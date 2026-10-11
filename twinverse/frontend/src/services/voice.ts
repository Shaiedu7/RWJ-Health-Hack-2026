export interface VoiceRequest {
  messageId: string;
  text: string;
  voiceId: string;
}

export interface VoiceClip {
  durationMs: number;
  url?: string;
  simulated: boolean;
}

/**
 * Patient speech boundary. The browser never holds an ElevenLabs key: the backend looks up the saved,
 * validated dialogue by messageId, calls ElevenLabs and returns audio (or an S3 URL).
 */
export interface PatientVoiceAdapter {
  synthesize(req: VoiceRequest, opts?: { forceFail?: boolean }): Promise<VoiceClip>;
}

export const estimateDurationMs = (text: string) => Math.max(1800, text.trim().split(/\s+/).length * 330 + 400);

export class SimulatedVoiceAdapter implements PatientVoiceAdapter {
  async synthesize(req: VoiceRequest, opts?: { forceFail?: boolean }): Promise<VoiceClip> {
    await new Promise((r) => setTimeout(r, 650));
    if (opts?.forceFail) throw new Error("Simulated voice failure");
    return { durationMs: estimateDurationMs(req.text), simulated: true };
  }
}

/** Ready for a FastAPI endpoint; not wired up in this prototype. */
export class BackendVoiceAdapter implements PatientVoiceAdapter {
  constructor(private endpoint = "/api/voice/speak") {}
  async synthesize(req: VoiceRequest): Promise<VoiceClip> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: req.messageId }),
    });
    if (!res.ok) throw new Error("Voice request failed");
    const blob = await res.blob();
    return { durationMs: 0, url: URL.createObjectURL(blob), simulated: false };
  }
}

export const voiceAdapter: PatientVoiceAdapter = new SimulatedVoiceAdapter();

/* ───────────── Student speech transcription (separate from patient voice) ───────────── */

export interface TranscriptionResult {
  text: string;
  simulated: boolean;
}

export interface SpeechTranscriber {
  start(): void;
  stop(): Promise<TranscriptionResult>;
  cancel(): void;
}

export class SimulatedTranscriber implements SpeechTranscriber {
  private startedAt = 0;
  private i = 0;
  constructor(private samples: () => string[]) {}
  start() {
    this.startedAt = Date.now();
  }
  async stop(): Promise<TranscriptionResult> {
    const held = Date.now() - this.startedAt;
    await new Promise((r) => setTimeout(r, 700));
    if (held < 400) throw new Error("Recording too short");
    const list = this.samples();
    return { text: list[this.i++ % list.length] ?? "", simulated: true };
  }
  cancel() {
    this.startedAt = 0;
  }
}
