# Encounter feedback: connecting the backend to the UI

The feedback UI is built and runs on sample data. This note says what the backend needs to return for the UI to show real feedback. Nothing here is agreed yet: the routes and payloads are a proposal, so change whatever does not fit and tell whoever owns the frontend.

## What exists

| Screen | Where | Who sees it |
|---|---|---|
| Feedback report | Opens when a student presses **End session**, or **View feedback** on a saved encounter | Student |
| Encounter list | `/feedback/faculty` (linked from Patient Studio as "Student feedback") | Faculty |
| Same report with comment boxes | `/feedback/faculty?encounter=<id>` | Faculty |

The report shows, top to bottom: total score and summary, the instructor's general critique, rubric sections with item scores, learning objectives, findings elicited and missed, strengths, areas for improvement, suggestions, and the transcript with annotations.

Faculty can write a general critique, and comment on any rubric item or any student message. Students see all of these in their report.

All code is in `src/feedback/`:

- `feedbackApi.ts` is the only file that talks to the backend. Routes live here.
- `normalize.ts` checks a backend response and fills in everything optional.
- `types.ts` is the shape the UI renders (the output of `normalize.ts`).
- `sample.ts` is the sample transcript and report used until the backend is connected.

## Backend status

The two student routes are implemented in `backend/lib/encounter-feedback.ts`. Opening an encounter starts building the gold-standard guide (`backend/lib/encounter-guide.ts`, cached per published patient version). The feedback `POST` then grades the transcript against `backend/lib/encounter-rubric.json`. Both prompts are in `backend/lib/feedback-prompts.ts`. The faculty routes, including `GET /api/faculty/students` and `GET /api/faculty/students/:studentId` for the Students tab, are in `backend/lib/faculty-feedback.ts`. Faculty comments are stored apart from the AI report and shown to the student in their own section.

## Turning it on

The UI calls these routes by default, and the faculty page requires a faculty sign-in. To work offline with sample data instead, create `twinverse/frontend/.env.local` containing `VITE_FEEDBACK_SOURCE=sample` and restart the dev server.

## Routes the UI calls

Student routes are called with `?mode=development-preview`, like the existing encounter routes.

| Method and route | Request body | Response |
|---|---|---|
| `POST /api/encounters/:id/feedback` | `{}` | `{ "status": "pending" }` or `{ "status": "ready", "feedback": {...} }` |
| `GET /api/encounters/:id/feedback` | | same |
| `GET /api/faculty/feedback` | | `{ "reviews": [...] }` |
| `GET /api/faculty/feedback/:id` | | `{ "entry": {...}, "messages": [...], "feedback": {...} }` |
| `POST /api/faculty/feedback/:id/comments` | `{ "text", "target" }` | `{ "comments": [...] }` |
| `POST /api/faculty/feedback/:id/comments/:commentId/remove` | `{}` | `{ "comments": [...] }` |

- **Generation can be slow.** The UI sends the `POST` once, then polls the `GET` every 3 seconds for up to 2 minutes while the status is `pending`. If generation is fast enough to finish inside the request, return `ready` from the `POST` and the UI never polls.
- **`POST` should be safe to repeat.** The UI calls it every time a student opens the report. Return the stored report if one exists for the encounter's current transcript; do not regenerate.
- **Errors.** Any non-2xx with a JSON body of `{ "message": "..." }` or `{ "detail": "..." }` is shown to the user with a retry button.
- **Comment removal is a `POST`** because the faculty router currently rejects every method except `GET`, `POST` and `PUT`.

## The feedback payload

Only `sections` is required. This is the smallest payload the UI accepts:

```json
{
  "sections": [
    {
      "name": "History Assessment",
      "items": [
        { "itemId": "1.1", "name": "General HPI", "score": 2,
          "rationale": "Covered character, radiation and severity; did not ask about duration.",
          "evidenceTurns": [3, 5, 7] }
      ]
    }
  ]
}
```

Everything else is optional and the matching part of the report shows an empty state without it:

```json
{
  "summary": "Two or three sentences on the encounter as a whole.",
  "rubricName": "Virtual Patient Encounter Rubric",
  "generatedAt": "2026-10-11T14:00:00Z",
  "reviewFlags": ["Clinical Reasoning & Synthesis scored 1. Faculty review is recommended."],
  "sections": [
    { "sectionId": "1", "name": "History Assessment", "items": [
      { "itemId": "1.1", "name": "General HPI", "score": 2,
        "prompt": "The rubric's question for this item.",
        "descriptor": "Asks 4–6 of the 10 items.",
        "rationale": "Why this score, in terms of this encounter.",
        "evidenceTurns": [3, 5, 7] }
    ] }
  ],
  "learningObjectives": [
    { "objectiveId": "lo-1", "text": "Identify cardiovascular risk factors.", "outcome": "met",
      "explanation": "Hypertension, smoking and family history were elicited.", "evidenceTurns": [13, 19] }
  ],
  "findings": {
    "elicited": [{ "label": "Chest pressure radiating to the left arm", "importance": "critical", "evidenceTurns": [5] }],
    "missed":   [{ "label": "How much he smokes", "importance": "critical", "explanation": "He said \"a bit\" and it was not pursued." }]
  },
  "strengths":    [{ "text": "Clear introduction with name and role.", "evidenceTurns": [1] }],
  "improvements": [{ "text": "Smoking was asked bluntly.", "suggestion": "Frame it first, then ask for amounts.", "evidenceTurns": [19] }],
  "suggestions":  ["Finish the HPI before moving to past history."],
  "annotations":  [{ "turn": 19, "sentiment": "improvement", "comment": "No framing for a sensitive question." }],
  "facultyComments": []
}
```

