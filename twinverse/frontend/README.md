# TwinVerse student interface

Prepared source copy of the supplied PatientRoom interface. The screens still use the original local demo; no real backend is connected yet.

Read [BACKEND-INTEGRATION.md](BACKEND-INTEGRATION.md) for the proposed API endpoints, student-safe data types, tested client, database-loader boundary, and exact steps for joining the backend later.

```sh
npm ci --ignore-scripts
npm run check
npm run test:integration
npm run build
npm run dev
```

The frontend API client is in `src/integration/studentApiClient.ts`; it does not import AWS SDKs, private patient definitions, or mock answers. The backend must own encounter IDs, messages, revisions, releases and feedback. No server resources were created for this preparation.
