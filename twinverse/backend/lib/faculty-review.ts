import { importFacultyProfile } from "./faculty-import.js";
import { createHash } from "node:crypto";
import { parseDocument, stringify } from "yaml";
import { FacultyError, validateFacultyProfile } from "./faculty-patients.js";
export type Issue = {
  path: string;
  severity: "critical" | "warning";
  message: string;
  fix?: string;
  source?: "rule" | "ai";
  status?: "dismissed";
  dismissalReason?: string;
  dismissedBy?: string;
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export const profileHash = (profile: unknown) =>
  createHash("sha256").update(canonical(profile)).digest("hex");
export function parseProfileText(text: unknown, format: unknown) {
  if (
    typeof text !== "string" ||
    Buffer.byteLength(text) > 120000 ||
    !["json", "yaml"].includes(String(format))
  )
    throw new FacultyError(
      422,
      "Choose JSON or YAML and provide a profile under 120 KB.",
    );
  try {
    const doc =
      format === "yaml"
        ? parseDocument(text, { uniqueKeys: true, version: "1.2" })
        : null;
    if (doc?.errors.length) throw new Error("Invalid YAML");
    const value = doc
      ? (doc.toJS({ maxAliasCount: 0 }) as unknown)
      : (JSON.parse(text) as unknown);
    return importFacultyProfile(value);
  } catch (e) {
    if (e instanceof FacultyError) throw e;
    throw new FacultyError(
      422,
      "Invalid JSON/YAML profile. Use the downloaded template and check the syntax.",
    );
  }
}
export const exportProfile = (profile: unknown, format: string) =>
  format === "yaml" ? stringify(profile) : JSON.stringify(profile, null, 2);
export function reviewProfile(value: unknown): Issue[] {
  const p = validateFacultyProfile(value) as Record<
    string,
    Record<string, unknown>
  >;
  const issues: Issue[] = [];
  const add = (
    path: string,
    message: string,
    severity: Issue["severity"] = "critical",
  ) => issues.push({ path, severity, message, source: "rule" });
  for (const path of [
    "demographics.name",
    "overview.chief_complaint",
    "clinical.hpi",
    "psychosocial.personality",
    "psychosocial.communication_style",
  ]) {
    const [s, k] = path.split(".");
    if (!String(p[s ?? ""]?.[k ?? ""] ?? "").trim())
      add(path, "Fill in this field before publishing.");
  }
  if (typeof p["demographics"]?.["age"] !== "number")
    add(
      "demographics.age",
      "Review and enter the patient age before publishing.",
    );
  for (const category of ["artifacts", "knowledge"]) {
    for (const file of (p[category] as unknown as Record<string, unknown>[] ?? [])) {
      if (file["reviewed"] !== true) add(category, "Review the uploaded document and its extracted text before publishing.");
      if (!String(file[category === "artifacts" ? "findings" : "text"] ?? "").trim()) add(category, "Enter reviewed document text before publishing.");
      if (category === "artifacts" && !(file["trigger"] as {type?:string}|undefined)?.type) add(category, "A report has no release trigger and will stay hidden from students.", "warning");
      const trigger=file["trigger"] as {type?:string;value?:string}|undefined;
      if(category === "artifacts" && trigger?.type) {
        if(!["start","topic_asked","exam_requested","after_turns"].includes(trigger.type))add(category,"Choose a supported report trigger.");
        else if(trigger.type!=="start" && !trigger.value?.trim())add(category,"Enter the report release condition.");
        else if(trigger.type==="after_turns" && (!/^\d+$/.test(trigger.value??"") || Number(trigger.value)<1 || Number(trigger.value)>40))add(category,"Report release must be between 1 and 40 turns.");
      }
    }
  }
  const c = p["clinical"] ?? {};
  const medications = (p["medications"]?.["current"] ?? []) as Record<
    string,
    string
  >[];
  const families: Record<string, string[]> = {
    penicillin: [
      "penicillin",
      "amoxicillin",
      "ampicillin",
      "augmentin",
      "piperacillin",
    ],
    sulfa: ["sulfa", "sulfamethoxazole", "bactrim"],
    nsaid: ["ibuprofen", "naproxen", "aspirin", "ketorolac", "diclofenac"],
    opioid: ["codeine", "morphine", "oxycodone", "hydrocodone"],
  };
  for (const allergy of (c["allergies"] ?? []) as Record<string, string>[]) {
    const name = String(allergy["substance"] ?? "")
      .toLowerCase()
      .trim();
    if (!name) continue;
    const drugs = [
      ...new Set([
        name,
        ...Object.entries(families)
          .filter(
            ([family, drugs]) => name.includes(family) || drugs.includes(name),
          )
          .flatMap(([, drugs]) => drugs),
      ]),
    ];
    for (const med of medications)
      if (
        drugs.some((drug) =>
          String(med["name"] ?? "")
            .toLowerCase()
            .includes(drug),
        )
      )
        add(
          "medications.current",
          `${med["name"]} conflicts with the listed ${allergy["substance"]} allergy.`,
        );
  }
  const nutrition = p["nutrition"] ?? {};
  const weight = nutrition["weight_kg"],
    height = nutrition["height_cm"];
  if (typeof weight === "number" && weight <= 0)
    add("nutrition.weight_kg", "Weight must be positive and in kilograms.");
  if (typeof height === "number" && height <= 0)
    add("nutrition.height_cm", "Height must be positive and in centimeters.");
  if (
    typeof weight === "number" &&
    typeof height === "number" &&
    weight > 0 &&
    height > 0
  ) {
    const bmi = weight / (height / 100) ** 2;
    if (bmi < 10 || bmi > 70)
      add(
        "nutrition",
        `Height and weight imply BMI ${bmi.toFixed(1)}. Review the supplied units and values.`,
      );
  }
  for (const v of (c["vitals"] ?? []) as Record<string, unknown>[]) {
    const label = String(v["label"] ?? "").toLowerCase();
    const value = String(v["value"] ?? "");
    const match = value.match(/^\s*(\d+(?:\.\d+)?)/);
    if (!match) continue;
    const n = Number(match[1]);
    if ((/heart|pulse/.test(label) || label === "hr") && (n < 20 || n > 250))
      add(
        "clinical.vitals",
        `Review heart rate ${value}; it is outside the teaching-case check range of 20–250.`,
      );
    if (/temp/.test(label)) {
      const fahrenheit = /°?\s*f(?:ahrenheit)?\b/i.test(value),
        celsius = /°?\s*c(?:elsius)?\b/i.test(value);
      if (
        (fahrenheit && (n < 86 || n > 109)) ||
        (celsius && (n < 30 || n > 43))
      )
        add("clinical.vitals", `Review temperature ${value} and its units.`);
      else if (!fahrenheit && !celsius)
        add(
          "clinical.vitals",
          `Temperature ${value} has no explicit Fahrenheit/Celsius unit.`,
          "warning",
        );
    }
    if (/oxygen|spo2/.test(label) && (n < 0 || n > 100))
      add("clinical.vitals", `Oxygen saturation ${value} is outside 0–100%.`);
  }
  for (const key of [
    "vitals",
    "exam",
    "laboratory_data",
    "clinical_findings",
    "anthropometrics",
  ])
    for (const item of (c[key] ?? []) as Record<string, unknown>[]) {
      const t = item["trigger"] as Record<string, string> | undefined;
      if (!t || !t["type"])
        add(
          `clinical.${key}`,
          "No release setting: this finding will stay hidden from students.",
          "warning",
        );
      else if (
        !["start", "topic_asked", "exam_requested", "after_turns"].includes(
          t["type"],
        )
      )
        add(
          `clinical.${key}`,
          "Choose a supported release setting. Custom intent is not supported yet.",
        );
      else if (t["type"] !== "start" && !String(t["value"] ?? "").trim())
        add(`clinical.${key}`, "Fill in each release condition.");
      else if (
        t["type"] === "after_turns" &&
        (!/^\d+$/.test(t["value"] ?? "") ||
          Number(t["value"]) < 1 ||
          Number(t["value"]) > 40)
      )
        add(`clinical.${key}`, "After-turns release must be between 1 and 40.");
      if (
        !String(item["label"] ?? "").trim() ||
        !String(item["value"] ?? "").trim()
      )
        add(`clinical.${key}`, "Each finding needs a label and value.");
    }
  if (!((p["learning"]?.["objectives"] ?? []) as unknown[]).length)
    add("learning.objectives", "No learning objectives supplied.", "warning");
  if (!((c["allergies"] ?? []) as unknown[]).length && !c["allergy_status"])
    add(
      "clinical.allergies",
      "Allergy status is unknown; an empty list will not be treated as no allergies.",
      "warning",
    );
  add(
    "review",
    "Fixed checks and AI review can miss issues or flag false positives; faculty must review the teaching case.",
    "warning",
  );
  return issues;
}
