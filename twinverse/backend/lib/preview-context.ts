import { createHash } from "node:crypto";
import { createDynamoPatientLoader } from "./dynamo-patient-loader.js";
import { PatientLoadError, type EncounterProfile } from "./patient-loader.js";
export const RICH_WYATT_ID = "import-723e573c6165830038229a56";
export const CSV_WYATT_ID = "import-d95bcab43d3144ceedd0ae8c";
export type SourceValue = string | number | boolean | null | SourceValue[] | { [key: string]: SourceValue };
export type Conflict = { field: string; values: string[]; qualifiedAnswer: string };
export type PatientCard = { patientId: string; mode: "development-preview" | "published"; approved: boolean; source: "Hugging Face" | "CSV" | "Faculty"; fields: { name: string; age?: number; background?: string; gender?: string } };
export type PreviewContext = {
  artifacts?: import("./patient-files.js").PatientFile[];
  publishedVersionId?: string; chartFindings?: import("./published-context.js").ChartFinding[]; disclosureRules?: SourceValue;
  schemaVersion: 2; patientId: string; draftRevision: number; sourceHash: string; contextHash: string;
  card: PatientCard; sourceSections: Record<string, SourceValue>; patientInformation: Record<string, SourceValue>;
  evidence: Record<string, string | number | boolean>;
  conflicts: Conflict[]; missing: string[];
  reviewOnly: { teachingObjectives: SourceValue; sourceMetadata: SourceValue; disclosureCategories: SourceValue; disclosureExecutable: false; exploration: SourceValue; overviewNarrative: SourceValue };
};
function record(value: unknown): Record<string, SourceValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PatientLoadError("INVALID_SCHEMA", "Patient section must be an object.");
  return value as Record<string, SourceValue>;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const hashValue = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function contextFromProfile(profile: EncounterProfile): PreviewContext {
  if (profile.mode !== "DEVELOPMENT_PREVIEW" || !profile.draftRevision || ![RICH_WYATT_ID, CSV_WYATT_ID].includes(profile.patientId)) throw new PatientLoadError("INVALID_MODE", "Selected profile is not an allowed development draft.");
  const fields = Object.fromEntries([...profile.approvedProfileFields, ...profile.unapprovedProposals.profileFields].map(f => [f.field, f.value])) as Record<string, SourceValue>;
  if (typeof fields.name !== "string") throw new PatientLoadError("INVALID_SCHEMA", "Patient name missing.");
  const sections = Object.fromEntries(profile.unapprovedProposals.facts.filter(f => f.type === "SUPPLIED_SECTION_PROPOSAL").map(f => [f.factId, f.value])) as Record<string, SourceValue>;
  const rich = profile.patientId === RICH_WYATT_ID;
  const sectionNames = ["patient_overview", "demographics", "clinical_profile", "medication_profile", "nutrition_profile", "psychosocial_profile"];
  if (rich && sectionNames.some(name => !sections[name])) throw new PatientLoadError("INVALID_SCHEMA", "All six richer patient sections are required.");
  const card: PatientCard = { patientId: profile.patientId, mode: "development-preview", approved: false, source: rich ? "Hugging Face" : "CSV", fields: { name: fields.name, ...(typeof fields.age === "number" ? { age: fields.age } : {}), ...(typeof fields.background === "string" ? { background: fields.background } : {}), ...(typeof fields.gender === "string" ? { gender: fields.gender } : {}) } };
  const patientInformation: Record<string, SourceValue> = rich ? structuredClone(sections) : { patient_overview: { ...card.fields }, suppliedNotes: fields.suppliedNotes ?? null };
  let exploration: SourceValue = null, overviewNarrative: SourceValue = null;
  const conflicts: Conflict[] = [], missing: string[] = [];
  if (rich) {
    const overview = record(patientInformation.patient_overview); overviewNarrative = overview.description ?? null;
    delete overview.description; delete overview.keywords; // Mixed narrative contains teaching goals, not just patient knowledge.
    if (typeof overviewNarrative === "string") {
      const patientSentences = overviewNarrative.split(/(?<=\.)\s+/).filter(sentence => !/requires developmentally|counseling|counselling|nutrition therapy|risk factors|learning objective/i.test(sentence));
      if (patientSentences.length) overview.patient_description = patientSentences.join(" ");
    }
    const nutrition = record(patientInformation.nutrition_profile);
    exploration = nutrition.foods_or_behaviors_to_explore ?? null; delete nutrition.foods_or_behaviors_to_explore;
    const clinical = record(patientInformation.clinical_profile);
    if (Array.isArray(clinical.allergies) && clinical.allergies.length === 0) { clinical.allergies = null; missing.push("Allergy status is unknown: the source empty array does not establish no allergies."); }
    const bmiEntries = [clinical.anthropometrics, clinical.clinical_findings].flatMap(value => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && /\bBMI\b/i.test(v)) : []);
    const values = [...new Set(bmiEntries.map(value => value.match(/BMI\s*:?\s*(\d+(?:\.\d+)?)/i)?.[1]).filter((v): v is string => !!v))];
    if (values.length > 1) {
      conflicts.push({ field: "BMI", values, qualifiedAnswer: "around 32 kg/m2" });
      for (const name of ["anthropometrics", "clinical_findings"]) if (Array.isArray(clinical[name])) clinical[name] = clinical[name].map(value => typeof value === "string" && /\bBMI\b/i.test(value) ? "BMI: around 32 kg/m2; conflicting source values, not a reconciled exact measurement" : value);
    }
    missing.push("Laboratory test dates are not supplied.", "Exact symptom onset, duration, severity and frequency are not supplied.");
  }
  const evidence: PreviewContext["evidence"] = {};
  const flatten = (value: SourceValue, path: string) => {
    if (value === null) return;
    if (Array.isArray(value)) { value.forEach((v, i) => flatten(v, `${path}.${i}`)); return; }
    if (typeof value === "object") { Object.entries(value).forEach(([k, v]) => flatten(v, path ? `${path}.${k}` : k)); return; }
    evidence[path] = value;
  };
  flatten(patientInformation, "");
  const review = profile.reviewOnlyProposals;
  const content = { schemaVersion: 2 as const, patientId: profile.patientId, draftRevision: profile.draftRevision, sourceHash: hashValue({ fields, sections, provenance: profile.sourceProvenance, review: review ?? null }), card, sourceSections: sections, patientInformation, evidence, conflicts, missing,
    reviewOnly: { teachingObjectives: (review?.teachingObjectives ?? null) as SourceValue, sourceMetadata: (review?.sourceMetadata ?? null) as SourceValue, disclosureCategories: (review?.disclosureCategories ?? null) as SourceValue, disclosureExecutable: false as const, exploration, overviewNarrative } };
  return { ...content, contextHash: hashValue(content) };
}
export function verifyContext(context: PreviewContext) {
  const { contextHash, ...content } = context;
  if (context.schemaVersion !== 2 || contextHash !== hashValue(content)) throw new Error("Encounter context snapshot failed integrity verification");
}
export async function loadPreviewContext(patientId = RICH_WYATT_ID): Promise<PreviewContext> {
  if (![RICH_WYATT_ID, CSV_WYATT_ID].includes(patientId)) throw new PatientLoadError("PATIENT_UNAVAILABLE", "Patient is not enabled for this demo.");
  const loader = await createDynamoPatientLoader();
  try { return contextFromProfile(await loader.loadPatientProfile(patientId, { developmentPreview: true })); } finally { loader.destroy(); }
}
