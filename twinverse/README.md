# TwinVerse - combined student and faculty application

This branch contains the current student encounter and Faculty Studio, sharing the TypeScript backend and existing AWS services. The older faculty project and challenge documents remain on main and the other preserved branches.

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

Wyatt remains an unapproved development preview. Faculty draft saving, JSON/YAML import, AI generation, consistency review and publishing are included. Ending a student session shows a processing screen; assessment/feedback processing is not implemented. JSON/YAML import maps data deterministically; it does not automatically invent missing fields with AI.

## Repository branches

- `main`: existing older faculty project and team documents.
- `twinverse-student-experience`: older student implementation.
- `twinverse-combined`: current integrated application (this branch).
- `frontend`: preserved team frontend archive branch.

## Checks

Backend: `npm run check`, `npm run lint`, `npm test`.
Frontend: `npm run check`, `npm run build`, `npm run test:integration`.
Some legacy CSV import tests require the separately supplied challenge archive; update its machine-specific path when running on another computer.
