import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { ACCOUNT, REGION, TABLE_NAME } from "../lib/patients-stack.js";
import { DEFAULT_PACKAGE, SCOPE_ID, type Item } from "./wyatt-draft.js";

const dataset = "joeljames270/virtual-patient-profiles-sample";
const namespace = `huggingface:${dataset}:default:train`;
const url = `https://datasets-server.huggingface.co/rows?dataset=joeljames270%2Fvirtual-patient-profiles-sample&config=default&split=train&offset=0&length=100`;
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
type Data = Record<string, unknown>;
function obj(x: unknown): Data {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("Expected source object");
  return x as Data;
}
function str(x: unknown): string {
  if (typeof x !== "string" || !x.trim())
    throw new Error("Expected nonempty source string");
  return x;
}
const bytes = readFileSync(
  new URL("../sources/huggingface-patients.json", import.meta.url),
);
const source = obj(JSON.parse(bytes.toString()) as unknown);
if (
  source["partial"] !== false ||
  !Array.isArray(source["rows"]) ||
  source["rows"].length !== source["num_rows_total"]
)
  throw new Error("Incomplete dataset; paginate before importing");
const edition = `hf-response-${hash(bytes)}`;
const csvEntry = new AdmZip(DEFAULT_PACKAGE)
  .getEntries()
  .find((e) =>
    e.entryName.endsWith("/faculty-provided-sample-patient-details.csv"),
  );
if (!csvEntry) throw new Error("Original CSV unavailable for overlap checks");
const csvRows = parse(csvEntry.getData(), {
  columns: true,
  bom: true,
  skip_empty_lines: true,
}) as Record<string, string>[];
const normalize = (s: string) => s.trim().toLowerCase();
const prepared = source["rows"].map((raw: unknown) => {
  const entry = obj(raw),
    row = obj(entry["row"]),
    overview = obj(row["patient_overview"]);
  if (
    !Array.isArray(entry["truncated_cells"]) ||
    entry["truncated_cells"].length
  )
    throw new Error("Truncated cells; refusing lossy import");
  if (!Number.isSafeInteger(entry["row_idx"]))
    throw new Error("Invalid row index");
  const name = str(overview["name"]),
    age = overview["age"];
  if (typeof age !== "number" || !Number.isSafeInteger(age) || age < 0)
    throw new Error("Invalid source age");
  const identity = normalize(name);
  const patientId = `import-${hash(`${SCOPE_ID}:${namespace}:${identity}`).slice(0, 24)}`;
  const overlaps = csvRows
    .filter((r) => normalize(r["patient-name"] ?? "") === identity)
    .map((r) => ({
      sourceNamespace: "faculty-provided-sample-patient-details",
      sourcePatientUuid: r["patient-uuid"],
      matchBasis: "NAME_ONLY_NOT_CONFIRMED_IDENTITY",
      status: "REVIEW_REQUIRED",
      originalCsvRow: r,
      differences: [
        "Hugging Face supplies additional clinical and social details; CSV does not establish their validity.",
        ...(name === "Wyatt Nelson"
          ? [
              "Diabetes, medication history and additional labs are absent from the supplied CSV; do not merge automatically.",
              "Hugging Face lists BMI 32 and 32.1; reconciliation required.",
            ]
          : []),
      ],
    }));
  return {
    row,
    index: entry["row_idx"],
    name,
    age,
    patientId,
    identity,
    overlaps,
    rowHash: hash(JSON.stringify(row)),
  };
});
if (new Set(prepared.map((p) => p.identity)).size !== prepared.length)
  throw new Error(
    "Duplicate source names require explicit identity resolution",
  );

