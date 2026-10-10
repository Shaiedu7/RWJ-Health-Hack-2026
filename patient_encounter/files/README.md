# Patient Studio

An AI-powered virtual patient system for healthcare education. Faculty build patients from a structured profile, attach clinical artifacts, set when information is released, check the case for consistency, and publish. Students then interview the virtual patient while a chart fills in as they ask the right questions.

**Status:** complete first draft. It has not yet been tested end to end against real AWS services, so expect a debugging pass on first run.

## What it does

**Faculty**
- Create a patient from a free-text description, or import a JSON/CSV dataset (up to 25 patients per file).
- Edit a nine-section profile: overview, demographics, clinical, medications, nutrition, psychosocial, information disclosure, learning, and metadata. Fields show "AI-generated" until edited, then "Faculty-verified".
- Upload artifacts (labs, ECGs, imaging, notes). PNG/JPG uploads get an AI-drafted findings summary to confirm.
- Upload knowledge sources (PDF or text) that ground the patient's answers.
- Set release rules on vitals, exam findings, and artifacts: at start, after a topic is asked, after an exam or test is requested, after N turns, or a custom intent.
- Test release rules before publishing by typing a sample student message.
- Run a consistency check (fixed rules plus an AI audit) and publish. Publishing is blocked while critical issues are open.
- Manage a library with versions, duplicate, and archive. Published versions are never changed; editing creates a new draft.

**Students**
- See only published patients.
- Interview the patient in chat. The patient stays in character and never states the hidden diagnosis.
- Watch the chart fill in as questions release items. Locked content never reaches the browser until it is released.

**Accounts:** sign in as faculty or student. Faculty registration requires an access code.

## Requirements

- Python 3.10 or newer
- An AWS account with Amazon Bedrock model access enabled in your region for:
  - a Claude Sonnet model
  - a Claude Haiku model
  - Titan Text Embeddings V2
- AWS credentials (access key ID, secret access key, and a session token if your keys are temporary)
- Internet access in the browser (the page loads React from a CDN)

## Project layout

```
app.py                 Entry point; registers routes and the login guard
schema.py              The patient profile (single source of truth)
db.py                  SQLite storage and versioning
llm.py                 Bedrock calls, structured output, embeddings, retrieval
checks.py              Consistency rules and AI audit
auth.py                Accounts, sessions, role enforcement
routes_studio.py       Faculty endpoints
routes_encounter.py    Student encounter and release logic
requirements.txt       Python dependencies
index.html             The whole frontend (React, loaded from a CDN)
```

If you use a `backend/` and `frontend/` folder split, keep `index.html` in `frontend/` and no path change is needed. If `index.html` sits next to `app.py` (a flat folder), change the last line of `app.py` to:

```python
def root(): return FileResponse(Path(__file__).parent / "index.html")
```

## Run it

Run everything from the folder that contains `app.py`.

**1. Set environment variables** (PowerShell; they last only for that terminal window):

```powershell
$Env:AWS_ACCESS_KEY_ID="your-key-id"
$Env:AWS_SECRET_ACCESS_KEY="your-secret"
$Env:AWS_SESSION_TOKEN="your-token"     # only for temporary keys
$Env:AWS_REGION="us-west-2"             # the region where Bedrock access is enabled
$Env:FACULTY_CODE="faculty-demo"        # optional; this is the default
```

Mac/Linux: use `export NAME="value"` instead of `$Env:NAME="value"`.

**2. Install dependencies** (once):

```
python -m pip install -r requirements.txt
```

**3. Start the server:**

```
python -m uvicorn app:app --reload
```

**4. Open** http://localhost:8000

Stop the server with Ctrl+C. If you reuse the same terminal window, you only need step 3.

### Optional settings

| Variable | Purpose | Default |
|---|---|---|
| `AWS_REGION` | Bedrock region | `us-east-1` |
| `BEDROCK_MODEL` | Main model ID | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `BEDROCK_FAST_MODEL` | Fast model for trigger matching | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `FACULTY_CODE` | Code required to register as faculty | `faculty-demo` |

If Bedrock reports "model not found" or "access denied", list your available IDs with `aws bedrock list-inference-profiles` and set the two model variables to match.

## First-time walkthrough

1. Click **Create an account**, choose **Faculty member**, enter your faculty code, any email, and a password of 8 or more characters.
2. Open **New patient**, paste a case description, and click **Generate patient profile**.
3. Review the nine sections in the editor and correct anything.
4. In **Artifacts**, upload an image and set a release rule (for example, "After student requests exam/test…" with the value "12-lead ECG").
5. In **Check & publish**, run the consistency check, fix any critical issues, and click **Approve & publish**.
6. Use **Test release triggers** to confirm your rule wording works.
7. Sign out, register a **Student** account, and click **Start encounter**.

## Suggested demo case

> 58-year-old male bus driver with 2 hours of crushing chest pressure radiating to his left arm, sweaty and nauseated. Hypertensive, smokes a pack a day but downplays it. Allergic to penicillin. Anxious, minimizes symptoms. Inferior STEMI is the hidden diagnosis; include amoxicillin on his med list by mistake.

The deliberate amoxicillin entry lets the consistency check visibly catch a penicillin allergy conflict.

## Importing a dataset

On **New patient**, upload a JSON or CSV file with one patient per record. A model maps your columns onto the profile form and is instructed not to invent facts. Imported patients arrive as drafts for review and are never published automatically. Column names do not need to match the schema.

## Customizing the profile

Edit `schema.py`. The editor form, AI generation, dataset import, and audit are all driven by it, so adding or renaming a field there needs no other code change. Delete `studio.db` after changing the schema so old records do not conflict.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `uvicorn` is not recognized | Use `python -m uvicorn app:app --reload` |
| `No module named ...` | Run `python -m pip install -r requirements.txt` |
| Page shows an error at `/` | Fix the `index.html` path line in `app.py` (see Project layout) |
| 403 when registering as faculty | The access code does not match the server's. The code is read once at startup, so set it before starting. Default is `faculty-demo` |
| 422 when registering | Email needs an `@`; password needs at least 8 characters |
| `ExpiredToken` / invalid token | Temporary keys expired. Get new ones, set them again, restart |
| Access denied on a model | Wrong region, or model access is not enabled in the Bedrock console |
| Variables seem ignored | They apply only to the terminal window where you set them |

Server errors print in the terminal running uvicorn. Frontend errors appear in the browser console (F12).

## Security notes

- Never put AWS keys in code or commit them to git. Use environment variables.
- Treat any key you have pasted or screenshotted as exposed and replace it.
- Uploaded files are served at `/files/...` without a login check.
- Any faculty member can edit any patient; there is no per-owner access control.
- There is no password reset, email verification, or SSO.
- This is a demo build. Do not use it with real patient data.

## Known limitations

- Release rules apply to vitals, exam findings, and artifacts only, not history, medications, or nutrition.
- Disclosure behavior (what the patient volunteers or withholds) depends on the model following instructions.
- Transcripts and scores are not saved. The learning profile is stored but not used to give students feedback.
- Uploaded PDFs are not read as artifacts; type key results into the findings text, or upload an image.
- Knowledge sources cannot be removed once added.
- The release log lives in the browser session and is lost when the encounter ends.
- The frontend is a single file compiled in the browser, not a built React project.
