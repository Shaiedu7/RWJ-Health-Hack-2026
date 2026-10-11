import test from "node:test";
import assert from "node:assert/strict";
import { blankFacultyProfile } from "../lib/faculty-patients.js";
import { parseAudit } from "../lib/faculty-audit.js";
import { reviewProfile } from "../lib/faculty-review.js";
import { publishDraft } from "../lib/published-patients.js";
import { profileHash } from "../lib/faculty-review.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
test("AI review validates paths, severity, fixes and malformed replies", () => {
  const p = blankFacultyProfile();
  assert.deepEqual(parseAudit('{"issues":[]}', p), []);
  assert.equal(
    parseAudit(
      JSON.stringify({
        issues: [
          {
            path: "clinical.hpi",
            severity: "warning",
            message: "Review timeline",
            fix: "Verify onset",
          },
        ],
      }),
      p,
    )[0]?.source,
    "ai",
  );
  for (const bad of [
    "not json",
    '{"issues":[{"path":"invented.field","severity":"critical","message":"x","fix":"x"}]}',
    '{"issues":[{"path":"clinical.hpi","severity":"urgent","message":"x","fix":"x"}]}',
  ])
    assert.throws(() => parseAudit(bad, p));
});
test("fixed checks catch family allergies, units and impossible measurements", () => {
  const p = blankFacultyProfile();
  Object.assign(p["clinical"] as object, {
    allergies: [{ substance: "penicillin allergy", reaction: "rash" }],
    vitals: [
      { label: "HR", value: "999 bpm", trigger: { type: "start" } },
      { label: "Temperature", value: "37 F", trigger: { type: "start" } },
    ],
  });
  Object.assign(p["medications"] as object, {
    current: [{ name: "Amoxicillin", dose: "", frequency: "", indication: "" }],
  });
  Object.assign(p["nutrition"] as object, { weight_kg: 90, height_cm: 17 });
  const issues = reviewProfile(p);
  assert.ok(
    issues.some(
      (i) => i.path === "medications.current" && i.severity === "critical",
    ),
  );
  assert.ok(
    issues.some((i) => i.path === "nutrition" && i.severity === "critical"),
  );
  assert.equal(
    issues.filter(
      (i) => i.path === "clinical.vitals" && i.severity === "critical",
    ).length,
    2,
  );
});
test("a stored AI critical issue blocks publication without a database write", async () => {
  const p = blankFacultyProfile();
  Object.assign(p["demographics"] as object, { name: "Test", age: 30 });
  Object.assign(p["overview"] as object, { chief_complaint: "Pain" });
  Object.assign(p["clinical"] as object, { hpi: "Pain" });
  Object.assign(p["psychosocial"] as object, {
    personality: "Reserved",
    communication_style: "Brief",
  });
  let calls = 0;
  const doc = {
    send: async () => {
      calls++;
      return {
        Item: {
          revision: 1,
          profileHash: profileHash(p),
          auditCompleted: true,
          issues: [{ severity: "critical", source: "ai" }],
        },
      };
    },
  } as unknown as DynamoDBDocumentClient;
  await assert.rejects(
    publishDraft(doc, "owner", "id", 1, p, true),
    /critical consistency/,
  );
  assert.equal(calls, 1);
});
test("dismissals require a reason, exact revision, and an AI finding", async () => {
  const { dismissAuditIssue } = await import("../lib/published-patients.js");
  const p = blankFacultyProfile();
  let writes = 0;
  let source = "rule";
  const doc = {
    send: async (cmd: unknown) => {
      if ((cmd as { input: { TransactItems?: unknown } }).input.TransactItems) {
        writes++;
        return {};
      }
      return {
        Item: {
          revision: 1,
          profileHash: profileHash(p),
          checkedAt: "before",
          issues: [
            {
              source,
              severity: "critical",
              path: "clinical.hpi",
              message: "Review",
            },
          ],
        },
      };
    },
  } as unknown as DynamoDBDocumentClient;
  await assert.rejects(
    dismissAuditIssue(doc, "owner", "id", 1, p, 0, ""),
    /why/,
  );
  await assert.rejects(
    dismissAuditIssue(doc, "owner", "id", 2, p, 0, "reviewed"),
    /revision/,
  );
  await assert.rejects(
    dismissAuditIssue(doc, "owner", "id", 1, p, 0, "reviewed"),
    /Fixed-rule/,
  );
  assert.equal(writes, 0);
  source = "ai";
  const issues = await dismissAuditIssue(
    doc,
    "owner",
    "id",
    1,
    p,
    0,
    "Diagnosis is explicitly supplied",
  );
  assert.equal(issues[0]?.status, "dismissed");
  assert.equal(issues[0]?.dismissedBy, "owner");
  assert.equal(writes, 1);
});