function build(
  p: (typeof prepared)[number],
  importedAt: string,
  actor: string,
  owner: string,
): Item[] {
  const PK = `PATIENT#${p.patientId}`,
    snapshotSK = `IMPORT#${edition}#${p.rowHash}`;
  const provenance = {
    dataset,
    config: "default",
    split: "train",
    sourceNamespace: namespace,
    sourceEditionId: edition,
    sourceUrl: url,
    sourceRowIndex: p.index,
    sourcePatientUuid: null,
    sourceIdentityKey: p.identity,
    identityStrategy:
      "NORMALIZED_NAME_WITHIN_DATASET_SPLIT_V1_NO_UUID_SUPPLIED",
    rowSha256: p.rowHash,
    responseSha256: hash(bytes),
    importedAt,
    importedByArn: actor,
    snapshotSK,
    normalizerVersion: "hf-draft-v1",
  };
  const ownerId = `IMPORT_PRINCIPAL#${owner}`;
  const fields = {
    name: p.name,
    age: p.age,
    gender: obj(p.row["patient_overview"])["sex"],
    background: obj(p.row["demographics"])["occupation"],
    raceEthnicity: obj(p.row["demographics"])["ethnicity"],
    personality: obj(p.row["psychosocial_profile"])["personality"],
    communicationStyle: obj(p.row["psychosocial_profile"])[
      "communication_style"
    ],
    suppliedNotes: obj(p.row["patient_overview"])["description"],
  };
  for (const [key, value] of Object.entries(fields))
    if (key !== "age") str(value);
  const common = {
    PK,
    patientId: p.patientId,
    schemaVersion: 1,
    approvalStatus: "UNAPPROVED",
    reviewRequired: true,
  };
  const items: Item[] = [
    {
      PK: `SOURCEPATIENT#${SCOPE_ID}#${namespace}#${hash(p.identity)}`,
      SK: "MAPPING",
      entityType: "SOURCE_PATIENT_MAPPING",
      patientId: p.patientId,
      scopeId: SCOPE_ID,
      sourceNamespace: namespace,
      sourceIdentityKey: p.identity,
      sourcePatientUuid: null,
      rowSha256: p.rowHash,
      sourceEditionId: edition,
    },
    {
      ...common,
      SK: "HEAD",
      entityType: "PATIENT",
      scopeId: SCOPE_ID,
      status: "DRAFT",
      draftRevision: 1,
      sourcePatientUuid: null,
      sourceEditionId: edition,
      displayName: p.name,
      createdAt: importedAt,
      updatedAt: importedAt,
      ownerFacultyId: ownerId,
      ownerIdentityType: "AWS_IMPORT_PRINCIPAL",
      ownerPrincipalArn: owner,
      facultyOwnerAssignmentRequired: true,
      ownerIndexPK: `SCOPE#${SCOPE_ID}#OWNER#${ownerId}`,
      ownerIndexSK: `${importedAt}#${p.patientId}`,
      sourceOverlapReviewRequired: p.overlaps.length > 0,
    },
    {
      ...common,
      SK: "DRAFT#PROFILE",
      entityType: "PATIENT_DRAFT_PROFILE",
      ...fields,
      sourceProvenance: provenance,
      fieldProvenance: Object.fromEntries(
        Object.keys(fields).map((k) => [
          k,
          { ...provenance, approvalStatus: "UNAPPROVED" },
        ]),
      ),
      unknownAnswerBehavior: null,
      clinicalFactsApprovalStatus: "UNREVIEWED",
      portraitAssetId: null,
      missingInformation: [
        "Approved disclosure rules",
        "Approved unknown-answer behavior",
        "Faculty-reviewed learning objectives",
        "Verified clinical artifact files",
      ],
      reviewNotes: [
        "All supplied sections are proposals. Empty arrays and nulls do not establish negative findings.",
        "Source assumptions and optional details are not confirmed facts.",
        "Disclosure prose requires explicit faculty-approved rules.",
      ],
    },
    {
      PK,
      SK: snapshotSK,
      entityType: "IMMUTABLE_IMPORT_SNAPSHOT",
      originalRow: p.row,
      provenance,
    },
    {
      ...common,
      SK: "DRAFT#DISCLOSURE_PROPOSAL",
      entityType: "DISCLOSURE_CATEGORY_PROPOSAL",
      originalCategories: p.row["information_disclosure"],
      provenance,
      executable: false,
    },
    {
      ...common,
      SK: "DRAFT#ASSESSMENT",
      entityType: "PATIENT_LEARNING_OBJECTIVES_PROPOSAL",
      learningOpportunities: p.row["learning_opportunities"],
      provenance,
      facultyApproved: false,
    },
    {
      ...common,
      SK: "DRAFT#SOURCE_METADATA",
      entityType: "SOURCE_ASSUMPTIONS_AND_OPTIONAL_DETAILS",
      sourceMetadata: p.row["metadata"],
      provenance,
      confirmedFacts: false,
    },
    {
      ...common,
      SK: "DRAFT#SOURCE_REVIEW",
      entityType: "CROSS_SOURCE_REVIEW",
      possibleMatches: p.overlaps,
      merged: false,
      provenance,
    },
    {
      PK,
      SK: `REQUEST#import-${p.rowHash}`,
      entityType: "IMPORT_RECEIPT",
      status: "COMPLETE",
      requestPayloadHash: p.rowHash,
      patientId: p.patientId,
      provenance,
    },
  ];
  for (const section of [
    "patient_overview",
    "demographics",
    "clinical_profile",
    "medication_profile",
    "nutrition_profile",
    "psychosocial_profile",
  ]) {
    items.push({
      ...common,
      SK: `DRAFT#FACT#${section}`,
      entityType: "PATIENT_FACT_PROPOSAL",
      factId: section,
      type: "SUPPLIED_SECTION_PROPOSAL",
      value: obj(p.row[section]),
      provenance: { ...provenance, sourceSection: section },
      unit: null,
    });
  }
  for (const item of items)
    if (Buffer.byteLength(JSON.stringify(item)) > 300_000)
      throw new Error("Item exceeds conservative size budget");
  return items;
}

