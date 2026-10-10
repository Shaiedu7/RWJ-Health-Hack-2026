import { useEffect, useRef } from "react";
import { fmtTime } from "../lib/format";
import type { Message } from "../types";

interface Props {
  messages: Message[];
  patientName: string;
  pending: boolean;
  recording?: boolean;
  highlightId?: string | null;
}

export default function ConversationPanel({ messages, patientName, pending, highlightId }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  return (
    <div className="scroll-soft h-full overflow-y-auto px-5 py-4" role="log" aria-label="Conversation transcript" aria-live="polite">
      <ol className="flex flex-col gap-3">
        {messages.map((m) => {
          const student = m.role === "student";
          return (
            <li key={m.id} id={`msg-${m.id}`} className={`flex flex-col ${student ? "items-end" : "items-start"}`}>
              <span className="mb-1 flex items-center gap-2 text-[11px] font-medium text-ink-3">
                {student ? "You" : patientName}
                <span className="font-mono font-normal">{fmtTime(m.t)}</span>
              </span>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  student ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-line bg-card text-ink"
                } ${highlightId === m.id ? "ring-2 ring-teal" : ""}`}
              >
                {m.text}
              </p>
            </li>
          );
        })}
        {pending && (
          <li className="flex flex-col items-start" aria-label={`${patientName} is preparing a response`}>
            <span className="mb-1 text-[11px] font-medium text-ink-3">{patientName}</span>
            <span className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="anim-dot size-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </span>
          </li>
        )}
      </ol>
      <div ref={end} />
    </div>
  );
}
