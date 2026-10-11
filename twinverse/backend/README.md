# TwinVerse Patients: step 1

Status: **deployed and verified on October 10, 2026**. CloudFormation stack `TwinVersePatients` is CREATE_COMPLETE. Table `twinverse-event-patients` and both indexes are ACTIVE. One unapproved Wyatt draft is saved as six items; a second import returned the same patient without writing a duplicate.

This project contains one AWS CDK table definition and a one-patient import/round-trip verifier. It is not a backend API. No other TwinVerse tables, uploads, clinical reports, publication, encounters, or AI are included.

## Exact deployment scope

Account: `977659666193`; profile: `twinverse-event`; region: `us-west-2`.

Created CloudFormation stack **TwinVersePatients**, with termination protection enabled, containing exactly one resource:

| Logical ID       | Resource type        | Physical name            |
| ---------------- | -------------------- | ------------------------ |
| Patients5DBC2CF4 | AWS::DynamoDB::Table | twinverse-event-patients |

The table has string partition key `PK` and string sort key `SK`, `PAY_PER_REQUEST` billing, `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain`, service deletion protection, and point-in-time recovery. DynamoDB encryption uses the AWS-owned key; `SSEEnabled: false` in the generated template means no separately configured KMS key, not an unencrypted table. Reads/writes use HTTPS. This is the event prototype, not a real-patient production system.

The two GSIs are properties of that same table, not additional tables:

| Index                   | Partition key attribute/value              | Sort key attribute/value                 | INCLUDE projection                                                                |
| ----------------------- | ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------- |
| OwnerIndex              | ownerIndexPK = SCOPE#scopeId#OWNER#ownerId | ownerIndexSK = updatedAt#patientId       | patientId, displayName, status, draftRevision, updatedAt, scopeId, ownerFacultyId |
| PublishedCatalogueIndex | catalogueIndexPK = SCOPE#scopeId#PUBLISHED | catalogueIndexSK = publishedAt#patientId | patientId, publicTitle, publicTeaser, currentPublishedVersionId, publishedAt      |

Base PK/SK and the corresponding index keys are automatically included in each projection. Only HEAD items get owner index keys. Imported drafts have no catalogue index keys; that sparse index stays empty for this import. Profile notes, diagnoses, original CSV rows and portrait locations are not projected into the catalogue.

Stack outputs are the table name and ARN. Tags are `Project=TwinVerse`, `Scope=twinverse-event`.

**New permissions created: none.** The template contains no IAM role, policy, grant, resource policy, service account, or public access rule. It contains no KMS key, S3 bucket, ECR repository, Lambda, or CDK bootstrap resources. Deployment uses the existing event participant identity, without passing a new CloudFormation execution role.

The deployment/verification API calls used are CloudFormation `CreateStack` (with `EnableTerminationProtection=true`), `DescribeStacks`, `DescribeStackEvents`, and `DescribeStackResources`. CloudFormation needs the event identity's existing DynamoDB creation/description/tagging and continuous-backup configuration permissions. The import verifier needs `sts:GetCallerIdentity`, `dynamodb:DescribeTable`, `dynamodb:GetItem`, `dynamodb:Query`, and `dynamodb:PutItem` for the transaction's conditional Put actions, scoped to this table where resource scoping applies. `TransactWriteItems` authorizes its individual actions; there is no new policy attached to teammates. Creation and the conditional import transaction succeeded under the event identity. This confirms the permissions needed for this step; other services and teammate identities were not tested.

On-demand requests, stored data, index storage and point-in-time recovery are billable. Retention means the table continues to exist after deletion of its stack. No deletion is part of this step.

## Why no CDK bootstrap

The event account has no DynamoDB tables and no existing TwinVerse/CDKToolkit stack in this region. The stack has no file or container assets. We synthesize with CDK and submit its small JSON TemplateBody directly to CloudFormation. We do not run `cdk bootstrap` or CDK CLI deployment, which would require extra infrastructure outside the approved one-table scope. The CDK code remains the infrastructure source of truth.

## Validation completed

- Verified the named local `twinverse-event` profile resolves to account `977659666193`, assumed role `WSParticipantRole/Participant`.
- AWS toolkit independently reports the same account/role; its ListTables returned no tables in `us-west-2`.
- TypeScript strict checks and lint passed.
- Four tests passed: source UUID/raw-value preservation; unapproved/unpublished/no-upload state; stable import keys; and detection of altered/missing data during round-trip comparison.
- CDK strict synthesis and the AWS Solutions compliance validation passed with no suppressions.
- CDK diff against an empty template added only the table and two stack outputs.
- CloudFormation ValidateTemplate succeeded with no parameters or IAM capabilities required.

