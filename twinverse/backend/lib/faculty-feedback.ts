import { randomUUID } from "node:crypto";
import { FacultyError } from "./faculty-patients.js";
import {
  defaultFeedbackDeps,
  type FacultyComment,
  type FeedbackStore,
  type FeedbackSummary,
} from "./encounter-feedback.js";
import {
  createEncounterStore,
  type EncounterStore,
} from "./student-encounters.js";

export type FacultyFeedbackDeps = {
  feedback: FeedbackStore;
  encounters: EncounterStore;
};
let defaults: FacultyFeedbackDeps | undefined;
const defaultDeps = () =>
  (defaults ??= {
    feedback: defaultFeedbackDeps().store,
    encounters: createEncounterStore(),
  });

/** A row in the faculty encounter lists (ReviewEntry in the frontend). */
export function reviewEntry(s: FeedbackSummary) {
  return {
    encounterId: s.encounterId,
    studentId: s.studentId,
    studentName: s.studentName,
    patientName: s.patientName,
    completedAt: s.completedAt,
    messageCount: s.messageCount,
    totalScore: s.scoring?.rawScore ?? 0,
    maxScore: s.scoring?.maxScore ?? 0,
    ...(s.scoring ? { weightedPercent: s.scoring.weightedPercent } : {}),
    needsReview: s.needsReview,
    commentCount: s.commentCount,
  };
}

/** One row per student, with the mean of their raw scores as a percentage. */
export function studentRows(summaries: FeedbackSummary[]) {
  const byStudent = new Map<string, FeedbackSummary[]>();
  for (const s of summaries)
    byStudent.set(s.studentId, [...(byStudent.get(s.studentId) ?? []), s]);
  return [...byStudent.entries()]
    .map(([studentId, rows]) => {
      const scored = rows.filter((r) => r.scoring?.maxScore);
      const mean = (values: number[]) =>
        values.length
          ? Math.round(
              (values.reduce((a, b) => a + b, 0) / values.length) * 10,
            ) / 10
          : null;
      const latest = rows.reduce((a, b) =>
        a.completedAt > b.completedAt ? a : b,
      );
      return {
        studentId,
        studentName: latest.studentName,
        assessmentCount: rows.length,
        averagePercent: mean(
          scored.map(
            (r) =>
              ((r.scoring?.rawScore ?? 0) / (r.scoring?.maxScore ?? 1)) * 100,
          ),
        ),
        averageScore: mean(scored.map((r) => r.scoring?.rawScore ?? 0)),
        maxScore: scored[0]?.scoring?.maxScore ?? 0,
        lastCompletedAt: latest.completedAt,
        needsReviewCount: rows.filter((r) => r.needsReview).length,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function parseComment(
  input: Record<string, unknown>,
): Pick<FacultyComment, "text" | "target"> {
  const text = typeof input["text"] === "string" ? input["text"].trim() : "";
  if (!text || text.length > 6000)
    throw new FacultyError(422, "Write a comment under 6,000 characters.");
  const t =
    input["target"] && typeof input["target"] === "object"
      ? (input["target"] as Record<string, unknown>)
      : {};
  const id = (key: string) =>
    typeof t[key] === "string" && t[key].length <= 100 ? t[key] : "";
  if (t["kind"] === "overall") return { text, target: { kind: "overall" } };
  if (t["kind"] === "item" && id("itemId"))
    return { text, target: { kind: "item", itemId: id("itemId") } };
  if (t["kind"] === "message" && id("messageId"))
    return { text, target: { kind: "message", messageId: id("messageId") } };
  throw new FacultyError(422, "Choose what the comment is about.");
}

/**
 * Faculty feedback routes, relative to /api/faculty. Returns the response body,
 * or undefined when the path is not a feedback route.
 */
export async function facultyFeedbackRoute(
  path: string,
  method: string,
  readBody: () => Promise<Record<string, unknown>>,
  author: string,
  deps: FacultyFeedbackDeps = defaultDeps(),
): Promise<unknown> {
  const summaries = () => deps.feedback.summaries();
  const find = async (encounterId: string) => {
    const summary = (await summaries()).find(
      (s) => s.encounterId === encounterId,
    );
    if (!summary)
      throw new FacultyError(
        404,
        "This assessment is not available for review.",
      );
    return summary;
  };

  if (path === "/feedback" && method === "GET")
    return {
      reviews: (await summaries())
        .map(reviewEntry)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    };
  if (path === "/students" && method === "GET")
    return { students: studentRows(await summaries()) };

  const student = path.match(/^\/students\/([^/]{1,128})$/);
  if (student && method === "GET") {
    const rows = (await summaries()).filter((s) => s.studentId === student[1]);
    const [row] = studentRows(rows);
    if (!row)
      throw new FacultyError(404, "This student has no completed assessments.");
    return {
      student: row,
      reviews: rows
        .map(reviewEntry)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    };
  }

  const detail = path.match(/^\/feedback\/([0-9a-f-]{36})$/i);
  if (detail && method === "GET") {
    const summary = await find(detail[1] ?? "");
    const [record, encounter, comments] = await Promise.all([
      deps.feedback.get(summary.studentId, summary.encounterId),
      deps.encounters.get(summary.studentId, summary.encounterId),
      deps.feedback.comments(summary.studentId, summary.encounterId),
    ]);
    if (!record?.feedback || !encounter)
      throw new FacultyError(
        404,
        "This assessment is not available for review.",
      );
    return {
      entry: reviewEntry({ ...summary, commentCount: comments.length }),
      scoring: record.scoring ?? null,
      messages: encounter.messages.map(
        ({ id, role, text, sequence, createdAt }) => ({
          id,
          role,
          text,
          sequence,
          createdAt,
        }),
      ),
      feedback: { ...(record.feedback as object), facultyComments: comments },
    };
  }

  const add = path.match(/^\/feedback\/([0-9a-f-]{36})\/comments$/i);
  const remove = path.match(
    /^\/feedback\/([0-9a-f-]{36})\/comments\/([0-9a-f-]{36})\/remove$/i,
  );
  if ((add || remove) && method === "POST") {
    const input = await readBody();
    const summary = await find((add ?? remove)?.[1] ?? "");
    const current = await deps.feedback.comments(
      summary.studentId,
      summary.encounterId,
    );
    const comments = add
      ? [
          ...current,
          {
            id: randomUUID(),
            author,
            createdAt: new Date().toISOString(),
            ...parseComment(input),
          },
        ]
      : current.filter((c) => c.id !== remove?.[2]);
    await deps.feedback.saveComments(
      summary.studentId,
      summary.encounterId,
      comments,
    );
    return { comments };
  }
  return undefined;
}
