import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createStudentApiClient,
  StudentApiError,
} from "../src/integration/studentApiClient.ts"
import {
  parseEncounter,
  parseFeedback,
  parsePatients,
  InvalidApiResponse,
} from "../src/integration/validation.ts"

const snapshot = {
  encounterId: "e1",
  patientId: "p1",
  patientVersionId: "v1",
  revision: 1,
  mode: "approved",
  status: "active",
  startedAt: "2026-10-10T12:00:00Z",
  endedAt: null,
  messages: [
    {
      id: "m1",
      sequence: 1,
      role: "patient",
      text: "Hello.",
      createdAt: "2026-10-10T12:00:00Z",
    },
  ],
  disclosures: [],
  releasedRecords: [],
  feedbackStatus: "not-requested",
}
test("browser DTOs discard backend-private fields and simulated session state", () => {
  const result = parseEncounter({
    ...snapshot,
    session: { rapport: true },
    approvedFacts: ["private"],
    rubric: { private: true },
  })
  assert.equal("session" in result, false)
  assert.equal("approvedFacts" in result, false)
  const list = parsePatients({
    patients: [
      {
        patientId: "p1",
        patientVersionId: null,
        displayName: "Fixture",
        age: null,
        gender: null,
        publicIntro: "",
        setting: null,
        portraitUrl: null,
        availability: "development-preview",
        hiddenDiagnosis: "private",
      },
    ],
    nextCursor: null,
  })
  assert.equal("hiddenDiagnosis" in list.patients[0], false)
})
test("client sends stable action IDs/revisions without browser patient state", async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const transport: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(JSON.stringify(snapshot), { status: 200 })
  }
  const client = createStudentApiClient({ baseUrl: "/api", fetch: transport })
  const context = { requestId: "same-action", expectedRevision: 0 }
  await client.sendMessage("e1", "  Question?  ", context)
  await client.sendMessage("e1", "  Question?  ", context)
  assert.equal(calls[0].url, "/api/encounters/e1/messages")
  assert.equal(calls[0].init.body, calls[1].init.body)
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    requestId: "same-action",
    expectedRevision: 0,
    text: "Question?",
  })
})
test("backend conflicts and failures are propagated with no hidden mock fallback", async () => {
  let calls = 0
  const client = createStudentApiClient({
    baseUrl: "/api",
    fetch: async () => {
      calls++
      return new Response(null, { status: 409 })
    },
  })
  await assert.rejects(
    client.restore("e1"),
    (e: unknown) => e instanceof StudentApiError && e.status === 409,
  )
  assert.equal(calls, 1)
})
test("record opening has its own action separate from a release request", async () => {
  const paths: string[] = []
  const client = createStudentApiClient({
    baseUrl: "/api",
    fetch: async (input) => {
      paths.push(String(input))
      return new Response(JSON.stringify(snapshot))
    },
  })
  await client.requestRecord("e1", "labs", {
    requestId: "release",
    expectedRevision: 0,
  })
  await client.recordOpened("e1", "record1", {
    requestId: "opened",
    expectedRevision: 0,
  })
  assert.deepEqual(paths, [
    "/api/encounters/e1/record-requests",
    "/api/encounters/e1/record-openings",
  ])
})
test("unexpected identities, clinical file URLs and unordered messages are rejected", async () => {
  const client = createStudentApiClient({
    baseUrl: "/api",
    fetch: async () =>
      new Response(JSON.stringify({ ...snapshot, encounterId: "another" })),
  })
  await assert.rejects(
    client.restore("e1"),
    (e: unknown) =>
      e instanceof StudentApiError && e.code === "WRONG_ENCOUNTER",
  )
  assert.throws(
    () =>
      parseEncounter({
        ...snapshot,
        messages: [
          snapshot.messages[0],
          { ...snapshot.messages[0], id: "m2", sequence: 0 },
        ],
      }),
    InvalidApiResponse,
  )
  assert.throws(
    () =>
      parseEncounter({
        ...snapshot,
        releasedRecords: [
          {
            recordId: "r1",
            title: "Fixture",
            kind: "artifact",
            releasedAt: "2026-10-10T12:00:00Z",
            fields: [],
            downloadUrl: "s3://private-bucket/file",
          },
        ],
      }),
    InvalidApiResponse,
  )
})
test("development preview is explicit and cannot masquerade as an approved encounter", async () => {
  let body = ""
  const client = createStudentApiClient({
    baseUrl: "/api",
    fetch: async (_input, init) => {
      body = String(init?.body)
      return new Response(
        JSON.stringify({
          ...snapshot,
          patientVersionId: null,
          mode: "development-preview",
        }),
      )
    },
  })
  await client.start("p1", "start-preview", "development-preview")
  assert.equal(JSON.parse(body).mode, "development-preview")
  await assert.rejects(
    client.start("p1", "start-approved"),
    (e: unknown) =>
      e instanceof StudentApiError && e.code === "WRONG_PATIENT_OR_MODE",
  )
  assert.throws(
    () => parseEncounter({ ...snapshot, patientVersionId: null }),
    InvalidApiResponse,
  )
})
test("rubric preserves N/A, discussion-only totals and score-one review triggers", () => {
  const keys = [
    "opening_and_purpose",
    "rapport_respect_empathy",
    "information_gathering",
    "listening_and_response_to_cues",
    "explanation_and_shared_decisions",
    "clinical_reasoning_and_synthesis",
    "professionalism_safety_closure",
  ]
  const domains = keys.map((key, i) => ({
    domainId: i + 1,
    key,
    descriptor: "Fixture descriptor",
    score: i === 0 ? "N/A" : i === 5 ? 1 : 3,
    explanation: "Fixture evidence",
    evidenceMessageIds: [],
  }))
  const feedback = {
    reportId: "f1",
    encounterId: "e1",
    summary: "Fixture",
    rubricVersionId: "rubric1",
    domains,
    total: 16,
    maxTotal: 28,
    discussionOnly: true,
    reviewRequired: true,
    evidence: {
      strength_demonstrated: [],
      important_gap_or_missed_opportunity: [],
      safety_or_accuracy_concern: [],
    },
    learningObjectives: [],
    nextSteps: [],
  }
  assert.equal(parseFeedback({ status: "ready", feedback }).status, "ready")
  assert.throws(
    () =>
      parseFeedback({
        status: "ready",
        feedback: { ...feedback, reviewRequired: false },
      }),
    InvalidApiResponse,
  )
  assert.throws(
    () =>
      parseFeedback({
        status: "ready",
        feedback: { ...feedback, discussionOnly: false },
      }),
    InvalidApiResponse,
  )
})
