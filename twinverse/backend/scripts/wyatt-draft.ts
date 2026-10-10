import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

export const SOURCE_UUID = "4d619156-3250-4212-8399-129f3280fab1";
export const SOURCE_NAMESPACE = "faculty-provided-sample-patient-details";
export const SCOPE_ID = "twinverse-event";
export const DEFAULT_PACKAGE =
  "/Users/ayushi/Downloads/Challenge 1_ The Virtual Patient Encounter System.zip";
export type Item = Record<string, unknown> & { PK: string; SK: string };
interface ParsedRecord {
  readonly record: Record<string, string>;
  readonly raw: string;
}
export interface WyattSource {
  readonly originalRow: Record<string, string>;
  readonly originalCsvRecord: string;
  readonly csvRowNumber: number;
  readonly packageSha256: string;
  readonly csvSha256: string;
  readonly csvMemberPath: string;
  readonly rowSha256: string;
  readonly portraitMemberPath: string;
  readonly portraitSha256: string;
  readonly portraitDuplicateMemberPath: string;
}
const sha256 = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");
const displayValue = (value: string): string =>
  value.trim().replace(/^"(.*)"$/s, "$1");

export function readWyattSource(packagePath = DEFAULT_PACKAGE): WyattSource {
  const packageBytes = readFileSync(packagePath);
  const zip = new AdmZip(packageBytes);
  const csvEntries = zip
    .getEntries()
    .filter((e) =>
      e.entryName.endsWith("/faculty-provided-sample-patient-details.csv"),
    );
  if (csvEntries.length !== 1)
    throw new Error("Expected exactly one supplied patient CSV.");
  const csvEntry = csvEntries[0];
  if (!csvEntry) throw new Error("CSV missing.");
  const csvBytes = csvEntry.getData();
  const records = parse(csvBytes, {
    columns: true,
    bom: true,
    raw: true,
    skip_empty_lines: true,
  }) as ParsedRecord[];
  const matches = records
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value.record["patient-uuid"] === SOURCE_UUID);
  if (matches.length !== 1)
    throw new Error("Wyatt source UUID must occur exactly once.");
  const match = matches[0];
  if (!match || match.value.record["patient-name"] !== "Wyatt Nelson")
    throw new Error("Source identity mismatch.");
  const prefix = csvEntry.entryName.slice(
    0,
    csvEntry.entryName.lastIndexOf("/") + 1,
  );
  const portraitPath = `${prefix}sample patient profiles for student interaction/patient images/Wyatt Nelson, Patient.png`;
  const portrait = zip.getEntry(portraitPath);
  const nestedEntry = zip.getEntry(
    `${prefix}sample patient profiles for student interaction/patient images/patient-images.zip`,
  );
  if (!portrait || !nestedEntry)
    throw new Error("Expected supplied portrait members.");
  const duplicate = new AdmZip(nestedEntry.getData()).getEntry(
    "patient-images/Wyatt Nelson, Patient.png",
  );
  if (!duplicate || sha256(duplicate.getData()) !== sha256(portrait.getData()))
    throw new Error("Portrait duplicate mismatch requires review.");
  return {
    originalRow: match.value.record,
    originalCsvRecord: match.value.raw,
    csvRowNumber: match.index + 2,
    packageSha256: sha256(packageBytes),
    csvSha256: sha256(csvBytes),
    csvMemberPath: csvEntry.entryName,
    rowSha256: sha256(match.value.raw),
    portraitMemberPath: portraitPath,
    portraitSha256: sha256(portrait.getData()),
    portraitDuplicateMemberPath: `${nestedEntry.entryName}!patient-images/Wyatt Nelson, Patient.png`,
  };
}

