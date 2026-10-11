import { auditFacultyProfile } from "./faculty-audit.js";
import {
  GetCommand,
  TransactWriteCommand,
  paginateQuery,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { FacultyError, draftItems } from "./faculty-patients.js";
import { profileHash, reviewProfile } from "./faculty-review.js";
import { TABLE_NAME } from "./patients-stack.js";
export function versionItems(
  owner: string,
  profile: Record<string, unknown>,
  id: string,
  revision: number,
  version: string,
) {
  const prefix = `VERSION#${version}#`,
    now = new Date().toISOString();
  const items = draftItems(owner, profile, id, revision, now)
    .filter(
      (i) =>
        !["HEAD", "DRAFT#ASSESSMENT", "DRAFT#DISCLOSURE_PROPOSAL"].includes(
          i.SK,
        ),
    )
    .map(
      (i) =>
        ({
          ...i,
          SK: i.SK.replace("DRAFT#", prefix),
          approvalStatus: "APPROVED",
          approvedBy: owner,
          publishedAt: now,
        }) as Record<string, unknown>,
    );
  const p = items.find((i) => i["SK"] === prefix + "PROFILE");
  if (!p) throw new Error("Profile required");
  p["unknownAnswerBehavior"] =
    "If a requested detail is absent, say you do not know or remember. Empty lists are unknown, not negative findings.";
  p["missingInformation"] = [];
  const facts = items
    .filter((i) => String(i["SK"]).startsWith(prefix + "FACT#"))
    .map((i) => String(i["factId"]));
  items.push({
    PK: `PATIENT#${id}`,
    SK: prefix + "RULE#interview",
    patientId: id,
    schemaVersion: 1,
    approvalStatus: "APPROVED",
    ruleId: "interview",
    channel: "PATIENT_REPLY",
    trigger: { type: "TOPIC_ASKED", topicId: "student interview", factIds: [] },
    targetFactIds: facts,
    targetRecordIds: [],
    approvedBy: owner,
  });
  const ids = items.map((i) => String(i["SK"]).slice(prefix.length));
  items.push({
    PK: `PATIENT#${id}`,
    SK: prefix + "META",
    patientId: id,
    schemaVersion: 1,
    approvalStatus: "APPROVED",
    approvedBy: owner,
    publishedAt: now,
    contentHash: profileHash(profile),
    entityIds: ids,
  });
  return items;
}
export async function checkDraft(
  doc: DynamoDBDocumentClient,
  owner: string,
  id: string,
  revision: number,
  profile: Record<string, unknown>,
) {
  const issues = [
    ...reviewProfile(profile),
    ...(await auditFacultyProfile(owner, profile)),
  ];
  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: TABLE_NAME,
            Key: { PK: `PATIENT#${id}`, SK: "HEAD" },
            ConditionExpression: "ownerFacultyId = :o AND draftRevision = :r",
            ExpressionAttributeValues: { ":o": owner, ":r": revision },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: `PATIENT#${id}`,
              SK: "DRAFT#CHECK",
              revision,
              profileHash: profileHash(profile),
              issues,
              auditCompleted: true,
              checkedAt: new Date().toISOString(),
            },
          },
        },
      ],
    }),
  );
  return issues;
}
export async function publishDraft(
  doc: DynamoDBDocumentClient,
  owner: string,
  id: string,
  revision: number,
  profile: Record<string, unknown>,
  confirmed: boolean,
) {
  if (!confirmed)
    throw new FacultyError(
      422,
      "Confirm you reviewed the complete profile and release settings.",
    );
  const issues = reviewProfile(profile);
  if (issues.some((i) => i.severity === "critical" && i.status !== "dismissed"))
    throw new FacultyError(
      422,
      "Fix the blocking review issues before publishing.",
    );
  const checked = (
    await doc.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `PATIENT#${id}`, SK: "DRAFT#CHECK" },
        ConsistentRead: true,
      }),
    )
  ).Item;
  if (
    checked?.["revision"] !== revision ||
    checked["profileHash"] !== profileHash(profile)
  )
    throw new FacultyError(
      409,
      "Run the check on this saved revision before publishing.",
    );
  if (checked["auditCompleted"] !== true || !Array.isArray(checked["issues"]))
    throw new FacultyError(
      409,
      "Run the updated consistency check before publishing.",
    );
  if (
    (checked["issues"] as { severity: string; status?: string }[]).some(
      (i) => i.severity === "critical",
    )
  )
    throw new FacultyError(
      422,
      "Resolve the critical consistency issues, then run the check again before publishing.",
    );
  const version = randomUUID(),
    items = versionItems(owner, profile, id, revision, version);
  const demographics = profile["demographics"] as Record<string, unknown>,
    overview = profile["overview"] as Record<string, unknown>;
  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: `PATIENT#${id}`, SK: "HEAD" },
            ConditionExpression: "ownerFacultyId = :o AND draftRevision = :r",
            UpdateExpression:
              "SET #s = :s, currentPublishedVersionId = :v, publishedRevision = :r, publishedAt = :now, catalogueIndexPK = :cat, catalogueIndexSK = :sort, publicTitle = :title, publicTeaser = :teaser",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":o": owner,
              ":r": revision,
              ":s": "PUBLISHED",
              ":v": version,
              ":now": new Date().toISOString(),
              ":cat": "SCOPE#twinverse-event#PUBLISHED",
              ":sort": `${String(demographics["name"])}#${id}`,
              ":title": demographics["name"],
              ":teaser": overview["chief_complaint"],
            },
          },
        },
        ...items.map((Item) => ({
          Put: {
            TableName: TABLE_NAME,
            Item,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        })),
      ],
    }),
  );
  return { versionId: version, revision };
}
export async function publishedCatalogue(doc: DynamoDBDocumentClient) {
  const rows: Record<string, unknown>[] = [];
  for await (const page of paginateQuery(
    { client: doc },
    {
      TableName: TABLE_NAME,
      IndexName: "PublishedCatalogueIndex",
      KeyConditionExpression: "catalogueIndexPK = :p",
      ExpressionAttributeValues: { ":p": "SCOPE#twinverse-event#PUBLISHED" },
    },
  ))
    rows.push(...(page.Items ?? []));
  return rows;
}

