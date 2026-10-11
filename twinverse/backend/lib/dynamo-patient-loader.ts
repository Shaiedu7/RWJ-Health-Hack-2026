import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  DynamoDBDocumentClient,
  GetCommand,
  paginateQuery,
} from "@aws-sdk/lib-dynamodb";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { ACCOUNT, REGION, TABLE_NAME } from "./patients-stack.js";
import {
  createPatientLoader,
  PatientLoadError,
  type StoredItem,
} from "./patient-loader.js";

export async function createDynamoPatientLoader() {
  if (typeof window !== "undefined")
    throw new PatientLoadError(
      "SERVER_ONLY",
      "Patient loader requires a server-side Node.js runtime.",
    );
  const credentials = fromNodeProviderChain({ profile: "twinverse-event" });
  const config = { region: REGION, credentials, maxAttempts: 3 };
  const sts = new STSClient(config);
  try {
    const caller = await sts.send(new GetCallerIdentityCommand({}));
    if (caller.Account !== ACCOUNT)
      throw new PatientLoadError(
        "WRONG_ACCOUNT",
        "AWS profile resolves to a different account.",
      );
  } finally {
    sts.destroy();
  }
  const client = new DynamoDBClient(config),
    doc = DynamoDBDocumentClient.from(client);
  const loader = createPatientLoader({
    async getHead(patientId) {
      const response = await doc.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `PATIENT#${patientId}`, SK: "HEAD" },
          ConsistentRead: true,
        }),
      );
      return response.Item as StoredItem | undefined;
    },
    async querySections(patientId, prefix) {
      const items: StoredItem[] = [];
      for await (const page of paginateQuery(
        { client: doc },
        {
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: {
            ":pk": `PATIENT#${patientId}`,
            ":prefix": prefix,
          },
          ConsistentRead: true,
        },
      ))
        items.push(...(page.Items ?? []));
      return items;
    },
  });
  return { ...loader, destroy: () => client.destroy() };
}
