# PatientRoom: student backend integration handoff

Prepared from `Student Interface for PatientRoom.zip`. The original archive is unchanged. The React screens remain intact and continue to run the original local demo. **No live backend has been joined or deployed.** The new API client is a separately tested integration boundary, ready for the joining step; adding an API URL alone does not switch the application out of demo mode.

## What is already here

The interface has case selection, encounter setup, a conversation/medical-chart room, record viewing, and post-encounter feedback. The avatar and speech are simulated. No new voice work was added.

The current `src/services/encounterService.ts` imports browser-side scripted answers from `src/mock/scripts.ts`. `src/state/useEncounterStore.ts` creates IDs and chart entries locally, maintains simulated disclosure/rapport state, evaluates feedback locally, and restores from localStorage. This makes the UI usable as a demo; it is not a server-backed encounter implementation. Its Margaret/Daniel cases are fictional demo cases, not mappings to Wyatt or the supplied CSV UUIDs.

The archive's AGENTS.md was read as repository guidance. Figma-hosted server/deployment statements were treated as environment-specific context, not a request to deploy. None of the `.figma/make` deployment scripts were executed.

## Added integration files

- `src/integration/contracts.ts`: separate student-visible patient, encounter, released-record, mutation and rubric-feedback types. There is no browser `ServiceSession`, approved-fact definition, hidden diagnosis, rubric answer key, source-import row, AWS credential, or private S3 URI in the encounter response type.
- `src/integration/studentApiClient.ts`: injectable HTTP client for list/start/restore/message/record request/record opening/finish/feedback. Optional application access-token and CSRF-token providers; cookie credentials; timeouts; clear HTTP/network failures; no mock fallback or automatic POST retry.
- `src/integration/validation.ts`: runtime response parsing with allowlisted output fields, ID/mode checks, ordered unique messages, disclosure evidence references, released-record URL validation, and supplied rubric semantics.
- `.env.example`: public API URL only. No AWS configuration belongs in Vite variables.
- `tests/studentApiClient.test.ts`: seven transport/contract tests. They use fake responses; no real API requests, AWS operations, or model invocations.

The client validators narrow what UI code consumes. They **cannot make a private network response safe after it has already reached the browser**. The backend must construct student-only responses before transmission. Real mode must also remove mock-script imports from its browser entry/build.

## Proposed API contract to implement later

These endpoints are a proposal for the joining team, not existing deployed routes. Responses use `contracts.ts` and authoritative server IDs, timestamps, message sequences and encounter revisions.

| Method and route | Request | Response |
|---|---|---|
| GET /patients?cursor=… | Authentication; optional cursor | `{patients: PublicPatient[], nextCursor: string or null}`; default published catalogue only |
| POST /encounters | `{patientId, requestId, mode}` | Complete student encounter snapshot; backend pins the published version, or explicitly authorizes development preview |
| GET /encounters/:id | Authentication | Complete current student snapshot for restore |
| POST /encounters/:id/messages | `{requestId, expectedRevision, text}` | Complete updated snapshot with committed server messages and actual releases |
| POST /encounters/:id/record-requests | `{requestId, expectedRevision, recordKind}` | Snapshot; only actually released records appear. Unavailable files do not become synthetic reports |
| POST /encounters/:id/record-openings | `{requestId, expectedRevision, recordId}` | Snapshot after recording that the student opened an already-released record |
| POST /encounters/:id/finish | `{requestId, expectedRevision}` | Finished snapshot; feedback may still be pending |
| GET /encounters/:id/feedback | Authentication | `{status: "pending"}` or `{status: "ready", feedback: StudentFeedback}` |

Only start defaults to `mode="approved"`. Preview is a deliberate request, and the backend must separately authorize it; a browser flag never approves a patient. Missing/unapproved profiles should produce 422, unavailable patients 404, unauthenticated/unauthorized calls 401/403, concurrent-update conflicts 409. All mutation responses must be complete snapshots: do not return the existing mock service's incremental `session` object.

Record request outcomes that need a user explanation can be added as a separate safe response field after API agreement; the current prepared contract relies on whether the authoritative snapshot includes the release. It does not invent a backend response or an unavailable clinical report.

