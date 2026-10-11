/**
 * Feedback data source. Calls the backend by default. Set VITE_FEEDBACK_SOURCE=sample to serve
 * sample reports instead, with faculty comments kept in this browser's localStorage. Routes:
 *   POST   /api/encounters/:id/feedback                     -> { status: "pending" } | { status: "ready", feedback }
 *   GET    /api/encounters/:id/feedback                     -> same
 *   GET    /api/faculty/feedback                            -> { reviews: ReviewEntry[] }
 *   GET    /api/faculty/students                            -> { students: StudentRow[] }
 *   GET    /api/faculty/students/:studentId                 -> { student: StudentRow, reviews: ReviewEntry[] }
 *   GET    /api/faculty/feedback/:id                        -> { entry, messages, feedback }
 *   POST   /api/faculty/feedback/:id/comments               -> { comments }   body { text, target }
 *   POST   /api/faculty/feedback/:id/comments/:commentId/remove -> { comments }
 * Payloads are described in FEEDBACK-INTEGRATION.md and checked by normalize.ts.
 */
import type { CommentTarget, FacultyComment, FeedbackReport, ReviewDetail, ReviewEntry, StudentRow, TranscriptMessage } from "./types.ts";
import { normalizeComments, normalizeReport } from "./normalize.ts";
import { buildSampleReport, SAMPLE_ENCOUNTER_ID, SAMPLE_MESSAGES, SAMPLE_PATIENT, SAMPLE_STUDENT } from "./sample.ts";

export const LIVE = import.meta.env.VITE_FEEDBACK_SOURCE !== "sample";
const preview = "?mode=development-preview";

export interface FeedbackApi {
  studentReport(encounter: { encounterId: string; patientName: string; messages: TranscriptMessage[] }, signal?: AbortSignal): Promise<FeedbackReport>;
  listReviews(): Promise<ReviewEntry[]>;
  listStudents(): Promise<StudentRow[]>;
  studentReviews(studentId: string): Promise<{ student: StudentRow; reviews: ReviewEntry[] }>;
  review(encounterId: string): Promise<ReviewDetail>;
  /** Both comment calls return the encounter's full comment list after the change. */
  addComment(encounterId: string, target: CommentTarget, text: string): Promise<FacultyComment[]>;
  removeComment(encounterId: string, commentId: string): Promise<FacultyComment[]>;
}

// ---------- sample data ----------
type Stored = { encounterId: string; studentName: string; patientName: string; messages: TranscriptMessage[]; comments: FacultyComment[] };
const KEY = "twinverse.feedback.sample.v1";
const builtIn = (): Stored => ({ encounterId: SAMPLE_ENCOUNTER_ID, studentName: SAMPLE_STUDENT, patientName: SAMPLE_PATIENT, messages: SAMPLE_MESSAGES, comments: [] });
function readAll(): Record<string, Stored> {
  let saved: Record<string, Stored> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Stored>; } catch { /* unreadable storage: start from the built-in sample */ }
  return { [SAMPLE_ENCOUNTER_ID]: { ...builtIn(), comments: saved[SAMPLE_ENCOUNTER_ID]?.comments ?? [] }, ...Object.fromEntries(Object.entries(saved).filter(([id]) => id !== SAMPLE_ENCOUNTER_ID)) };
}
function writeAll(all: Record<string, Stored>) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { throw new Error("This browser could not save the comment."); }
}
const reportFor = (stored: Stored): FeedbackReport => ({ ...buildSampleReport(stored.encounterId, stored.messages), facultyComments: stored.comments });
function entryFor(stored: Stored): ReviewEntry {
  const report = reportFor(stored);
  return { encounterId: stored.encounterId, studentId: sampleStudentId(stored.studentName), studentName: stored.studentName, patientName: stored.patientName, completedAt: report.generatedAt, messageCount: stored.messages.length, totalScore: report.totalScore, maxScore: report.maxScore, needsReview: report.reviewFlags.length > 0, commentCount: stored.comments.length };
}
const sampleStudentId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Groups review rows into student rows, averaging total ÷ maximum. Mirrors the backend's studentRows. */
export function summarizeStudents(rows: ReviewEntry[]): StudentRow[] {
  const groups = new Map<string, ReviewEntry[]>();
  for (const row of rows) { const id = row.studentId ?? sampleStudentId(row.studentName); groups.set(id, [...(groups.get(id) ?? []), row]); }
  return [...groups.entries()].map(([studentId, list]) => {
    const scored = list.filter((r) => r.maxScore > 0), latest = list.reduce((a, b) => (a.completedAt > b.completedAt ? a : b));
    const mean = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null);
    return { studentId, studentName: latest.studentName, assessmentCount: list.length, averagePercent: mean(scored.map((r) => (r.totalScore / r.maxScore) * 100)), averageScore: mean(scored.map((r) => r.totalScore)), maxScore: scored[0]?.maxScore ?? 0, lastCompletedAt: latest.completedAt, needsReviewCount: list.filter((r) => r.needsReview).length };
  }).sort((a, b) => a.studentName.localeCompare(b.studentName));
}
function find(encounterId: string) {
  const all = readAll(), stored = all[encounterId];
  if (!stored) throw new Error("This encounter is not available for review.");
  return { all, stored };
}
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
});

