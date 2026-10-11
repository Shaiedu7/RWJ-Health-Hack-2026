/**
 * Turns a backend feedback payload into the FeedbackReport the UI renders.
 * The backend only has to send what the scorer produces; everything derivable is filled in here.
 * See FEEDBACK-INTEGRATION.md for the accepted payload.
 */
import type { FacultyComment, FeedbackReport, Importance, RubricScore, TranscriptMessage } from "./types.ts";

const DEFAULT_SCALE: Record<RubricScore, string> = { 3: "Exceeds expectations", 2: "Meets expectations", 1: "Below expectations" };
type Raw = Record<string, unknown>;
const fail = (what: string): never => { throw new Error(`Feedback response is not usable: ${what}.`); };
const object = (value: unknown, what: string): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : fail(`${what} must be an object`));
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const required = (value: unknown, what: string) => (typeof value === "string" && value.trim() ? value : fail(`${what} is missing`));
const importance = (value: unknown): Importance => (value === "critical" || value === "minor" ? value : "important");

export function normalizeComments(value: unknown): FacultyComment[] {
  return list(value).flatMap((entry) => {
    const c = object(entry, "comment"), t = c.target && typeof c.target === "object" ? (c.target as Raw) : { kind: "overall" };
    const target: FacultyComment["target"] | null = t.kind === "item" && typeof t.itemId === "string" ? { kind: "item", itemId: t.itemId }
      : t.kind === "message" && typeof t.messageId === "string" ? { kind: "message", messageId: t.messageId }
      : t.kind === "overall" ? { kind: "overall" } : null;
    if (!target || typeof c.text !== "string" || !c.text.trim()) return [];
    return [{ id: required(c.id, "comment id"), author: text(c.author, "Instructor"), createdAt: text(c.createdAt, new Date().toISOString()), text: c.text, target }];
  });
}

export function normalizeReport(value: unknown, messages: TranscriptMessage[], encounterId: string): FeedbackReport {
  const raw = object(value, "feedback");
  const known = new Set(messages.map((m) => m.id)), byTurn = new Map(messages.map((m) => [m.sequence, m.id]));
  /** Evidence may cite message IDs, turn numbers (the message's sequence), or both. Citations that match no message are dropped. */
  const evidence = (source: Raw): string[] => [...new Set([
    ...list(source.evidenceMessageIds).filter((id): id is string => typeof id === "string" && known.has(id)),
    ...list(source.evidenceTurns).flatMap((turn) => byTurn.get(Number(turn)) ?? []),
  ])];

  const sections = list(raw.sections).map((entry, s) => {
    const section = object(entry, "section");
    return {
      sectionId: String(section.sectionId ?? s),
      name: required(section.name, "section name"),
      items: list(section.items).map((entry) => {
        const item = object(entry, "rubric item"), score = Number(item.score);
        if (score !== 1 && score !== 2 && score !== 3) fail(`item ${String(item.itemId)} has score ${String(item.score)}, expected 1, 2 or 3`);
        return { itemId: String(item.itemId ?? fail("item id is missing")), name: required(item.name, "item name"), prompt: text(item.prompt), score: score as RubricScore, descriptor: text(item.descriptor), rationale: text(item.rationale), evidenceMessageIds: evidence(item) };
      }),
    };
  });
  const items = sections.flatMap((s) => s.items);
  if (!items.length) fail("it contains no rubric items");

  const scale = raw.scale && typeof raw.scale === "object" ? (raw.scale as Raw) : {};
  const findings = raw.findings && typeof raw.findings === "object" ? (raw.findings as Raw) : {};
  return {
    reportId: text(raw.reportId, `report-${encounterId}`),
    encounterId,
    generatedAt: text(raw.generatedAt, new Date().toISOString()),
    rubricName: text(raw.rubricName, "Encounter rubric"),
    scale: { 3: text(scale["3"], DEFAULT_SCALE[3]), 2: text(scale["2"], DEFAULT_SCALE[2]), 1: text(scale["1"], DEFAULT_SCALE[1]) },
    totalScore: items.reduce((sum, i) => sum + i.score, 0),
    maxScore: items.length * 3,
    reviewFlags: list(raw.reviewFlags).filter((flag): flag is string => typeof flag === "string"),
    summary: text(raw.summary),
    sections,
    learningObjectives: list(raw.learningObjectives).map((entry, i) => {
      const o = object(entry, "learning objective");
      const outcome = o.outcome === "met" || o.met === true ? "met" : o.outcome === "partial" ? "partial" : "notMet";
      return { objectiveId: String(o.objectiveId ?? i), text: required(o.text, "objective text"), outcome, explanation: text(o.explanation), evidenceMessageIds: evidence(o) } as const;
    }),
    findings: {
      elicited: list(findings.elicited).map((entry) => { const f = object(entry, "finding"); return { label: required(f.label, "finding label"), importance: importance(f.importance), evidenceMessageIds: evidence(f) }; }),
      missed: list(findings.missed).map((entry) => { const f = object(entry, "finding"); return { label: required(f.label, "finding label"), importance: importance(f.importance), explanation: text(f.explanation) }; }),
    },
    strengths: list(raw.strengths).map((entry) => { const p = object(entry, "strength"); return { text: required(p.text, "strength text"), evidenceMessageIds: evidence(p) }; }),
    improvements: list(raw.improvements).map((entry) => { const p = object(entry, "improvement"); return { text: required(p.text, "improvement text"), suggestion: text(p.suggestion), evidenceMessageIds: evidence(p) }; }),
    suggestions: list(raw.suggestions).filter((s): s is string => typeof s === "string"),
    annotations: list(raw.annotations).flatMap((entry) => {
      const a = object(entry, "annotation"), [messageId] = evidence({ evidenceMessageIds: [a.messageId], evidenceTurns: [a.turn] });
      return messageId && typeof a.comment === "string" ? [{ messageId, sentiment: a.sentiment === "strength" ? "strength" as const : "improvement" as const, comment: a.comment }] : [];
    }),
    facultyComments: normalizeComments(raw.facultyComments),
  };
}
