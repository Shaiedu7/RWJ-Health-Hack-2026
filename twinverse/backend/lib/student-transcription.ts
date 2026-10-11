import { EncounterError, type EncounterStore } from "./student-encounters.js";
export const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4"]);
export async function transcribeQuestion(store: EncounterStore, student: string, encounterId: string, audio: Uint8Array, mime: string, fetcher: typeof fetch = fetch): Promise<string> {
  const encounter = await store.get(student, encounterId);
  if (!encounter) throw new EncounterError(404, "Encounter unavailable for this student.");
  if (!encounter.context) throw new EncounterError(409, "This encounter is archived.");
  if (!AUDIO_TYPES.has(mime) || audio.length < 100 || audio.length > 2_000_000) throw new EncounterError(400, "Record a short spoken question (up to 30 seconds).");
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key || key.includes("{{resolve:")) throw new EncounterError(503, "Microphone transcription needs server configuration. You can keep typing.");
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `question.${mime.split("/")[1]}`); form.append("model_id", "scribe_v2"); form.append("language_code", "en"); form.append("tag_audio_events", "false");
  let response: Response;
  try { response = await fetcher("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(30000) }); }
  catch { throw new EncounterError(503, "Transcription failed. Try speaking again or type your question."); }
  if (!response.ok) throw new EncounterError(503, "ElevenLabs transcription is unavailable. Check Speech to Text permission and credits, or keep typing.");
  const result = await response.json() as { text?: unknown };
  if (typeof result.text !== "string" || !result.text.trim()) throw new EncounterError(422, "No speech was recognized. Please try again.");
  if (result.text.length > 2000) throw new EncounterError(422, "Your question is too long. Please shorten it.");
  return result.text.trim();
}