The exact deployed template is at `review/Patients.template.json`. The preview at `review/wyatt-import-preview.json` retains its preview placeholders; the actual saved draft used the verified caller and import timestamp. Live results are in `review/deployment-verification.json`, `review/wyatt-first-import-verification.json`, `review/wyatt-verification.json`, and `review/aws-final-item-check.json`.

## Wyatt draft contents

Source UUID: `4d619156-3250-4212-8399-129f3280fab1`.

Stable internal patient ID: `import-d95bcab43d3144ceedd0ae8c`.

One atomic import writes **six items** in Patients:

1. Source UUID-to-patient mapping under `SOURCEPATIENT#twinverse-event#faculty-provided-sample-patient-details#<UUID>`, SK `MAPPING`.
2. `PATIENT#<patientId>` / `HEAD`: draft revision 1, `DRAFT`, `UNAPPROVED`, faculty review required, owner-index fields only.
3. Same patient partition / `DRAFT#PROFILE`: supplied name, age, background, gender, personality, race/ethnicity, notes and summary. Only presentation quoting is normalized; originals are retained. No missing medical values are inferred.
4. Same partition / `DRAFT#ASSET#portrait-source`: filename/member paths/hash and supplied external S3 URI, all matching/access/approval unverified, no application S3 object and `uploaded=false`.
5. Same partition / `IMPORT#<sourceEditionId>#<rowHash>`: original parsed row (including the source column spelling `race/ethinicity`), raw CSV record from the parser, package/CSV/row hashes, record number, actor/time and normalizer version.
6. Same partition / `REQUEST#<stableImportRequestId>`: durable completed import receipt.

The supplied narrative is preserved, rather than automatically converting mixed clinical/teaching prose into approved facts or objectives. Missing cholesterol units/test dates and pending faculty configuration are flagged. There are no clinical RECORD items or VERSION items.

There is no faculty identity system yet. The initial owner is explicitly an `AWS_IMPORT_PRINCIPAL` derived from the verified assumed role; `facultyOwnerAssignmentRequired=true`. This does not assert that the shared event role is a named faculty person or provide student access. The imported draft must be assigned/reviewed before future publication.

All six writes use `attribute_not_exists(PK) AND attribute_not_exists(SK)` in one transaction. Stable mapping and patient IDs prevent duplicates across retries. A repeat reads the existing mapping and compares all six persisted items; it makes no writes. A different source row, ownership conflict, or faculty-edited draft fails comparison and is reported without overwriting data. Changed-source reconciliation is outside this one-import step.

## Teammate use after approval and deployment

Use Node.js 20 or newer and an authenticated AWS profile with access to the same event account. Each teammate uses their own authorized AWS session; do not share keys or tokens. This table's deployment does not grant access automatically.

From this project directory:

```sh
npm ci
npm run check
npm run lint
npm test
npm run synth
npm run preview:wyatt -- "/path/to/Challenge 1_ The Virtual Patient Encounter System.zip"
```

The source-package path is configurable for preview/import, so teammates do not need the original user's Downloads directory. Tests currently read that supplied local default path; run them where the package is available or update the fixture path for your environment.

The approved deployment was performed through the AWS toolkit using the asset-free CDK template. This equivalent command is documented for reference; do not run it for the already-created stack:

```sh
aws cloudformation create-stack --stack-name TwinVersePatients --template-body file://review/Patients.template.json --enable-termination-protection --profile twinverse-event --region us-west-2
```

Do not execute that create command again if the stack exists. Inspect the existing stack and use a reviewed update instead. After changing infrastructure code, synthesize again and refresh the review template; the checked-in review template describes this approved step only.

Once the table is ACTIVE:

```sh
npm run import:wyatt -- --write --package "/path/to/Challenge 1_ The Virtual Patient Encounter System.zip"
npm run import:wyatt -- --write --package "/path/to/Challenge 1_ The Virtual Patient Encounter System.zip"
```

The completed first run reported `created=true`; the completed second run reported `created=false`, with the same patient ID and six matching items. A teammate repeating the import now should get `created=false` if they use the same source and provisional owner role. Different ownership or edited source data is rejected without overwriting records. The verifier uses strongly consistent base-table reads and saves `review/wyatt-verification.json` only after successful comparison. It checks the actual profile/original row/provenance, not just that an item exists. Owner-list queries use OwnerIndex and are eventually consistent; direct retrieval uses the patient partition. Never expose this private table or its raw records directly to students.

The deployment and both verification runs succeeded. An independent strongly consistent table scan found six items, and a catalogue query returned zero published patients. The scope of this step is complete; no other database tables or backend features were built.

## Read-only patient loader

The next incremental step adds a server-side profile reader without changing the deployed table or its saved drafts. See [Patient loader usage and data contract](PATIENT-LOADER.md). Run `npm run load:patient -- import-d95bcab43d3144ceedd0ae8c --development-preview` for Wyatt. Normal mode rejects this unapproved draft.