if (!process.argv.includes("--write")) {
  for (const p of prepared)
    build(p, new Date().toISOString(), "PREVIEW", "PREVIEW");
  console.log(
    JSON.stringify(
      {
        mode: "PREVIEW",
        total: prepared.length,
        patients: prepared.map((p) => ({
          name: p.name,
          patientId: p.patientId,
          possibleCsvMatches: p.overlaps.length,
        })),
        itemsPerPatient: 15,
      },
      null,
      2,
    ),
  );
} else {
  const config = {
    region: REGION,
    credentials: fromNodeProviderChain({ profile: "twinverse-event" }),
    maxAttempts: 3,
  };
  const ddb = new DynamoDBClient(config),
    sts = new STSClient(config),
    doc = DynamoDBDocumentClient.from(ddb);
  const results: Data[] = [];
  try {
    const caller = await sts.send(new GetCallerIdentityCommand({}));
    if (caller.Account !== ACCOUNT || !caller.Arn)
      throw new Error("Unexpected AWS account");
    const role = /^arn:aws:sts::(\d+):assumed-role\/(.+)\/[^/]+$/.exec(
      caller.Arn,
    );
    if (!role) throw new Error("Expected event role");
    const owner = `arn:aws:iam::${role[1]}:role/${role[2]}`;
    if (
      (await ddb.send(new DescribeTableCommand({ TableName: TABLE_NAME })))
        .Table?.TableStatus !== "ACTIVE"
    )
      throw new Error("Table unavailable");
    for (const p of prepared) {
      let expected = build(p, new Date().toISOString(), caller.Arn, owner);
      const firstItem = expected[0];
      if (!firstItem) throw new Error("Missing source mapping");
      const mappingKey = { PK: firstItem.PK, SK: "MAPPING" };
      let mapping = (
        await doc.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: mappingKey,
            ConsistentRead: true,
          }),
        )
      ).Item;
      let created = false;
      if (!mapping) {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: expected.map((Item) => ({
              Put: {
                TableName: TABLE_NAME,
                Item,
                ConditionExpression:
                  "attribute_not_exists(PK) AND attribute_not_exists(SK)",
              },
            })),
          }),
        );
        created = true;
        mapping = (
          await doc.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: mappingKey,
              ConsistentRead: true,
            }),
          )
        ).Item;
      }
      if (
        mapping?.["patientId"] !== p.patientId ||
        mapping["rowSha256"] !== p.rowHash ||
        mapping["sourceEditionId"] !== edition
      )
        throw new Error(
          "Source changed or mapping conflicts; nothing overwritten",
        );
      const actual: Item[] = [];
      let key: Record<string, unknown> | undefined;
      do {
        const page = await doc.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": `PATIENT#${p.patientId}` },
            ConsistentRead: true,
            ExclusiveStartKey: key,
          }),
        );
        actual.push(...((page.Items ?? []) as Item[]));
        key = page.LastEvaluatedKey;
      } while (key);
      const head = actual.find((i) => i.SK === "HEAD"),
        snapshot = actual.find((i) => i.SK.startsWith("IMPORT#"));
      const prov = obj(snapshot?.["provenance"]);
      expected = build(
        p,
        str(head?.["createdAt"]),
        str(prov["importedByArn"]),
        owner,
      );
      const all = [mapping, ...actual];
      if (
        all.length !== expected.length ||
        expected.some(
          (e) =>
            !isDeepStrictEqual(
              all.find((a) => a?.["PK"] === e.PK && a["SK"] === e.SK),
              e,
            ),
        )
      )
        throw new Error("Round-trip content mismatch");
      if (!isDeepStrictEqual(snapshot?.["originalRow"], p.row))
        throw new Error("Source content changed");
      results.push({
        name: p.name,
        patientId: p.patientId,
        created,
        itemCount: all.length,
        originalRowMatches: true,
        unapproved: true,
        possibleCsvMatches: p.overlaps.length,
      });
    }
    const report = {
      status: "VERIFIED",
      account: ACCOUNT,
      region: REGION,
      tableName: TABLE_NAME,
      dataset,
      sourceUrl: url,
      sourceEditionId: edition,
      responseSha256: hash(bytes),
      totalSourceRows: prepared.length,
      checkedAt: new Date().toISOString(),
      patients: results,
      newResources: 0,
      published: 0,
      filesUploaded: 0,
    };
    writeFileSync(
      "review/huggingface-import-verification.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    ddb.destroy();
    sts.destroy();
  }
}
