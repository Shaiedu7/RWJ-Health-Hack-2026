import test from "node:test";
import assert from "node:assert/strict";
import {
  blankFacultyProfile,
  requireFaculty,
  validateFacultyProfile,
  draftItems,
  createFacultyStore,
  FacultyError,
} from "../lib/faculty-patients.js";
import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { createPatientLoader } from "../lib/patient-loader.js";

test("faculty access requires a verified identity and the Faculty group", () => {
  assert.throws(
    () => requireFaculty(null),
    (e: unknown) => e instanceof FacultyError && e.status === 401,
  );
  assert.throws(
    () => requireFaculty({ sub: "student" }),
    (e: unknown) => e instanceof FacultyError && e.status === 403,
  );
  assert.throws(() =>
    requireFaculty({ sub: "student", "cognito:groups": "Faculty" }),
  );
  assert.equal(
    requireFaculty({ sub: "faculty", "cognito:groups": ["Faculty"] }),
    "faculty",
  );
});
test("unknown ages stay blank and invalid profiles and file references are rejected", () => {
  const p = blankFacultyProfile();
  assert.equal((p["demographics"] as Record<string, unknown>)["age"], null);
  assert.deepEqual(validateFacultyProfile(p), p);
  assert.throws(() =>
    validateFacultyProfile({ ...p, ownerFacultyId: "attacker" }),
  );
  assert.throws(() =>
    validateFacultyProfile({ ...p, demographics: { name: "Test", age: -1 } }),
  );
  assert.throws(() => validateFacultyProfile({ ...p, clinical: { hpi: 123 } }));
  assert.throws(() =>
    validateFacultyProfile({ ...p, knowledge: [{ name: "leak" }] }),
  );
});
test("saved drafts load through the existing patient loader without approving teaching answers", async () => {
  const p = blankFacultyProfile();
  (p["demographics"] as Record<string, unknown>)["name"] =
    "Fictional faculty test";
  (p["clinical"] as Record<string, unknown>)["hidden_diagnosis"] =
    "Teaching-only test answer";
  const items = draftItems("faculty", p, "test", 1, new Date().toISOString());
  const loader = createPatientLoader({
    getHead: async () => items[0],
    querySections: async () => items.filter((i) => i.SK.startsWith("DRAFT#")),
  });
  const loaded = await loader.loadPatientProfile("test", {
    developmentPreview: true,
  });
  assert.equal(loaded.readiness.approvedStudentEncounter, false);
  assert.equal(loaded.approvedFacts.length, 0);
  assert.equal(
    JSON.stringify(loaded).includes("Teaching-only test answer"),
    false,
  );
  assert.equal(
    items.some((i) => "catalogueIndexPK" in i),
    false,
  );
});
test("another faculty member cannot read a draft and concurrent revisions cannot overwrite it", async () => {
  let transactions = 0;
  const doc = {
    send: async (command: unknown) => {
      if (command instanceof GetCommand)
        return {
          Item:
            command.input.Key?.["SK"] === "HEAD"
              ? {
                  ownerFacultyId: "owner",
                  scopeId: "twinverse-event",
                  status: "DRAFT",
                  draftRevision: 2,
                  createdAt: "2026-10-10",
                }
              : { revision: 2, profile: blankFacultyProfile() },
        };
      if (command instanceof TransactWriteCommand) {
        transactions++;
        const e = new Error();
        e.name = "TransactionCanceledException";
        throw e;
      }
      throw new Error("Unexpected operation");
    },
  } as unknown as DynamoDBDocumentClient;
  const store = createFacultyStore(doc);
  await assert.rejects(
    store.get("other", "test"),
    (e: unknown) => e instanceof FacultyError && e.status === 404,
  );
  await assert.rejects(
    store.save("owner", blankFacultyProfile(), "test", 1),
    (e: unknown) => e instanceof FacultyError && e.status === 409,
  );
  assert.equal(transactions, 0);
  await assert.rejects(
    store.save("owner", blankFacultyProfile(), "test", 2),
    (e: unknown) => e instanceof FacultyError && e.status === 409,
  );
  assert.equal(transactions, 1);
});
