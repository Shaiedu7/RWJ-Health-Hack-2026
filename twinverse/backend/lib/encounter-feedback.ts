import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  paginateScan,
} from "@aws-sdk/lib-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { REGION, TABLE_NAME } from "./patients-stack.js";
import { hashValue, type PreviewContext } from "./preview-context.js";
import type { ChatMessage } from "./preview-conversation.js";
import { EncounterError, type Encounter } from "./student-encounters.js";
import {
  EVALUATION_PROMPT,
  EVALUATION_PROMPT_VERSION,
  fillPrompt,
} from "./feedback-prompts.js";
import {
  bedrockJson,
  callWithRetry,
  ensureGuide,
  FeedbackModelError,
  parseModelJson,
  type Guide,
  type JsonModelCall,
  type StoredGuide,
} from "./encounter-guide.js";

type Raw = Record<string, unknown>;
type Score = 1 | 2 | 3;
export type Rubric = {
  rubricName: string;
  scoringScale: Record<string, string>;
  maxScore: number;
  sections: {
    id: string;
    name: string;
    items: {
      id: string;
      name: string;
      prompt: string;
      scoring: Record<string, string>;
    }[];
  }[];
};
export const RUBRIC = JSON.parse(
  readFileSync(new URL("./encounter-rubric.json", import.meta.url), "utf8"),
) as Rubric;
const RUBRIC_ITEMS = RUBRIC.sections.flatMap((s) => s.items);

// ---------- transcript ----------
export type Turn = {
  turn: number;
  role: "STUDENT" | "PATIENT";
  text: string;
  timestamp: string;
};
const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
/** Turn numbers are the stored message sequence, which is what the feedback UI cites. */
export function buildTranscript(messages: ChatMessage[]): Turn[] {
  const sorted = [...messages].sort((a, b) => a.sequence - b.sequence);
  const start = Date.parse(sorted[0]?.createdAt ?? "");
  return sorted.map((m) => {
    const at = Date.parse(m.createdAt);
    const seconds =
      Number.isFinite(at) && Number.isFinite(start)
        ? Math.max(0, Math.round((at - start) / 1000))
        : 0;
    return {
      turn: m.sequence,
      role: m.role === "user" ? "STUDENT" : "PATIENT",
      text: m.text,
      timestamp: mmss(seconds),
    };
  });
}
export const transcriptText = (turns: Turn[]) =>
  turns
    .map(
      (t) =>
        `[T${t.turn} | ${t.timestamp} | ${t.role}] ${t.text.replace(/\s+/g, " ").trim()}`,
    )
    .join("\n");
export const transcriptHash = (messages: ChatMessage[]) =>
  hashValue({
    prompt: EVALUATION_PROMPT_VERSION,
    messages: messages.map(({ id, text }) => ({ id, text })),
  });

// ---------- model call ----------
export function evaluationPrompt(guide: Guide, turns: Turn[]) {
  return fillPrompt(EVALUATION_PROMPT, {
    rubric_json: JSON.stringify(RUBRIC, null, 1),
    guide_json: JSON.stringify(guide),
    transcript: transcriptText(turns),
    // Scribe word timings are not stored yet, so every encounter is graded as text-only.
    pacing_metrics_json: "{}",
  });
}
export function parseEvaluation(text: string): Raw {
  const raw = parseModelJson(text);
  const items = Array.isArray(raw["items"]) ? (raw["items"] as unknown[]) : [];
  for (const { id } of RUBRIC_ITEMS) {
    const item = items.find(
      (i) => i && typeof i === "object" && String((i as Raw)["id"]) === id,
    ) as Raw | undefined;
    if (!item)
      throw new FeedbackModelError(
        `Rubric item ${id} is missing from "items".`,
      );
    if (![1, 2, 3].includes(Number(item["score"])))
      throw new FeedbackModelError(
        `Rubric item ${id} must have a score of 1, 2 or 3.`,
      );
  }
  return raw;
}
export const evaluateTranscript = (
  guide: Guide,
  turns: Turn[],
  call: JsonModelCall,
) => callWithRetry(evaluationPrompt(guide, turns), call, parseEvaluation);

