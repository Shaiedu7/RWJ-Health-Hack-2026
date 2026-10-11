# TwinVerse patient loader

Implemented and verified against the existing Patients table. This is a reusable server-side reader and a local command, not a deployed API. No table, faculty profile, approval, or publication was changed. No Bedrock or S3 request is made.

## Run the verified Wyatt preview

From this project directory, with an authenticated `twinverse-event` profile:

```sh
npm run load:patient -- import-d95bcab43d3144ceedd0ae8c --development-preview
```

The command prints a readable summary and saves the local inspection files `review/patient-loader-summary.txt` and `review/patient-loader-result.json`. It reads AWS credentials using the server-side Node credential provider, confirms the event account, then uses `GetItem` and paginated, strongly consistent `Query` against `twinverse-event-patients` in `us-west-2`. Credentials are never placed in the returned profile or saved inspection files. No source ZIP is needed to run this reader.

Without `--development-preview`, Wyatt is rejected with `PATIENT_NOT_PUBLISHED`. Preview always sets `readiness.approvedStudentEncounter=false`, even if some draft fields are individually approved. It cannot turn a draft into an approved encounter.

## Reusable entry points

`lib/patient-loader.ts` exports `createPatientLoader(store, scopeId)` and `PatientLoadError`. A small read-only `PatientStore` interface makes validation testable without AWS. `lib/dynamo-patient-loader.ts` exports `createDynamoPatientLoader()` with the existing account/profile/table/region configuration.

```ts
const loader = await createDynamoPatientLoader();
try {
  const profile = await loader.loadPatientProfile(patientId, {
    developmentPreview: true,
  });
  // Server-side inspection only. Check readiness before any later encounter work.
} finally {
  loader.destroy();
}
```

Default mode requires a PUBLISHED HEAD and loads only `VERSION#<currentPublishedVersionId>#` sections. There is no draft fallback. Preview explicitly loads `DRAFT#` sections. Both paths validate scope, patient identity, schema version, profile presence, typed fields, approval states, and rule references. Retired/unavailable patients are rejected. Draft revisions/HEAD metadata are checked before and after the paginated query; changes trigger bounded retries and then `CONCURRENT_UPDATE` rather than a mixed profile.

The loader is an internal server component, not a student authorization API. A future API must authenticate the caller and enforce encounter ownership/course access before using it. A client-supplied ID alone must not become authorization, and the whole server-side envelope must not be returned to a student.

## What the server receives

| Field | Meaning |
|---|---|
| patientId, sourcePatientUuid, versionId/draftRevision | Internal identity, preserved source identity, and selected content revision |
| approvedProfileFields | Approved identity/personality/presentation fields; field-level unapproved provenance prevents promotion |
| approvedFacts | Typed, explicitly approved FACT items; narrative notes are not parsed into facts |
| approvedRules | Approved RULE items with typed triggers/targets and preserved full definitions, including faculty configuration |
| recordMetadata | Approved record descriptors, separate from portraits; no file contents or download URLs are fetched |
| unapprovedProposals | Separate profile-field, fact, rule and record proposals, kept outside approved conversation content |
| unknownAnswerBehavior | Approved text policy, or null when missing/unapproved |
| missingInformation and readiness.blockers | Stored missing fields plus validation/readiness gaps |
| portraitMetadata and sourceProvenance | Private presentation/source metadata for inspection, not clinical evidence or model instructions |

Raw IMPORT snapshots and REQUEST receipts are excluded from the section query. Imported `suppliedNotes` and `suppliedSummary` remain quarantined narrative proposals, even if a future profile has a general approval stamp. They mix clinical descriptions and teaching suggestions and cannot become approved clinical facts through loading.

Wyatt's live result has eight unapproved profile fields; zero approved fields/facts/rules/records; source UUID `4d619156-3250-4212-8399-129f3280fab1`; draft revision 1; an unverified, non-uploaded portrait reference; and missing cholesterol units, test dates, disclosure rules, unknown-answer policy, faculty objectives and approved structured facts. Faculty ownership still requires assignment.

## Structured-section read contract

The existing deployed patient currently has PROFILE/ASSET only. The FACT/RULE/RECORD read paths follow the proposed section keys; their attribute-level contract is documented here so later faculty storage can write compatible items. This reader does not implement that writer.

- FACT suffix `FACT#<factId>`: `type`, JSON `value`, optional `unit` and `provenance`, explicit `approvalStatus`. An optional `factId` must match the key.
- RULE suffix `RULE#<ruleId>`: `channel` PATIENT_REPLY or CHART_RELEASE; `trigger.type` ENCOUNTER_START, TOPIC_ASKED, EXPLICIT_RECORD_REQUEST or ALL_REQUIRED_DISCLOSURES; corresponding `topicId`, `recordType` or `factIds`; `targetFactIds`/`targetRecordIds`; explicit approval. Targets/prerequisite fact references must exist, and approved rules must depend on approved, available content. The complete rule definition is preserved; the next disclosure evaluator must validate and honor all its prerequisites/operators and permitted response content. This loader does not execute rules.
- RECORD suffix `RECORD#<recordId>`: `kind` STRUCTURED or ARTIFACT, `title`, `availability`, approval and optional `storageReference`. An artifact is not marked available unless its metadata also explicitly says `accessStatus=VERIFIED` and includes bucket/key plus immutable version/checksum. This flag reflects reviewed metadata, not a new access check performed by the loader. Payloads/files remain outside this metadata-only reader.
- Published META: schemaVersion 1, `approvedBy`, `publishedAt`, `contentHash`, and `entityIds` as section suffixes, such as PROFILE, FACT#duration, RULE#duration. Missing or unexpected sections fail validation. A future publisher must calculate the hash and atomically preserve this manifest/content; this reader checks manifest membership, not the publication hash algorithm. No published patient exists to verify live yet; this path is tested using in-memory fixtures only.

Errors distinguish invalid IDs/schema, missing patients/profiles, unavailable scope/status, unapproved drafts, incomplete published content, and concurrent updates. SDK/credential failures produce a clear CLI read-failure message without dumping credentials.

## Verification and next conversation boundary

Strict typing, lint and all 12 tests passed, including eight loader tests covering approval separation, draft rejection, missing/retired patients, malformed data, dangling rules, unavailable artifacts, concurrent edits and isolated published-version reads. Live preview succeeded; live normal-mode rejection succeeded. Test-only approved profiles were never written to DynamoDB.

The next AI conversation layer should receive only the approved identity/personality, approved unknown-answer policy, and facts permitted by the approved rules for the current encounter state. Rules and record metadata stay with the server's disclosure/chart logic; proposals, import provenance, rubric/teaching text and portrait locations are not patient-model grounding. The loader prepares definitions, not per-turn disclosure state or a finished prompt. **For Wyatt today, no approved AI/student encounter input is available.** This step stops at the working loader.
