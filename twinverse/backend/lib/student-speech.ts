import { EncounterError, type EncounterStore } from "./student-encounters.js";
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
export async function savedReplySpeech(store: EncounterStore, student: string, encounterId: string, messageId: string, fetcher: typeof fetch = fetch): Promise<Buffer> {
  const encounter = await store.get(student, encounterId);
  if (!encounter) throw new EncounterError(404, "Encounter unavailable for this student.");
  if (!encounter.context) throw new EncounterError(409, "Spoken replies are available in richer Wyatt previews only.");
  const message = encounter.messages.find(m => m.id === messageId && m.role === "assistant");
  if (!message) throw new EncounterError(404, "Saved patient reply unavailable.");
  const key = process.env["ELEVENLABS_API_KEY"];
  const voice = process.env["ELEVENLABS_VOICE_ID"];
  if (!key || key.includes("{{resolve:") || !voice || !/^[a-zA-Z0-9]{10,64}$/.test(voice)) throw new EncounterError(503, "Spoken replies need server-side ElevenLabs configuration. You can keep typing.");
  const cacheKey = JSON.stringify([student, encounterId, messageId, voice]);
  const cached = cache.get(cacheKey); if (cached) return cached;
  const existing = pending.get(cacheKey); if (existing) return existing;
  if (pending.size >= 3) throw new EncounterError(429, "Audio is busy. Try again shortly; typing is still available.");
  const task = (async () => {
    let response: Response;
    try { response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify({ text: message.text, model_id: "eleven_multilingual_v2" }), signal: AbortSignal.timeout(30000) }); }
    catch { throw new EncounterError(503, "Audio could not be generated. Your saved reply and typing are still available."); }
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new EncounterError(503, "ElevenLabs audio is unavailable. Check the key permissions and credits; typing still works.");
    const reader = response.body?.getReader(); if (!reader) throw new EncounterError(503, "Audio unavailable.");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const result = await reader.read(); if (result.done) break; bytes += result.value.length; if (bytes > 2_000_000) { await reader.cancel(); throw new EncounterError(503, "Audio exceeded the preview size limit."); } chunks.push(result.value); }
    const audio = Buffer.concat(chunks); if (!audio.length) throw new EncounterError(503, "Audio unavailable.");
    if (cache.size >= 12) cache.delete(cache.keys().next().value ?? "");
    cache.set(cacheKey, audio); return audio;
  })();
  pending.set(cacheKey, task);
  try { return await task; } finally { pending.delete(cacheKey); }
}
