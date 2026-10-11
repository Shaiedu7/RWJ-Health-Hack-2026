import { createContext, useContext, useState } from "react";
import Icon from "../components/Icon";
import { targetKey, type CommentTarget, type FacultyComment, type FeedbackReport as Report, type Importance, type RubricScore, type TranscriptMessage } from "./types.ts";

interface Props {
  report: Report;
  messages: TranscriptMessage[];
  patientName: string;
  viewer: "student" | "faculty";
  /** True while scores come from sample data rather than a real evaluation. */
  sample: boolean;
  onAddComment?: (target: CommentTarget, text: string) => Promise<void>;
  onRemoveComment?: (commentId: string) => Promise<void>;
}
const Ctx = createContext<Props | null>(null);
const useReport = () => useContext(Ctx)!;

const SCORE_TONE: Record<RubricScore, string> = { 3: "bg-teal-soft text-teal-deep", 2: "bg-paper-2 text-ink-2", 1: "bg-danger-soft text-danger" };
const IMPORTANCE: Record<Importance, { label: string; tone: string }> = {
  critical: { label: "Critical", tone: "bg-danger-soft text-danger" },
  important: { label: "Important", tone: "bg-amber-soft text-amber-900" },
  minor: { label: "Minor", tone: "bg-paper-2 text-ink-2" },
};
const OUTCOME = {
  met: { label: "Met", tone: "bg-teal-soft text-teal-deep" },
  partial: { label: "Partly met", tone: "bg-amber-soft text-amber-900" },
  notMet: { label: "Not met", tone: "bg-danger-soft text-danger" },
} as const;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const Card = ({ title, children, className = "", aside }: { title: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) => (
  <section className={`rounded-[28px] border border-line bg-card p-6 md:p-7 ${className}`}>
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);
const Chip = ({ children, tone }: { children: React.ReactNode; tone: string }) => <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{children}</span>;
const Bar = ({ value, max }: { value: number; max: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-paper-2" role="img" aria-label={`${value} of ${max}`}>
    <div className="h-full rounded-full bg-teal" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
  </div>
);

/** The cited messages, each student question followed by the patient's reply to it. */
function Evidence({ ids }: { ids: string[] }) {
  const { messages, patientName, viewer } = useReport();
  const [open, setOpen] = useState(false);
  const picked = new Set<string>();
  ids.forEach((id) => {
    const i = messages.findIndex((m) => m.id === id);
    if (i < 0) return;
    picked.add(id);
    if (messages[i]?.role === "user" && messages[i + 1]?.role === "assistant") picked.add(messages[i + 1]!.id);
  });
  const list = messages.filter((m) => picked.has(m.id));
  if (!list.length) return null;
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal-deep underline-offset-2 hover:underline">
        {open ? "Hide exchange" : "View exchange"} <Icon name="chevron" size={12} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="anim-rise mt-3 flex flex-col gap-2 rounded-2xl bg-paper-2 p-4 text-sm">
          {list.map((m) => (
            <p key={m.id} className="leading-relaxed">
              <a href={`#message-${m.id}`} className="mr-2 font-mono text-xs text-ink-3 hover:text-teal-deep">#{m.sequence}</a>
              <span className="mr-2 font-semibold text-ink">{m.role === "assistant" ? patientName : viewer === "student" ? "You" : "Student"}</span>
              <span className="text-ink-2">{m.text}</span>
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function CommentList({ comments }: { comments: FacultyComment[] }) {
  const { viewer, onRemoveComment } = useReport();
  const [removing, setRemoving] = useState<string | null>(null);
  if (!comments.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {comments.map((c) => (
        <li key={c.id} className="rounded-2xl border border-teal/30 bg-teal-soft/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span><span className="font-semibold text-teal-deep">{c.target.kind === "overall" ? "Instructor critique" : "Instructor comment"}</span> · {c.author} · {when(c.createdAt)}</span>
            {viewer === "faculty" && onRemoveComment && (
              <button disabled={removing === c.id} className="font-semibold text-danger hover:underline disabled:opacity-50" onClick={() => { setRemoving(c.id); void onRemoveComment(c.id).finally(() => setRemoving(null)); }}>
                {removing === c.id ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{c.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Instructor comments attached to one part of the report, with a composer for faculty. */
function Comments({ target, label, startOpen = false, general = false }: { target: CommentTarget; label: string; startOpen?: boolean; general?: boolean }) {
  const { report, viewer, onAddComment } = useReport();
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const comments = report.facultyComments.filter((c) => targetKey(c.target) === targetKey(target));
  const canWrite = viewer === "faculty" && !!onAddComment;
  if (!comments.length && !canWrite) return null;
  async function submit() {
    if (!onAddComment || !text.trim()) return;
    setBusy(true); setError("");
    try { await onAddComment(target, text.trim()); setText(""); if (!startOpen) setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : "The comment could not be saved."); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <CommentList comments={comments} />
      {canWrite && !open && (
        <button onClick={() => setOpen(true)} className="self-start text-xs font-semibold text-teal-deep underline-offset-2 hover:underline">+ {label}</button>
      )}
      {canWrite && open && (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={general ? 6000 : 2000} rows={general ? 7 : 3} disabled={busy} aria-label={label} placeholder={general ? "Your overall assessment of this encounter: what stood out, what to work on, anything the automated feedback missed. The student sees this under their overall score." : "Visible to the student in their feedback report."} className="w-full rounded-xl border border-line bg-white p-3 text-[15px]" />
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !text.trim()} className="h-10 rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50">{busy ? "Saving…" : general ? "Post critique" : "Add comment"}</button>
            {!startOpen && <button type="button" disabled={busy} onClick={() => { setOpen(false); setText(""); setError(""); }} className="h-10 rounded-full border border-line px-5 text-sm font-semibold text-ink">Cancel</button>}
          </div>
        </form>
      )}
    </div>
  );
}

function Rubric() {
  const { report } = useReport();
  const [openSection, setOpenSection] = useState<string | null>(null);
  return (
    <ul className="flex flex-col divide-y divide-line">
      {report.sections.map((section) => {
        const total = section.items.reduce((sum, i) => sum + i.score, 0), max = section.items.length * 3, open = openSection === section.sectionId;
        const commented = report.facultyComments.filter((c) => c.target.kind === "item" && section.items.some((i) => c.target.kind === "item" && i.itemId === c.target.itemId)).length;
        return (
          <li key={section.sectionId} className="py-4 first:pt-0 last:pb-0">
            <button onClick={() => setOpenSection(open ? null : section.sectionId)} aria-expanded={open} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-left sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
              <span className="font-semibold text-ink">
                {section.name}
                {commented > 0 && <span className="ml-2 text-xs font-normal text-teal-deep">{commented} instructor comment{commented === 1 ? "" : "s"}</span>}
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1"><Bar value={total} max={max} /></span>
              <span className="flex items-center gap-2 font-mono text-sm text-ink-2">{total} / {max} <Icon name="chevron" size={14} className={open ? "rotate-180" : ""} /></span>
            </button>
            {open && (
              <ul className="anim-rise mt-4 flex flex-col gap-4">
                {section.items.map((item) => (
                  <li key={item.itemId} className="rounded-2xl bg-paper p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink"><span className="mr-2 font-mono text-xs text-ink-3">{item.itemId}</span>{item.name}</h3>
                      <Chip tone={SCORE_TONE[item.score]}>{item.score} · {report.scale[item.score]}</Chip>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink">{item.rationale}</p>
                    <p className="mt-2 text-sm text-ink-3"><span className="font-semibold">Rubric level:</span> {item.descriptor}</p>
                    <Evidence ids={item.evidenceMessageIds} />
                    <Comments target={{ kind: "item", itemId: item.itemId }} label="Comment on this item" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Points({ items, tone }: { items: { text: string; suggestion?: string; evidenceMessageIds: string[] }[]; tone: "good" | "improve" }) {
  if (!items.length) return <p className="text-sm text-ink-3">Nothing to report in this area.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className={`mt-2 size-1.5 shrink-0 rounded-full ${tone === "improve" ? "bg-amber-600" : "bg-teal"}`} />
          <div className="min-w-0">
            <p className="text-[15px] leading-relaxed text-ink">{it.text}</p>
            {it.suggestion && <p className="mt-1 text-sm leading-relaxed text-ink-2"><span className="font-semibold">Try:</span> {it.suggestion}</p>}
            <Evidence ids={it.evidenceMessageIds} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Transcript() {
  const { report, messages, patientName, viewer } = useReport();
  if (!messages.length) return <p className="text-sm text-ink-3">No messages were exchanged in this encounter.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => {
        const notes = report.annotations.filter((a) => a.messageId === m.id), student = m.role === "user";
        return (
          <li key={m.id} id={`message-${m.id}`} className={`scroll-mt-6 rounded-2xl p-4 target:ring-2 target:ring-teal ${student ? "bg-paper" : "bg-teal-soft/40"}`}>
            <p className="text-xs text-ink-3"><span className="mr-2 font-mono">#{m.sequence}</span><span className="font-semibold text-ink">{student ? (viewer === "student" ? "You" : "Student") : patientName}</span></p>
            <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{m.text}</p>
            {notes.map((note, i) => (
              <p key={i} className={`mt-3 flex gap-2 border-l-2 pl-3 text-sm leading-relaxed ${note.sentiment === "strength" ? "border-teal text-teal-deep" : "border-amber-600 text-amber-900"}`}>
                <span className="font-semibold">{note.sentiment === "strength" ? "Strength" : "To improve"}:</span> <span className="text-ink-2">{note.comment}</span>
              </p>
            ))}
            {student && <Comments target={{ kind: "message", messageId: m.id }} label="Comment on this message" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function FeedbackReport(props: Props) {
  const { report, viewer, sample } = props;
  const items = report.sections.flatMap((s) => s.items);
  const count = (score: RubricScore) => items.filter((i) => i.score === score).length;
  const inline = report.facultyComments.filter((c) => c.target.kind !== "overall").length;
  return (
    <Ctx.Provider value={props}>
      <div className="flex flex-col gap-6">
        {sample && (
          <p className="rounded-2xl border border-amber-600/40 bg-amber-soft px-5 py-3 text-sm text-amber-900" role="note">
            <strong>Sample feedback.</strong> Automated scoring is not connected yet. The scores and comments below are placeholders and do not evaluate this conversation.
          </p>
        )}
        {report.reviewFlags.length > 0 && (
          <div className="flex gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger" role="alert">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <ul className="flex flex-col gap-1">{report.reviewFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
          </div>
        )}

        <Card title="Overall" aside={<span className="text-xs text-ink-3">{report.rubricName} · {when(report.generatedAt)}</span>}>
          <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
            <div>
              <p className="font-display text-6xl leading-none text-ink">{report.totalScore}<span className="text-3xl text-ink-3"> / {report.maxScore}</span></p>
              <p className="mt-3 text-sm text-ink-3">{([3, 2, 1] as const).map((s) => `${count(s)} ${report.scale[s].toLowerCase()}`).join(" · ")}</p>
            </div>
            <p className="max-w-3xl text-[17px] leading-relaxed text-ink-2">{report.summary}</p>
          </div>
        </Card>

        <Card title={viewer === "faculty" ? "General critique" : "Critique from your instructor"}>
          {viewer === "student" && !report.facultyComments.length && <p className="text-sm text-ink-3">Your instructor has not written a critique yet.</p>}
          {viewer === "faculty" && <p className="-mt-2 text-sm text-ink-3">Write your overall assessment here. It appears near the top of the student's report, directly under the overall score. To respond to one moment, comment on a rubric item or a transcript message below.</p>}
          <Comments target={{ kind: "overall" }} label="General critique" startOpen general />
          {inline > 0 && <p className="mt-3 text-sm text-ink-3">{inline} {report.facultyComments.length > inline ? "more " : ""}comment{inline === 1 ? "" : "s"} on specific rubric items or messages below.</p>}
        </Card>

        <Card title="Rubric scores" aside={<span className="text-xs text-ink-3">Select a section for item scores and evidence</span>}>
          <Rubric />
        </Card>

        <Card title="Learning objectives">
          {report.learningObjectives.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {report.learningObjectives.map((o) => (
                <li key={o.objectiveId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-2xl font-semibold text-ink">{o.text}</p>
                    <Chip tone={OUTCOME[o.outcome].tone}>{OUTCOME[o.outcome].label}</Chip>
                  </div>
                  <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-ink-2">{o.explanation}</p>
                  <Evidence ids={o.evidenceMessageIds} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-3">No learning objectives were defined for this patient.</p>}
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Findings elicited">
            {report.findings.elicited.length ? (
              <ul className="flex flex-col gap-4">
                {report.findings.elicited.map((f) => (
                  <li key={f.label}>
                    <div className="flex items-start justify-between gap-3"><p className="text-[15px] leading-relaxed text-ink">{f.label}</p><Chip tone={IMPORTANCE[f.importance].tone}>{IMPORTANCE[f.importance].label}</Chip></div>
                    <Evidence ids={f.evidenceMessageIds} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-3">No key findings were elicited in this attempt.</p>}
          </Card>
          <Card title="Findings missed">
            {report.findings.missed.length ? (
              <ul className="flex flex-col gap-4">
                {report.findings.missed.map((f) => (
                  <li key={f.label}>
                    <div className="flex items-start justify-between gap-3"><p className="text-[15px] leading-relaxed text-ink">{f.label}</p><Chip tone={IMPORTANCE[f.importance].tone}>{IMPORTANCE[f.importance].label}</Chip></div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-3">{f.explanation}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-3">Nothing missed. Every key finding was covered.</p>}
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Strengths"><Points items={report.strengths} tone="good" /></Card>
          <Card title="Areas for improvement"><Points items={report.improvements} tone="improve" /></Card>
        </div>

        {report.suggestions.length > 0 && (
          <Card title={viewer === "student" ? "Suggestions for your next attempt" : "Suggestions given to the student"} className="bg-teal-soft/50">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink marker:text-teal-deep">
              {report.suggestions.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </Card>
        )}

        <Card title="Annotated transcript" aside={<span className="text-xs text-ink-3">{props.messages.length} messages</span>}>
          <Transcript />
        </Card>
      </div>
    </Ctx.Provider>
  );
}
