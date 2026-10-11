# Read-only Wyatt database preview

The active React entry now loads Wyatt through a local backend, not the demo case store. The original mock components remain on disk but are not imported by the active entry. No database writes, approval, publication, AI conversation, voice, feedback, or new AWS resources were added.

## Run

Use Node 24 and the existing event AWS login. In terminal one:

```sh
cd /Users/ayushi/Documents/Codex/2026-10-10/use-aws-agent-toolkit-with-profile/outputs/patients-step1
npm run serve:student
```

In terminal two:

```sh
cd /Users/ayushi/Documents/Codex/2026-10-10/use-aws-agent-toolkit-with-profile/outputs/student-interface
npm run dev
```

Open http://127.0.0.1:8443 and click Load saved patient in development preview. Ports 8787 and 8443 must be free. Both servers bind to loopback. Do not expose this development inspection endpoint publicly; it has no production user authentication.

## Contract and permissions

GET /api/patients/import-d95bcab43d3144ceedd0ae8c?mode=development-preview

The server requires ENABLE_STUDENT_DEVELOPMENT_PREVIEW=true, set explicitly by the run script. Its fixed allowlisted patient is loaded from twinverse-event-patients in us-west-2 using the existing server-only patient loader, which also verifies account 977659666193. The browser receives patientId, mode, approved=false, and name/age/gender/background/personality/supplied notes/summary. It does not receive the private loader envelope, source UUID/provenance, rules, storage URI, or credentials. The draft narrative is labeled unapproved and is not presented as released clinical records.

Existing permission requirements: sts:GetCallerIdentity and dynamodb:GetItem/Query on the existing table. No new IAM permissions or infrastructure were deployed. A future public deployment needs authentication and explicit preview authorization before deployment review.

Missing preview mode returns 403; a different patient path returns 404; data validation errors return 422; unavailable AWS reads return 503. The UI has loading, error, and retry states with no mock fallback. The portrait is an unavailable placeholder; missing values remain missing. Conversation controls are disabled.

Verified live: API returned saved Wyatt data through Vite's proxy and the browser displayed his name, age 18, high-school background, personality, and supplied narrative. Non-preview API access returned 403.
