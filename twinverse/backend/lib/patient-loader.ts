/** Server-only profile reader. No database mutations or model invocations. */
import { isDeepStrictEqual } from "node:util";
export type StoredItem = Record<string, unknown>;
export interface PatientStore {
  getHead(patientId: string): Promise<StoredItem | undefined>;
  querySections(patientId: string, prefix: string): Promise<StoredItem[]>;
}
export class PatientLoadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "PatientLoadError";
  }
}
type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export interface ProfileField {
  readonly field: string;
  readonly value: JsonValue;
  readonly provenance: JsonValue | null;
}
export interface Fact {
  readonly factId: string;
  readonly type: string;
  readonly value: JsonValue;
  readonly unit: string | null;
  readonly provenance: JsonValue | null;
}
export interface Rule {
  readonly definition: JsonValue;
  readonly ruleId: string;
  readonly channel: "PATIENT_REPLY" | "CHART_RELEASE";
  readonly trigger: {
    readonly type: string;
    readonly topicId: string | null;
    readonly recordType: string | null;
    readonly factIds: readonly string[];
  };
  readonly targetFactIds: readonly string[];
  readonly targetRecordIds: readonly string[];
}
export interface RecordMetadata {
  readonly recordId: string;
  readonly kind: "STRUCTURED" | "ARTIFACT";
  readonly title: string;
  readonly available: boolean;
  readonly storageReference: JsonValue | null;
}
export interface EncounterProfile {
  readonly serverOnly: true;
  readonly mode: "DEVELOPMENT_PREVIEW" | "PUBLISHED";
  readonly patientId: string;
  readonly sourcePatientUuid: string | null;
  readonly versionId: string | null;
  readonly draftRevision: number | null;
  readonly approvedProfileFields: readonly ProfileField[];
  readonly approvedFacts: readonly Fact[];
  readonly approvedRules: readonly Rule[];
  readonly recordMetadata: readonly RecordMetadata[];
  readonly unapprovedProposals: {
    readonly profileFields: readonly ProfileField[];
    readonly facts: readonly Fact[];
    readonly rules: readonly Rule[];
    readonly records: readonly RecordMetadata[];
  };
  readonly reviewOnlyProposals?: {
    readonly teachingObjectives: JsonValue | null;
    readonly sourceMetadata: JsonValue | null;
    readonly disclosureCategories: JsonValue | null;
    readonly disclosureExecutable: false;
  };
  readonly portraitMetadata: JsonValue | null;
  readonly sourceProvenance: JsonValue | null;
  readonly unknownAnswerBehavior: string | null;
  readonly missingInformation: readonly string[];
  readonly readiness: {
    readonly approvedStudentEncounter: boolean;
    readonly blockers: readonly string[];
  };
}
function invalid(message: string): never {
  throw new PatientLoadError("INVALID_SCHEMA", message);
}
function object(value: unknown, path: string): StoredItem {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(`${path} must be an object.`);
  return value as StoredItem;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    invalid(`${path} must be a nonempty string.`);
  return value;
}
function optionalText(value: unknown, path: string): string | null {
  return value == null ? null : text(value, path);
}
function strings(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid(`${path} must be a string array.`);
  return value.map((v: unknown) => text(v, path));
}
function json(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((v: unknown) => json(v, path));
  const source = object(value, path);
  return Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, json(v, `${path}.${k}`)]),
  );
}
function approved(item: StoredItem): boolean {
  const status = item["approvalStatus"];
  if (
    status !== undefined &&
    !["APPROVED", "UNAPPROVED", "PROPOSED", "REJECTED", "UNREVIEWED"].includes(
      String(status),
    )
  )
    invalid("Unknown approval status.");
  if (
    item["reviewRequired"] !== undefined &&
    typeof item["reviewRequired"] !== "boolean"
  )
    invalid("reviewRequired must be boolean.");
  return status === "APPROVED" && item["reviewRequired"] !== true;
}
function checkHead(
  head: StoredItem | undefined,
  patientId: string,
  scopeId: string,
): StoredItem {
  if (!head)
    throw new PatientLoadError(
      "PATIENT_NOT_FOUND",
      `Patient ${patientId} does not exist.`,
    );
  if (
    head["PK"] !== `PATIENT#${patientId}` ||
    head["SK"] !== "HEAD" ||
    head["patientId"] !== patientId ||
    head["schemaVersion"] !== 1
  )
    invalid("Invalid patient HEAD or unsupported schema version.");
  if (head["scopeId"] !== scopeId)
    throw new PatientLoadError(
      "PATIENT_UNAVAILABLE",
      "Patient is outside the configured event scope.",
    );
  if (!["DRAFT", "PUBLISHED"].includes(String(head["status"])))
    throw new PatientLoadError(
      "PATIENT_UNAVAILABLE",
      "Patient is retired or unavailable.",
    );
  return head;
}
function buildProfile(
  head: StoredItem,
  items: StoredItem[],
  patientId: string,
  prefix: string,
  preview: boolean,
): EncounterProfile {
  const sections = new Map<string, StoredItem>();
  for (const item of items) {
    const key = text(item["SK"], "SK");
    if (item["PK"] !== `PATIENT#${patientId}` || !key.startsWith(prefix))
      invalid("Retrieved section belongs to a different patient or version.");
    const suffix = key.slice(prefix.length);
    if (sections.has(suffix)) invalid(`Duplicate section ${suffix}.`);
    if (item["patientId"] !== undefined && item["patientId"] !== patientId)
      invalid(`Patient ID mismatch in ${suffix}.`);
    sections.set(suffix, item);
  }
  const profile = sections.get("PROFILE");
  if (!profile)
    throw new PatientLoadError(
      "PROFILE_NOT_FOUND",
      "The selected patient draft/version has no PROFILE section.",
    );
  if (profile["schemaVersion"] !== 1)
    invalid("Unsupported PROFILE schema version.");
  const missing = new Set(
    strings(profile["missingInformation"], "missingInformation"),
  );
  const blockers = new Set<string>();
  if (preview)
    blockers.add(
      "Development previews cannot start approved student encounters.",
    );
  if (head["facultyOwnerAssignmentRequired"] === true)
    blockers.add("A faculty owner must be assigned.");
  if (!approved(profile))
    blockers.add("Patient profile still requires faculty approval.");
  if (!preview) {
    const meta = sections.get("META");
    if (!meta || meta["schemaVersion"] !== 1)
      invalid("Published version has no valid META manifest.");
    text(meta["approvedBy"], "META.approvedBy");
    text(meta["publishedAt"], "META.publishedAt");
    text(meta["contentHash"], "META.contentHash");
    const expected = strings(meta["entityIds"], "META.entityIds");
    if (!expected.includes("PROFILE"))
      invalid("Published manifest must list PROFILE in entityIds.");
    if (
      expected.some((key) => !sections.has(key)) ||
      [...sections.keys()].some(
        (key) => key !== "META" && !expected.includes(key),
      )
    )
      invalid("Published manifest and version sections disagree.");
  }
  const approvedProfileFields: ProfileField[] = [],
    proposedFields: ProfileField[] = [];
  const fieldProvenance =
    profile["fieldProvenance"] == null
      ? {}
      : object(profile["fieldProvenance"], "fieldProvenance");
  for (const field of [
    "name",
    "age",
    "background",
    "gender",
    "raceEthnicity",
    "personality",
    "communicationStyle",
    "presentation",
    "unknownAnswerBehavior",
    "suppliedNotes",
    "suppliedSummary",
  ]) {
    const value = profile[field];
    if (value == null || value === "") {
      if (["name", "age", "personality"].includes(field))
        missing.add(`Profile.${field}`);
      continue;
    }
    if (field === "age") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        invalid("Profile.age must be a nonnegative integer.");
    } else text(value, `Profile.${field}`);
    const provenance =
      fieldProvenance[field] == null
        ? null
        : object(fieldProvenance[field], `fieldProvenance.${field}`);
    const entry = {
      field,
      value: json(value, field),
      provenance: provenance ? json(provenance, field) : null,
    };
    // Imported mixed narrative is never promoted to approved clinical facts.
    const isApproved =
      !field.startsWith("supplied") &&
      approved(profile) &&
      (provenance === null || approved(provenance));
    (isApproved ? approvedProfileFields : proposedFields).push(entry);
  }
  const facts: Fact[] = [],
    proposedFacts: Fact[] = [],
    rules: Rule[] = [],
    proposedRules: Rule[] = [],
    records: RecordMetadata[] = [],
    proposedRecords: RecordMetadata[] = [];
  const allFactIds = new Set<string>(),
    allRecordIds = new Set<string>();
  for (const [key, item] of sections) {
    if (key.startsWith("FACT#")) {
      const factId = key.slice(5);
      text(factId, "factId");
      if (item["factId"] !== undefined && item["factId"] !== factId)
        invalid("Fact ID differs from its key.");
      const fact = {
        factId,
        type: text(item["type"], "fact.type"),
        value: json(item["value"], "fact.value"),
        unit: optionalText(item["unit"], "fact.unit"),
        provenance:
          item["provenance"] == null
            ? null
            : json(item["provenance"], "fact.provenance"),
      };
      allFactIds.add(factId);
      (approved(item) ? facts : proposedFacts).push(fact);
    } else if (key.startsWith("RECORD#")) {
      const recordId = key.slice(7);
      text(recordId, "recordId");
      if (item["recordId"] !== undefined && item["recordId"] !== recordId)
        invalid("Record ID differs from its key.");
      const kind = item["kind"];
      if (kind !== "STRUCTURED" && kind !== "ARTIFACT")
        invalid("Record.kind must be STRUCTURED or ARTIFACT.");
      const storage =
        item["storageReference"] == null
          ? null
          : object(item["storageReference"], "record.storageReference");
      const available =
        item["availability"] === "AVAILABLE" &&
        (kind === "STRUCTURED" ||
          (storage !== null &&
            item["accessStatus"] === "VERIFIED" &&
            typeof storage["bucket"] === "string" &&
            typeof storage["key"] === "string" &&
            (typeof storage["versionId"] === "string" ||
              typeof storage["sha256"] === "string")));
      const record: RecordMetadata = {
        recordId,
        kind,
        title: text(item["title"], "record.title"),
        available,
        storageReference: storage
          ? json(storage, "record.storageReference")
          : null,
      };
      if (!available)
        missing.add(
          `Record ${recordId} is unavailable or lacks a verified storage reference.`,
        );
      allRecordIds.add(recordId);
      (approved(item) ? records : proposedRecords).push(record);
    } else if (key.startsWith("RULE#")) {
      const ruleId = key.slice(5);
      text(ruleId, "ruleId");
      if (item["ruleId"] !== undefined && item["ruleId"] !== ruleId)
        invalid("Rule ID differs from its key.");
      const channel = item["channel"];
      if (channel !== "PATIENT_REPLY" && channel !== "CHART_RELEASE")
        invalid("Invalid disclosure channel.");
      const trigger = object(item["trigger"], "rule.trigger");
      const type = text(trigger["type"], "rule.trigger.type");
      if (
        ![
          "ENCOUNTER_START",
          "TOPIC_ASKED",
          "EXPLICIT_RECORD_REQUEST",
          "ALL_REQUIRED_DISCLOSURES",
        ].includes(type)
      )
        invalid("Unsupported rule trigger; faculty review required.");
      const topicId = optionalText(trigger["topicId"], "trigger.topicId"),
        recordType = optionalText(trigger["recordType"], "trigger.recordType"),
        factIds = strings(trigger["factIds"], "trigger.factIds");
      if (
        (type === "TOPIC_ASKED" && !topicId) ||
        (type === "EXPLICIT_RECORD_REQUEST" && !recordType) ||
        (type === "ALL_REQUIRED_DISCLOSURES" && factIds.length === 0)
      )
        invalid("Disclosure trigger is missing its explicit condition.");
      const targetFactIds = strings(
          item["targetFactIds"],
          "rule.targetFactIds",
        ),
        targetRecordIds = strings(
          item["targetRecordIds"],
          "rule.targetRecordIds",
        );
      if (
        channel === "PATIENT_REPLY"
          ? targetFactIds.length === 0 || targetRecordIds.length > 0
          : targetRecordIds.length === 0 || targetFactIds.length > 0
      )
        invalid("Disclosure targets do not match channel.");
      const rule: Rule = {
        definition: json(
          Object.fromEntries(
            Object.entries(item).filter(
              ([key]) => key !== "PK" && key !== "SK",
            ),
          ),
          "rule.definition",
        ),
        ruleId,
        channel,
        trigger: { type, topicId, recordType, factIds },
        targetFactIds,
        targetRecordIds,
      };
      (approved(item) ? rules : proposedRules).push(rule);
    }
  }
  for (const rule of [...rules, ...proposedRules]) {
    if (
      rule.targetFactIds.some((id) => !allFactIds.has(id)) ||
      rule.targetRecordIds.some((id) => !allRecordIds.has(id)) ||
      rule.trigger.factIds.some((id) => !allFactIds.has(id))
    )
      invalid(`Rule ${rule.ruleId} references missing facts or records.`);
  }
  for (const rule of rules) {
    if (
      rule.targetFactIds.some((id) => !facts.some((f) => f.factId === id)) ||
      rule.targetRecordIds.some(
        (id) => !records.some((r) => r.recordId === id && r.available),
      ) ||
      rule.trigger.factIds.some((id) => !facts.some((f) => f.factId === id))
    )
      blockers.add(
        `Approved rule ${rule.ruleId} depends on unapproved or unavailable content.`,
      );
  }
  const unknownField = approvedProfileFields.find(
    (f) => f.field === "unknownAnswerBehavior",
  );
  const unknown = optionalText(unknownField?.value, "unknownAnswerBehavior");
  if (!unknown) missing.add("Approved unknown-answer behavior");
  if (facts.length === 0) missing.add("Approved structured patient facts");
  if (rules.length === 0) missing.add("Approved disclosure rules");
  for (const field of ["name", "age", "personality"])
    if (!approvedProfileFields.some((f) => f.field === field))
      blockers.add(`Profile.${field} is missing or unapproved.`);
  if (proposedFacts.length || proposedRules.length || proposedRecords.length)
    blockers.add(
      "Version contains unapproved fact, rule, or record proposals.",
    );
  missing.forEach((value) => blockers.add(value));
  const portraitId = optionalText(
    profile["portraitAssetId"],
    "portraitAssetId",
  );
  const portrait = portraitId ? sections.get(`ASSET#${portraitId}`) : undefined;
  if (portraitId && !portrait)
    missing.add(`Portrait ${portraitId} metadata is missing.`);
  const result: EncounterProfile = {
    serverOnly: true,
    mode: preview ? "DEVELOPMENT_PREVIEW" : "PUBLISHED",
    patientId,
    sourcePatientUuid: optionalText(
      head["sourcePatientUuid"],
      "sourcePatientUuid",
    ),
    versionId: preview
      ? null
      : text(head["currentPublishedVersionId"], "currentPublishedVersionId"),
    draftRevision: preview ? Number(head["draftRevision"]) : null,
    approvedProfileFields,
    approvedFacts: facts,
    approvedRules: rules,
    recordMetadata: records,
    unapprovedProposals: {
      profileFields: proposedFields,
      facts: proposedFacts,
      rules: proposedRules,
      records: proposedRecords,
    },
    reviewOnlyProposals: {
      teachingObjectives: sections.get("ASSESSMENT")?.["learningOpportunities"] == null ? null : json(sections.get("ASSESSMENT")?.["learningOpportunities"], "teachingObjectives"),
      sourceMetadata: sections.get("SOURCE_METADATA")?.["sourceMetadata"] == null ? null : json(sections.get("SOURCE_METADATA")?.["sourceMetadata"], "sourceMetadata"),
      disclosureCategories: sections.get("DISCLOSURE_PROPOSAL")?.["originalCategories"] == null ? null : json(sections.get("DISCLOSURE_PROPOSAL")?.["originalCategories"], "disclosureCategories"),
      disclosureExecutable: false,
    },
    portraitMetadata: portrait ? json(portrait, "portrait") : null,
    sourceProvenance:
      profile["sourceProvenance"] == null
        ? null
        : json(profile["sourceProvenance"], "sourceProvenance"),
    unknownAnswerBehavior: unknown,
    missingInformation: [...missing],
    readiness: {
      approvedStudentEncounter: !preview && blockers.size === 0,
      blockers: [...blockers],
    },
  };
  if (!preview && !result.readiness.approvedStudentEncounter)
    throw new PatientLoadError(
      "PATIENT_NOT_READY",
      "Published patient is incomplete or contains unapproved encounter content.",
      result.readiness.blockers,
    );
  return result;
}

