/**
 * Feedback report contract shared by the student and faculty views.
 * The report is self-describing (section names, item names, scale labels) so the UI
 * follows whatever rubric the backend scored against.
 */
export type RubricScore = 1 | 2 | 3;
export type Importance = "critical" | "important" | "minor";

export interface RubricItemResult {
  itemId: string;
  name: string;
  prompt: string;
  score: RubricScore;
  /** Rubric wording for the level the student reached. */
  descriptor: string;
  /** Rubric wording for every level, when the backend sends it. */
  levels?: Partial<Record<RubricScore, string>>;
  /** Why this score, in terms of this encounter. */
  rationale: string;
  evidenceMessageIds: string[];
}
export interface RubricSectionResult {
  sectionId: string;
  name: string;
  items: RubricItemResult[];
}
export interface ObjectiveResult {
  objectiveId: string;
  text: string;
  outcome: "met" | "partial" | "notMet";
  explanation: string;
  evidenceMessageIds: string[];
}
export interface TranscriptAnnotation {
  messageId: string;
  sentiment: "strength" | "improvement";
  comment: string;
}
export type CommentTarget = { kind: "overall" } | { kind: "item"; itemId: string } | { kind: "message"; messageId: string };
export interface FacultyComment {
  id: string;
  author: string;
  createdAt: string;
  text: string;
  target: CommentTarget;
}
export interface FeedbackReport {
  reportId: string;
  encounterId: string;
  generatedAt: string;
  rubricName: string;
  scale: Record<RubricScore, string>;
  totalScore: number;
  maxScore: number;
  /** Non-empty when a faculty member should look at this encounter regardless of the total. */
  reviewFlags: string[];
  summary: string;
  sections: RubricSectionResult[];
  learningObjectives: ObjectiveResult[];
  findings: {
    elicited: { label: string; importance: Importance; evidenceMessageIds: string[] }[];
    missed: { label: string; importance: Importance; explanation: string }[];
  };
  strengths: { text: string; evidenceMessageIds: string[] }[];
  improvements: { text: string; suggestion: string; evidenceMessageIds: string[] }[];
  suggestions: string[];
  annotations: TranscriptAnnotation[];
  facultyComments: FacultyComment[];
}
export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sequence: number;
  createdAt: string;
}
/** One row in the faculty review list. */
export interface ReviewEntry {
  encounterId: string;
  studentId?: string;
  studentName: string;
  patientName: string;
  completedAt: string;
  messageCount: number;
  totalScore: number;
  maxScore: number;
  /** Score weighted by patient difficulty, as a percentage. Faculty only. */
  weightedPercent?: number;
  needsReview: boolean;
  commentCount: number;
}
/** One row in the faculty student list. */
export interface StudentRow {
  studentId: string;
  studentName: string;
  assessmentCount: number;
  /** Mean of total ÷ maximum across the student's assessments, or null when none are scored. */
  averagePercent: number | null;
  averageScore: number | null;
  maxScore: number;
  lastCompletedAt: string;
  needsReviewCount: number;
}
export interface ReviewDetail {
  entry: ReviewEntry;
  messages: TranscriptMessage[];
  report: FeedbackReport;
}
export const targetKey = (target: CommentTarget) =>
  target.kind === "overall" ? "overall" : target.kind === "item" ? `item:${target.itemId}` : `message:${target.messageId}`;