export async function dismissAuditIssue(
  doc: DynamoDBDocumentClient,
  owner: string,
  id: string,
  revision: number,
  profile: Record<string, unknown>,
  index: number,
  reason: string,
) {
  if (!reason.trim() || reason.length > 1000)
    throw new FacultyError(
      422,
      "Record why you disagree with this AI finding.",
    );
  const check = (
    await doc.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `PATIENT#${id}`, SK: "DRAFT#CHECK" },
        ConsistentRead: true,
      }),
    )
  ).Item;
  if (
    !check ||
    check["revision"] !== revision ||
    check["profileHash"] !== profileHash(profile) ||
    !Array.isArray(check["issues"])
  )
    throw new FacultyError(
      409,
      "Check this saved revision before reviewing findings.",
    );
  const issues = structuredClone(
    check["issues"],
  ) as import("./faculty-review.js").Issue[];
  const issue = issues[index];
  if (!issue || issue.source !== "ai")
    throw new FacultyError(
      422,
      "Fixed-rule issues must be corrected in the profile.",
    );
  Object.assign(issue, {
    status: "dismissed",
    dismissalReason: reason.trim(),
    dismissedBy: owner,
  });
  await doc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: TABLE_NAME,
            Key: { PK: `PATIENT#${id}`, SK: "HEAD" },
            ConditionExpression: "ownerFacultyId = :o AND draftRevision = :r",
            ExpressionAttributeValues: { ":o": owner, ":r": revision },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...check, issues, checkedAt: new Date().toISOString() },
            ConditionExpression: "checkedAt = :previous",
            ExpressionAttributeValues: { ":previous": check["checkedAt"] },
          },
        },
      ],
    }),
  );
  return issues;
}
