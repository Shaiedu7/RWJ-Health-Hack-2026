import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { REGION, TABLE_NAME } from "./patients-stack.js";
import { MODEL_ID } from "./preview-conversation.js";
import { facultyStore } from "./faculty-patients.js";
import {
  hashValue,
  verifyContext,
  type PreviewContext,
} from "./preview-context.js";
import {
  GUIDE_PROMPT,
  GUIDE_PROMPT_VERSION,
  fillPrompt,
} from "./feedback-prompts.js";

export type Guide = Record<string, unknown>;
export type StoredGuide = { key: string; guide: Guide; difficulty?: string };
export type GuideSource = {
  patientId: string;
  difficulty?: string;
  inputs: Record<string, string>;
};
/** Sends one prompt and returns the model's raw text. Tests pass a fake. */
export type JsonModelCall = (
  prompt: string,
  maxTokens: number,
  signal: AbortSignal,
) => Promise<string>;
/** The model answered, but not with something usable. Worth one retry. */
export class FeedbackModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackModelError";
  }
}

export const FEEDBACK_MAX_TOKENS = 16_000;
const CALL_TIMEOUT_MS = 240_000;

export const bedrockJson: JsonModelCall = async (prompt, maxTokens, signal) => {
  const client = new BedrockRuntimeClient({
    region: REGION,
    credentials: fromNodeProviderChain({ profile: "twinverse-event" }),
    maxAttempts: 2,
    retryMode: "adaptive",
  });
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [
          { text: "Return only valid JSON. No markdown or commentary." },
        ],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens, temperature: 0 },
      }),
      { abortSignal: signal },
    );
    if (response.stopReason !== "end_turn")
      throw new FeedbackModelError(
        `The model stopped before finishing (${response.stopReason ?? "unknown reason"}).`,
      );
    return (response.output?.message?.content ?? [])
      .map((b) => b.text ?? "")
      .join("");
  } finally {
    client.destroy();
  }
};

export function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    // Some replies wrap the JSON in a sentence; fall back to the outermost object.
    const start = trimmed.indexOf("{"),
      end = trimmed.lastIndexOf("}");
    try {
      value =
        start >= 0 && end > start
          ? JSON.parse(trimmed.slice(start, end + 1))
          : undefined;
    } catch {
      value = undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FeedbackModelError("The response was not a JSON object.");
  return value as Record<string, unknown>;
}

/** Calls the model, retrying once with the rejection reason when the output fails validation. */
export async function callWithRetry<T>(
  prompt: string,
  call: JsonModelCall,
  parse: (text: string) => T,
): Promise<T> {
  const signal = AbortSignal.timeout(CALL_TIMEOUT_MS);
  let correction = "";
  for (let attempt = 0; ; attempt++) {
    try {
      return parse(
        await call(prompt + correction, FEEDBACK_MAX_TOKENS, signal),
      );
    } catch (error) {
      if (!(error instanceof FeedbackModelError) || attempt >= 1) throw error;
      correction = `\n\nYOUR PREVIOUS RESPONSE WAS REJECTED: ${error.message} Return the complete JSON again.`;
    }
  }
}

const list = (value: unknown) => {
  const items = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && !!v.trim())
    : [];
  return items.length
    ? items.map((v) => `- ${v.trim()}`).join("\n")
    : "NOT_SPECIFIED";
};
const object = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Maps a faculty Patient Studio profile onto the guide prompt's placeholders. */
export function guideSourceFromProfile(
  patientId: string,
  profile: Record<string, unknown>,
): GuideSource {
  const { learning, artifacts, metadata, knowledge, _verified, ...patient } =
    profile;
  void metadata;
  void knowledge;
  void _verified;
  const l = object(learning),
    clinical = object(profile["clinical"]),
    overview = object(profile["overview"]);
  const records = (Array.isArray(artifacts) ? artifacts : []).flatMap((a) => {
    const r = object(a);
    return typeof r["findings"] === "string" && r["findings"].trim()
      ? [`${String(r["title"] || r["kind"] || "Record")}: ${r["findings"]}`]
      : [];
  });
  const field =
    typeof l["student_field_of_study"] === "string"
      ? l["student_field_of_study"].trim()
      : "";
  return {
    patientId,
    ...(typeof overview["difficulty"] === "string"
      ? { difficulty: overview["difficulty"] }
      : {}),
    inputs: {
      patient_profile: JSON.stringify(patient, null, 1),
      learning_profile: JSON.stringify({
        expected_discoveries: l["expected_discoveries"] ?? [],
        possible_patient_reactions: l["possible_patient_reactions"] ?? [],
      }),
      objectives: list(l["objectives"]),
      key_questions: list(l["key_questions_to_ask"]),
      common_pitfalls: list(l["common_pitfalls"]),
      competencies: list(l["competencies"]),
      debrief_points: list(l["debrief_points"]),
      artifacts_text: records.length ? records.join("\n") : "None attached",
      case_specific_symptoms: list(l["case_specific_symptoms"]),
      expected_differentials: list(clinical["differentials"]),
      expected_workup: list(l["expected_workup"]),
      expected_treatment: list(l["expected_treatment"]),
      field_of_study: field || "NOT_SPECIFIED",
    },
  };
}

