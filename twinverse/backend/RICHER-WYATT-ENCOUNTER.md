# Richer Wyatt student encounter

New encounters explicitly select `import-723e573c6165830038229a56` (Hugging Face). The old CSV ID `import-d95bcab43d3144ceedd0ae8c` is a separate patient. Neither patient's source records, approval state or publication state are changed by this feature.

## Run and test

Backend directory: `/Users/ayushi/Documents/Codex/2026-10-10/use-aws-agent-toolkit-with-profile/outputs/patients-step1`

Run `npm run serve:student` with a valid `twinverse-event` AWS session. The script explicitly enables development preview. The server binds only to `127.0.0.1:8787` and rejects preview access in `NODE_ENV=production`. Do not expose this local event backend as a hosted clinical application.

Frontend directory: `/Users/ayushi/Documents/Codex/2026-10-10/use-aws-agent-toolkit-with-profile/outputs/student-interface`

Run `npm run dev`, then open `http://127.0.0.1:8443/`. Sign in with the invited Cognito account. Click **Start new encounter · richer Wyatt**. Ask about food, drinks, constipation, medications, or cholesterol. Refresh the same encounter URL to restore saved messages. Use **Choose patient / saved encounters** to create another independent richer encounter or view a preserved CSV archive.

Restart the backend after code changes by stopping its terminal process and running the same command again. Login sessions are held server-side and expire after 15 minutes or a backend restart, so sign in again. Saved encounters survive restart. Do not stop other unrelated processes.

## Data and snapshot binding

`preview-context.ts` uses the existing patient loader to read all six unapproved section proposals from DynamoDB: overview, demographics, clinical, medication, nutrition and psychosocial. Their original values are retained in a private encounter snapshot. A canonical source hash and context hash, patient ID and draft revision are bound to each new encounter. Hash verification fails closed on snapshot changes. Subsequent replies use that saved snapshot, rather than loading a different source revision.

Teaching objectives/expected discoveries, source assumptions/optional details, disclosure categories and exploratory nutrition prose remain separate review-only data. Mixed overview narrative is retained privately but not promoted wholesale to patient knowledge. Relevant overview demographics and the clinical/medication/nutrition/psychosocial sections establish the demo's candidate patient information. Hidden disclosure prose about insulin therapy, third-party reports, school absences and optional hobbies is not treated as established patient history or as report files. The disclosure proposal remains non-executable and unapproved.

The original empty allergy array is preserved in raw sections; conversational allergy status is unknown. Original BMI values 32 and 32.1 are preserved with a private conflict flag. Conversation uses the qualified “around 32” value, without reconciling or verifying either exact source value.

## Conversation and grounding

Bedrock model: `us.amazon.nova-2-lite-v1:0`, invoked from `us-west-2`. This geographic US inference profile may route to its supported US destination regions. Invocation access was checked with a real call. No new AWS resources or permissions were created.

The exact-quotation response approach is removed. Bedrock writes Wyatt's brief, natural first-person response and private evidence citations. The server validates structure/citations, blocks internal-profile wording and invalid allergy/BMI statements, and performs an additional Bedrock grounding review. One correction attempt is allowed. Only a validated final response is saved and displayed. Service/model/review failures are explicit errors; they never become medical “unknown” answers or mock replies.

The evidence validator and model-based reviewer reduce unsupported answers but do not constitute clinical approval or a proof against every possible model error. This is still an unapproved demo. Grounding review adds an extra model call and latency. The full saved history supplies conversational context; student claims and previous model replies are never sources of new patient facts.

Gradual disclosure is explicitly application behavior for this demo, not a faculty-approved rule. The browser receives only patient-card fields, saved message text and relevant clinical chart entries discussed in accepted replies. It does not receive full context, raw sections, teaching data, source assumptions, evidence IDs, hashes or credentials. No clinical report files are created or linked.

## Encounter storage and privacy

The existing table is reused. New records use `PK=STUDENT#twinverse-event#<verified Cognito subject>` and `SK=ENCOUNTER#<new encounter UUID>`. The saved context is private server-side data.

Old `ENCOUNTER#WYATT-PREVIEW` records are left untouched and are listed/read as CSV archives. They are explicitly read-only because they have no pinned snapshot. They are never repointed to Hugging Face. Starting a richer encounter creates a new record.

Reads/writes always use the authenticated subject, never a supplied student ID. Ordered messages, stable turn request IDs, optimistic revisions, conditional writes, in-flight leases and restoration remain in place. Completed request replays do not call the model again. Maximum 40 turns per encounter; start a new encounter afterward.

## Verification

Backend: `npm run check`, `npm run lint`, `npm test`.
Frontend: `npm run check`, `npm run build`, `npm run test:integration`.
Live checks: `node --import tsx scripts/verify-preview-conversation.ts`.

Live checks use the actual loaded richer draft, save/retrieve temporary student-owned encounters, check ordered restoration, hashes, duplicate protection and cross-student denial, then remove only their own temporary encounter records. Source patient hashes are compared before/after. The script records natural replies and scenario results in `review/richer-wyatt-live-checks.json`.

ElevenLabs speech and microphone input were not connected previously and are unchanged in this request. No key is fetched or exposed. No faculty, avatar or assessment features were added.

The Converse parameter configuration follows the official Amazon Nova 2 documentation: https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-converse-api.html. Extended reasoning is not enabled; maxTokens is set explicitly and temperature is 0.

Ownership verification used a different service-level student identity against real DynamoDB, plus tests of Cognito verification and the backend route’s use of the verified subject. A second real Cognito student was not signed in through the browser. The signed-in browser flow and saved-chart restoration were verified with the invited student account.
