export type VoiceState = "off" | "starting" | "listening" | "transcribing" | "thinking" | "speaking";
export class SilenceDetector {
  started = 0; lastSpeech = 0; voicedFrames = 0;
  sample(rms: number, now: number) {
    if (rms > 0.025) { if (!this.started) this.started = now; this.lastSpeech = now; this.voicedFrames++; }
    return this.voicedFrames >= 4 && now - this.lastSpeech > 1200;
  }
}
export class VoiceConversation {
  private active = false;
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private recorder?: MediaRecorder;
  private timer?: ReturnType<typeof setInterval>;
  private controller = new AbortController();
  private state: (state: VoiceState) => void;
  private error: (message: string) => void;
  private turn: (blob: Blob, signal: AbortSignal) => Promise<ArrayBuffer>;
  constructor(state: (state: VoiceState) => void, error: (message: string) => void, turn: (blob: Blob, signal: AbortSignal) => Promise<ArrayBuffer>) { this.state = state; this.error = error; this.turn = turn; }
  async start() {
    this.active = true; this.state("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microphone conversation isn’t supported in this browser. Try Chrome or keep typing.");
      this.context = new AudioContext(); await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if (!this.active) { this.stream.getTracks().forEach(t => t.stop()); if (this.context.state !== "closed") await this.context.close(); return; }
      this.listen();
    } catch (e) { this.fail(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser, or keep typing." : e instanceof Error ? e.message : "Microphone unavailable."); }
  }
  private listen() {
    if (!this.active || !this.stream || !this.context) return;
    this.stream.getAudioTracks().forEach(t => { t.enabled = true; });
    const mime = ["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) { this.fail("This browser’s recording format is unsupported. Try Chrome or keep typing."); return; }
    const recorder = new MediaRecorder(this.stream,{mimeType:mime}); this.recorder = recorder;
    const chunks: Blob[] = []; let size = 0;
    const input = this.context.createMediaStreamSource(this.stream); const analyser = this.context.createAnalyser(); analyser.fftSize = 1024; input.connect(analyser);
    const samples = new Float32Array(analyser.fftSize); const detector = new SilenceDetector(); const began = performance.now();
    const cleanup = () => { clearInterval(this.timer); input.disconnect(); analyser.disconnect(); };
    recorder.ondataavailable = e => { if (e.data.size) { size += e.data.size; chunks.push(e.data); if (size > 2_000_000) this.fail("Recording too large. Try a shorter question."); } };
    recorder.onerror = () => this.fail("Recording failed. You can keep typing.");
    recorder.onstop = () => {
      cleanup(); if (!this.active) return;
      this.stream?.getAudioTracks().forEach(t => { t.enabled = false; });
      if (detector.voicedFrames < 4) { this.listen(); return; }
      void this.respond(new Blob(chunks,{type:mime.split(";")[0]}));
    };
    this.state("listening"); recorder.start(250);
    this.timer = setInterval(() => { if (!this.active || recorder.state !== "recording") return; analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length); if (detector.sample(rms,performance.now()) || performance.now()-began > 30000) recorder.stop(); },100);
  }
  private async respond(blob: Blob) {
    try {
      this.state("transcribing"); const bytes = await this.turn(blob,this.controller.signal);
      if (!this.active || !this.context) return;
      const audio = await this.context.decodeAudioData(bytes); if (!this.active) return;
      const source = this.context.createBufferSource(); this.source = source; source.buffer = audio; source.connect(this.context.destination);
      source.onended = () => { source.disconnect(); if (this.active) this.listen(); };
      this.state("speaking"); source.start();
    } catch (e) { if (this.active) this.fail(e instanceof Error ? e.message : "Voice unavailable. You can keep typing."); }
  }
  thinking() { if (this.active) this.state("thinking"); }
  interrupt() { if (this.source) { this.source.onended = null; try { this.source.stop(); } catch { /* Already stopped. */ } this.source.disconnect(); this.source = undefined; this.listen(); } }
  finishQuestion() { if (this.recorder?.state === "recording") this.recorder.stop(); }
  stop() { this.active = false; this.controller.abort(); clearInterval(this.timer); if (this.recorder?.state === "recording") this.recorder.stop(); this.stream?.getTracks().forEach(t=>t.stop()); if (this.source) { this.source.onended=null; try { this.source.stop(); } catch { /* Already ended. */ } } if (this.context && this.context.state !== "closed") void this.context.close(); this.state("off"); }
  private fail(message: string) { this.stop(); this.error(message); }
}