// ---------- checks done in code ----------
const array = (value: unknown) => (Array.isArray(value) ? value : []);
const object = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** True when every fragment of the quote (split on ellipses) appears in the turn text. */
export function quoteMatches(quote: string, text: string) {
  const haystack = ` ${normalize(text)} `;
  const parts = quote
    .split(/\.\.\.|…/)
    .map(normalize)
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => haystack.includes(` ${p} `));
}

export type Evidence = { turn: number; timestamp: string; quote: string };
/** Keeps a citation only if it points at a student turn and its quote is really in that turn. */
function verifiedEvidence(
  value: unknown,
  byTurn: Map<number, Turn>,
): Evidence | undefined {
  const e = object(value),
    turn = byTurn.get(Number(e["turn"])),
    quote = str(e["quote"]);
  if (
    !turn ||
    turn.role !== "STUDENT" ||
    !quote ||
    !quoteMatches(quote, turn.text)
  )
    return undefined;
  return { turn: turn.turn, timestamp: turn.timestamp, quote };
}

const specified = (value: unknown) =>
  array(value).filter((v) => !JSON.stringify(v).includes("NOT_SPECIFIED"))
    .length;
/** Rubric thresholds for the counting items. `expected` is the checklist size the guide implies. */
const COUNTED: Record<
  string,
  {
    expected: (guide: Guide) => number;
    score: (hit: number, total: number) => Score;
  }
> = {
  "1.1": {
    expected: () => 10,
    score: (hit) => (hit >= 7 ? 3 : hit >= 4 ? 2 : 1),
  },
  "1.2": {
    expected: (g) => specified(g["caseSpecificSymptoms"]),
    score: (hit, total) =>
      hit / total >= 0.7 ? 3 : hit / total >= 0.3 ? 2 : 1,
  },
  "1.3": {
    expected: () => 6,
    score: (hit) => (hit >= 5 ? 3 : hit >= 3 ? 2 : 1),
  },
  "2.1": {
    expected: (g) => specified(g["expectedDifferentials"]),
    score: (hit) => (hit >= 3 ? 3 : hit >= 1 ? 2 : 1),
  },
  // "Missing 1–2" is the only partial level, so any partial coverage scores 2.
  "2.2": {
    expected: (g) => specified(g["expectedWorkup"]),
    score: (hit, total) => (hit === 0 ? 1 : hit >= total ? 3 : 2),
  },
};

export type FinalItem = {
  id: string;
  score: Score;
  modelScore: Score;
  rationale: string;
  evidence: Evidence[];
  checklist?: { item: string; covered: boolean; turn?: number }[];
};
export type Scoring = {
  rawScore: number;
  maxScore: number;
  difficulty?: string;
  weightedPercent: number;
};
// Difficulty only changes how much each item counts; the grader scores everyone the same way.
const WEIGHTS: Record<string, Record<string, number>> = {
  beginner: { "2.1": 0.5, "2.2": 0.5, "2.3": 0.5, "2.4": 0.5 },
  intermediate: { "2.3": 0.5, "4.5": 1.25 },
  advanced: { "4.1": 1.5, "4.3": 1.5, "4.4": 1.5, "4.5": 1.5 },
};
export function scoreEncounter(
  items: Pick<FinalItem, "id" | "score">[],
  difficulty?: string,
): Scoring {
  const weights = WEIGHTS[difficulty ?? ""] ?? {};
  const weight = (id: string) => weights[id] ?? 1;
  const earned = items.reduce((sum, i) => sum + i.score * weight(i.id), 0);
  const possible = items.reduce((sum, i) => sum + 3 * weight(i.id), 0);
  return {
    rawScore: items.reduce((sum, i) => sum + i.score, 0),
    maxScore: items.length * 3,
    ...(difficulty ? { difficulty } : {}),
    weightedPercent: possible ? Math.round((earned / possible) * 1000) / 10 : 0,
  };
}

