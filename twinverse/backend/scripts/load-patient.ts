import { writeFileSync } from "node:fs";
import { createDynamoPatientLoader } from "../lib/dynamo-patient-loader.js";
import { PatientLoadError } from "../lib/patient-loader.js";

const args = process.argv.slice(2);
const patientId = args[0];
if (
  !patientId ||
  patientId.startsWith("--") ||
  args.slice(1).some((a) => a !== "--development-preview")
) {
  console.error(
    "Usage: npm run load:patient -- <patientId> [--development-preview]",
  );
  process.exit(2);
}
let loader: Awaited<ReturnType<typeof createDynamoPatientLoader>> | undefined;
try {
  loader = await createDynamoPatientLoader();
  const profile = await loader.loadPatientProfile(patientId, {
    developmentPreview: args.includes("--development-preview"),
  });
  const fields = [
    ...profile.approvedProfileFields,
    ...profile.unapprovedProposals.profileFields,
  ];
  const field = (name: string) =>
    fields.find((f) => f.field === name)?.value ?? "Missing";
  const summary = [
    `${String(field("name"))} — ${profile.mode}`,
    `Patient ID: ${profile.patientId}`,
    `Source UUID: ${profile.sourcePatientUuid ?? "Not supplied"}`,
    `Age: ${String(field("age"))}; background: ${String(field("background"))}`,
    `Personality (${profile.mode === "DEVELOPMENT_PREVIEW" ? "proposal" : "approved"}): ${String(field("personality"))}`,
    `Approved student encounter: ${profile.readiness.approvedStudentEncounter ? "YES" : "NO"}`,
    `Approved facts: ${profile.approvedFacts.length}; proposed fact items: ${profile.unapprovedProposals.facts.length}`,
    `Unapproved profile fields: ${profile.unapprovedProposals.profileFields.length}`,
    `Approved rules: ${profile.approvedRules.length}; clinical record metadata: ${profile.recordMetadata.length + profile.unapprovedProposals.records.length}`,
    `Supplied narrative (not approved clinical facts): ${String(field("suppliedNotes"))}`,
    `Portrait: ${profile.portraitMetadata ? "Metadata only; no object fetched or access verified" : "Not supplied"}`,
    "Missing information:",
    ...profile.missingInformation.map((v) => `  - ${v}`),
    "Encounter blockers:",
    ...profile.readiness.blockers.map((v) => `  - ${v}`),
  ].join("\n");
  console.log(summary);
  // Local proof artifact only; no credentials, raw import rows, or database writes.
  writeFileSync("review/patient-loader-summary.txt", summary + "\n");
  writeFileSync(
    "review/patient-loader-result.json",
    JSON.stringify(profile, null, 2) + "\n",
  );
} catch (error) {
  if (error instanceof PatientLoadError)
    console.error(
      `${error.code}: ${error.message}${error.details.length ? "\n" + error.details.join("\n") : ""}`,
    );
  else
    console.error(
      `PATIENT_READ_FAILED: ${error instanceof Error ? error.name : "UnknownError"}. Check server credentials and table read permissions.`,
    );
  process.exitCode = 1;
} finally {
  loader?.destroy();
}
