import { validateFileBindings, type PatientFile } from "./patient-files.js";
import {
  dismissAuditIssue,
  checkDraft,
  publishDraft,
  publishedCatalogue,
} from "./published-patients.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  paginateQuery,
} from "@aws-sdk/lib-dynamodb";
import { ACCOUNT, REGION, TABLE_NAME } from "./patients-stack.js";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

type ObjectValue = Record<string, unknown>;
type Schema = ObjectValue;
const contract = JSON.parse(
  readFileSync(new URL("./faculty-schema.json", import.meta.url), "utf8"),
) as { schema: Schema; blank: ObjectValue };
export const facultySchema = contract.schema;
export const blankFacultyProfile = () => structuredClone(contract.blank);
export class FacultyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireFaculty(
  identity: { sub: string; "cognito:groups"?: unknown } | null,
) {
  if (!identity) throw new FacultyError(401, "Sign in with Cognito.");
  if (
    !Array.isArray(identity["cognito:groups"]) ||
    !identity["cognito:groups"].includes("Faculty")
  )
    throw new FacultyError(403, "This account does not have faculty access.");
  return identity.sub;
}
function object(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function valid(value: unknown, spec: Schema): boolean {
  if (typeof spec["$ref"] === "string") {
    const target = (facultySchema["$defs"] as Record<string, Schema>)[
      spec["$ref"].split("/").at(-1) ?? ""
    ];
    return target !== undefined && valid(value, target);
  }
  if (Array.isArray(spec["anyOf"]))
    return (spec["anyOf"] as Schema[]).some((s) => valid(value, s));
  if (Array.isArray(spec["enum"]) && !spec["enum"].includes(value))
    return false;
  switch (spec["type"]) {
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "string":
      return typeof value === "string" && value.length <= 20_000;
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "array":
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every((v) => valid(v, spec["items"] as Schema))
      );
    case "object": {
      if (!object(value)) return false;
      const props = spec["properties"] as Record<string, Schema> | undefined;
      if (!props) return Object.keys(value).length <= 100;
      if (Object.keys(value).some((k) => !Object.hasOwn(props, k)))
        return false;
      if (
        (spec["required"] as string[] | undefined)?.some(
          (k) => !Object.hasOwn(value, k),
        )
      )
        return false;
      return Object.entries(value).every(
        ([k, v]) => props[k] !== undefined && valid(v, props[k]),
      );
    }
    default:
      return true;
  }
}
export function validateFacultyProfile(value: unknown): ObjectValue {
  if (!valid(value, facultySchema) || !object(value))
    throw new FacultyError(
      422,
      "Patient profile does not match the form schema.",
    );
  const profile = { ...blankFacultyProfile(), ...value };
  const demographics = profile["demographics"] as ObjectValue;
  const age = demographics["age"];
  if (
    age !== null &&
    age !== undefined &&
    (typeof age !== "number" || age < 0 || age > 110)
  )
    throw new FacultyError(422, "Age must be blank or between 0 and 110.");
  if (Buffer.byteLength(JSON.stringify(profile)) > 120_000)
    throw new FacultyError(413, "Patient profile is too large.");
  return profile;
}
export interface FacultyStore {
  list(owner: string): Promise<ObjectValue[]>;
  check(owner: string, id: string, revision: number): Promise<unknown>;
  publish(
    owner: string,
    id: string,
    revision: number,
    confirmed: boolean,
  ): Promise<ObjectValue>;
  dismiss(
    owner: string,
    id: string,
    revision: number,
    index: number,
    reason: string,
  ): Promise<import("./faculty-review.js").Issue[]>;
  catalogue(): Promise<ObjectValue[]>;
  publishedStudio(id: string, version: string): Promise<ObjectValue>;
  get(owner: string, id: string): Promise<ObjectValue>;
  save(
    owner: string,
    profile: unknown,
    id?: string,
    revision?: number,
    uploaded?: PatientFile,
  ): Promise<ObjectValue>;
}
export function draftItems(
  owner: string,
  profile: ObjectValue,
  id: string,
  revision: number,
  createdAt: string,
) {
  const now = new Date().toISOString(),
    pk = `PATIENT#${id}`;
  const common = {
    PK: pk,
    patientId: id,
    schemaVersion: 1,
    approvalStatus: "UNAPPROVED",
  };
  const demographics = profile["demographics"] as ObjectValue,
    overview = profile["overview"] as ObjectValue;
  const psychosocial = profile["psychosocial"] as ObjectValue;
  const clinical = profile["clinical"] as ObjectValue;
  const patientClinical = { ...clinical };
  delete patientClinical["hidden_diagnosis"];
  delete patientClinical["differentials"];
  return [
    {
      ...common,
      SK: "HEAD",
      entityType: "PATIENT",
      scopeId: "twinverse-event",
      status: "DRAFT",
      draftRevision: revision,
      displayName:
        demographics["name"] || overview["title"] || "Untitled patient",
      ownerFacultyId: owner,
      ownerIdentityType: "COGNITO_SUB",
      facultyOwnerAssignmentRequired: false,
      createdAt,
      updatedAt: now,
      ownerIndexPK: `SCOPE#twinverse-event#OWNER#${owner}`,
      ownerIndexSK: `${createdAt}#${id}`,
    },
    {
      ...common,
      SK: "DRAFT#STUDIO",
      entityType: "FACULTY_STUDIO_PROFILE",
      profile,
      revision,
    },
    {
      ...common,
      SK: "DRAFT#PROFILE",
      entityType: "PATIENT_DRAFT_PROFILE",
      name: demographics["name"],
      age: demographics["age"],
      background: demographics["occupation"],
      gender: demographics["gender_identity"] || demographics["sex"],
      personality: psychosocial["personality"],
      communicationStyle: psychosocial["communication_style"],
      presentation: overview["chief_complaint"],
      suppliedSummary: overview["case_summary"],
      missingInformation: [
        "Faculty approval",
        "Approved disclosure rules",
        "Approved unknown-answer behavior",
      ],
      sourceProvenance: { type: "FACULTY_DRAFT", authorSub: owner },
      unknownAnswerBehavior: null,
    },
    ...Object.entries({
      demographics,
      clinical: patientClinical,
      medications: profile["medications"],
      nutrition: profile["nutrition"],
      psychosocial,
    }).map(([key, value]) => ({
      ...common,
      SK: `DRAFT#FACT#${key}`,
      entityType: "PATIENT_FACT_PROPOSAL",
      factId: key,
      type: key.toUpperCase(),
      value,
      unit: null,
      provenance: { type: "FACULTY_DRAFT", authorSub: owner },
    })),
    {
      ...common,
      SK: "DRAFT#ASSESSMENT",
      entityType: "PATIENT_LEARNING_OBJECTIVES_PROPOSAL",
      value: profile["learning"],
    },
    {
      ...common,
      SK: "DRAFT#DISCLOSURE_PROPOSAL",
      entityType: "DISCLOSURE_CATEGORY_PROPOSAL",
      value: profile["disclosure"],
      executable: false,
    },
  ];
}
export function createFacultyStore(doc: DynamoDBDocumentClient): FacultyStore {
  const store: FacultyStore = {
    async catalogue() {
      return publishedCatalogue(doc);
    },
    async publishedStudio(id, version) {
      const { Item } = await doc.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `PATIENT#${id}`, SK: `VERSION#${version}#STUDIO` },
          ConsistentRead: true,
        }),
      );
      if (!Item) throw new FacultyError(404, "Published patient unavailable.");
      return Item["profile"] as ObjectValue;
    },
    async check(owner, id, revision) {
      const current = await store.get(owner, id);
      if (current["ver"] !== revision)
        throw new FacultyError(409, "Refresh the draft before checking.");
      return checkDraft(
        doc,
        owner,
        id,
        revision,
        current["profile"] as ObjectValue,
      );
    },
    async publish(owner, id, revision, confirmed) {
      const current = await store.get(owner, id);
      if (current["ver"] !== revision)
        throw new FacultyError(409, "Refresh the draft before publishing.");
      if (current["status"] === "published") return current;
      await publishDraft(
        doc,
        owner,
        id,
        revision,
        current["profile"] as ObjectValue,
        confirmed,
      );
      return store.get(owner, id);
    },
    async list(owner) {
      const rows: ObjectValue[] = [];
      for await (const page of paginateQuery(
        { client: doc },
        {
          TableName: TABLE_NAME,
          IndexName: "OwnerIndex",
          KeyConditionExpression: "ownerIndexPK = :owner",
          ExpressionAttributeValues: {
            ":owner": `SCOPE#twinverse-event#OWNER#${owner}`,
          },
        },
      ))
        rows.push(...(page.Items ?? []));
      return Promise.all(
        rows
          .filter((r) => ["DRAFT", "PUBLISHED"].includes(String(r["status"])))
          .map(async (r) => {
            const current = await store.get(owner, String(r["patientId"]));
            const profile = current["profile"] as Record<
              string,
              Record<string, unknown>
            >;
            return {
              pid: r["patientId"],
              ver: current["ver"],
              status: current["status"],
              name:
                profile["demographics"]?.["name"] ||
                profile["overview"]?.["title"] ||
                "Untitled patient",
              complaint: profile["overview"]?.["chief_complaint"] || "",
              tags: profile["metadata"]?.["tags"] || [],
              difficulty: profile["overview"]?.["difficulty"] || "",
              live: !!current["publishedVersionId"],
            };
          }),
      );
    },
    async dismiss(owner, id, revision, index, reason) {
      const current = await store.get(owner, id);
      if (current["ver"] !== revision)
        throw new FacultyError(409, "Draft changed; check again.");
      return dismissAuditIssue(
        doc,
        owner,
        id,
        revision,
        current["profile"] as ObjectValue,
        index,
        reason,
      );
    },
    async get(owner, id) {
      const { Item: head } = await doc.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `PATIENT#${id}`, SK: "HEAD" },
          ConsistentRead: true,
        }),
      );
      if (
        !head ||
        head["ownerFacultyId"] !== owner ||
        head["scopeId"] !== "twinverse-event" ||
        !["DRAFT", "PUBLISHED"].includes(String(head["status"]))
      )
        throw new FacultyError(
          404,
          "Patient draft unavailable for this faculty account.",
        );
      const { Item: studio } = await doc.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `PATIENT#${id}`, SK: "DRAFT#STUDIO" },
          ConsistentRead: true,
        }),
      );
      if (!studio)
        throw new FacultyError(
          422,
          "This patient has not been created in Patient Studio.",
        );
      if (studio["revision"] !== head["draftRevision"])
        throw new FacultyError(
          409,
          "Draft changed while loading. Refresh and retry.",
        );
      return {
        pid: id,
        ver: head["draftRevision"],
        status:
          head["publishedRevision"] === head["draftRevision"]
            ? "published"
            : "draft",
        publishedVersionId: head["currentPublishedVersionId"] ?? null,
        publishedRevision: head["publishedRevision"] ?? null,
        publicationHead: head,
        profile: studio["profile"],
        issues: null,
        createdAt: head["createdAt"],
      };
    },
    async save(owner, value, id, revision, uploaded) {
      const profile = validateFacultyProfile(value);
      const current = id ? await store.get(owner, id) : undefined;
      if (
        current &&
        (revision !== current["ver"] || !Number.isSafeInteger(revision))
      )
        throw new FacultyError(
          409,
          "Draft has changed. Refresh before saving.",
        );
      const patientId = id ?? `faculty-${randomUUID()}`,
        next = current ? Number(current["ver"]) + 1 : 1;
      validateFileBindings(profile, owner, patientId, uploaded ? {artifacts: [...((current?.["profile"] as ObjectValue)?.["artifacts"] as PatientFile[] ?? []), uploaded], knowledge: (current?.["profile"] as ObjectValue)?.["knowledge"] ?? []} : current?.["profile"] as ObjectValue | undefined);
      const items = draftItems(
        owner,
        profile,
        patientId,
        next,
        String(current?.["createdAt"] ?? new Date().toISOString()),
      );
      if (current?.["publishedVersionId"]) {
        const previous = current["publicationHead"] as ObjectValue;
        Object.assign(items[0] ?? {}, {
          status: "PUBLISHED",
          currentPublishedVersionId: previous["currentPublishedVersionId"],
          publishedRevision: previous["publishedRevision"],
          publishedAt: previous["publishedAt"],
          catalogueIndexPK: previous["catalogueIndexPK"],
          catalogueIndexSK: previous["catalogueIndexSK"],
          publicTitle: previous["publicTitle"],
          publicTeaser: previous["publicTeaser"],
        });
      }
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: items.map((Item, index) => ({
              Put: {
                TableName: TABLE_NAME,
                Item,
                ...(index === 0
                  ? current
                    ? {
                        ConditionExpression:
                          "ownerFacultyId = :owner AND draftRevision = :revision AND (#s = :draft OR #s = :published)",
                        ExpressionAttributeNames: { "#s": "status" },
                        ExpressionAttributeValues: {
                          ":owner": owner,
                          ":revision": revision,
                          ":draft": "DRAFT",
                          ":published": "PUBLISHED",
                        },
                      }
                    : { ConditionExpression: "attribute_not_exists(PK)" }
                  : {}),
              },
            })),
          }),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "TransactionCanceledException"
        )
          throw new FacultyError(
            409,
            "Draft changed or could not be saved. Refresh and retry.",
          );
        throw error;
      }
      return store.get(owner, patientId);
    },
  };
  return store;
}
let cached: Promise<FacultyStore> | undefined;
export function facultyStore() {
  return (cached ??= (async () => {
    const config = {
      region: REGION,
      credentials: fromNodeProviderChain({ profile: "twinverse-event" }),
      maxAttempts: 3,
    };
    const sts = new STSClient(config);
    try {
      if (
        (await sts.send(new GetCallerIdentityCommand({}))).Account !== ACCOUNT
      )
        throw new FacultyError(
          503,
          "Faculty backend AWS account does not match the event account.",
        );
    } finally {
      sts.destroy();
    }
    return createFacultyStore(
      DynamoDBDocumentClient.from(new DynamoDBClient(config)),
    );
  })().catch((error) => {
    cached = undefined;
    throw error;
  }));
}