const sampleApi: FeedbackApi = {
  async studentReport(encounter, signal) {
    await wait(1200, signal);
    const all = readAll();
    const stored: Stored = { encounterId: encounter.encounterId, studentName: "Student (this browser)", patientName: encounter.patientName, messages: encounter.messages, comments: all[encounter.encounterId]?.comments ?? [] };
    try { writeAll({ ...all, [stored.encounterId]: stored }); } catch { /* the report still renders; it just won't appear on the faculty page */ }
    return reportFor(stored);
  },
  async listReviews() {
    return Object.values(readAll()).map(entryFor).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },
  async listStudents() {
    return summarizeStudents(await sampleApi.listReviews());
  },
  async studentReviews(studentId) {
    const reviews = (await sampleApi.listReviews()).filter((r) => r.studentId === studentId);
    const [student] = summarizeStudents(reviews);
    if (!student) throw new Error("This student has no completed assessments.");
    return { student, reviews };
  },
  async review(encounterId) {
    const { stored } = find(encounterId);
    return { entry: entryFor(stored), messages: stored.messages, report: reportFor(stored) };
  },
  async addComment(encounterId, target, text) {
    const { all, stored } = find(encounterId);
    const next = { ...stored, comments: [...stored.comments, { id: crypto.randomUUID(), author: "Faculty (sample)", createdAt: new Date().toISOString(), text: text.trim(), target }] };
    writeAll({ ...all, [encounterId]: next });
    return next.comments;
  },
  async removeComment(encounterId, commentId) {
    const { all, stored } = find(encounterId);
    const next = { ...stored, comments: stored.comments.filter((c) => c.id !== commentId) };
    writeAll({ ...all, [encounterId]: next });
    return next.comments;
  },
};

// ---------- backend ----------
async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store", headers: options.body ? { "Content-Type": "application/json" } : undefined });
  if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("Unable to connect. Please try again shortly.");
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || result.detail || "Request failed."), { status: response.status });
  return result as T;
}
type Pending = { status: "pending" } | { status: "ready"; feedback: unknown };
const liveApi: FeedbackApi = {
  async studentReport(encounter, signal) {
    const path = `/api/encounters/${encounter.encounterId}/feedback${preview}`;
    let result = await call<Pending>(path, { method: "POST", body: "{}", signal });
    for (let attempt = 0; result.status === "pending"; attempt++) {
      // About 4 minutes: the first report for a patient also builds its answer guide (two model calls).
      if (attempt >= 80) throw new Error("Feedback is taking longer than expected. Try again in a minute.");
      await wait(3000, signal);
      result = await call<Pending>(path, { signal });
    }
    return normalizeReport(result.feedback, encounter.messages, encounter.encounterId);
  },
  async listReviews() { return (await call<{ reviews: ReviewEntry[] }>("/api/faculty/feedback")).reviews; },
  async listStudents() { return (await call<{ students: StudentRow[] }>("/api/faculty/students")).students; },
  async studentReviews(studentId) { return call<{ student: StudentRow; reviews: ReviewEntry[] }>(`/api/faculty/students/${encodeURIComponent(studentId)}`); },
  async review(encounterId) {
    const result = await call<{ entry: ReviewEntry; messages: TranscriptMessage[]; feedback: unknown }>(`/api/faculty/feedback/${encounterId}`);
    return { entry: result.entry, messages: result.messages, report: normalizeReport(result.feedback, result.messages, encounterId) };
  },
  async addComment(encounterId, target, text) { return normalizeComments((await call<{ comments: unknown }>(`/api/faculty/feedback/${encounterId}/comments`, { method: "POST", body: JSON.stringify({ text, target }) })).comments); },
  async removeComment(encounterId, commentId) { return normalizeComments((await call<{ comments: unknown }>(`/api/faculty/feedback/${encounterId}/comments/${commentId}/remove`, { method: "POST", body: "{}" })).comments); },
};

export const feedbackApi: FeedbackApi = LIVE ? liveApi : sampleApi;
