# TwinVerse voice conversation

Open Wyatt’s encounter at http://127.0.0.1:8443. Click **Start conversation** and allow microphone access. Ask your question, then pause for about 1.2 seconds. The app transcribes the question through ElevenLabs Scribe v2, sends the text through the existing saved, grounded Bedrock conversation flow, and automatically speaks the saved reply using ElevenLabs. It then resumes listening.

**Done speaking** submits your recorded question without waiting for the pause. **Stop conversation** stops the microphone and playback. **Interrupt Wyatt** stops his reply and listens for your next question. Typing stays available when voice is stopped or fails. Typed messages also trigger spoken replies automatically. **Hear reply** replays a previous response without a visible audio player.

This version alternates listening and speaking. It does not automatically detect speech over Wyatt’s reply. The microphone is disabled during transcription, response generation, and playback to avoid transcribing his own voice. Silence detection uses an amplitude threshold and may need tuning for your room or microphone. Questions are limited to 30 seconds and 2 MB.

Only your recorded question is sent to ElevenLabs transcription. The server API key stays private. Raw microphone audio is not stored by TwinVerse; transcript text becomes part of your private saved encounter. ElevenLabs provider retention follows your account’s settings; this implementation does not claim zero retention. No new AWS resources or permissions were deployed.

Stopping during an AI request may leave the in-flight turn finishing on the server. Refresh restores the saved result; it does not create a fake replacement. Request IDs and revisions still prevent duplicate saved turns.

## Verification and limits

20 backend tests and 13 frontend tests passed. Type checks, backend lint, and frontend production build passed. Tests cover owned encounters, recording size/type validation, transcription errors, no-speech handling, pause detection, late permission cancellation, saved reply selection, audio deduplication, and provider failures.

Live ElevenLabs speech and transcription were verified with a generic synthetic “Hello, how are you?” clip. This verifies provider access, not the user’s actual microphone or complete spoken conversation. The signed-in browser displays Start conversation and no visible audio player. A real microphone trial is pending user testing. The full grounded response is generated and checked before speech, so noticeable pauses remain.

The existing secure backend start instructions are in ElevenLabs-voice-guide.md. Chrome or another browser supporting MediaRecorder, Web Audio, and microphone access is needed. The in-app browser’s microphone support has not been verified.
