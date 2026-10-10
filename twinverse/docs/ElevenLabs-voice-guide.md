# TwinVerse spoken replies

ElevenLabs is connected server-side using the existing `twinverse/event/elevenlabs` secret in Oregon. The key is passed into the local backend by the official AWS `asm-exec` wrapper. It is never returned to the browser or printed.

Open http://127.0.0.1:8443, sign in, open a richer Wyatt encounter, and click **Hear reply** beside a saved AI message. An audio player appears. If automatic playback is blocked by the browser, press Play in the player. Typing works independently of audio.

Voice: Will (young male), `bIHbv24MWmeRgasZH58o`. Model: `eleven_multilingual_v2`. This is a synthetic demo voice, not a recording of Wyatt.

The server looks up the encounter using the authenticated student identity, then retrieves the requested saved assistant message. It sends exactly that text to ElevenLabs, never a browser-supplied replacement, private profile, or whole conversation. Archived CSV encounters cannot generate speech. A small in-memory cache reuses recently generated audio; it clears on server restart. No audio is stored in DynamoDB. Requests have a timeout, size limit, and concurrency limit.

No new AWS infrastructure or permissions were deployed. Microphone input remains unimplemented.

## Restarting locally

Backend folder:
`/Users/ayushi/Documents/Codex/2026-10-10/use-aws-agent-toolkit-with-profile/outputs/patients-step1`

From that folder, run:

```bash
PATH="/Users/ayushi/.local/bin:$PATH" \
AWS_PROFILE=twinverse-event AWS_REGION=us-west-2 \
ENABLE_STUDENT_DEVELOPMENT_PREVIEW=true \
ELEVENLABS_VOICE_ID=bIHbv24MWmeRgasZH58o \
ELEVENLABS_API_KEY='{{resolve:secretsmanager:twinverse/event/elevenlabs:SecretString:apiKey}}' \
python3 /Users/ayushi/Documents/Codex/2026-10-10/aws-core-plugin-app-6a0b1644959c8191a6ecd016190651cd-openai/work/voice/asm-exec \
-- node --import tsx scripts/student-preview-server.ts
```

The local backend must be stopped before starting another on port 8787. Restarting clears the short-lived login session, so sign in again; saved conversations remain in DynamoDB.

Frontend folder:
`/Users/ayushi/Documents/Codex/2026-10-10/use-aws-agent-toolkit-with-profile/outputs/student-interface`

Run the existing development script there if the frontend is not already running. Keep secrets out of frontend environment variables.

## Verification

19 backend tests passed, including owned-message selection, exact text sent to TTS, duplicate coalescing/cache, and provider-failure preservation. Backend type checks and lint passed; frontend type checks and production build passed. In the signed-in browser, the existing richer Wyatt encounter restored, the saved introduction generated audio, and playback was observed with readyState 4, duration 2.51 seconds, paused false, and no media error. Browser automation confirmed playback state; subjective voice quality was not evaluated.
