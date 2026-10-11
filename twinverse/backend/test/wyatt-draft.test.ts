import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDraft,
  patientIdForSource,
  readWyattSource,
  SOURCE_UUID,
  verifyDraft,
} from "../scripts/wyatt-draft.js";

test("Wyatt source identity and unmodified CSV values survive import preparation", () => {
  const source = readWyattSource();
  const items = buildDraft(
    source,
    "2026-10-10T00:00:00.000Z",
    "actor",
    "owner",
  );
  const snapshot = items.find(
    (item) => item["entityType"] === "IMMUTABLE_IMPORT_SNAPSHOT",
  );
  assert.deepEqual(snapshot?.["originalRow"], source.originalRow);
  assert.equal(snapshot?.["originalCsvRecord"], source.originalCsvRecord);
  assert.equal(source.originalRow["patient-uuid"], SOURCE_UUID);
  assert.equal(source.csvRowNumber, 3);
  assert.match(source.originalRow["notes"] ?? "", /Total Chol 235, LDL 145/);
  verifyDraft(items, structuredClone(items));
});
test("draft is unapproved and has no publication, reports, uploads, or invented medical details", () => {
  const items = buildDraft(readWyattSource(), "time", "actor", "owner");
  const head = items.find((item) => item.SK === "HEAD");
  assert.equal(head?.["status"], "DRAFT");
  assert.equal(head?.["reviewRequired"], true);
  assert.equal(head?.["approvalStatus"], "UNAPPROVED");
  assert.ok(
    items.every(
      (item) =>
        !("catalogueIndexPK" in item) && !("currentPublishedVersionId" in item),
    ),
  );
  assert.ok(
    items.every(
      (item) =>
        !item.SK.startsWith("DRAFT#RECORD#") && !item.SK.startsWith("VERSION#"),
    ),
  );
  const portrait = items.find(
    (item) => item["entityType"] === "PATIENT_PORTRAIT",
  );
  assert.equal(portrait?.["uploaded"], false);
  assert.equal(portrait?.["accessStatus"], "UNVERIFIED");
  assert.equal(portrait?.["applicationStorageReference"], null);
});
test("repeated preparation maps the same source identity to the same item keys", () => {
  const source = readWyattSource();
  const first = buildDraft(source, "time1", "actor", "owner");
  const second = buildDraft(source, "time2", "actor", "owner");
  assert.deepEqual(
    first.map((i) => [i.PK, i.SK]),
    second.map((i) => [i.PK, i.SK]),
  );
  assert.equal(first[0]?.["patientId"], patientIdForSource());
});
test("round-trip verification rejects lost or changed source data", () => {
  const expected = buildDraft(readWyattSource(), "time", "actor", "owner");
  const changed = structuredClone(expected);
  const snapshot = changed.find(
    (item) => item["entityType"] === "IMMUTABLE_IMPORT_SNAPSHOT",
  );
  assert.ok(snapshot);
  snapshot["originalRow"] = { "patient-uuid": SOURCE_UUID, age: "99" };
  assert.throws(() => verifyDraft(expected, changed), /Round-trip mismatch/);
  assert.throws(
    () => verifyDraft(expected, expected.slice(1)),
    /item count mismatch/,
  );
});
