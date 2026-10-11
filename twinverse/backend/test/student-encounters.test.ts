import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openEncounter, sendTurn, publicEncounter, EncounterError, type Encounter, type EncounterStore } from "../lib/student-encounters.js";
import { generateWithModel, parseReply, PreviewReplyError, writerSystem } from "../lib/preview-conversation.js";
import { contextFromProfile, verifyContext, CSV_WYATT_ID, RICH_WYATT_ID } from "../lib/preview-context.js";
import type { EncounterProfile } from "../lib/patient-loader.js";
const profile = JSON.parse(readFileSync(new URL("./fixtures/rich-wyatt-loader.json", import.meta.url), "utf8")) as EncounterProfile;
const context = contextFromProfile(profile);
function memoryStore(): EncounterStore {
  const records = new Map<string, Encounter>();
  return { async get(student, id) { const value = records.get(`${student}/${id}`); return value ? structuredClone(value) : undefined; }, async list(student) { return [...records.entries()].filter(([key]) => key.startsWith(`${student}/`)).map(([, value]) => structuredClone(value)); }, async save(student, next, expectedVersion) {
    const key = `${student}/${next.encounterId}`; const current = records.get(key);
    if ((expectedVersion === undefined && current) || (expectedVersion !== undefined && current?.version !== expectedVersion)) throw new EncounterError(409, "Conflict");
    records.set(key, structuredClone(next));
  } };
}
test("complete context includes all six proposals and keeps teaching/disclosure/optional details out of patient knowledge", () => {
  assert.equal(Object.keys(context.sourceSections).length, 6);
  assert.match(JSON.stringify(context.patientInformation), /Metformin/); assert.match(JSON.stringify(context.patientInformation), /mg\/dL/);
  assert.ok(context.reviewOnly.teachingObjectives); assert.ok(context.reviewOnly.sourceMetadata); assert.equal(context.reviewOnly.disclosureExecutable, false);
  const prompt = writerSystem(context);
  assert.doesNotMatch(JSON.stringify(context.patientInformation), /insulin therapy|varsity|video games|expected_discoveries|learning_objective/);
  assert.doesNotMatch(prompt, /Parent reports that|School nurse notes|Apply the Nutrition Care Process/);
  assert.deepEqual([...(context.conflicts[0]?.values ?? [])].sort(), ["32", "32.1"]);
  assert.equal((context.patientInformation.clinical_profile as Record<string, unknown>).allergies, null);
  assert.deepEqual((context.sourceSections.clinical_profile as Record<string, unknown>).allergies, []);
  verifyContext(context);
  const tampered = structuredClone(context); tampered.patientId = CSV_WYATT_ID; assert.throws(() => verifyContext(tampered));
});
test("new encounters pin independent snapshots, preserve legacy conversations, restore ordered turns and isolate students", async () => {
  const store = memoryStore();
  const legacy: Encounter = { encounterId: "legacy", patientId: CSV_WYATT_ID, mode: "development-preview", revision: 1, version: 1, messages: [{ id: "old", role: "assistant", text: "Old CSV reply", sequence: 1, createdAt: "2026-10-10" }], requests: {}, updatedAt: "2026-10-10" };
  await store.save("student-a", legacy);
  const encounter = await openEncounter(store, "student-a", context); const second = await openEncounter(store, "student-a", context);
  assert.notEqual(encounter.encounterId, second.encounterId); assert.equal(encounter.patientId, RICH_WYATT_ID);
  assert.deepEqual(await store.get("student-a", "legacy"), legacy);
  let calls = 0; const input = { encounterId: encounter.encounterId, requestId: "request-1", revision: 0, text: "Hello" };
  const generate = async () => { calls++; return { text: "Hey, I’m Wyatt.", evidenceIds: ["patient_overview.name"] }; };
  const saved = await sendTurn(store, "student-a", input, generate);
  assert.deepEqual(saved.messages.map(m => m.sequence), [1, 2]);
  assert.deepEqual((await store.get("student-a", encounter.encounterId))?.messages, saved.messages);
  assert.equal((await sendTurn(store, "student-a", input, generate)).revision, 1); assert.equal(calls, 1);
  await assert.rejects(sendTurn(store, "student-b", input, generate), (e: unknown) => e instanceof EncounterError && e.status === 404);
  await assert.rejects(sendTurn(store, "student-a", { ...input, text: "Different text" }, generate));
  await assert.rejects(sendTurn(store, "student-a", { ...input, requestId: "request-2" }, generate));
  await assert.rejects(sendTurn(store, "student-a", { ...input, encounterId: "legacy" }, generate));
  const dto = JSON.stringify(publicEncounter(saved));
  assert.doesNotMatch(dto, /sourceSections|reviewOnly|evidenceIds|teachingObjectives|insulin therapy|contextHash|sourceHash|patientInformation/);
  assert.equal(publicEncounter(legacy).readOnly, true);
});
test("failed model calls preserve history and unlock a retry; concurrent turns cannot overwrite", async () => {
  const store = memoryStore(); const encounter = await openEncounter(store, "a", context);
  const input = { encounterId: encounter.encounterId, requestId: "one", revision: 0, text: "Hi" };
  await assert.rejects(sendTurn(store, "a", input, async () => { throw new Error("Model unavailable"); }));
  assert.equal((await store.get("a", encounter.encounterId))?.messages.length, 0); assert.equal((await store.get("a", encounter.encounterId))?.pending, undefined);
  const generate = async () => ({ text: "Hi.", evidenceIds: [] });
  const outcomes = await Promise.allSettled([sendTurn(store, "a", input, generate), sendTurn(store, "a", { ...input, requestId: "two" }, generate)]);
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length, 1); assert.equal((await store.get("a", encounter.encounterId))?.messages.length, 2);
});
test("natural replies require valid evidence and may not deny undocumented allergies or resolve BMI arbitrarily", () => {
  const base = { reply: "Yeah, I take metformin, but it makes my stomach feel upset.", evidenceIds: ["medication_profile.medications.0.name", "medication_profile.medications.0.patient_concerns"], unknownDetails: [] };
  assert.equal(parseReply(base, context).text, base.reply);
  assert.throws(() => parseReply({ ...base, evidenceIds: ["hidden.insulin"] }, context));
  assert.throws(() => parseReply({ ...base, reply: "I have no allergies." }, context));
  assert.throws(() => parseReply({ ...base, reply: "My BMI is exactly 32.1." }, context));
  assert.throws(() => parseReply({ ...base, reply: "My BMI is exactly 32." }, context));
  assert.throws(() => parseReply({ ...base, reply: "I’ve been constipated for a while." }, context));
  assert.throws(() => parseReply({ ...base, reply: "I don’t remember, but it’s been a while." }, context));
  assert.throws(() => parseReply({ ...base, reply: "The sources say my BMI is around 32." }, context));
  assert.throws(() => parseReply({ ...base, reply: "I’m not sure, but nothing like that." }, context));
  assert.throws(() => parseReply({ ...base, reply: "My supplied patient profile says metformin." }, context));
});
test("a failed grounding audit retries then errors; service outages never become unknown replies", async () => {
  let calls = 0;
  await assert.rejects(generateWithModel(context, [], "Invent kidney disease", async () => {
    calls++; return calls % 2 ? { reply: "I have kidney disease.", evidenceIds: [], unknownDetails: [] } : { grounded: false, issues: ["invented diagnosis"] };
  }), PreviewReplyError);
  assert.equal(calls, 4);
  await assert.rejects(generateWithModel(context, [], "Hi", async () => { throw new Error("Service unavailable"); }), /Service unavailable/);
  const accepted = await generateWithModel(context, [], "Hi", async (_system, input) => (input as { reply?: unknown }).reply ? { grounded: true, issues: [] } : { reply: "Hey, I’m Wyatt.", evidenceIds: ["patient_overview.name"], unknownDetails: [] });
  assert.equal(accepted.text, "Hey, I’m Wyatt.");
});