export function finalizeEvaluation(
  raw: Raw,
  guide: Guide,
  turns: Turn[],
  difficulty?: string,
) {
  const byTurn = new Map(turns.map((t) => [t.turn, t]));
  const flags: string[] = [];
  const rawItems = array(raw["items"]).map(object);

  const items: FinalItem[] = RUBRIC_ITEMS.map((ri) => {
    const r = rawItems.find((i) => String(i["id"]) === ri.id) ?? {};
    const modelScore = Number(r["score"]) as Score;
    const cited = array(r["evidence"]);
    const evidence = cited
      .map((e) => verifiedEvidence(e, byTurn))
      .filter((e): e is Evidence => !!e);
    let score = modelScore,
      rationale = str(r["rationale"]);
    if (cited.length && !evidence.length)
      flags.push(
        `${ri.name} (${ri.id}): none of the quotes cited for this score match the transcript. Check the score.`,
      );

    const counted = COUNTED[ri.id];
    let checklist: FinalItem["checklist"];
    if (counted) {
      // One row per checklist item; it counts only if a real student turn is cited.
      const rows = new Map<
        string,
        { item: string; covered: boolean; turn?: number }
      >();
      for (const entry of array(r["checklist"]).map(object)) {
        const item = str(entry["item"]);
        if (!item) continue;
        const turn = byTurn.get(Number(entry["turn"]));
        const covered = entry["covered"] === true && turn?.role === "STUDENT";
        const key = normalize(item);
        if (!rows.get(key)?.covered)
          rows.set(key, {
            item,
            covered,
            ...(covered && turn ? { turn: turn.turn } : {}),
          });
      }
      checklist = [...rows.values()];
      const total = Math.max(checklist.length, counted.expected(guide));
      if (!checklist.length || !total)
        flags.push(
          `${ri.name} (${ri.id}): no checklist came back, so the count could not be re-checked.`,
        );
      else {
        const hit = checklist.filter((c) => c.covered).length;
        let recount = counted.score(hit, total);
        // Descriptor 1 also covers "discusses incorrect diagnoses", which a count cannot see.
        if (ri.id === "2.1") recount = Math.min(recount, modelScore) as Score;
        if (recount !== modelScore)
          rationale += ` (Score set to ${recount} from the checklist count: ${hit} of ${total} covered.)`;
        score = recount;
      }
    }
    return {
      id: ri.id,
      score,
      modelScore,
      rationale: rationale.trim(),
      evidence,
      ...(checklist ? { checklist } : {}),
    };
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of ["4.6", "4.3"])
    if (byId.get(id)?.score === 1) {
      const name = RUBRIC_ITEMS.find((i) => i.id === id)?.name ?? id;
      flags.unshift(
        `${name} (${id}) scored 1. Faculty review is recommended whatever the total.`,
      );
    }

  const cite = (value: Raw) => verifiedEvidence(value, byTurn);
  const strengths = array(raw["strengths"])
    .map(object)
    .filter((s) => str(s["point"]));
  const improvements = array(raw["improvements"])
    .map(object)
    .filter((s) => str(s["point"]));
  const coverage = object(object(raw["scriptAlignment"])["keywordCoverage"]);
  const labels = (value: unknown) =>
    array(value)
      .map((v) =>
        typeof v === "string"
          ? v
          : str(object(v)["item"]) || str(object(v)["label"]),
      )
      .filter(Boolean);

  // The shape src/feedback/normalize.ts accepts. Totals are left out on purpose: the UI computes them.
  const feedback = {
    rubricName: RUBRIC.rubricName,
    generatedAt: new Date().toISOString(),
    scale: RUBRIC.scoringScale,
    summary: str(raw["reflection"]),
    reviewFlags: flags,
    sections: RUBRIC.sections.map((section) => ({
      sectionId: section.id,
      name: section.name,
      items: section.items.map((ri) => {
        const item = byId.get(ri.id) as FinalItem;
        return {
          itemId: ri.id,
          name: ri.name,
          prompt: ri.prompt,
          score: item.score,
          descriptor: ri.scoring[String(item.score)] ?? "",
          levels: ri.scoring,
          rationale: item.rationale,
          evidenceTurns: item.evidence.map((e) => e.turn),
        };
      }),
    })),
    learningObjectives: array(raw["learningObjectives"])
      .map(object)
      .filter((o) => str(o["objective"]))
      .map((o, i) => ({
        objectiveId: `lo-${i + 1}`,
        text: str(o["objective"]),
        outcome: o["met"] === true ? "met" : "notMet",
        evidenceTurns: array(o["evidence"])
          .map((e) => cite(object(e)))
          .filter((e): e is Evidence => !!e)
          .map((e) => e.turn),
      })),
    findings: {
      elicited: labels(coverage["hit"]).map((label) => ({ label })),
      missed: labels(coverage["missed"]).map((label) => ({ label })),
    },
    strengths: strengths.map((s) => ({
      text: [str(s["point"]), str(s["whyItMatters"])].filter(Boolean).join(" "),
      evidenceTurns: cite(s) ? [Number(s["turn"])] : [],
    })),
    improvements: improvements.map((s) => ({
      text: [str(s["point"]), str(s["whyItMatters"])].filter(Boolean).join(" "),
      suggestion: str(s["trySaying"])
        ? `Try saying: "${str(s["trySaying"])}"`
        : "",
      evidenceTurns: cite(s) ? [Number(s["turn"])] : [],
    })),
    suggestions: array(raw["suggestions"]).map(str).filter(Boolean),
    annotations: [
      ...strengths
        .filter((s) => cite(s))
        .map((s) => ({
          turn: Number(s["turn"]),
          sentiment: "strength",
          comment: str(s["point"]),
        })),
      ...improvements
        .filter((s) => cite(s))
        .map((s) => ({
          turn: Number(s["turn"]),
          sentiment: "improvement",
          comment: str(s["point"]),
        })),
    ],
    facultyComments: [],
  };
  return { feedback, items, scoring: scoreEncounter(items, difficulty) };
}

// ---------- storage ----------
export type FeedbackRecord = {
  encounterId: string;
  patientId: string;
  transcriptHash: string;
  status: "pending" | "ready" | "failed";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  guideKey?: string;
  feedback?: unknown;
  items?: FinalItem[];
  scoring?: Scoring;
  evaluation?: unknown;
  // Copied onto the record so the faculty lists need no extra lookups.
  studentName?: string;
  patientName?: string;
  messageCount?: number;
  needsReview?: boolean;
};
export type CommentTarget =
  | { kind: "overall" }
  | { kind: "item"; itemId: string }
  | { kind: "message"; messageId: string };
export type FacultyComment = {
  id: string;
  author: string;
  createdAt: string;
  text: string;
  target: CommentTarget;
};
/** One completed assessment, as the faculty lists show it. */
export type FeedbackSummary = {
  studentId: string;
  studentName: string;
  encounterId: string;
  patientId: string;
  patientName: string;
  completedAt: string;
  messageCount: number;
  scoring?: Scoring;
  needsReview: boolean;
  commentCount: number;
};
export interface FeedbackStore {
  get(
    student: string,
    encounterId: string,
  ): Promise<FeedbackRecord | undefined>;
  put(student: string, record: FeedbackRecord): Promise<void>;
  /** Saves only while the stored record still belongs to the same transcript. */
  complete(student: string, record: FeedbackRecord): Promise<void>;
  /** Faculty comments live in their own item so regenerating the AI report never loses them. */
  comments(student: string, encounterId: string): Promise<FacultyComment[]>;
  saveComments(
    student: string,
    encounterId: string,
    comments: FacultyComment[],
  ): Promise<void>;
  /** Every finished assessment across all students. */
  summaries(): Promise<FeedbackSummary[]>;
}
export function createFeedbackStore(): FeedbackStore {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: REGION,
      credentials: fromNodeProviderChain({ profile: "twinverse-event" }),
      maxAttempts: 3,
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  const partition = (student: string) => `STUDENT#twinverse-event#${student}`;
  const key = (student: string, id: string) => ({
    PK: partition(student),
    SK: `FEEDBACK#${id}`,
  });
  const commentsKey = (student: string, id: string) => ({
    PK: partition(student),
    SK: `FEEDBACK_COMMENTS#${id}`,
  });
  return {
    async get(student, id) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: key(student, id),
          ConsistentRead: true,
        }),
      );
      return Item as FeedbackRecord | undefined;
    },
    async put(student, record) {
      await client.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { ...record, ...key(student, record.encounterId) },
        }),
      );
    },
    async complete(student, record) {
      try {
        await client.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...record, ...key(student, record.encounterId) },
            ConditionExpression: "transcriptHash = :hash",
            ExpressionAttributeValues: { ":hash": record.transcriptHash },
          }),
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          error.name === "ConditionalCheckFailedException"
        ))
          throw error;
      }
    },
    async comments(student, id) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: commentsKey(student, id),
          ConsistentRead: true,
        }),
      );
      return (Item?.["comments"] as FacultyComment[] | undefined) ?? [];
    },
    async saveComments(student, id, comments) {
      await client.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { ...commentsKey(student, id), encounterId: id, comments },
        }),
      );
    },
    async summaries() {
      // Encounters are partitioned per student and no index spans them, so the faculty view
      // scans. Fine for the local preview; a deployed version should add a GSI instead.
      const rows: Raw[] = [];
      for await (const page of paginateScan(
        { client },
        {
          TableName: TABLE_NAME,
          FilterExpression:
            "begins_with(PK, :student) AND (begins_with(SK, :feedback) OR begins_with(SK, :comments))",
          ExpressionAttributeValues: {
            ":student": "STUDENT#twinverse-event#",
            ":feedback": "FEEDBACK#",
            ":comments": "FEEDBACK_COMMENTS#",
          },
          ProjectionExpression:
            "PK, SK, encounterId, patientId, patientName, studentName, #status, finishedAt, messageCount, scoring, needsReview, comments",
          ExpressionAttributeNames: { "#status": "status" },
        },
      ))
        rows.push(...((page.Items ?? []) as Raw[]));
      const studentOf = (row: Raw) =>
        String(row["PK"]).slice("STUDENT#twinverse-event#".length);
      const commentCounts = new Map(
        rows
          .filter((r) => String(r["SK"]).startsWith("FEEDBACK_COMMENTS#"))
          .map((r) => [
            `${studentOf(r)}/${String(r["encounterId"])}`,
            array(r["comments"]).length,
          ]),
      );
      return rows
        .filter(
          (r) =>
            String(r["SK"]).startsWith("FEEDBACK#") && r["status"] === "ready",
        )
        .map((r) =>
          toSummary(
            studentOf(r),
            r as FeedbackRecord,
            commentCounts.get(`${studentOf(r)}/${String(r["encounterId"])}`) ??
              0,
          ),
        );
    },
  };
}
export function toSummary(
  studentId: string,
  record: FeedbackRecord,
  commentCount: number,
): FeedbackSummary {
  return {
    studentId,
    studentName: record.studentName || `Student ${studentId.slice(0, 8)}`,
    encounterId: record.encounterId,
    patientId: record.patientId,
    patientName: record.patientName ?? "Patient",
    completedAt: record.finishedAt ?? record.startedAt,
    messageCount: record.messageCount ?? 0,
    ...(record.scoring ? { scoring: record.scoring } : {}),
    needsReview: record.needsReview ?? false,
    commentCount,
  };
}