export function createPatientLoader(
  store: PatientStore,
  scopeId = "twinverse-event",
) {
  return {
    async loadPatientProfile(
      patientId: string,
      options: { readonly developmentPreview?: boolean } = {},
    ): Promise<EncounterProfile> {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(patientId))
        throw new PatientLoadError(
          "INVALID_PATIENT_ID",
          "Use an internal patient ID, without key prefixes or separators.",
        );
      if (
        options.developmentPreview !== undefined &&
        typeof options.developmentPreview !== "boolean"
      )
        throw new PatientLoadError(
          "INVALID_MODE",
          "developmentPreview must be an explicit boolean.",
        );
      const preview = options.developmentPreview === true;
      for (let attempt = 0; attempt < 3; attempt++) {
        const head = checkHead(
          await store.getHead(patientId),
          patientId,
          scopeId,
        );
        if (!preview && head["status"] !== "PUBLISHED")
          throw new PatientLoadError(
            "PATIENT_NOT_PUBLISHED",
            "Patient is an unapproved draft. Use developmentPreview only for server-side inspection.",
          );
        if (
          preview &&
          (!Number.isInteger(head["draftRevision"]) ||
            Number(head["draftRevision"]) < 1)
        )
          invalid("Draft revision is missing or invalid.");
        const prefix = preview
          ? "DRAFT#"
          : `VERSION#${text(head["currentPublishedVersionId"], "currentPublishedVersionId")}#`;
        const items = await store.querySections(patientId, prefix);
        const after = checkHead(
          await store.getHead(patientId),
          patientId,
          scopeId,
        );
        if (!isDeepStrictEqual(head, after)) continue;
        return buildProfile(head, items, patientId, prefix, preview);
      }
      throw new PatientLoadError(
        "CONCURRENT_UPDATE",
        "Patient changed during retrieval. Retry after faculty edits finish.",
      );
    },
  };
}
