import type {
  FeedbackResult,
  PublicPatient,
  RubricDomain,
  StudentEncounter,
} from "./contracts.ts"

export class InvalidApiResponse extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidApiResponse"
  }
}
function fail(path: string): never {
  throw new InvalidApiResponse(`Invalid student API response: ${path}`)
}
function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path)
  return value as Record<string, unknown>
}
function str(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path)
  return value
}
function id(value: unknown, path: string): string {
  const v = str(value, path)
  if (!v.trim()) fail(path)
  return v
}
function nullable(value: unknown, path: string): string | null {
  return value === null ? null : str(value, path)
}
function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail(path)
  return value
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path)
  return value
}
function strings(value: unknown, path: string): string[] {
  return array(value, path).map((v) => str(v, path))
}
function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): T {
  if (!values.includes(value as T)) fail(path)
  return value as T
}
function date(value: unknown, path: string): string {
  const v = str(value, path)
  if (!Number.isFinite(Date.parse(v))) fail(path)
  return v
}
function url(value: unknown, path: string): string | null {
  const v = nullable(value, path)
  if (v === null) return null
  if (v.startsWith("/") && !v.startsWith("//")) return v
  try {
    if (new URL(v).protocol === "https:") return v
  } catch {
    /* invalid */
  }
  return fail(path)
}
export function parsePatients(
  value: unknown,
): { patients: PublicPatient[]; nextCursor: string | null } {
  const body = obj(value, "patients response")
  const patients = array(body.patients, "patients").map((v) => {
    const p = obj(v, "patient")
    // Construct allowlisted objects; hidden facts, rubric and private storage paths are discarded.
    return {
      patientId: id(p.patientId, "patientId"),
      patientVersionId: nullable(p.patientVersionId, "patientVersionId"),
      displayName: id(p.displayName, "displayName"),
      age: p.age === null ? null : integer(p.age, "age"),
      gender: nullable(p.gender, "gender"),
      publicIntro: str(p.publicIntro, "publicIntro"),
      setting: nullable(p.setting, "setting"),
      portraitUrl: url(p.portraitUrl, "portraitUrl"),
      availability: oneOf(
        p.availability,
        ["published", "development-preview"] as const,
        "availability",
      ),
    }
  })
  return { patients, nextCursor: nullable(body.nextCursor, "nextCursor") }
}
export function parseEncounter(value: unknown): StudentEncounter {
  const e = obj(value, "encounter")
  const messages = array(e.messages, "messages").map((v) => {
    const m = obj(v, "message")
    return {
      id: id(m.id, "message.id"),
      sequence: integer(m.sequence, "message.sequence"),
      role: oneOf(m.role, ["student", "patient"] as const, "message.role"),
      text: str(m.text, "message.text"),
      createdAt: date(m.createdAt, "message.createdAt"),
    }
  })
  if (
    new Set(messages.map((m) => m.id)).size !== messages.length ||
    messages.some((m, i) => i > 0 && m.sequence <= messages[i - 1].sequence)
  )
    fail("messages must have unique IDs and increasing server sequences")
  const disclosures = array(e.disclosures, "disclosures").map((v) => {
    const d = obj(v, "disclosure")
    const evidenceMessageIds = strings(
      d.evidenceMessageIds,
      "evidenceMessageIds",
    )
    if (evidenceMessageIds.some((id) => !messages.some((m) => m.id === id)))
      fail("disclosure references an absent message")
    return {
      factId: id(d.factId, "factId"),
      label: str(d.label, "label"),
      value: str(d.value, "value"),
      evidenceMessageIds,
    }
  })
  const releasedRecords = array(e.releasedRecords, "releasedRecords").map(
    (v) => {
      const r = obj(v, "record")
      return {
        recordId: id(r.recordId, "recordId"),
        title: str(r.title, "title"),
        kind: oneOf(r.kind, ["structured", "artifact"] as const, "kind"),
        releasedAt: date(r.releasedAt, "releasedAt"),
        fields: array(r.fields, "record.fields").map((v) => {
          const f = obj(v, "field")
          return { label: str(f.label, "label"), value: str(f.value, "value") }
        }),
        downloadUrl: url(r.downloadUrl, "downloadUrl"),
      }
    },
  )
  if (
    new Set(releasedRecords.map((r) => r.recordId)).size !==
    releasedRecords.length
  )
    fail("duplicate released record")
  const mode = oneOf(
    e.mode,
    ["approved", "development-preview"] as const,
    "mode",
  )
  const patientVersionId = nullable(e.patientVersionId, "patientVersionId")
  if (mode === "approved" && !patientVersionId)
    fail("approved encounter requires an immutable patient version")
  return {
    encounterId: id(e.encounterId, "encounterId"),
    patientId: id(e.patientId, "patientId"),
    patientVersionId,
    revision: integer(e.revision, "revision"),
    mode,
    status: oneOf(e.status, ["active", "finished"] as const, "status"),
    startedAt: date(e.startedAt, "startedAt"),
    endedAt: e.endedAt === null ? null : date(e.endedAt, "endedAt"),
    messages,
    disclosures,
    releasedRecords,
    feedbackStatus: oneOf(
      e.feedbackStatus,
      ["not-requested", "pending", "ready"] as const,
      "feedbackStatus",
    ),
  }
}
const keys = [
  "opening_and_purpose",
  "rapport_respect_empathy",
  "information_gathering",
  "listening_and_response_to_cues",
  "explanation_and_shared_decisions",
  "clinical_reasoning_and_synthesis",
  "professionalism_safety_closure",
]
export function parseFeedback(value: unknown): FeedbackResult {
  const response = obj(value, "feedback response")
  if (response.status === "pending") return { status: "pending" }
  if (response.status !== "ready") fail("feedback status")
  const f = obj(response.feedback, "feedback")
  const domains = array(f.domains, "domains").map<RubricDomain>((v) => {
    const d = obj(v, "domain")
    const domainId = integer(d.domainId, "domainId")
    const score = d.score
    if (
      score !== "N/A" &&
      score !== 1 &&
      score !== 2 &&
      score !== 3 &&
      score !== 4
    )
      fail("score must be 1–4 or N/A")
    if (domainId < 1 || domainId > 7 || d.key !== keys[domainId - 1])
      fail("rubric domain ID/key")
    return {
      domainId,
      key: str(d.key, "key"),
      descriptor: str(d.descriptor, "descriptor"),
      score,
      explanation: str(d.explanation, "explanation"),
      evidenceMessageIds: strings(d.evidenceMessageIds, "evidenceMessageIds"),
    }
  })
  if (
    domains.length !== 7 ||
    new Set(domains.map((d) => d.domainId)).size !== 7
  )
    fail("expected seven distinct rubric domains")
  if (
    f.discussionOnly !== true ||
    f.maxTotal !== 28 ||
    typeof f.reviewRequired !== "boolean"
  )
    fail("rubric interpretation")
  const total = integer(f.total, "total")
  if (
    total !== domains.reduce((n, d) => n + (d.score === "N/A" ? 0 : d.score), 0)
  )
    fail("total disagrees with scored domains")
  if (
    domains.some(
      (d) => (d.domainId === 6 || d.domainId === 7) && d.score === 1,
    ) &&
    !f.reviewRequired
  )
    fail("safety/reasoning score 1 requires review")
  const evidence = obj(f.evidence, "evidence")
  return {
    status: "ready",
    feedback: {
      reportId: id(f.reportId, "reportId"),
      encounterId: id(f.encounterId, "encounterId"),
      summary: str(f.summary, "summary"),
      rubricVersionId: id(f.rubricVersionId, "rubricVersionId"),
      domains,
      total,
      maxTotal: 28,
      discussionOnly: true,
      reviewRequired: f.reviewRequired,
      evidence: {
        strength_demonstrated: strings(
          evidence.strength_demonstrated,
          "strength_demonstrated",
        ),
        important_gap_or_missed_opportunity: strings(
          evidence.important_gap_or_missed_opportunity,
          "important_gap_or_missed_opportunity",
        ),
        safety_or_accuracy_concern: strings(
          evidence.safety_or_accuracy_concern,
          "safety_or_accuracy_concern",
        ),
      },
      learningObjectives: array(f.learningObjectives, "learningObjectives").map(
        (v) => {
          const o = obj(v, "objective")
          return {
            objectiveId: id(o.objectiveId, "objectiveId"),
            text: str(o.text, "text"),
            outcome: str(o.outcome, "outcome"),
            evidenceMessageIds: strings(
              o.evidenceMessageIds,
              "evidenceMessageIds",
            ),
          }
        },
      ),
      nextSteps: strings(f.nextSteps, "nextSteps"),
    },
  }
}
