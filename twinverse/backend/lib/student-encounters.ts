import { releasedFindings } from './published-context.js';
import { randomUUID, createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, paginateQuery } from "@aws-sdk/lib-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { REGION, TABLE_NAME } from "./patients-stack.js";
import { type ChatMessage, type GroundedReply } from "./preview-conversation.js";
import { CSV_WYATT_ID, RICH_WYATT_ID, verifyContext, type PreviewContext } from "./preview-context.js";
export type Encounter = { endedAt?: string; feedback?: import("./session-feedback.js").EncounterFeedback; encounterId: string; patientId: string; mode: "development-preview" | "published"; context?: PreviewContext; revision: number; version: number; messages: ChatMessage[]; requests: Record<string, { hash: string; revision: number }>; pending?: { requestId: string; hash: string; until: number }; updatedAt: string };
export class EncounterError extends Error { constructor(public status: number, message: string) { super(message); this.name = "EncounterError"; } }
export interface EncounterStore { get(student: string, encounterId: string): Promise<Encounter | undefined>; list(student: string): Promise<Encounter[]>; save(student: string, next: Encounter, expectedVersion?: number): Promise<void> }
export function createEncounterStore(): EncounterStore {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION, credentials: fromNodeProviderChain({ profile: "twinverse-event" }), maxAttempts: 3 }));
  const partition = (student: string) => `STUDENT#twinverse-event#${student}`;
  const key = (student: string, id: string) => ({ PK: partition(student), SK: `ENCOUNTER#${id}` });
  return {
    async get(student, id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
      const value = (await client.send(new GetCommand({ TableName: TABLE_NAME, Key: key(student, id), ConsistentRead: true }))).Item as Encounter | undefined;
      if (value) return value;
      const legacy = (await client.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: partition(student), SK: "ENCOUNTER#WYATT-PREVIEW" }, ConsistentRead: true }))).Item as Encounter | undefined;
      return legacy?.encounterId === id ? legacy : undefined;
    },
    async list(student) {
      const items: Encounter[] = [];
      for await (const page of paginateQuery({ client }, { TableName: TABLE_NAME, KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)", ExpressionAttributeValues: { ":pk": partition(student), ":prefix": "ENCOUNTER#" }, ConsistentRead: true })) items.push(...(page.Items ?? []) as Encounter[]);
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async save(student, next, expectedVersion) {
      if (!next.context) throw new EncounterError(409, "This archived CSV encounter is read-only. Start a new richer Wyatt encounter.");
      verifyContext(next.context);
      if (next.patientId !== next.context.patientId) throw new EncounterError(409, "Encounter patient binding is invalid.");
      if (Buffer.byteLength(JSON.stringify(next)) > 300_000) throw new EncounterError(409, "This preview has reached its storage limit.");
      try {
        await client.send(new PutCommand({ TableName: TABLE_NAME, Item: { ...next, ...key(student, next.encounterId) }, ConditionExpression: expectedVersion === undefined ? "attribute_not_exists(PK)" : "#v = :version", ...(expectedVersion === undefined ? {} : { ExpressionAttributeNames: { "#v": "version" }, ExpressionAttributeValues: { ":version": expectedVersion } }) }));
      } catch (error) { if (error instanceof Error && error.name === "ConditionalCheckFailedException") throw new EncounterError(409, "The encounter changed. Refresh it before retrying."); throw error; }
    },
  };
}
export function encounterSummary(encounter: Encounter) { return { encounterId: encounter.encounterId, patientId: encounter.patientId, mode: encounter.mode, patientName: encounter.context?.card.fields.name ?? "Wyatt Nelson", source: encounter.context?.card.source ?? (encounter.patientId === CSV_WYATT_ID ? "CSV" : "Unknown"), updatedAt: encounter.updatedAt, messageCount: encounter.messages.length, readOnly: !encounter.context }; }
export function publicEncounter(encounter: Encounter) {
  const context = encounter.context;
  if (context) verifyContext(context);
  const released = context ? releasedFindings(context,encounter.messages) : [];
  const ids = [...new Set(encounter.messages.filter(m => m.role === "assistant").flatMap(m => m.evidenceIds ?? []))];
  const chartEntries = context?.card.approved ? releasedFindings(context,encounter.messages).filter(item=>!item.group.startsWith("artifact:")).map(item=>({label:item.label,value:item.value})) : context ? ids.filter(id => /^(clinical_profile|medication_profile)\./.test(id) && Object.hasOwn(context.evidence, id)).map(id => {
    const medication = id.match(/^medication_profile\.medications\.(\d+)\.(.+)$/);
    const label = medication ? `${String(context.evidence[`medication_profile.medications.${medication[1]}.name`] ?? "Medication")} · ${(medication[2] ?? "detail").replaceAll("_", " ")}` : id.split(".").filter(v => !/^\d+$/.test(v)).slice(1).join(" · ").replaceAll("_", " ");
    return { label, value: String(context.evidence[id]) };
  }) : [];
  return { encounterId: encounter.encounterId, patientId: encounter.patientId, mode: encounter.mode, revision: encounter.revision, messages: encounter.messages.map(({ id, role, text, sequence, createdAt }) => ({ id, role, text, sequence, createdAt })), busy: !!encounter.pending && encounter.pending.until > Date.now(), readOnly: !context || !!encounter.endedAt, endedAt: encounter.endedAt ?? null, feedback: encounter.feedback ?? null,
    patient: context?.card ?? { patientId: encounter.patientId, mode: "development-preview", approved: false, source: "CSV", fields: { name: "Wyatt Nelson", age: 18, background: "High school student" } },
    chart: { entries: chartEntries, documents: (context?.artifacts ?? []).filter(file=>released.some(f=>f.group===`artifact:${file.id}`)).map(file=>({id:file.id,title:file.title,findings:file.findings??"",contentType:file.content_type})), documentsAvailable: (context?.artifacts ?? []).some(file=>released.some(f=>f.group===`artifact:${file.id}`)), behavior: context?.card.approved ? "Faculty-reviewed chart settings determine when structured findings appear. No report files are available." : "Demo application behavior: show supplied clinical details discussed in this conversation. No faculty-approved chart release rules or report files are available." } };
}
export async function openEncounter(store: EncounterStore, student: string, context: PreviewContext) {
  verifyContext(context);
  if (!context.card.approved && context.patientId !== RICH_WYATT_ID) throw new EncounterError(400, "New encounters require the explicitly selected richer Wyatt draft.");
  const encounter: Encounter = { encounterId: randomUUID(), patientId: context.patientId, context: structuredClone(context), mode: context.card.mode, version: 0, revision: 0, messages: [], requests: {}, updatedAt: new Date().toISOString() };
  await store.save(student, encounter); return encounter;
}
export async function sendTurn(store: EncounterStore, student: string, input: { encounterId: string; requestId: string; revision: number; text: string }, generate: (context: PreviewContext, history: ChatMessage[], text: string) => Promise<GroundedReply>): Promise<Encounter> {
  let current = await store.get(student, input.encounterId);
  if (!current || current.encounterId !== input.encounterId) throw new EncounterError(404, "Encounter unavailable for this student.");
  if (!current.context) throw new EncounterError(409, "This archived CSV conversation is preserved read-only. Start a new richer Wyatt encounter.");
  if (current.endedAt) throw new EncounterError(409, "This session has ended. Start a new encounter.");
  verifyContext(current.context);
  if (current.context.patientId !== current.patientId) throw new EncounterError(409, "Encounter patient binding is invalid.");
  const hash = createHash("sha256").update(input.text).digest("hex");
  const previous = current.requests[input.requestId];
  if (previous) { if (previous.hash !== hash || previous.revision !== input.revision) throw new EncounterError(409, "Request ID was already used for a different turn."); return current; }
  if (current.revision !== input.revision) throw new EncounterError(409, "Conversation changed. Refresh before sending.");
  if (current.messages.length >= 80) throw new EncounterError(409, "This preview reached its 40-turn limit. Start a new encounter.");
  if (current.pending && current.pending.until > Date.now()) throw new EncounterError(409, "A reply is still being generated. Refresh shortly.");
  const context = current.context;
  const locked = { ...current, context, version: current.version + 1, pending: { requestId: input.requestId, hash, until: Date.now() + 120_000 } };
  await store.save(student, locked, current.version); current = locked;
  try {
    const reply = await generate(locked.context, current.messages, input.text);
    const now = new Date().toISOString();
    const next: Encounter = { ...current, version: current.version + 1, revision: current.revision + 1, updatedAt: now, requests: { ...current.requests, [input.requestId]: { hash, revision: input.revision } }, messages: [...current.messages, { id: `${input.requestId}:user`, role: "user", text: input.text, sequence: current.messages.length + 1, createdAt: now }, { id: `${input.requestId}:assistant`, role: "assistant", text: reply.text, evidenceIds: reply.evidenceIds, sequence: current.messages.length + 2, createdAt: now }] };
    delete next.pending;
    await store.save(student, next, current.version); return next;
  } catch (error) {
    const unlocked = { ...current, version: current.version + 1 }; delete unlocked.pending;
    try { await store.save(student, unlocked, current.version); } catch { /* Never overwrite a completed or newer turn. */ }
    throw error;
  }
}
