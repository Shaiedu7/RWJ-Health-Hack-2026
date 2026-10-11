export const RICH_WYATT_ID = "import-723e573c6165830038229a56";
export const CSV_WYATT_ID = "import-d95bcab43d3144ceedd0ae8c";
export type Patient = { patientId: string; mode: "development-preview" | "published"; approved: boolean; source: "Hugging Face" | "CSV" | "Faculty"; fields: { name: string; age?: number; background?: string; gender?: string } };
export type Message = { id: string; role: "user" | "assistant"; text: string; sequence: number; createdAt: string };
export type Encounter = { encounterId: string; patientId: string; mode: "development-preview" | "published"; revision: number; messages: Message[]; busy: boolean; readOnly: boolean; patient: Patient; chart: { entries: { label: string; value: string }[]; documentsAvailable: boolean; documents: {id:string;title:string;findings:string;contentType:string}[]; behavior: string } };
export type EncounterSummary = { encounterId: string; patientId: string; source: string; patientName?: string; updatedAt: string; messageCount: number; readOnly: boolean };
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected preview response."); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== "string") throw new Error("Unexpected preview text."); return value; }
function patientId(value: unknown): string { if (value !== RICH_WYATT_ID && value !== CSV_WYATT_ID && !(typeof value === "string" && /^faculty-[0-9a-f-]{36}$/i.test(value))) throw new Error("Unexpected patient identity."); return value; }
function guid(value: unknown): string { const id = string(value); if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unexpected encounter identity."); return id; }
export function parsePatient(value: unknown): Patient {
  const p = object(value), fields = object(p.fields);
  if (!(p.mode === "published" && p.approved === true && p.source === "Faculty" && typeof p.patientId === "string" && /^faculty-[0-9a-f-]{36}$/i.test(p.patientId)) && !(p.mode === "development-preview" && p.approved === false && (p.source === "Hugging Face" || p.source === "CSV") && (p.patientId === RICH_WYATT_ID || p.patientId === CSV_WYATT_ID))) throw new Error("Unexpected preview status.");
  return { patientId: patientId(p.patientId), mode: p.mode as Patient["mode"], approved: p.approved === true, source: p.source as Patient["source"], fields: { name: string(fields.name), ...(typeof fields.age === "number" ? { age: fields.age } : {}), ...(typeof fields.background === "string" ? { background: fields.background } : {}), ...(typeof fields.gender === "string" ? { gender: fields.gender } : {}) } };
}
export function parseEncounter(value: unknown): Encounter {
  const e = object(value), chart = object(e.chart), patient = parsePatient(e.patient);
  if (e.mode !== patient.mode || !Number.isSafeInteger(e.revision) || Number(e.revision) < 0 || !Array.isArray(e.messages) || typeof e.busy !== "boolean" || typeof e.readOnly !== "boolean" || !Array.isArray(chart.entries) || typeof chart.documentsAvailable !== "boolean" || patient.patientId !== e.patientId) throw new Error("Unexpected encounter response.");
  if (chart.documentsAvailable !== (Array.isArray(chart.documents) && chart.documents.length>0) || (patient.mode !== "published" && chart.documentsAvailable)) throw new Error("Unexpected report availability.");
  const messages = e.messages.map((value, i) => {
    const m = object(value);
    if (m.sequence !== i + 1 || (m.role !== "user" && m.role !== "assistant")) throw new Error("Unexpected conversation order.");
    return { id: string(m.id), role: m.role as Message["role"], text: string(m.text), sequence: i + 1, createdAt: string(m.createdAt) };
  });
  return { encounterId: guid(e.encounterId), patientId: patientId(e.patientId), mode: patient.mode, revision: Number(e.revision), messages, busy: e.busy, readOnly: e.readOnly, patient,
    chart: { entries: chart.entries.map(value => { const entry = object(value); return { label: string(entry.label), value: string(entry.value) }; }), documentsAvailable: chart.documentsAvailable, documents: Array.isArray(chart.documents) ? chart.documents.map(value=>{const doc=object(value);return {id:guid(doc.id),title:string(doc.title),findings:string(doc.findings),contentType:string(doc.contentType)}}) : [], behavior: string(chart.behavior) } };
}
export function parseSummaries(value: unknown): EncounterSummary[] {
  const result = object(value); if (!Array.isArray(result.encounters)) throw new Error("Unexpected saved encounters.");
  return result.encounters.map(value => { const e = object(value); if ((e.mode !== "development-preview" && e.mode !== "published") || !Number.isSafeInteger(e.messageCount) || typeof e.readOnly !== "boolean") throw new Error("Unexpected encounter summary."); return { encounterId: guid(e.encounterId), patientId: patientId(e.patientId), source: string(e.source), ...(typeof e.patientName === "string" ? {patientName:e.patientName} : {}), updatedAt: string(e.updatedAt), messageCount: Number(e.messageCount), readOnly: e.readOnly }; });
}
