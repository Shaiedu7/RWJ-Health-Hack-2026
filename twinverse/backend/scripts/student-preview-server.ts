import { loadPublishedContext } from '../lib/published-context.js';
import { facultyStore } from '../lib/faculty-patients.js';
import { facultyRoute } from "../lib/faculty-routes.js";
import { transcribeQuestion, AUDIO_TYPES } from "../lib/student-transcription.js";
import { savedReplySpeech } from "../lib/student-speech.js";
import { authRoute, authenticatedStudent } from "../lib/student-auth.js";
import { createServer, type IncomingMessage } from "node:http";
import { PatientLoadError } from "../lib/patient-loader.js";
import { generatePreviewReply, PreviewReplyError } from "../lib/preview-conversation.js";
import { loadPreviewContext, RICH_WYATT_ID } from "../lib/preview-context.js";
import { createEncounterStore, EncounterError, openEncounter, publicEncounter, encounterSummary, sendTurn } from "../lib/student-encounters.js";
const enabled = process.env["ENABLE_STUDENT_DEVELOPMENT_PREVIEW"] === "true" && process.env["NODE_ENV"] !== "production";
const store = createEncounterStore();
async function body(req: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of req) { text += String(chunk); if (Buffer.byteLength(text) > 8000) throw new EncounterError(413, "Message too large."); }
  try { return JSON.parse(text) as unknown; } catch { throw new EncounterError(400, "Invalid request body."); }
}
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const send = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  try {
    try { if (await authRoute(req, res, url)) return; } catch { return send(400, { message: "Invalid authentication request." }); }
    if (await facultyRoute(req, res, url)) return;
    const student = await authenticatedStudent(req);
    if (!student) return send(401, { message: "Sign in to access the development preview." });
    if (!enabled || url.searchParams.get("mode") !== "development-preview") return send(403, { message: "Explicit local development preview is required." });
    if (req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1):8443$/.test(req.headers.origin)) return send(403, { message: "Origin not allowed." });
    if (req.method === "POST" && !req.headers.origin) return send(403, { message: "A same-origin browser request is required." });
    if(req.method==='GET' && url.pathname==='/api/patients') {const rows=await(await facultyStore()).catalogue();const published=await Promise.all(rows.map(async row=>(await loadPublishedContext(String(row['patientId']))).card));const wyatt=await loadPreviewContext(RICH_WYATT_ID);return send(200,{patients:[...published,wyatt.card]});}
    if (url.pathname === "/api/encounters" && req.method === "GET") return send(200, { encounters: (await store.list(student.sub)).map(encounterSummary) });
    if (url.pathname === "/api/encounters" && req.method === "POST") {
      const input = await body(req) as { patientId?: unknown };
      if (!input || typeof input.patientId !== "string" || !(input.patientId===RICH_WYATT_ID || /^faculty-[0-9a-f-]{36}$/i.test(input.patientId))) throw new EncounterError(400, "Select an available patient.");
      const context = input.patientId===RICH_WYATT_ID ? await loadPreviewContext(input.patientId) : await loadPublishedContext(input.patientId);
      return send(200, { encounter: publicEncounter(await openEncounter(store, student.sub, context)) });
    }
    const transcriptionMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]{36})\/transcription$/i);
    if (transcriptionMatch && req.method === "POST") {
      const mime = (req.headers["content-type"] ?? "").split(";")[0] ?? "";
      if (!AUDIO_TYPES.has(mime)) throw new EncounterError(415, "Unsupported microphone recording format.");
      const owned = await store.get(student.sub, transcriptionMatch[1] ?? "");
      if (!owned) throw new EncounterError(404, "Encounter unavailable for this student.");
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) { const bytes = Buffer.from(chunk as Uint8Array); length += bytes.length; if (length > 2_000_000) throw new EncounterError(413, "Recording too large. Keep questions under 30 seconds."); chunks.push(bytes); }
      return send(200, { text: await transcribeQuestion(store, student.sub, transcriptionMatch[1] ?? "", Buffer.concat(chunks), mime) });
    }
    const speechMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]{36})\/speech$/i);
    if (speechMatch && req.method === "POST") {
      const input = await body(req) as { messageId?: unknown };
      if (!input || typeof input.messageId !== "string" || input.messageId.length > 100) throw new EncounterError(400, "Select a saved patient reply.");
      const audio = await savedReplySpeech(store, student.sub, speechMatch[1] ?? "", input.messageId);
      res.setHeader("Content-Type", "audio/mpeg"); res.setHeader("Content-Length", audio.length); res.end(audio); return;
    }
    const match = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]{36})(\/messages)?$/i);
    if (match && req.method === "GET" && !match[2]) {
      const encounter = await store.get(student.sub, match[1] ?? "");
      if (!encounter) throw new EncounterError(404, "Encounter unavailable for this student.");
      return send(200, { encounter: publicEncounter(encounter) });
    }
    if (match && req.method === "POST" && match[2]) {
      const value = await body(req);
      if (!value || typeof value !== "object") throw new EncounterError(400, "Invalid turn.");
      const input = value as { requestId?: unknown; revision?: unknown; text?: unknown };
      if (typeof input.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestId) || typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.text !== "string" || !input.text.trim() || input.text.length > 2000) throw new EncounterError(400, "A valid message, request ID and revision are required.");
      const encounter = await sendTurn(store, student.sub, { encounterId: match[1] ?? "", requestId: input.requestId, revision: input.revision, text: input.text.trim() }, generatePreviewReply);
      return send(200, { encounter: publicEncounter(encounter) });
    }
    return send(404, { message: "Preview endpoint unavailable." });
  } catch (error) {
    if (error instanceof EncounterError) return send(error.status, { message: error.message });
    if (error instanceof PatientLoadError) return send(422, { message: "The selected patient could not be loaded." });
    if (error instanceof PreviewReplyError) return send(503, { message: error.message });
    console.error("Preview operation failed:", error instanceof Error ? error.name : "UnknownError");
    return send(503, { message: "The preview backend could not complete this request. Your saved conversation has not been replaced with mock replies. Try refreshing, then retry." });
  }
});
server.requestTimeout = 60_000;
server.listen(8787, "127.0.0.1", () => console.log("Student preview API: http://127.0.0.1:8787 (Cognito, DynamoDB, Bedrock; local development only)"));