The feedback contract preserves seven domain IDs/keys, descriptors, ratings 1–4 or N/A, evidence-message IDs, the three supplied evidence fields, faculty-defined objectives, and next steps. Total is a discussion aid with `maxTotal=28` and `discussionOnly=true`; N/A contributes no numeric score. A 1 in domain 6 or 7 requires review. There are no pass/fail thresholds or letter grades. The server must validate supporting evidence against the encounter before sending feedback.

## How to join the UI when the backend arrives

1. Confirm these response types/routes with the backend developer. Keep AWS profile `twinverse-event`, region `us-west-2`, DynamoDB access and Bedrock credentials entirely on the server. The existing private patient loader lives in `../patients-step1/lib/patient-loader.ts`; do not import it into this React project or return its entire envelope to the browser.
2. Create the HTTP client with the confirmed URL and the application's authenticated session. For example:

   ```ts
   import { createStudentApiClient } from "./integration/studentApiClient";
   const api = createStudentApiClient({
     baseUrl: import.meta.env.VITE_API_BASE_URL || "/api",
     // Add the existing application's token/CSRF providers when authentication exists.
   });
   ```

   The backend must enforce ownership/scope on every route. For cookie-authenticated mutations, it must require a CSRF token and the client must supply `getCsrfToken`. For a separate origin, configure CORS for the actual UI origin and its authentication method. An API URL is not a secret; all VITE values are browser-visible.
3. Change `App.tsx`/CaseSelection to asynchronously load `api.listPatients()`. Replace static `getPublicCase()` calls with the selected server public patient. Handle loading, empty catalogue, unknown patient and failed reads explicitly. Do not fall back to the first demo case when a database patient is missing.
4. Adapt `useEncounterStore` to accept full server snapshots. Replace its locally generated encounter/message/chart IDs and `session` with server values. Generate `crypto.randomUUID()` once per user action; persist/reuse that request ID and payload across uncertain retries, and send the current server revision. Serialize encounter mutations, ignore stale responses, and refresh on 409. Disable duplicate submit while an action is pending; use try/catch/finally so errors do not leave the UI stuck. Do not send the browser's asked/disclosed/rapport state or transcript as authority.
5. Restore with GET /encounters/:id after authentication. Store at most a scoped encounter reference and UI preferences locally; do not treat demo localStorage history as server truth. Keep notes visibly local until an authenticated notes endpoint is deliberately added. Do not label local saving as backend persistence.
6. Keep chart release and record opening separate. Existing `markSeen` marks items read as they become visible; it is not a clinical-record opening event. Call `recordOpened` only when the artifact is actually opened. Display only server-released chart information, and use short-lived authorized file URLs only when real files exist.
7. Replace local `assess()` with finish and feedback retrieval. Map the report into feedback cards and add a rubric-domain view while preserving N/A, discussion-only totals and evidence links. Show pending/retry states. Keep demo feedback isolated from real reports.
8. Remove real-mode imports of `src/mock/scripts.ts` and static cases; retain an explicitly separate demo entry if wanted. Default real encounters to text. Voice and animated behavior integration can remain for a later step.

This is a prepared contract/client, not a drop-in replacement for the legacy mock `EncounterService`: that interface gives the browser session state and invents IDs. The React-store adaptation above is intentionally left for the backend joining step.

## Mapping gaps to avoid filling with invented data

The UI's `PublicCase` currently requires a mock MRN, DOB, concern, duration, avatar palette and voice. The database loader does not provide approved versions of those for Wyatt. The prepared public DTO allows missing age/gender/setting/portrait where appropriate and does not require MRN/DOB. Update the view to show missing values or hide those optional fields; do not manufacture them to satisfy the mock type.

Wyatt remains internal patient `import-d95bcab43d3144ceedd0ae8c`, source UUID `4d619156-3250-4212-8399-129f3280fab1`, an unapproved draft. The existing loader accepts him only for explicit server development inspection. It has zero approved facts/rules/clinical records. He must not be added to a published student catalogue or represented as an approved encounter while joining these projects.

## Run and verification

Use Node.js 22.18+ or the verified Node.js 24.2 environment. The prepared copy has a validated `package-lock.json`; use npm for these commands. The original pnpm lock is preserved from the supplied archive but was not used for this validation.

```sh
npm ci --ignore-scripts
npm run check
npm run test:integration
npm run build
npm run dev
```

Verified: TypeScript check passed, all seven integration tests passed, and Vite production build passed. The original Figma config emits non-blocking future-native-config warnings; it was preserved. No server or deployment was started. The current built app is still the original mock demo; the joining changes are documented above.
