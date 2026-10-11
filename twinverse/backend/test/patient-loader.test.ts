import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createPatientLoader,
  PatientLoadError,
  type StoredItem,
  type PatientStore,
} from "../lib/patient-loader.js";

const id = "import-d95bcab43d3144ceedd0ae8c";
const fixture = (
  JSON.parse(readFileSync(new URL("./fixtures/wyatt-import-preview.json", import.meta.url), "utf8")) as {
    items: StoredItem[];
  }
).items;
function setup(items: StoredItem[] = structuredClone(fixture)) {
  const prefixes: string[] = [];
  const store: PatientStore = {
    async getHead(patientId) {
      return structuredClone(
        items.find(
          (i) => i["PK"] === `PATIENT#${patientId}` && i["SK"] === "HEAD",
        ),
      );
    },
    async querySections(patientId, prefix) {
      prefixes.push(prefix);
      return structuredClone(
        items.filter(
          (i) =>
            i["PK"] === `PATIENT#${patientId}` &&
            String(i["SK"]).startsWith(prefix),
        ),
      );
    },
  };
  return { ...createPatientLoader(store), prefixes, items };
}
function errorCode(code: string) {
  return (error: unknown) =>
    error instanceof PatientLoadError && error.code === code;
}
function fact(key: string, status: string): StoredItem {
  return {
    PK: `PATIENT#${id}`,
    SK: `DRAFT#FACT#${key}`,
    type: "symptom",
    value: "Supplied fixture value",
    approvalStatus: status,
  };
}

