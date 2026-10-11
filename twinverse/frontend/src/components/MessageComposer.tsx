import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SpeechTranscriber } from "../services/voice";
import { fmtTime } from "../lib/format";
import Icon from "./Icon";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  transcriber: SpeechTranscriber;
  onRecordStart: () => void;
  micAvailable: boolean;
  footer: ReactNode;
}

type Rec = "idle" | "recording" | "transcribing";

export default function MessageComposer({ onSend, disabled, transcriber, onRecordStart, micAvailable, footer }: Props) {
  const [text, setText] = useState("");
  const [rec, setRec] = useState<Rec>("idle");
  const [secs, setSecs] = useState(0);
  const [fromVoice, setFromVoice] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef<Rec>("idle");
  const input = useRef<HTMLInputElement>(null);
  recRef.current = rec;

  useEffect(() => {
    if (rec !== "recording") return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [rec]);

  useEffect(() => () => transcriber.cancel(), [transcriber]);

  const begin = () => {
    if (recRef.current !== "idle" || disabled) return;
    setError("");
    onRecordStart();
    transcriber.start();
    setSecs(0);
    setRec("recording");
  };
  const end = async () => {
    if (recRef.current !== "recording") return;
    setRec("transcribing");
    try {
      const res = await transcriber.stop();
      setText(res.text);
      setFromVoice(true);
      requestAnimationFrame(() => input.current?.focus());
    } catch {
      setError("Couldn't capture that. Hold the button while you speak, or type your question.");
    }
    setRec("idle");
  };

  const submit = () => {
    if (!text.trim() || disabled || rec !== "idle") return;
    onSend(text);
    setText("");
    setFromVoice(false);
  };

  const recording = rec === "recording";
  return (
    <div className="border-t border-line bg-card/80 px-5 pb-3 pt-3">
      {fromVoice && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-teal-soft px-3 py-1.5 text-xs text-teal-deep">
          <span>Transcribed from your voice. Edit if needed, then send.</span>
          <button
            onClick={() => {
              setText("");
              setFromVoice(false);
            }}
            className="font-semibold underline underline-offset-2"
          >
            Discard
          </button>
        </div>
      )}
      {error && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            ref={input}
            value={recording ? "" : text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || rec !== "idle"}
            placeholder={recording ? "" : rec === "transcribing" ? "Transcribing…" : "Ask the patient a question…"}
            aria-label="Ask the patient a question"
            className="h-12 w-full rounded-full border border-line bg-card px-5 text-[15px] text-ink placeholder:text-ink-3 focus:border-teal disabled:bg-paper-2"
          />
          {recording && (
            <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center gap-2 text-sm font-medium text-danger" role="status">
              <span className="anim-rec size-2.5 rounded-full bg-danger" /> Recording… <span className="font-mono">{fmtTime(secs)}</span>
              <span className="font-normal text-ink-3">Release to transcribe</span>
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={!micAvailable || disabled}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            begin();
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              begin();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") end();
          }}
          onBlur={end}
          aria-pressed={recording}
          aria-label="Push to talk. Hold to record your question"
          title={micAvailable ? "Hold to talk" : "Voice input is off. Enable it in setup."}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition select-none ${
            recording ? "anim-rec border-danger bg-danger text-white" : "border-line bg-card text-ink-2 hover:border-teal hover:text-teal-deep"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Icon name="mic" size={20} />
        </button>
        <button
          type="submit"
          disabled={!text.trim() || disabled || rec !== "idle"}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-teal px-5 text-sm font-semibold text-white transition hover:bg-teal-deep disabled:cursor-not-allowed disabled:bg-ink-3/40"
        >
          Send <Icon name="send" size={16} />
        </button>
      </form>
      <div className="mt-2.5">{footer}</div>
    </div>
  );
}
