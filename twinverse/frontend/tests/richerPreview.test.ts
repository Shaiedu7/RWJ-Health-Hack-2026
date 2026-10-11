import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePatient, parseEncounter, parseSummaries, RICH_WYATT_ID, CSV_WYATT_ID } from "../src/previewApi.ts";
const id = "7f5aa210-c961-4b46-9c39-794253d7bc6e";
const patient = { patientId: RICH_WYATT_ID, mode: "development-preview", approved: false, source: "Hugging Face", fields: { name: "Wyatt Nelson", age: 18, background: "High school student", suppliedNotes: "hidden patient narrative" }, patientInformation: { hidden: "private" } };
const saved = { encounterId: id, patientId: RICH_WYATT_ID, mode: "development-preview", revision: 1, busy: false, readOnly: false, patient,
  messages: [{ id: "one", role: "user", text: "Hi", sequence: 1, createdAt: "2026-10-10" }, { id: "two", role: "assistant", text: "Hey, I’m Wyatt.", sequence: 2, createdAt: "2026-10-10", evidenceIds: ["private-evidence"] }],
  chart: { entries: [], documentsAvailable: false, behavior: "Demo application behavior" }, context: { reviewOnly: { teachingObjectives: "private" } }, sourceHash: "private" };
test("richer patient cards and restored messages discard private context and hidden teaching data", () => {
  const card = parsePatient(patient); assert.equal(card.patientId, RICH_WYATT_ID); assert.equal(card.source, "Hugging Face");
  assert.doesNotMatch(JSON.stringify(card), /suppliedNotes|patientInformation|hidden/);
  const restored = parseEncounter(saved); assert.equal(restored.messages[1]?.text, "Hey, I’m Wyatt.");
  assert.doesNotMatch(JSON.stringify(restored), /reviewOnly|teachingObjectives|evidenceIds|context|sourceHash/);
});
test("restoration rejects wrong source identities, unordered messages and invented report availability", () => {
  assert.throws(() => parseEncounter({ ...saved, patientId: CSV_WYATT_ID }));
  assert.throws(() => parseEncounter({ ...saved, messages: [{ ...saved.messages[0], sequence: 2 }] }));
  assert.throws(() => parseEncounter({ ...saved, chart: { ...saved.chart, documentsAvailable: true } }));
  assert.throws(() => parsePatient({ ...patient, approved: true }));
});
test("saved CSV archive and richer encounters remain distinct and can be selected independently", () => {
  const summaries = parseSummaries({ encounters: [{ encounterId: id, patientId: CSV_WYATT_ID, source: "CSV", mode: "development-preview", messageCount: 2, updatedAt: "2026-10-10", readOnly: true }, { encounterId: "97c444ca-9aaf-4c59-b8a2-62fd2a884a74", patientId: RICH_WYATT_ID, source: "Hugging Face", mode: "development-preview", messageCount: 0, updatedAt: "2026-10-10", readOnly: false }] });
  assert.notEqual(summaries[0]?.patientId, summaries[1]?.patientId); assert.equal(summaries[0]?.readOnly, true);
});
test("published faculty cards and encounters retain public identity and discard private teaching data", () => {
  const id = "faculty-8fbb33d6-350f-4e6d-bdc3-391cf0ccdd42";
  const card = { patientId:id, mode:"published", approved:true, source:"Faculty", fields:{name:"Fictional demo",age:58}, hidden_diagnosis:"private" };
  assert.equal(parsePatient(card).approved,true);
  assert.doesNotMatch(JSON.stringify(parsePatient(card)),/hidden_diagnosis/);
  assert.throws(()=>parsePatient({...card,approved:false}));
  const e=parseEncounter({...saved,patientId:id,mode:"published",patient:card});
  assert.equal(e.patient.fields.name,"Fictional demo");
  assert.doesNotMatch(JSON.stringify(e),/teachingObjectives|context|sourceHash/);
});
