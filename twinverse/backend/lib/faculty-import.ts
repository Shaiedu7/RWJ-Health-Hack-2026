import {
  blankFacultyProfile,
  FacultyError,
  validateFacultyProfile,
} from "./faculty-patients.js";
type Obj = Record<string, unknown>;
const object = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const strings = (v: unknown): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string")
    ? (v as string[])
    : [];
const lines = (o: Obj, keys: string[]) =>
  keys
    .filter((k) => o[k] !== undefined)
    .map(
      (k) =>
        `${k.replaceAll("_", " ")}: ${Array.isArray(o[k]) ? strings(o[k]).join("; ") : text(o[k])}`,
    )
    .join("\n");
/** Deterministic import adapter; supplied text is data, never instructions to execute. */
export function importFacultyProfile(value: unknown) {
  if (Array.isArray(value)) {
    if (value.length !== 1)
      throw new FacultyError(
        422,
        "Import one patient at a time. This file must contain exactly one patient.",
      );
    value = value[0];
  }
  const src = object(value);
  if (!src["patient_overview"]) return validateFacultyProfile(value);
  const ov = object(src["patient_overview"]),
    dm = object(src["demographics"]),
    cl = object(src["clinical_profile"]),
    med = object(src["medication_profile"]),
    nu = object(src["nutrition_profile"]),
    ps = object(src["psychosocial_profile"]),
    dis = object(src["information_disclosure"]);
  const p = blankFacultyProfile();
  Object.assign(p["overview"] as object, {
    title: text(ov["name"]),
    case_summary: text(ov["description"]),
    chief_complaint: strings(cl["current_symptoms"]).join("; "),
  });
  Object.assign(p["demographics"] as object, {
    name: text(ov["name"]),
    age: ov["age"] ?? null,
    sex: text(ov["sex"]),
    occupation: text(dm["occupation"]),
    ethnicity: text(dm["ethnicity"]),
    primary_language: text(dm["language"]),
    education: text(dm["education_level"]),
    living_situation: text(dm["residence"]),
    marital_status: text(dm["marital_status"]),
    insurance: text(dm["insurance"]),
    cultural_context: text(dm["cultural_context"]),
  });
  const findings = (items: string[]) =>
    items.map((value, i) => ({
      id: `import-${i}`,
      label: value.includes(":")
        ? value.slice(0, value.indexOf(":"))
        : "Supplied finding",
      value: value.includes(":")
        ? value.slice(value.indexOf(":") + 1).trim()
        : value,
    }));
  Object.assign(p["clinical"] as object, {
    hpi: strings(cl["current_symptoms"]).join("; "),
    primary_diagnosis: text(cl["primary_diagnosis"]),
    secondary_diagnoses: strings(cl["secondary_diagnoses"]),
    pmh: strings(cl["medical_history"]).filter(
      (f) => !/^family history/i.test(f),
    ),
    family_history: strings(cl["medical_history"])
      .filter((f) => /^family history/i.test(f))
      .join("\n"),
    allergy_status: strings(cl["allergies"])
      .filter((f) => /^no known allergies$/i.test(f.trim()))
      .join("; "),
    allergies: strings(cl["allergies"])
      .filter((f) => !/^no known allergies$/i.test(f.trim()))
      .map((substance) => ({ substance, reaction: "" })),
    vitals: findings(strings(cl["vital_signs"])),
    exam: [],
    laboratory_data: findings(strings(cl["laboratory_data"])),
    clinical_findings: findings(strings(cl["clinical_findings"])),
    anthropometrics: findings(strings(cl["anthropometrics"])),
  });
  const meds = Array.isArray(med["medications"])
    ? med["medications"].map(object)
    : [];
  Object.assign(p["medications"] as object, {
    current: meds.map((m) => ({
      name: text(m["name"]),
      dose: text(m["dose"]),
      frequency: text(m["frequency"]),
      indication: text(m["purpose"]),
      adherence: text(m["adherence"]),
      patient_concerns: text(m["patient_concerns"]),
    })),
    adherence: meds
      .map(
        (m) =>
          `${text(m["name"])}: ${lines(m, ["adherence", "patient_concerns"])}`,
      )
      .join("\n"),
    otc_and_supplements: strings(med["supplements_and_otc"]),
  });
  Object.assign(p["nutrition"] as object, {
    diet_pattern: text(nu["dietary_pattern"]),
    food_preferences: strings(nu["food_preferences"]),
    foods_or_behaviors_to_explore: strings(nu["foods_or_behaviors_to_explore"]),
    meal_pattern: text(nu["meal_pattern"]),
    hydration: text(nu["hydration"]),
    physical_activity: text(nu["physical_activity"]),
    sleep: text(nu["sleep"]),
  });
  Object.assign(p["psychosocial"] as object, {
    personality: text(ps["personality"]),
    communication_style: text(ps["communication_style"]),
    support_system: text(ps["support_system"]),
    tobacco_and_substance_use: text(nu["substance_use"]),
    ...Object.fromEntries(
      [
        "goals",
        "concerns",
        "beliefs",
        "motivations",
        "fears",
        "barriers",
        "strengths",
      ].map((k) => [k, strings(ps[k])]),
    ),
    readiness_to_change: text(ps["readiness_to_change"]),
  });
  Object.assign(p["disclosure"] as object, {
    ...Object.fromEntries(
      [
        "initial_information",
        "discoverable_information",
        "reluctant_information",
        "hidden_information",
      ].map((k) => [k, strings(dis[k])]),
    ),
    rules: [
      ...strings(dis["initial_information"]).map((fact) => ({
        fact,
        mode: "volunteer",
      })),
      ...strings(dis["discoverable_information"]).map((fact) => ({
        fact,
        mode: "if_asked",
      })),
      ...strings(dis["reluctant_information"]).map((fact) => ({
        fact,
        mode: "only_if_probed",
      })),
    ],
    hidden_concerns: strings(dis["hidden_information"]).join("\n"),
  });
  const opportunities = object(src["learning_opportunities"])["opportunities"];
  const learning = Array.isArray(opportunities)
    ? opportunities.map(object)
    : [];
  Object.assign(p["learning"] as object, {
    objectives: learning.map((o) => text(o["learning_objective"])),
    expected_discoveries: learning.flatMap((o) =>
      strings(o["expected_discoveries"]),
    ),
    possible_patient_reactions: learning.flatMap((o) =>
      strings(o["possible_patient_reactions"]),
    ),
  });
  Object.assign(p["metadata"] as object, {
    tags: strings(ov["keywords"]),
    notes:
      "Imported supplied profile. Source assumptions and optional details remain unverified. Choose chart release settings before publishing. Original source (faculty only):\n" +
      JSON.stringify(src),
  });
  return validateFacultyProfile(p);
}