export function patientIdForSource(): string {
  return `import-${sha256(`${SCOPE_ID}:${SOURCE_NAMESPACE}:${SOURCE_UUID}`).slice(0, 24)}`;
}
export function mappingKey(): { PK: string; SK: string } {
  return {
    PK: `SOURCEPATIENT#${SCOPE_ID}#${SOURCE_NAMESPACE}#${SOURCE_UUID}`,
    SK: "MAPPING",
  };
}
export function buildDraft(
  source: WyattSource,
  importedAt: string,
  actorArn: string,
  ownerPrincipalArn: string,
): Item[] {
  const patientId = patientIdForSource();
  const PK = `PATIENT#${patientId}`;
  const sourceEditionId = `csv-${source.csvSha256}`;
  const requestId = `import-${sha256(`${SCOPE_ID}:${SOURCE_NAMESPACE}:${SOURCE_UUID}:${source.rowSha256}`)}`;
  const snapshotSK = `IMPORT#${sourceEditionId}#${source.rowSha256}`;
  const provenance = {
    sourceNamespace: SOURCE_NAMESPACE,
    sourcePatientUuid: SOURCE_UUID,
    sourceEditionId,
    packageFilename: "Challenge 1_ The Virtual Patient Encounter System.zip",
    packageSha256: source.packageSha256,
    csvSha256: source.csvSha256,
    csvMemberPath: source.csvMemberPath,
    csvRowNumber: source.csvRowNumber,
    csvRowNumberConvention: "1-based CSV record number including header",
    rowSha256: source.rowSha256,
    importedAt,
    importedByArn: actorArn,
    normalizerVersion: "wyatt-draft-v1",
    snapshotSK,
  };
  const ownerId = `IMPORT_PRINCIPAL#${ownerPrincipalArn}`;
  const row = source.originalRow;
  const fields: Record<string, unknown> = {};
  const fieldProvenance: Record<string, unknown> = {};
  const columns = {
    name: "patient-name",
    age: "age",
    background: "background",
    gender: "gender",
    personality: "personality",
    raceEthnicity: "race/ethinicity",
    suppliedNotes: "notes",
    suppliedSummary: "summary",
  };
  for (const [field, column] of Object.entries(columns)) {
    const original = row[column];
    if (original === undefined)
      throw new Error(`Missing source column: ${column}`);
    fields[field] = field === "age" ? Number(original) : displayValue(original);
    fieldProvenance[field] = {
      sourceEditionId,
      snapshotSK,
      column,
      approvalStatus: "UNAPPROVED",
    };
  }
  if (!Number.isInteger(fields["age"]))
    throw new Error("Source age is not an integer.");
  return [
    {
      ...mappingKey(),
      entityType: "SOURCE_PATIENT_MAPPING",
      patientId,
      sourceNamespace: SOURCE_NAMESPACE,
      sourcePatientUuid: SOURCE_UUID,
      scopeId: SCOPE_ID,
    },
    {
      PK,
      SK: "HEAD",
      entityType: "PATIENT",
      schemaVersion: 1,
      patientId,
      scopeId: SCOPE_ID,
      sourcePatientUuid: SOURCE_UUID,
      status: "DRAFT",
      approvalStatus: "UNAPPROVED",
      reviewRequired: true,
      draftRevision: 1,
      ownerFacultyId: ownerId,
      ownerIdentityType: "AWS_IMPORT_PRINCIPAL",
      ownerPrincipalArn,
      facultyOwnerAssignmentRequired: true,
      createdAt: importedAt,
      updatedAt: importedAt,
      displayName: row["patient-name"],
      ownerIndexPK: `SCOPE#${SCOPE_ID}#OWNER#${ownerId}`,
      ownerIndexSK: `${importedAt}#${patientId}`,
      sourceEditionId,
    },
    {
      PK,
      SK: "DRAFT#PROFILE",
      entityType: "PATIENT_DRAFT_PROFILE",
      schemaVersion: 1,
      patientId,
      ...fields,
      approvalStatus: "UNAPPROVED",
      reviewRequired: true,
      fieldProvenance,
      portraitAssetId: "portrait-source",
      sourceProvenance: provenance,
      unknownAnswerBehavior: null,
      clinicalFactsApprovalStatus: "UNREVIEWED",
      missingInformation: [
        "Cholesterol units",
        "Test dates",
        "Approved disclosure rules",
        "Approved unknown-answer behavior",
        "Faculty-defined objectives",
      ],
      reviewNotes: [
        "Supplied notes mix clinical statements and teaching suggestions; faculty must review before any fact/objective extraction.",
      ],
    },
    {
      PK,
      SK: "DRAFT#ASSET#portrait-source",
      entityType: "PATIENT_PORTRAIT",
      sourcePatientUuid: SOURCE_UUID,
      originalFilename: "Wyatt Nelson, Patient.png",
      archiveMemberPath: source.portraitMemberPath,
      duplicateMemberPath: source.portraitDuplicateMemberPath,
      sha256: source.portraitSha256,
      matchBasis: "SUPPLIED_FILENAME",
      matchStatus: "UNVERIFIED",
      approvalStatus: "UNAPPROVED",
      externalSourceUri: row["patient-img"],
      accessStatus: "UNVERIFIED",
      applicationStorageReference: null,
      uploaded: false,
    },
    {
      PK,
      SK: snapshotSK,
      entityType: "IMMUTABLE_IMPORT_SNAPSHOT",
      originalRow: row,
      originalCsvRecord: source.originalCsvRecord,
      provenance,
    },
    {
      PK,
      SK: `REQUEST#${requestId}`,
      entityType: "IMPORT_RECEIPT",
      requestId,
      requestPayloadHash: source.rowSha256,
      status: "COMPLETE",
      patientId,
      sourceEditionId,
      importedAt,
      importedByArn: actorArn,
    },
  ];
}

export function verifyDraft(expected: Item[], actual: Item[]): void {
  if (actual.length !== expected.length)
    throw new Error("Patient item count mismatch.");
  const byKey = new Map(actual.map((item) => [`${item.PK}|${item.SK}`, item]));
  for (const item of expected) {
    if (!isDeepStrictEqual(byKey.get(`${item.PK}|${item.SK}`), item))
      throw new Error(`Round-trip mismatch: ${item.SK}`);
    if (
      "catalogueIndexPK" in item ||
      "currentPublishedVersionId" in item ||
      item.SK.startsWith("VERSION#")
    )
      throw new Error("Import unexpectedly publishes patient.");
    if (item.SK.startsWith("DRAFT#RECORD#"))
      throw new Error("Import unexpectedly creates a clinical report.");
  }
}