// ---------- request handling ----------
export type FeedbackResponse =
  { status: "pending" } | { status: "ready"; feedback: unknown };
export type FeedbackDeps = {
  store: FeedbackStore;
  guide: (context: PreviewContext) => Promise<StoredGuide>;
  call: JsonModelCall;
};
let defaults: FeedbackDeps | undefined;
export const defaultFeedbackDeps = () =>
  (defaults ??= {
    store: createFeedbackStore(),
    guide: (c) => ensureGuide(c),
    call: bedrockJson,
  });

// The preview server is one process, so this map is the source of truth for running jobs.
const running = new Map<string, Promise<void>>();
const jobKey = (student: string, encounterId: string) =>
  `${student}/${encounterId}`;

async function runFeedback(
  deps: FeedbackDeps,
  student: string,
  encounter: Encounter,
  record: FeedbackRecord,
) {
  try {
    if (!encounter.context)
      throw new EncounterError(
        409,
        "This archived encounter cannot be scored.",
      );
    const { key, guide, difficulty } = await deps.guide(encounter.context);
    const turns = buildTranscript(encounter.messages);
    const evaluation = await evaluateTranscript(guide, turns, deps.call);
    const result = finalizeEvaluation(evaluation, guide, turns, difficulty);
    await deps.store.complete(student, {
      ...record,
      status: "ready",
      finishedAt: new Date().toISOString(),
      guideKey: key,
      feedback: result.feedback,
      items: result.items,
      scoring: result.scoring,
      needsReview: result.feedback.reviewFlags.length > 0,
      evaluation,
    });
  } catch (error) {
    console.error(
      "Feedback generation failed:",
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "UnknownError",
    );
    const message =
      error instanceof FeedbackModelError
        ? `Feedback could not be generated: ${error.message} Please retry.`
        : "Feedback could not be generated. Please retry.";
    await deps.store
      .complete(student, {
        ...record,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: message,
      })
      .catch(() => undefined);
  }
}