Rules the UI applies:

- **Scores are 1, 2 or 3.** Anything else rejects the whole report with an error. If the rubric needs "not applicable", tell the frontend owner; it is not supported yet.
- **Do not send totals.** The total and maximum are computed from the item scores (maximum = number of items × 3).
- **Rubric names come from the payload.** The UI has no copy of the rubric, so section and item names can change without a frontend change.
- **`outcome`** is `"met"`, `"partial"` or `"notMet"`. A boolean `"met": true` is also accepted.
- **`importance`** is `"critical"`, `"important"` or `"minor"`; anything else is treated as `"important"`.
- **`sentiment`** is `"strength"` or `"improvement"`.
- **`reviewFlags`** is free text shown in a red banner at the top. The backend decides when to raise one (the rubric says a 1 in item 4.3 or 4.6).
- **Scale labels** default to Exceeds / Meets / Below expectations. Override with `"scale": { "3": "...", "2": "...", "1": "..." }`.

### Citing the transcript

Every place that takes evidence accepts either or both of:

- `evidenceTurns`: message sequence numbers, the `sequence` field the encounter already stores (1-based, counting student and patient messages together).
- `evidenceMessageIds`: the stored message `id` values.

Turn numbers are the easier choice for a model: number the transcript lines in the prompt and ask for those numbers back. Citations that match no message are dropped silently, so a hallucinated turn number cannot break the page. Cite the **student's** message; the UI automatically shows the patient's reply after it.

## Faculty payloads

`reviews` entries and `entry`:

```json
{ "encounterId": "…", "studentName": "…", "patientName": "…", "completedAt": "2026-10-11T14:00:00Z",
  "messageCount": 28, "totalScore": 36, "maxScore": 48, "needsReview": false, "commentCount": 2 }
```

`messages` is the encounter transcript in the same shape the student encounter route returns: `{ id, role: "user" | "assistant", text, sequence, createdAt }`.

A comment:

```json
{ "id": "…", "author": "Dr. Rivera", "createdAt": "2026-10-11T15:00:00Z", "text": "…",
  "target": { "kind": "overall" } }
```

`target` is one of `{ "kind": "overall" }` (the general critique), `{ "kind": "item", "itemId": "1.1" }` or `{ "kind": "message", "messageId": "…" }`. The add-comment request sends `text` and `target` in exactly this form; the backend supplies `id`, `author` and `createdAt`. Both comment routes return the encounter's complete comment list after the change.

For students to see comments, include the same list as `facultyComments` in the feedback payload on the student route.

## Things in the current backend that affect this

- **Learning objectives are dropped before the encounter.** Faculty enter them under `learning.objectives` in the patient profile, but `lib/published-context.ts` sets `reviewOnly.teachingObjectives` to `null`, so the encounter record has none to score against. They need loading from the published profile, along with `key_questions_to_ask`, `expected_discoveries` and `common_pitfalls`, which are useful rubric material.
- **Encounters are stored per student** (`PK = STUDENT#twinverse-event#<sub>`), so the faculty list needs a query across students, and there is no student name on the record, only the Cognito `sub`.
- **There is no "finished" state.** End session is a frontend-only action; the first feedback `POST` is the only signal that an encounter ended.
- **Each patient reply stores `evidenceIds`**, the profile facts it drew on. That gives "findings elicited" without asking the model; "missed" is the rest of the profile's facts.
- **The student server caps request bodies at 8,000 bytes** and rejects `POST`s without an `Origin` header. The UI's requests fit both.
- **Faculty routes need `ENABLE_FACULTY_DEVELOPMENT=true`** as well as `ENABLE_STUDENT_DEVELOPMENT_PREVIEW=true`, and the caller must be in the Cognito `Faculty` group.

## Checking a payload without the UI

`tests/feedbackSample.test.ts` runs `normalizeReport` against sample payloads. Paste a real response into a test there and run `npm run test:integration` in `twinverse/frontend` to see whether the UI will accept it and what it turns into.

## Not done on the frontend

- The live routes have never been called against a real server.
- The saved-encounters list does not show scores.
- A posted critique or comment can be removed but not edited.
