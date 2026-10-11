import { mkdirSync, writeFileSync } from "node:fs";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { ACCOUNT, REGION, TABLE_NAME } from "../lib/patients-stack.js";
import {
  buildDraft,
  DEFAULT_PACKAGE,
  type Item,
  mappingKey,
  patientIdForSource,
  readWyattSource,
  SOURCE_UUID,
  verifyDraft,
} from "./wyatt-draft.js";

if (!process.argv.includes("--write"))
  throw new Error(
    "Use --write only after approving deployment and the draft import.",
  );
const packageFlag = process.argv.indexOf("--package");
const source = readWyattSource(
  packageFlag >= 0 ? process.argv[packageFlag + 1] : DEFAULT_PACKAGE,
);
const credentials = fromNodeProviderChain({ profile: "twinverse-event" });
const config = { region: REGION, credentials, maxAttempts: 3 };
const ddb = new DynamoDBClient(config);
const sts = new STSClient(config);
const doc = DynamoDBDocumentClient.from(ddb);

async function getItem(key: {
  PK: string;
  SK: string;
}): Promise<Item | undefined> {
  const result = await doc.send(
    new GetCommand({ TableName: TABLE_NAME, Key: key, ConsistentRead: true }),
  );
  return result.Item as Item | undefined;
}
async function readPatient(): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `PATIENT#${patientIdForSource()}` },
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as Item[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

try {
  const caller = await sts.send(new GetCallerIdentityCommand({}));
  if (caller.Account !== ACCOUNT || !caller.Arn)
    throw new Error("Wrong account or missing verified caller ARN.");
  const role = /^arn:aws:sts::(\d+):assumed-role\/(.+)\/[^/]+$/.exec(
    caller.Arn,
  );
  if (!role?.[1] || !role[2])
    throw new Error("Expected the event assumed-role credentials.");
  const ownerPrincipalArn = `arn:aws:iam::${role[1]}:role/${role[2]}`;
  const table = await ddb.send(
    new DescribeTableCommand({ TableName: TABLE_NAME }),
  );
  if (table.Table?.TableStatus !== "ACTIVE")
    throw new Error("Patients table is not ACTIVE.");

  let mapping = await getItem(mappingKey());
  let created = false;
  if (!mapping) {
    const expected = buildDraft(
      source,
      new Date().toISOString(),
      caller.Arn,
      ownerPrincipalArn,
    );
    try {
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
    } catch (error) {
      // Only treat a concurrently created matching mapping as a possible retry;
      // all other failures propagate. Full equality is checked below.
      mapping = await getItem(mappingKey());
      if (!mapping) throw error;
    }
    mapping = await getItem(mappingKey());
  }
  if (mapping?.["patientId"] !== patientIdForSource())
    throw new Error("Existing source mapping conflicts; nothing overwritten.");
  const actualPatient = await readPatient();
  const head = actualPatient.find((item) => item.SK === "HEAD");
  if (head?.["ownerPrincipalArn"] !== ownerPrincipalArn)
    throw new Error("Existing patient owner differs; faculty review required.");
  const snapshot = actualPatient.find(
    (item) => item["entityType"] === "IMMUTABLE_IMPORT_SNAPSHOT",
  );
  const provenance = snapshot?.["provenance"] as
    Record<string, unknown> | undefined;
  if (
    typeof head["createdAt"] !== "string" ||
    typeof provenance?.["importedByArn"] !== "string"
  )
    throw new Error("Import provenance missing.");
  const expected = buildDraft(
    source,
    head["createdAt"],
    provenance["importedByArn"],
    ownerPrincipalArn,
  );
  verifyDraft(expected, [mapping, ...actualPatient]);
  const receipt = {
    status: "VERIFIED",
    created,
    patientId: patientIdForSource(),
    sourcePatientUuid: SOURCE_UUID,
    account: ACCOUNT,
    region: REGION,
    tableName: TABLE_NAME,
    itemCount: actualPatient.length + 1,
    draftRevision: head["draftRevision"],
    published: false,
    uploaded: false,
    clinicalReportsCreated: 0,
    originalRowMatches: true,
    originalCsvRecordMatches: true,
    checkedAt: new Date().toISOString(),
  };
  mkdirSync("review", { recursive: true });
  writeFileSync(
    "review/wyatt-verification.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  ddb.destroy();
  sts.destroy();
}
