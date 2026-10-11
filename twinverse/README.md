# TwinVerse - combined student and faculty application

`main` contains the current student encounter, Faculty Studio and AI rubric feedback, sharing the TypeScript backend and existing AWS services. Earlier work is preserved on the branches listed below.

## Run locally

Use Node.js 24 or later. Follow [AWS credentials setup](aws/README.md) first. No AWS resources are created by starting the app.

In `twinverse/backend`, run `npm ci`, then:

```sh
ENABLE_FACULTY_DEVELOPMENT=true npm run serve:student
```

In a separate terminal, in `twinverse/frontend`, run `npm ci`, then:

```sh
npm run dev -- --host 127.0.0.1 --port 8443
```

Open http://127.0.0.1:8443/ for students or http://127.0.0.1:8443/faculty.html for faculty. Faculty access requires the existing Cognito Faculty group. A shared AWS account does not automatically grant a Cognito user faculty access.

Text conversations and faculty generation/checking use the existing Bedrock model. Spoken replies and microphone transcription require server-side ElevenLabs configuration. See the backend documentation and `.env.server.example`; the dynamic secret reference must be resolved by `asm-exec`, not passed literally to ElevenLabs. Do not put real secrets in example files or frontend configuration.

Wyatt remains an unapproved development preview. Faculty draft saving, JSON/YAML import, AI generation, consistency review and publishing are included. Ending a student session locks the encounter and opens the rubric feedback report; faculty review reports and add comments at http://127.0.0.1:8443/feedback/faculty. Feedback is scored by the backend (`backend/lib/encounter-feedback.ts`, rubric in `encounter-rubric.json`). Set `VITE_FEEDBACK_SOURCE=sample` in `frontend/.env.local` to show offline sample reports instead. JSON/YAML import maps data deterministically; it does not automatically invent missing fields with AI.

AWS credentials are read only from the `twinverse-event` profile in `~/.aws/credentials`. Exported `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN` variables are ignored. When the temporary credentials expire, replace all three values in that file and restart the backend.

## Repository branches

- `main`: current integrated application (this branch), including AI rubric feedback.
- `merge-ai-evaluation`: the merge of `final` and `ai-evaluation` that `main` was set to.
- `final`: integrated application before the rubric feedback merge.
- `ai-evaluation`: rubric feedback work, now merged into `main`.
- `main-backup-before-override`: the previous `main`, including the hand-written demo encounters.
- `encounter-feedback`, `twinverse-combined`, `twinverse-student-experience`, `frontend`: earlier preserved branches.

## Checks

Backend: `npm run check`, `npm run lint`, `npm test`.
Frontend: `npm run check`, `npm run build`, `npm run test:integration`.
Some legacy CSV import tests require the separately supplied challenge archive; update its machine-specific path when running on another computer.
