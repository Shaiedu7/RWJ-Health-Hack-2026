import { useCallback, useEffect, useRef, useState } from "react";
import { estimateDurationMs, type PatientVoiceAdapter, type VoiceRequest } from "../services/voice";

export type AudioStatus = "idle" | "loading" | "playing" | "failed";

interface Options {
  adapter: PatientVoiceAdapter;
  voiceEnabled: boolean;
  onEnded?: () => void;
}

/** Plays one patient clip at a time (real audio when a URL is returned, simulated timing otherwise). */
export function usePatientAudio({ adapter, voiceEnabled, onEnded }: Options) {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [progress, setProgress] = useState(1);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [current, setCurrent] = useState<VoiceRequest | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [simulated, setSimulated] = useState(true);

  const mouthRef = useRef(0);
  const token = useRef(0);
  const raf = useRef(0);
  const el = useRef<HTMLAudioElement | null>(null);
  const lastReq = useRef<VoiceRequest | null>(null);
  const enabled = useRef(voiceEnabled);
  const failRef = useRef(simulateFailure);
  const endedCb = useRef(onEnded);
  enabled.current = voiceEnabled;
  failRef.current = simulateFailure;
  endedCb.current = onEnded;

  const halt = useCallback(() => {
    token.current++;
    cancelAnimationFrame(raf.current);
    if (el.current) {
      el.current.pause();
      el.current.src = "";
      el.current = null;
    }
    mouthRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    halt();
    setStatus((s) => (s === "failed" ? s : "idle"));
    setProgress(1);
  }, [halt]);

  const play = useCallback(
    async (req: VoiceRequest) => {
      halt();
      const mine = token.current;
      lastReq.current = req;
      setCurrent(req);
      setProgress(0);
      let durationMs = estimateDurationMs(req.text);
      let url: string | undefined;

      if (enabled.current) {
        setStatus("loading");
        try {
          const clip = await adapter.synthesize(req, { forceFail: failRef.current });
          if (mine !== token.current) return;
          setSimulated(clip.simulated);
          url = clip.url;
          if (clip.durationMs) durationMs = clip.durationMs;
        } catch {
          if (mine !== token.current) return;
          setStatus("failed");
          setProgress(1);
          return;
        }
      }

      setStatus("playing");
      const t0 = performance.now();
      if (url) {
        const a = new Audio(url);
        a.muted = false;
        el.current = a;
        void a.play().catch(() => setStatus("failed"));
      }
      const tick = () => {
        if (mine !== token.current) return;
        const elapsed = performance.now() - t0;
        const dur = el.current?.duration && isFinite(el.current.duration) ? el.current.duration * 1000 : durationMs;
        const p = Math.min(1, elapsed / dur);
        setProgress(p);
        const s = elapsed / 1000;
        mouthRef.current =
          p >= 1 || dur - elapsed < 120 ? 0 : Math.min(1, 0.2 + 0.8 * Math.abs(Math.sin(s * 10.5)) * (0.55 + 0.45 * Math.sin(s * 3.1 + 1)));
        if (p >= 1) {
          halt();
          setStatus("idle");
          endedCb.current?.();
          return;
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [adapter, halt],
  );

  const replay = useCallback(() => {
    if (lastReq.current) void play(lastReq.current);
  }, [play]);

  useEffect(() => {
    if (el.current) {
      el.current.muted = muted;
      el.current.volume = volume;
    }
  }, [muted, volume, status]);

  useEffect(() => () => halt(), [halt]);

  return { status, progress, muted, setMuted, volume, setVolume, current, play, stop, replay, mouthRef, simulateFailure, setSimulateFailure, simulated, voiceEnabled };
}

export type PatientAudioController = ReturnType<typeof usePatientAudio>;
