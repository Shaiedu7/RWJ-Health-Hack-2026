# TwinVerse

Student virtual patient encounters with React, a TypeScript backend, Amazon Cognito, DynamoDB, Amazon Bedrock, and ElevenLabs.

- `frontend/`: student login, patient selection, split-screen encounter, portrait, text and microphone conversation, automatic spoken replies, and End session processing screen.
- `backend/`: authentication, private patient loading, owned saved encounters, grounded AI conversation, speech and transcription endpoints, tests, and CDK infrastructure.

The backend runs locally on port 8787; frontend on port 8443. Existing AWS services are in us-west-2. All patient encounters currently use development-preview mode. Session processing is a UI placeholder; assessment is not connected.

## Local development

Install dependencies with `npm ci` in each folder. Run `npm run dev -- --host 127.0.0.1 --port 8443` in frontend. Run `npm run serve:student` in backend after configuring server-side AWS credentials. ElevenLabs requires runtime server configuration (`ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`); never put keys into frontend variables or commit real environment files. Use the AWS `asm-exec` secret runtime workflow described in `docs/`.

Frontend: `npm run check`, `npm run build`, `npm run test:integration`.
Backend: `npm run check`, `npm run lint`, `npm test`.

The legacy CSV import tests require the challenge ZIP supplied separately. Its default path is defined in `backend/scripts/wyatt-draft.ts`; update that path for your machine. no challenge archive, deployed patient records, or student conversations are included in this repository. The Hugging Face importer similarly requires its separately downloaded source data. See backend documentation for importer parameters.

No AWS resources are created by starting the local apps. Review infrastructure and permissions before deploying CDK stacks.

## Teammate AWS credentials

See [AWS setup without the CLI](aws/README.md). Placeholder files are in `aws/credentials.example` and `aws/config.example`; their filled-in copies belong in your personal `.aws` folder, outside this repository.
