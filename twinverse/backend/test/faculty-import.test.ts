import test from "node:test";
import assert from "node:assert/strict";
import {
  studioContext,
  releasedFindings,
  publishedTurnContext,
} from "../lib/published-context.js";
import { readFileSync } from "node:fs";
import {
  parseProfileText,
  reviewProfile,
  exportProfile,
} from "../lib/faculty-review.js";
const source = readFileSync(
  new URL("./fixtures/supplied-patient.json", import.meta.url),
  "utf8",
);
test("imports the supplied patient list without inventing release settings or measurements", () => {
  const p = parseProfileText(source, "json") as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(p["demographics"]?.["name"], "Dominic Rivera");
  assert.equal(p["demographics"]?.["age"], 22);
  assert.equal((p["medications"]?.["current"] as unknown[]).length, 2);
  assert.equal((p["learning"]?.["objectives"] as unknown[]).length, 7);
  assert.equal(p["nutrition"]?.["weight_kg"], null);
  assert.ok(
    reviewProfile(p).some(
      (i) => i.severity === "warning" && i.path === "clinical.laboratory_data",
    ),
  );
  assert.deepEqual(p["clinical"]?.["exam"], []);
  assert.equal((p["clinical"]?.["laboratory_data"] as unknown[]).length, 3);
  assert.equal(p["clinical"]?.["allergy_status"], "No known allergies");
  assert.deepEqual(p["clinical"]?.["allergies"], []);
  assert.match(String(p["clinical"]?.["family_history"]), /mother/);
  assert.equal(
    p["nutrition"]?.["hydration"],
    "High intake of sugary fruit juices and sodas; low water intake",
  );
  assert.deepEqual(p["learning"]?.["key_questions_to_ask"], []);
  assert.ok((p["learning"]?.["expected_discoveries"] as unknown[]).length > 0);
  assert.match(String(p["demographics"]?.["cultural_context"]), /cuidado/);
  assert.match(String(p["metadata"]?.["notes"]), /optional_details/);
  assert.deepEqual(parseProfileText(exportProfile(p, "yaml"), "yaml"), p);
});
test("does not silently ignore extra patients", () => {
  const patient = (JSON.parse(source) as unknown[])[0];
  assert.throws(
    () => parseProfileText(JSON.stringify([patient, patient]), "json"),
    /one patient at a time/,
  );
});

test("supplied profiles can publish with missing triggers, while unconfigured findings remain private", () => {
  const p = parseProfileText(source, "json");
  assert.equal(
    reviewProfile(p).filter((i) => i.severity === "critical").length,
    0,
  );
  const context = studioContext("faculty-test", "version-test", p);
  assert.deepEqual(
    releasedFindings(context, [
      {
        role: "user",
        text: "Can I request all lab tests and a physical exam?",
      },
    ]),
    [],
  );
  const turn = publishedTurnContext(
    context,
    [],
    "Can I request the HbA1c test?",
  );
  assert.equal(
    Object.keys(turn.evidence).some((k) => k.startsWith("chart.")),
    false,
  );
  assert.equal(JSON.stringify(turn.patientInformation).includes("9.8%"), false);
});
