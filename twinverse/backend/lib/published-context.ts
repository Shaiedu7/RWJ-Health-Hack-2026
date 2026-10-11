import { facultyStore } from "./faculty-patients.js";
import { createDynamoPatientLoader } from "./dynamo-patient-loader.js";
import {
  hashValue,
  verifyContext,
  type PreviewContext,
  type SourceValue,
} from "./preview-context.js";
import type { ChatMessage } from "./preview-conversation.js";
export type ChartFinding = {
  label: string;
  value: string;
  group: string;
  trigger: { type: string; value?: string };
};
export function flattenEvidence(
  value: SourceValue,
  path = "",
  result: PreviewContext["evidence"] = {},
) {
  if (value === null || value === "") return result;
  if (Array.isArray(value))
    value.forEach((v, i) => flattenEvidence(v, `${path}.${i}`, result));
  else if (typeof value === "object")
    Object.entries(value).forEach(([k, v]) =>
      flattenEvidence(v, path ? `${path}.${k}` : k, result),
    );
  else result[path] = value;
  return result;
}
export function studioContext(
  id: string,
  version: string,
  profile: Record<string, unknown>,
): PreviewContext {
  const d = profile["demographics"] as Record<string, SourceValue>,
    p = profile["psychosocial"] as Record<string, SourceValue>,
    clinical = structuredClone(profile["clinical"]) as Record<
      string,
      SourceValue
    >;
  const chartFindings: ChartFinding[] = [];
  for (const group of [
    "vitals",
    "exam",
    "laboratory_data",
    "clinical_findings",
    "anthropometrics",
  ])
    for (const [index, item] of (
      (clinical[group] ?? []) as Record<string, SourceValue>[]
    ).entries()) {
      chartFindings.push({
        label: String(item["label"]),
        value: String(item["value"]),
        group,
        trigger: item["trigger"] as ChartFinding["trigger"],
      });
      void index;
    }
  delete clinical["vitals"];
  delete clinical["exam"];
  delete clinical["laboratory_data"];
  delete clinical["clinical_findings"];
  delete clinical["anthropometrics"];
  delete clinical["hidden_diagnosis"];
  delete clinical["differentials"];
  if (
    Array.isArray(clinical["allergies"]) &&
    !clinical["allergies"].length &&
    !clinical["allergy_status"]
  )
    clinical["allergies"] = null;
  const info: Record<string, SourceValue> = {
    demographics: d,
    clinical_profile: clinical,
    medication_profile: profile["medications"] as SourceValue,
    nutrition_profile: profile["nutrition"] as SourceValue,
    psychosocial_profile: p,
  };
  const evidence = flattenEvidence(info);
  chartFindings.forEach((item, i) => {
    evidence[`chart.${i}.value`] = item.value;
  });
  const content = {
    schemaVersion: 2 as const,
    patientId: id,
    draftRevision: 1,
    sourceHash: hashValue({ version, profile }),
    card: {
      patientId: id,
      mode: "published" as const,
      approved: true,
      source: "Faculty" as const,
      fields: {
        name: String(d["name"]),
        ...(typeof d["age"] === "number" ? { age: d["age"] } : {}),
        background: String(d["occupation"] ?? ""),
        gender: String(d["sex"] ?? ""),
      },
    },
    sourceSections: info,
    patientInformation: info,
    evidence,
    conflicts: [],
    missing:
      clinical["allergies"] === null
        ? ["Allergy status is unknown: no negative finding supplied."]
        : [],
    reviewOnly: {
      teachingObjectives: profile["learning"] as SourceValue,
      sourceMetadata: null,
      disclosureCategories: null,
      disclosureExecutable: false as const,
      exploration: null,
      overviewNarrative: null,
    },
    publishedVersionId: version,
    chartFindings,
    disclosureRules: profile["disclosure"] as SourceValue,
  };
  return { ...content, contextHash: hashValue(content) };
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function releasedFindings(
  context: PreviewContext,
  history: Pick<ChatMessage, "role" | "text">[],
): ChartFinding[] {
  const questions = history
    .filter((m) => m.role === "user")
    .map((m) => normalize(m.text));
  return (context.chartFindings ?? []).filter((item) => {
    const t = item.trigger;
    if (
      !t ||
      !["start", "after_turns", "topic_asked", "exam_requested"].includes(
        t.type,
      )
    )
      return false;
    if (t.type === "start") return true;
    if (t.type === "after_turns") return questions.length >= Number(t.value);
    const terms = normalize(t.value ?? "")
      .split(" ")
      .filter(Boolean);
    return (
      terms.length > 0 &&
      questions.some(
        (q) =>
          terms.every((term) =>
            q.split(" ").some((word) => word.startsWith(term.slice(0, 6))),
          ) &&
          (t.type !== "exam_requested" ||
            /exam|test|check|measure|request|look|listen|physical|can i get/.test(
              q,
            )),
      )
    );
  });
}
export function publishedTurnContext(
  context: PreviewContext,
  history: ChatMessage[],
  text: string,
): PreviewContext {
  verifyContext(context);
  const next = structuredClone(context);
  next.evidence = Object.fromEntries(
    Object.entries(next.evidence).filter(([key]) => !key.startsWith("chart.")),
  );
  const released = releasedFindings(context, [
    ...history,
    { role: "user", text },
  ]);
  next.patientInformation["released_chart"] = released.map(
    ({ label, value }) => ({ label, value }),
  );
  for (const [i, item] of (context.chartFindings ?? []).entries())
    if (released.includes(item)) next.evidence[`chart.${i}.value`] = item.value;
  const { contextHash, ...content } = next;
  void contextHash;
  return { ...content, contextHash: hashValue(content) };
}
export async function loadPublishedContext(id: string) {
  const loader = await createDynamoPatientLoader();
  try {
    const loaded = await loader.loadPatientProfile(id);
    if (!loaded.versionId) throw new Error("Published version missing");
    const profile = await (
      await facultyStore()
    ).publishedStudio(id, loaded.versionId);
    return studioContext(id, loaded.versionId, profile);
  } finally {
    loader.destroy();
  }
}
