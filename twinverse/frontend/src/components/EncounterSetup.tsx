import { useEffect, useRef, useState } from "react";
import type { Prefs } from "../state/useEncounterStore";
import type { PublicCase } from "../types";
import { Brand } from "./CaseSelection";
import Icon from "./Icon";
import PatientAvatar from "./PatientAvatar";

type Mic = "idle" | "requesting" | "ok" | "denied" | "unsupported";

export default function EncounterSetup({ patient, prefs, onBegin, onBack }: { patient: PublicCase; prefs: Prefs; onBegin: (p: Prefs) => void; onBack: () => void }) {
  const [voice, setVoice] = useState(prefs.voiceEnabled);
  const [tone, setTone] = useState(false);
  const [mic, setMic] = useState<Mic>("idle");
  const [level, setLevel] = useState(0);
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => () => cleanup.current(), []);

  const playTone = () => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [523.25, 659.25].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
    setTone(true);
    setTimeout(() => void ctx.close(), 1400);
  };

  const checkMic = async () => {
    cleanup.current();
    if (!navigator.mediaDevices?.getUserMedia) return setMic("unsupported");
    setMic("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 60));
        raf = requestAnimationFrame(loop);
      };
      loop();
      cleanup.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setMic("ok");
    } catch {
      setMic("denied");
    }
  };

  const begin = (p: Prefs) => {
    cleanup.current();
    onBegin(p);
  };

  const row = "flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5";
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Brand />
        <button onClick={onBack} className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink-2 hover:bg-paper-2">
          <Icon name="back" size={16} /> Back to cases
        </button>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-6 pb-16 pt-4 md:grid-cols-[320px_1fr]">
        <aside>
          <div className="overflow-hidden rounded-[28px] border border-line bg-teal-soft">
            <PatientAvatar appearance={patient.appearance} state="idle" variant="portrait" className="h-64 w-full" />
          </div>
          <h1 className="mt-5 font-display text-3xl text-ink">{patient.patientName}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {patient.age}-year-old {patient.sex.toLowerCase()} · {patient.encounterType}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{patient.intro}</p>
        </aside>

        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">Before you begin</p>
          <h2 className="mt-2 font-display text-4xl text-ink">Prepare for the encounter</h2>
          <p className="mt-4 rounded-2xl bg-teal-soft px-5 py-4 text-[15px] leading-relaxed text-teal-deep">
            You’ll interview a simulated patient. Medical information will become available as the encounter progresses.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <div className={row}>
              <div>
                <h3 className="font-semibold text-ink">Speaker test</h3>
                <p className="text-sm text-ink-3">{tone ? "Did you hear the chime? Adjust your volume if not." : "Play a short chime to check your sound."}</p>
              </div>
              <button onClick={playTone} className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-teal">
                <Icon name="volume" size={16} /> Play test sound
              </button>
            </div>

            <div className={row}>
              <div>
                <h3 id="voice-label" className="font-semibold text-ink">Patient voice playback</h3>
                <p className="text-sm text-ink-3">Hear {patient.patientName.split(" ")[0]}’s replies aloud. Captions are always shown. Voice: {patient.voiceLabel.toLowerCase()}.</p>
              </div>
              <button
                role="switch"
                aria-checked={voice}
                aria-labelledby="voice-label"
                onClick={() => setVoice(!voice)}
                className={`relative h-7 w-12 rounded-full transition ${voice ? "bg-teal" : "bg-ink-3/40"}`}
              >
                <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${voice ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>

            <div className={row}>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-ink">
                  Microphone <span className="font-normal text-ink-3">(optional)</span>
                </h3>
                <p className="text-sm text-ink-3" role="status">
                  {mic === "idle" && "Speak your questions with push-to-talk. You can always type instead."}
                  {mic === "requesting" && "Waiting for permission…"}
                  {mic === "ok" && "Microphone connected. Speak to see the level."}
                  {mic === "denied" && "Microphone access was blocked. You can still type your questions."}
                  {mic === "unsupported" && "No microphone found. You can still type your questions."}
                </p>
                {mic === "ok" && (
                  <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-paper-2" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                    <div className="h-full rounded-full bg-teal transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
                  </div>
                )}
              </div>
              <button onClick={checkMic} className="flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-teal">
                <Icon name="mic" size={16} /> {mic === "ok" ? "Recheck" : "Check microphone"}
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={() => begin({ voiceEnabled: voice, micEnabled: true })} className="flex h-12 items-center gap-2 rounded-full bg-teal px-8 text-[15px] font-semibold text-white transition hover:bg-teal-deep">
              Begin encounter <Icon name="arrow" size={17} />
            </button>
            <button onClick={() => begin({ voiceEnabled: false, micEnabled: false })} className="h-12 rounded-full border border-line px-6 text-[15px] font-semibold text-ink hover:border-ink">
              Continue with text
            </button>
          </div>
          <p className="mt-5 text-xs text-ink-3">Demo mode: patient speech and transcription are simulated. No cloud services are connected.</p>
        </section>
      </main>
    </div>
  );
}
