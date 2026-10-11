import test from "node:test";
import assert from "node:assert/strict";
import {
  generatedProfile,
  generationPrompt,
} from "../lib/faculty-generation.js";
import { blankFacultyProfile } from "../lib/faculty-patients.js";

test("generated drafts cannot approve fields, fake files or omit form sections", () => {
  const profile = blankFacultyProfile();
  profile["_verified"] = ["clinical.hpi"];
  const result = generatedProfile(
    JSON.stringify(profile),
    "FICTIONAL",
    "Fictional test case",
  );
  assert.deepEqual(result["_verified"], []);
  assert.match(
    String((result["metadata"] as Record<string, unknown>)["notes"]),
    /All fields require faculty review/,
  );
  assert.throws(() => generatedProfile('{"overview":{}}', "FICTIONAL", "test"));
  assert.throws(() => generatedProfile("incomplete JSON", "FICTIONAL", "test"));
  assert.throws(() =>
    generatedProfile(
      JSON.stringify({
        ...profile,
        artifacts: [{ id: "file", file_url: "/fake" }],
      }),
      "FICTIONAL",
      "test",
    ),
  );
  assert.throws(() =>
    generatedProfile(
      JSON.stringify({ ...profile, approvalStatus: "APPROVED" }),
      "FICTIONAL",
      "test",
    ),
  );
});
test("supplied-details mapping and fictional generation have distinct instructions", () => {
  assert.match(generationPrompt("SUPPLIED"), /Never invent medical history/);
  assert.match(
    generationPrompt("FICTIONAL"),
    /explicitly fictional teaching case/,
  );
  const result = generatedProfile(
    JSON.stringify(blankFacultyProfile()),
    "SUPPLIED",
    "No age supplied",
  );
  assert.equal(
    (result["demographics"] as Record<string, unknown>)["age"],
    null,
  );
  assert.equal(
    (result["psychosocial"] as Record<string, unknown>)["health_literacy"],
    null,
  );
});
