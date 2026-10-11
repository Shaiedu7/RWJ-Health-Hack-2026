import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSampleReport, SAMPLE_ENCOUNTER_ID, SAMPLE_MESSAGES } from "../src/feedback/sample.ts";
import { targetKey } from "../src/feedback/types.ts";
const cited = (report: ReturnType<typeof buildSampleReport>) => [...report.sections.flatMap(s => s.items.flatMap(i => i.evidenceMessageIds)), ...report.learningObjectives.flatMap(o => o.evidenceMessageIds), ...report.findings.elicited.flatMap(f => f.evidenceMessageIds), ...report.strengths.flatMap(s => s.evidenceMessageIds), ...report.improvements.flatMap(s => s.evidenceMessageIds), ...report.annotations.map(a => a.messageId)];
test("sample report totals follow its sixteen item scores and cite only student messages in the transcript", () => {
  const report = buildSampleReport(SAMPLE_ENCOUNTER_ID, SAMPLE_MESSAGES), items = report.sections.flatMap(s => s.items);
  assert.equal(items.length, 16); assert.equal(report.maxScore, 48);
  assert.equal(report.totalScore, items.reduce((sum, i) => sum + i.score, 0));
  const students = new Set(SAMPLE_MESSAGES.filter(m => m.role === "user").map(m => m.id));
  assert.ok(cited(report).length > 20); for (const id of cited(report)) assert.ok(students.has(id), id);
});
test("a short transcript drops citations it cannot support instead of pointing at missing messages", () => {
  const short = SAMPLE_MESSAGES.slice(0, 4), ids = new Set(short.map(m => m.id));
  for (const id of cited(buildSampleReport("x", short))) assert.ok(ids.has(id), id);
  assert.deepEqual(cited(buildSampleReport("x", [])), []);
});
test("comment targets map to distinct keys", () => {
  assert.equal(targetKey({ kind: "overall" }), "overall");
  assert.notEqual(targetKey({ kind: "item", itemId: "1.1" }), targetKey({ kind: "message", messageId: "1.1" }));
});
import { normalizeReport } from "../src/feedback/normalize.ts";
const minimal = { sections: [{ name: "History", items: [{ itemId: "1.1", name: "General HPI", score: 2, rationale: "Asked five of ten.", evidenceTurns: [3, 5, 99] }, { itemId: 1.2, name: "Case history", score: "3", evidenceMessageIds: ["sample-11", "not-a-message"] }] }] };
test("a minimal backend payload is completed: totals derived, turn numbers resolved, unknown citations dropped", () => {
  const report = normalizeReport(minimal, SAMPLE_MESSAGES, "enc");
  assert.equal(report.totalScore, 5); assert.equal(report.maxScore, 6); assert.equal(report.scale[3], "Exceeds expectations");
  assert.deepEqual(report.sections[0]?.items[0]?.evidenceMessageIds, ["sample-3", "sample-5"]);
  assert.deepEqual(report.sections[0]?.items[1]?.evidenceMessageIds, ["sample-11"]);
  assert.deepEqual([report.learningObjectives, report.facultyComments, report.reviewFlags, report.annotations], [[], [], [], []]);
});
test("the full sample report survives normalisation unchanged, and unusable payloads are rejected", () => {
  const sample = buildSampleReport(SAMPLE_ENCOUNTER_ID, SAMPLE_MESSAGES);
  assert.deepEqual(normalizeReport(JSON.parse(JSON.stringify(sample)), SAMPLE_MESSAGES, SAMPLE_ENCOUNTER_ID), sample);
  assert.throws(() => normalizeReport({ sections: [] }, SAMPLE_MESSAGES, "enc"), /no rubric items/);
  assert.throws(() => normalizeReport({ sections: [{ name: "X", items: [{ itemId: "1", name: "Y", score: 4 }] }] }, SAMPLE_MESSAGES, "enc"), /expected 1, 2 or 3/);
  assert.equal(normalizeReport({ ...minimal, learningObjectives: [{ text: "Objective", met: true, evidenceTurns: [1] }] }, SAMPLE_MESSAGES, "enc").learningObjectives[0]?.outcome, "met");
});
import { DEMO_CASES } from "../src/feedback/demoCases.ts";
test("each demo encounter scores all sixteen items, cites only its own student messages and survives normalisation", () => {
  assert.deepEqual(DEMO_CASES.map(d => d.report.totalScore), [38, 19, 40]);
  assert.deepEqual(DEMO_CASES.map(d => d.report.reviewFlags.length), [0, 2, 0]);
  for (const demo of DEMO_CASES) {
    assert.equal(demo.report.maxScore, 48);
    const students = new Set(demo.messages.filter(m => m.role === "user").map(m => m.id));
    for (const id of cited(demo.report)) assert.ok(students.has(id), id);
    assert.deepEqual(normalizeReport(JSON.parse(JSON.stringify(demo.report)), demo.messages, demo.encounterId), demo.report);
  }
});