/** The development Wyatt draft has no faculty learning profile, only review-only teaching notes. */
export function guideSourceFromPreview(context: PreviewContext): GuideSource {
  const review = context.reviewOnly;
  return {
    patientId: context.patientId,
    inputs: {
      patient_profile: JSON.stringify(
        {
          patient: context.patientInformation,
          missing: context.missing,
          conflicts: context.conflicts,
        },
        null,
        1,
      ),
      learning_profile: JSON.stringify({
        overview: review.overviewNarrative,
        to_explore: review.exploration,
      }),
      objectives: review.teachingObjectives
        ? JSON.stringify(review.teachingObjectives)
        : "NOT_SPECIFIED",
      key_questions: "NOT_SPECIFIED",
      common_pitfalls: "NOT_SPECIFIED",
      competencies: "NOT_SPECIFIED",
      debrief_points: "NOT_SPECIFIED",
      artifacts_text: "None attached",
      case_specific_symptoms: "NOT_SPECIFIED",
      expected_differentials: "NOT_SPECIFIED",
      expected_workup: "NOT_SPECIFIED",
      expected_treatment: "NOT_SPECIFIED",
      field_of_study: "NOT_SPECIFIED",
    },
  };
}

export async function loadGuideSource(
  context: PreviewContext,
): Promise<GuideSource> {
  if (!context.card.approved || !context.publishedVersionId)
    return guideSourceFromPreview(context);
  const profile = await (
    await facultyStore()
  ).publishedStudio(context.patientId, context.publishedVersionId);
  return guideSourceFromProfile(context.patientId, profile);
}

export function parseGuide(text: string): Guide {
  const guide = parseModelJson(text);
  for (const key of ["phases", "hpiChecklist", "medicalHistoryChecklist"])
    if (!Array.isArray(guide[key]))
      throw new FeedbackModelError(`The guide has no "${key}" list.`);
  return guide;
}

export const guideKey = (source: GuideSource) =>
  hashValue({
    prompt: GUIDE_PROMPT_VERSION,
    model: MODEL_ID,
    inputs: source.inputs,
  });

export interface GuideCache {
  get(patientId: string, key: string): Promise<Guide | undefined>;
  put(patientId: string, key: string, guide: Guide): Promise<void>;
}
export function createGuideCache(): GuideCache {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: REGION,
      credentials: fromNodeProviderChain({ profile: "twinverse-event" }),
      maxAttempts: 3,
    }),
  );
  // Content-addressed: a changed profile or prompt gets a new key, so stale guides are never reused.
  const key = (patientId: string, hash: string) => ({
    PK: `PATIENT#${patientId}`,
    SK: `GUIDE#${hash}`,
  });
  return {
    async get(patientId, hash) {
      const { Item } = await client.send(
        new GetCommand({ TableName: TABLE_NAME, Key: key(patientId, hash) }),
      );
      return Item?.["guide"] as Guide | undefined;
    },
    async put(patientId, hash, guide) {
      await client.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...key(patientId, hash),
            entityType: "ENCOUNTER_GUIDE",
            promptVersion: GUIDE_PROMPT_VERSION,
            modelId: MODEL_ID,
            createdAt: new Date().toISOString(),
            guide,
          },
        }),
      );
    },
  };
}

export type GuideDeps = {
  cache: GuideCache;
  call: JsonModelCall;
  load: (context: PreviewContext) => Promise<GuideSource>;
};
let defaults: GuideDeps | undefined;
const defaultGuideDeps = () =>
  (defaults ??= {
    cache: createGuideCache(),
    call: bedrockJson,
    load: loadGuideSource,
  });

const inFlight = new Map<string, Promise<StoredGuide>>();
/** Returns the cached gold-standard guide for this patient version, generating it on first use. */
export async function ensureGuide(
  context: PreviewContext,
  deps: GuideDeps = defaultGuideDeps(),
): Promise<StoredGuide> {
  verifyContext(context);
  const source = await deps.load(context);
  const key = guideKey(source);
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const meta = {
      key,
      ...(source.difficulty ? { difficulty: source.difficulty } : {}),
    };
    const cached = await deps.cache.get(source.patientId, key);
    if (cached) return { ...meta, guide: cached };
    const guide = await callWithRetry(
      fillPrompt(GUIDE_PROMPT, source.inputs),
      deps.call,
      parseGuide,
    );
    await deps.cache.put(source.patientId, key, guide);
    return { ...meta, guide };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
