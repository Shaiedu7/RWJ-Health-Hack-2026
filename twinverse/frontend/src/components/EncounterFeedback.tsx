import { useState } from "react";
import { fmtTime } from "../lib/format";
import { elapsedSec } from "../state/useEncounterStore";
import type { Encounter, FeedbackItem, Message, PublicCase } from "../types";
import { Brand } from "./CaseSelection";
import ConversationPanel from "./ConversationPanel";
import Icon from "./Icon";
import Modal from "./Modal";

function Exchange({ ids, messages, name }: { ids: string[]; messages: Message[]; name: string }) {
  const picked = new Set<string>();
  ids.forEach((id) => {
    const i = messages.findIndex((m) => m.id === id);
    if (i < 0) return;
    if (messages[i].role === "patient" && messages[i - 1]?.role === "student") picked.add(messages[i - 1].id);
    picked.add(id);
  });
  const list = messages.filter((m) => picked.has(m.id));
  return (
    <div className="anim-rise mt-3 flex flex-col gap-2 rounded-2xl bg-paper-2 p-4 text-sm">
      {list.map((m) => (
        <p key={m.id} className="leading-relaxed">
          <span className="mr-2 font-semibold text-ink">{m.role === "student" ? "You" : name}</span>
          <span className="mr-2 font-mono text-xs text-ink-3">{fmtTime(m.t)}</span>
          <span className="text-ink-2">{m.text}</span>
        </p>
      ))}
    </div>
  );
}

function Items({ items, messages, name, tone }: { items: FeedbackItem[]; messages: Message[]; name: string; tone?: "good" | "improve" }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return <p className="text-sm text-ink-3">Nothing to report in this area.</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className={`mt-2 size-1.5 shrink-0 rounded-full ${tone === "improve" ? "bg-amber-600" : "bg-teal"}`} />
          <div className="min-w-0">
            <p className="text-[15px] leading-relaxed text-ink">{it.text}</p>
            {it.evidence && it.evidence.length > 0 && (
              <>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal-deep underline-offset-2 hover:underline">
                  {open === i ? "Hide exchange" : "View exchange"} <Icon name="chevron" size={12} className={open === i ? "rotate-180" : ""} />
                </button>
                {open === i && <Exchange ids={it.evidence} messages={messages} name={name} />}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

const Card = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`rounded-[28px] border border-line bg-card p-7 ${className}`}>
    <h2 className="mb-4 font-display text-2xl text-ink">{title}</h2>
    {children}
  </section>
);

const STATUS = { observed: "Observed", partial: "Partly observed", notObserved: "Not observed" } as const;

interface Props {
  encounter: Encounter;
  patient: PublicCase;
  onTryAgain: () => void;
  onBack: () => void;
}

export default function EncounterFeedback({ encounter, patient, onTryAgain, onBack }: Props) {
  const [transcript, setTranscript] = useState(false);
  const f = encounter.feedback!;
  const msgs = encounter.messages;
  const name = patient.patientName;
  const questions = msgs.filter((m) => m.role === "student").length;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Brand />
        <span className="rounded-full bg-teal-soft px-3 py-1 text-xs font-semibold text-teal-deep">Simulated encounter · complete</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-20 pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">Encounter feedback</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] text-ink">{name}</h1>
        <p className="mt-3 text-ink-3">
          {patient.encounterType} · {fmtTime(elapsedSec(encounter))} · {questions} question{questions === 1 ? "" : "s"} asked
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => setTranscript(true)} className="h-11 rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink hover:border-teal">
            Review transcript
          </button>
          <button onClick={onTryAgain} className="flex h-11 items-center gap-2 rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-deep">
            <Icon name="retry" size={15} /> Try again
          </button>
          <button onClick={onBack} className="h-11 rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink hover:border-ink">
            Back to cases
          </button>
        </div>

        <div className="mt-10 flex flex-col gap-6">
          <Card title="Encounter summary">
            <p className="max-w-3xl text-[17px] leading-relaxed text-ink-2">{f.summary}</p>
          </Card>

          <Card title="Learning objectives">
            <ul className="flex flex-col divide-y divide-line">
              {f.objectives.map((o) => (
                <li key={o.text} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="max-w-xl text-[15px] leading-relaxed text-ink">{o.text}</span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      o.status === "observed" ? "bg-teal-soft text-teal-deep" : o.status === "partial" ? "bg-amber-soft text-amber-900" : "bg-paper-2 text-ink-2"
                    }`}
                  >
                    {STATUS[o.status]}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Important findings elicited">
              {f.elicited.length ? <Items items={f.elicited} messages={msgs} name={name} /> : <p className="text-sm text-ink-3">No key findings were elicited in this attempt.</p>}
            </Card>
            <Card title="Important findings missed">
              {f.missed.length ? (
                <ul className="flex flex-col gap-3.5">
                  {f.missed.map((m) => (
                    <li key={m.label} className="flex gap-3">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-600" />
                      <div>
                        <p className="text-[15px] leading-relaxed text-ink">{m.label}</p>
                        <p className="text-sm text-ink-3">{m.hint}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">Nothing missed. Every key finding was covered.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Interview structure and sequencing">
              <Items items={f.structure} messages={msgs} name={name} />
            </Card>
            <Card title="Communication, clarity and empathy">
              <Items items={f.communication} messages={msgs} name={name} />
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Strengths">
              {f.strengths.length ? <Items items={f.strengths} messages={msgs} name={name} /> : <p className="text-sm text-ink-3">No strengths could be identified from this short encounter.</p>}
            </Card>
            <Card title="Specific improvements">
              {f.improvements.length ? <Items items={f.improvements} messages={msgs} name={name} tone="improve" /> : <p className="text-sm text-ink-3">No specific improvements to flag.</p>}
            </Card>
          </div>

          <Card title="Suggestions for your next attempt" className="bg-teal-soft/50">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink marker:text-teal-deep">
              {f.next.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
          </Card>
        </div>
      </main>

      <Modal open={transcript} onClose={() => setTranscript(false)} title="Encounter transcript" side="right">
        <div className="-mx-6 -my-5 h-[calc(100dvh-5rem)]">
          <ConversationPanel messages={msgs} patientName={name} pending={false} />
        </div>
      </Modal>
    </div>
  );
}
