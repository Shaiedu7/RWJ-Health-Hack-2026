# TwinVerse session, documents and feedback review

Local branch: `twinverse-session-feedback`. Preserved baseline: `twinverse-combined` at `5a1e4d8`. No GitHub push or AWS deployment has occurred for this change. The running app remains on the baseline. The isolated checkout is under `work/github-push/twinverse/`.

## Implemented in the isolated branch

- Cognito sign-in selection sets a server-side active role. Faculty requires both faculty-mode login and verified Faculty group membership. A student-mode session cannot access Faculty API routes even when the demo account belongs to Faculty. Switching roles requires explicit sign-in. Separate real student accounts still need their own Cognito invitations.
- Faculty artifact and knowledge upload/review controls accept PDF, PNG and JPEG up to 2 MB per file. File signatures, draft ownership/revisions and object bindings are checked server-side. Original files are private. Bedrock transcribes visible text; failed extraction requires manual entry. Faculty must review extracted text before publishing. Report release settings use existing deterministic rules. Unsupported/invalid triggers block publication; missing triggers warn and keep reports hidden.
- Knowledge files default to private teaching references. A faculty-reviewed Patient record can ground the patient's answers. General reference material is not treated as facts about this patient. No managed Knowledge Base/vector index is created in this implementation.
- Student report metadata and file bytes require ownership of the saved encounter and a satisfied release rule. Private storage keys and unreleased text are excluded from the public DTO. Existing encounters retain their pinned published version; documents added later require a new published version and a new encounter.
- End session freezes the trial and requests schema-constrained Bedrock feedback, saved in the existing owned encounter record. Each new attempt is a separate logged encounter. Feedback covers strengths, findings elicited/missed, interview organization, communication and specific next steps, with saved message citations. Faculty learning objectives come from the pinned patient version. Older pinned versions without objectives and unapproved Wyatt drafts receive explicitly limited/provisional feedback. This is AI educational feedback, not a validated clinical grade.
- Feedback retries preserve the ended conversation; successful results restore after refresh. No assessment fallback is fabricated when Bedrock fails.

## Proposed deployment (approval required)

Account `977659666193`, region `us-west-2`, stack `TwinVersePatientFiles`:

| Resource | Exact configuration |
| --- | --- |
| PatientFiles | S3 bucket `twinverse-event-files-977659666193-us-west-2`; SSE-S3 AES256; versioning; all public access blocked; ACLs disabled; retained on delete/replacement; access logging and request metrics |
| AccessLogs | S3 bucket `twinverse-event-files-logs-977659666193-us-west-2`; AES256; all public access blocked; ACLs disabled; 90-day log expiry; retained on delete/replacement |
| FilesPolicy | Denies all non-TLS access to the document bucket and its objects; grants no new reader access |
| LogsPolicy | Denies non-TLS access; allows only S3 logging service writes to `access/*`, conditioned on the exact source document bucket and account |

No IAM roles, IAM identity policies, KMS keys, Lambda functions, database tables or Cognito resources will be created. Runtime needs `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` only for cleanup of failed uploads under the document bucket. Existing event role policy simulation returned allowed for all three; simulation is not a substitute for a live post-deployment test. Existing DynamoDB and Bedrock access are reused.

The synthesized template is in backend `review/patient-files/TwinVersePatientFiles.template.json` (not committed). CDK strict synthesis and direct cdk-nag v3 validation passed; `files-compliance.json` has no violations. AWS CloudFormation ValidateTemplate succeeded in the event account. No stack/change set was created.

Costs: S3 storage, requests, logging storage, request metrics and Bedrock extraction/feedback calls are usage-based. Versioned/retained documents continue using storage until explicitly cleaned up; removing a draft attachment does not delete files still referenced by published encounters. Pricing: https://aws.amazon.com/s3/pricing/ . CloudTrail S3 data-event logging is recommended for a production deployment but is not added by this event stack.

## Verification and limits

Backend type/lint checks and 45 tests passed before the final documentation update. Frontend type/build checks and 14 integration tests passed. Faculty inline JSX syntax was separately checked (Vite does not compile it). Privacy tests cover cross-owner references, unreleased report text, immutable ended trials, invalid citation rejection and persisted feedback retries. A real Bedrock feedback generation against DynamoDB Wyatt succeeded with a clearly labeled synthetic transcript; no student trial was mutated. See `bedrock-feedback-verification.json`.

Still required after approval: deploy the storage stack, run the new branch, verify real PDF/image uploads and extraction, review/publish a fictional test patient, verify release and access denial in the browser, and verify End session/feedback refresh with the real Cognito session. Full browser end-to-end behavior has not yet been verified for this branch.

After storage deployment, start the isolated backend with `ENABLE_PATIENT_FILES=true ENABLE_FACULTY_DEVELOPMENT=true npm run serve:student`. Without this flag, upload controls remain disabled and no file-extraction calls are attempted.
