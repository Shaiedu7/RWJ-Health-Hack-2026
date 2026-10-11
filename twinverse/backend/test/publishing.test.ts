import test from "node:test";
import assert from "node:assert/strict";
import { blankFacultyProfile, FacultyError } from "../lib/faculty-patients.js";
import {
  reviewProfile,
  parseProfileText,
  exportProfile,
} from "../lib/faculty-review.js";
import { versionItems, publishDraft } from "../lib/published-patients.js";
import { createPatientLoader } from "../lib/patient-loader.js";
import {
  studioContext,
  publishedTurnContext,
  releasedFindings,
} from "../lib/published-context.js";
import { writerSystem } from "../lib/preview-conversation.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
function complete() {
  const p = blankFacultyProfile();
  Object.assign(p["demographics"] as object, {
    name: "Fictional published test",
    age: 58,
  });
  Object.assign(p["overview"] as object, { chief_complaint: "Chest pressure" });
  Object.assign(p["clinical"] as object, {
    hpi: "Two hours of chest pressure.",
    hidden_diagnosis: "PRIVATE_TEACHING_ANSWER",
    vitals: [
      {
        label: "Blood pressure",
        value: "150/92 mmHg",
        trigger: { type: "start", value: "" },
      },
    ],
    exam: [
      {
        label: "Heart",
        value: "Regular rhythm",
        trigger: { type: "exam_requested", value: "physical exam" },
      },
    ],
  });
  Object.assign(p["psychosocial"] as object, {
    personality: "Anxious",
    communication_style: "Brief answers",
  });
  return p;
}

test("JSON and YAML round trips preserve fields and reject aliases, duplicate keys and invented fields", () => {
  const p = complete();
  for (const format of ["json", "yaml"])
    assert.deepEqual(parseProfileText(exportProfile(p, format), format), p);
  assert.throws(() =>
    parseProfileText("overview: &a {title: X}\ndemographics: *a", "yaml"),
  );
  assert.throws(() =>
    parseProfileText("demographics: {}\ndemographics: {}", "yaml"),
  );
  assert.throws(() => parseProfileText('{"admin":true}', "json"));
});
test("review catches missing fields, allergy/drug conflicts and incomplete release conditions", () => {
  assert.ok(
    reviewProfile(blankFacultyProfile()).some((i) => i.severity === "critical"),
  );
  const p = complete();
  assert.equal(
    reviewProfile(p).some((i) => i.severity === "critical"),
    false,
  );
  Object.assign(p["clinical"] as object, {
    allergies: [{ substance: "penicillin", reaction: "hives" }],
  });
  Object.assign(p["medications"] as object, {
    current: [{ name: "Amoxicillin", dose: "", frequency: "", indication: "" }],
  });
  assert.ok(
    reviewProfile(p).some(
      (i) => i.path === "medications.current" && i.severity === "critical",
    ),
  );
});
test("published version manifest passes the existing loader while teaching answers remain outside AI patient knowledge", async () => {
  const p = complete(),
    id = "faculty-test",
    version = "v1",
    items = versionItems("owner", p, id, 1, version);
  const loader = createPatientLoader({
    getHead: async () => ({
      PK: `PATIENT#${id}`,
      SK: "HEAD",
      patientId: id,
      schemaVersion: 1,
      scopeId: "twinverse-event",
      status: "PUBLISHED",
      currentPublishedVersionId: version,
    }),
    querySections: async () => items,
  });
  const loaded = await loader.loadPatientProfile(id);
  assert.equal(loaded.readiness.approvedStudentEncounter, true);
  const context = studioContext(id, version, p);
  assert.doesNotMatch(
    JSON.stringify(context.patientInformation),
    /PRIVATE_TEACHING_ANSWER/,
  );
  assert.doesNotMatch(
    writerSystem(publishedTurnContext(context, [], "Hello")),
    /PRIVATE_TEACHING_ANSWER|Wyatt Nelson|18, a shy/,
  );
  assert.equal(context.card.approved, true);
});
test("chart release honors start, exam requests and turn thresholds; private future findings stay out of the model input", () => {
  const c = studioContext("faculty-test", "v1", complete());
  assert.equal(releasedFindings(c, []).length, 1);
  const initial = publishedTurnContext(c, [], "Hello");
  assert.equal(
    Object.keys(initial.evidence).filter((k) => k.startsWith("chart.")).length,
    1,
  );
  assert.equal(
    releasedFindings(c, [
      { role: "user", text: "Can I request a physical examination?" },
    ]).length,
    2,
  );
  const snapshot = JSON.stringify(c);
  publishedTurnContext(c, [], "Hello");
  assert.equal(JSON.stringify(c), snapshot);
});
test("publishing requires explicit review confirmation and a check of the exact saved revision before any write", async () => {
  let sends = 0;
  const doc = {
    send: async () => {
      sends++;
      return { Item: { revision: 2, profileHash: "stale" } };
    },
  } as unknown as DynamoDBDocumentClient;
  await assert.rejects(
    publishDraft(doc, "owner", "test", 1, complete(), false),
    (e: unknown) => e instanceof FacultyError && e.status === 422,
  );
  assert.equal(sends, 0);
  await assert.rejects(
    publishDraft(doc, "owner", "test", 1, complete(), true),
    (e: unknown) => e instanceof FacultyError && e.status === 409,
  );
  assert.equal(sends, 1);
});