test("preview preserves proposals, source provenance and missing information without extracting clinical facts", async () => {
  const loader = setup(),
    result = await loader.loadPatientProfile(id, { developmentPreview: true });
  assert.equal(result.readiness.approvedStudentEncounter, false);
  assert.equal(result.approvedFacts.length, 0);
  assert.equal(result.approvedProfileFields.length, 0);
  assert.equal(result.unapprovedProposals.profileFields.length, 8);
  assert.ok(
    result.unapprovedProposals.profileFields.some(
      (f) => f.field === "suppliedNotes",
    ),
  );
  assert.ok(result.missingInformation.includes("Cholesterol units"));
  assert.equal(result.unknownAnswerBehavior, null);
  assert.equal(
    result.sourcePatientUuid,
    "4d619156-3250-4212-8399-129f3280fab1",
  );
  assert.deepEqual(loader.prefixes, ["DRAFT#"]);
  assert.deepEqual(loader.items, fixture);
});
test("draft is rejected by default without reading its private sections", async () => {
  const loader = setup();
  await assert.rejects(
    loader.loadPatientProfile(id),
    errorCode("PATIENT_NOT_PUBLISHED"),
  );
  assert.equal(loader.prefixes.length, 0);
});
test("missing, retired, wrong-scope and invalid IDs report distinct errors", async () => {
  await assert.rejects(
    setup([]).loadPatientProfile(id),
    errorCode("PATIENT_NOT_FOUND"),
  );
  await assert.rejects(
    setup().loadPatientProfile("bad#key"),
    errorCode("INVALID_PATIENT_ID"),
  );
  for (const [field, value] of [
    ["status", "RETIRED"],
    ["scopeId", "another-event"],
  ]) {
    const loader = setup();
    const head = loader.items.find((i) => i["SK"] === "HEAD");
    assert.ok(head);
    head[String(field)] = value;
    await assert.rejects(
      loader.loadPatientProfile(id, { developmentPreview: true }),
      errorCode("PATIENT_UNAVAILABLE"),
    );
  }
});
test("approved facts and unapproved proposals remain distinct in preview", async () => {
  const loader = setup([
    ...structuredClone(fixture),
    fact("approved", "APPROVED"),
    fact("proposal", "UNAPPROVED"),
  ]);
  const result = await loader.loadPatientProfile(id, {
    developmentPreview: true,
  });
  assert.deepEqual(
    result.approvedFacts.map((f) => f.factId),
    ["approved"],
  );
  assert.deepEqual(
    result.unapprovedProposals.facts.map((f) => f.factId),
    ["proposal"],
  );
  assert.equal(result.readiness.approvedStudentEncounter, false);
});
test("malformed facts and dangling rule references fail validation", async () => {
  const malformed = fact("bad", "APPROVED");
  delete malformed["type"];
  await assert.rejects(
    setup([...structuredClone(fixture), malformed]).loadPatientProfile(id, {
      developmentPreview: true,
    }),
    errorCode("INVALID_SCHEMA"),
  );
  const rule = {
    PK: `PATIENT#${id}`,
    SK: "DRAFT#RULE#r",
    channel: "PATIENT_REPLY",
    trigger: { type: "ENCOUNTER_START" },
    targetFactIds: ["missing"],
    approvalStatus: "APPROVED",
  };
  await assert.rejects(
    setup([...structuredClone(fixture), rule]).loadPatientProfile(id, {
      developmentPreview: true,
    }),
    errorCode("INVALID_SCHEMA"),
  );
});
test("missing profile is clear, and unverified artifacts are not available", async () => {
  await assert.rejects(
    setup(
      fixture.filter((i) => i["SK"] !== "DRAFT#PROFILE"),
    ).loadPatientProfile(id, { developmentPreview: true }),
    errorCode("PROFILE_NOT_FOUND"),
  );
  const record = {
    PK: `PATIENT#${id}`,
    SK: "DRAFT#RECORD#lab",
    kind: "ARTIFACT",
    title: "Fixture report",
    availability: "AVAILABLE",
    accessStatus: "UNVERIFIED",
    storageReference: { bucket: "fixture", key: "fixture", sha256: "fixture" },
    approvalStatus: "APPROVED",
  };
  const result = await setup([
    ...structuredClone(fixture),
    record,
  ]).loadPatientProfile(id, { developmentPreview: true });
  assert.equal(result.recordMetadata[0]?.available, false);
});
test("changing draft revisions are retried, then rejected instead of returning a mixed snapshot", async () => {
  let reads = 0;
  const head = fixture.find((i) => i["SK"] === "HEAD");
  assert.ok(head);
  const loader = createPatientLoader({
    async getHead() {
      return { ...head, draftRevision: ++reads };
    },
    async querySections() {
      return structuredClone(
        fixture.filter((i) => String(i["SK"]).startsWith("DRAFT#")),
      );
    },
  });
  await assert.rejects(
    loader.loadPatientProfile(id, { developmentPreview: true }),
    errorCode("CONCURRENT_UPDATE"),
  );
  assert.equal(reads, 6);
});
test("published loading uses only the exact version and refuses incomplete manifests", async () => {
  const head = structuredClone(fixture.find((i) => i["SK"] === "HEAD"));
  assert.ok(head);
  Object.assign(head, {
    status: "PUBLISHED",
    facultyOwnerAssignmentRequired: false,
    currentPublishedVersionId: "v1",
  });
  const profile = structuredClone(
    fixture.find((i) => i["SK"] === "DRAFT#PROFILE"),
  );
  assert.ok(profile);
  Object.assign(profile, {
    SK: "VERSION#v1#PROFILE",
    approvalStatus: "APPROVED",
    reviewRequired: false,
    missingInformation: [],
    unknownAnswerBehavior: "I do not know.",
    portraitAssetId: null,
    fieldProvenance: {},
  });
  const f = { ...fact("f", "APPROVED"), SK: "VERSION#v1#FACT#f" };
  const rule = {
    PK: `PATIENT#${id}`,
    SK: "VERSION#v1#RULE#r",
    channel: "PATIENT_REPLY",
    trigger: { type: "ENCOUNTER_START" },
    targetFactIds: ["f"],
    approvalStatus: "APPROVED",
    prerequisites: { operator: "ALL", factIds: [] },
  };
  const meta = {
    PK: `PATIENT#${id}`,
    SK: "VERSION#v1#META",
    schemaVersion: 1,
    approvedBy: "fixture-faculty",
    publishedAt: "fixture-time",
    contentHash: "fixture-hash",
    entityIds: ["PROFILE", "FACT#f", "RULE#r"],
  };
  const loader = setup([
    head,
    profile,
    f,
    rule,
    meta,
    ...fixture.filter((i) => String(i["SK"]).startsWith("DRAFT#")),
  ]);
  const result = await loader.loadPatientProfile(id);
  assert.equal(result.versionId, "v1");
  assert.equal(result.readiness.approvedStudentEncounter, true);
  assert.deepEqual(loader.prefixes, ["VERSION#v1#"]);
  assert.ok(result.approvedRules[0]?.definition);
  meta["entityIds"] = ["PROFILE", "FACT#missing"];
  await assert.rejects(
    loader.loadPatientProfile(id),
    errorCode("INVALID_SCHEMA"),
  );
});
