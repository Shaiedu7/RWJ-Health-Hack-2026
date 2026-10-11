/** Student-visible API contract. Never import the private server patient loader here. */
export type EncounterMode = "approved" | "development-preview"
export interface PublicPatient {
  patientId: string
  patientVersionId: string | null
  displayName: string
  age: number | null
  gender: string | null
  publicIntro: string
  setting: string | null
  portraitUrl: string | null
  availability: "published" | "development-preview"
}
export interface StudentMessage {
  id: string
  sequence: number
  role: "student" | "patient"
  text: string
  createdAt: string
}
export interface ReleasedRecord {
  recordId: string
  title: string
  kind: "structured" | "artifact"
  releasedAt: string
  fields: { label: string; value: string }[]
  downloadUrl: string | null
}
export interface StudentEncounter {
  encounterId: string
  patientId: string
  patientVersionId: string | null
  revision: number
  mode: EncounterMode
  status: "active" | "finished"
  startedAt: string
  endedAt: string | null
  messages: StudentMessage[]
  disclosures: {
    factId: string
    label: string
    value: string
    evidenceMessageIds: string[]
  }[]
  releasedRecords: ReleasedRecord[]
  feedbackStatus: "not-requested" | "pending" | "ready"
}
export interface MutationContext {
  /** Generate once per user action and reuse unchanged after uncertain network failures. */
  requestId: string
  expectedRevision: number
}
export interface RubricDomain {
  domainId: number
  key: string
  descriptor: string
  score: 1 | 2 | 3 | 4 | "N/A"
  explanation: string
  evidenceMessageIds: string[]
}
export interface StudentFeedback {
  reportId: string
  encounterId: string
  summary: string
  rubricVersionId: string
  domains: RubricDomain[]
  total: number
  maxTotal: 28
  discussionOnly: true
  reviewRequired: boolean
  evidence: {
    strength_demonstrated: string[]
    important_gap_or_missed_opportunity: string[]
    safety_or_accuracy_concern: string[]
  }
  learningObjectives: {
    objectiveId: string
    text: string
    outcome: string
    evidenceMessageIds: string[]
  }[]
  nextSteps: string[]
}
export type FeedbackResult = { status: "pending" } | {
  status: "ready"
  feedback: StudentFeedback
}