/** The stored AI report plus the instructor's comments, which are kept separately. */
async function ready(
  deps: FeedbackDeps,
  student: string,
  record: FeedbackRecord,
): Promise<FeedbackResponse> {
  return {
    status: "ready",
    feedback: {
      ...(record.feedback as Raw),
      facultyComments: await deps.store.comments(student, record.encounterId),
    },
  };
}

/** POST: returns stored feedback for this exact transcript, or starts generating it. Safe to repeat. */
export async function requestFeedback(
  deps: FeedbackDeps,
  student: string,
  encounter: Encounter,
  studentName?: string,
): Promise<FeedbackResponse> {
  if (!encounter.context)
    throw new EncounterError(409, "This archived encounter cannot be scored.");
  if (!encounter.messages.some((m) => m.role === "user"))
    throw new EncounterError(
      409,
      "Ask the patient at least one question before requesting feedback.",
    );
  const hash = transcriptHash(encounter.messages);
  const key = jobKey(student, encounter.encounterId);
  const existing = await deps.store.get(student, encounter.encounterId);
  if (existing?.transcriptHash === hash) {
    if (existing.status === "ready") return ready(deps, student, existing);
    if (existing.status === "pending" && running.has(key))
      return { status: "pending" };
  }
  const record: FeedbackRecord = {
    encounterId: encounter.encounterId,
    patientId: encounter.patientId,
    transcriptHash: hash,
    status: "pending",
    startedAt: new Date().toISOString(),
    patientName: encounter.context.card.fields.name,
    messageCount: encounter.messages.length,
    ...(studentName ? { studentName } : {}),
  };
  await deps.store.put(student, record);
  const job = runFeedback(deps, student, encounter, record).finally(() => {
    if (running.get(key) === job) running.delete(key);
  });
  running.set(key, job);
  return { status: "pending" };
}

/** GET: reports progress for the encounter's current transcript. */
export async function feedbackStatus(
  deps: FeedbackDeps,
  student: string,
  encounter: Encounter,
): Promise<FeedbackResponse> {
  const existing = await deps.store.get(student, encounter.encounterId);
  if (
    !existing ||
    existing.transcriptHash !== transcriptHash(encounter.messages)
  )
    throw new EncounterError(
      404,
      "Feedback has not been requested for this conversation yet.",
    );
  if (existing.status === "ready") return ready(deps, student, existing);
  if (existing.status === "failed")
    throw new EncounterError(
      503,
      existing.error ?? "Feedback could not be generated. Please retry.",
    );
  if (running.has(jobKey(student, encounter.encounterId)))
    return { status: "pending" };
  throw new EncounterError(
    503,
    "Feedback generation was interrupted. Please retry.",
  );
}
