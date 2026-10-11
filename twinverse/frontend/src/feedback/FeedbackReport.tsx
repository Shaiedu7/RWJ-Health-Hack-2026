import { createContext, useContext, useState } from "react";
import Icon from "../components/Icon";
import type { CommentTarget, FacultyComment, FeedbackReport as Report, Importance, RubricScore, TranscriptMessage } from "./types.ts";

interface Props {
  report: Report;
  messages: TranscriptMessage[];
  patientName: string;
  viewer: "student" | "faculty";
  /** True while scores come from sample data rather than a real evaluation. */
  sample: boolean;
  /** Page heading shown left of the score: the patient for students, the student for faculty. */
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Difficulty-weighted percentage. Shown to faculty only. */
  weightedPercent?: number;
  onAddComment?: (target: CommentTarget, text: string) => Promise<void>;
  onRemoveComment?: (commentId: string) => Promise<void>;
}
type Shared = Props & { focused: string | null; focus: (messageId: string) => void };
const Ctx = createContext<Shared | null>(null);
const useReport = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error("FeedbackReport context missing");
  return value;
};

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

const Chip = ({ children, tone }: { children: React.ReactNode; tone: string }) => <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{children}</span>;
const AiBadge = () => <span className="rounded-full border border-ink-3/30 bg-paper-2 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">AI-generated</span>;
const Bar = ({ value, max }: { value: number; max: number }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-paper-2" role="img" aria-label={`${value} of ${max}`}>
    <div className="h-full rounded-full bg-teal" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
  </div>
);
const Heading = ({ children }: { children: React.ReactNode }) => <h3 className="mb-3 mt-7 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3 first:mt-0">{children}</h3>;

/** One of the three side-by-side columns. Each scrolls on its own on wide screens. */
function Column({ title, aside, ai, children }: { title: string; aside?: React.ReactNode; ai?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-[28px] border border-line bg-card xl:h-[calc(100dvh-13rem)] xl:min-h-[36rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-xl text-ink">{title}{ai && <AiBadge />}</h2>
        {aside}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </section>
  );
}

/** Links to cited student messages; selecting one scrolls the conversation column to it. */
function Evidence({ ids }: { ids: string[] }) {
  const { messages, focus } = useReport();
  const cited = messages.filter((m) => ids.includes(m.id));
  if (!cited.length) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
      <span>Evidence:</span>
      {cited.map((m) => (
        <button key={m.id} onClick={() => focus(m.id)} title="Show this message in the conversation" className="rounded-full border border-teal/40 px-2 py-0.5 font-mono font-semibold text-teal-deep hover:bg-teal-soft">#{m.sequence}</button>
      ))}
    </p>
  );
}

function Transcript() {
  const { report, messages, patientName, viewer, focused } = useReport();
  if (!messages.length) return <p className="text-sm text-ink-3">No messages were exchanged in this encounter.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => {
        const notes = report.annotations.filter((a) => a.messageId === m.id), student = m.role === "user";
        return (
          <li key={m.id} id={`message-${m.id}`} className={`flex scroll-mt-4 flex-col ${student ? "items-end" : "items-start"}`}>
            <p className="mb-1 text-xs text-ink-3"><span className="mr-2 font-mono">#{m.sequence}</span><span className="font-semibold text-ink">{student ? (viewer === "student" ? "You" : "Student") : patientName}</span></p>
            <div className={`max-w-[92%] rounded-2xl px-4 py-3 transition-shadow ${student ? "rounded-tr-sm bg-teal-soft" : "rounded-tl-sm bg-paper-2"} ${focused === m.id ? "ring-2 ring-teal" : ""}`}>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{m.text}</p>
            </div>
            {notes.map((note, i) => (
              <p key={i} className={`mt-2 max-w-[92%] border-l-2 pl-3 text-xs leading-relaxed ${note.sentiment === "strength" ? "border-teal" : "border-amber-600"}`}>
                <span className="font-semibold text-ink-2">AI note · {note.sentiment === "strength" ? "Strength" : "To improve"}:</span> <span className="text-ink-2">{note.comment}</span>
              </p>
            ))}
          </li>
        );
      })}
    </ol>
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

function Evaluation() {
  const { report, viewer } = useReport();
  return (
    <>
      {report.summary && <p className="text-[15px] leading-relaxed text-ink">{report.summary}</p>}

      <Heading>Score by section</Heading>
      <ul className="flex flex-col gap-3">
        {report.sections.map((s) => {
          const total = s.items.reduce((sum, i) => sum + i.score, 0), max = s.items.length * 3;
          return (
            <li key={s.sectionId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-ink">{s.name}</span><span className="font-mono text-ink-2">{total} / {max}</span>
              <span className="col-span-2"><Bar value={total} max={max} /></span>
            </li>
          );
        })}
      </ul>

      <Heading>Strengths</Heading>
      <Points items={report.strengths} tone="good" />
      <Heading>Areas for improvement</Heading>
      <Points items={report.improvements} tone="improve" />

      <Heading>Learning objectives</Heading>
      {report.learningObjectives.length ? (
        <ul className="flex flex-col gap-4">
          {report.learningObjectives.map((o) => (
            <li key={o.objectiveId}>
              <div className="flex items-start justify-between gap-3"><p className="text-[15px] leading-relaxed text-ink">{o.text}</p><Chip tone={OUTCOME[o.outcome].tone}>{OUTCOME[o.outcome].label}</Chip></div>
              {o.explanation && <p className="mt-1 text-sm leading-relaxed text-ink-2">{o.explanation}</p>}
              <Evidence ids={o.evidenceMessageIds} />
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-3">No learning objectives were defined for this patient.</p>}

      <Heading>Findings elicited</Heading>
      {report.findings.elicited.length ? (
        <ul className="flex flex-col gap-3">
          {report.findings.elicited.map((f) => (
            <li key={f.label}>
              <div className="flex items-start justify-between gap-3"><p className="text-[15px] leading-relaxed text-ink">{f.label}</p><Chip tone={IMPORTANCE[f.importance].tone}>{IMPORTANCE[f.importance].label}</Chip></div>
              <Evidence ids={f.evidenceMessageIds} />
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-3">No key findings were elicited.</p>}

      <Heading>Findings missed</Heading>
      {report.findings.missed.length ? (
        <ul className="flex flex-col gap-3">
          {report.findings.missed.map((f) => (
            <li key={f.label}>
              <div className="flex items-start justify-between gap-3"><p className="text-[15px] leading-relaxed text-ink">{f.label}</p><Chip tone={IMPORTANCE[f.importance].tone}>{IMPORTANCE[f.importance].label}</Chip></div>
              {f.explanation && <p className="mt-1 text-sm leading-relaxed text-ink-3">{f.explanation}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-3">Nothing missed.</p>}

      {report.suggestions.length > 0 && (
        <>
          <Heading>{viewer === "student" ? "Suggestions for your next attempt" : "Suggestions given to the student"}</Heading>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink marker:text-teal-deep">
            {report.suggestions.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </>
      )}
    </>
  );
}

function Rubric() {
  const { report } = useReport();
  return (
    <>
      <p className="mb-5 text-sm text-ink-3">{report.rubricName} · scored {when(report.generatedAt)}</p>
      <div className="flex flex-col gap-7">
        {report.sections.map((section) => (
          <section key={section.sectionId}>
            <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-line pb-2">
              <h3 className="font-semibold text-ink">{section.name}</h3>
              <span className="font-mono text-sm text-ink-2">{section.items.reduce((sum, i) => sum + i.score, 0)} / {section.items.length * 3}</span>
            </div>
            <ul className="flex flex-col gap-4">
              {section.items.map((item) => (
                <li key={item.itemId} id={`rubric-${item.itemId}`} className="rounded-2xl bg-paper p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-ink"><span className="mr-2 font-mono text-xs text-ink-3">{item.itemId}</span>{item.name}</h4>
                    <Chip tone={SCORE_TONE[item.score]}>{item.score} / 3</Chip>
                  </div>
                  {item.prompt && <p className="mt-1 text-sm text-ink-3">{item.prompt}</p>}
                  <ol className="mt-3 flex flex-col gap-1.5">
                    {([3, 2, 1] as const).map((level) => {
                      const text = item.levels?.[level] ?? (level === item.score ? item.descriptor : undefined);
                      if (!text) return null;
                      const reached = level === item.score;
                      return (
                        <li key={level} className={`flex gap-2 rounded-xl px-3 py-2 text-sm leading-relaxed ${reached ? "border border-teal bg-teal-soft text-ink" : "text-ink-3"}`}>
                          <span className="shrink-0 font-mono font-semibold">{level}</span>
                          <span><span className="font-semibold">{report.scale[level]}.</span> {text}{reached && <span className="ml-1 font-semibold text-teal-deep">← this attempt</span>}</span>
                        </li>
                      );
                    })}
                  </ol>
                  {item.rationale && <p className="mt-3 text-sm leading-relaxed text-ink"><span className="font-semibold">Why this score:</span> {item.rationale}</p>}
                  <Evidence ids={item.evidenceMessageIds} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Instructor feedback is kept apart from the AI output, below the three columns. */
function InstructorFeedback() {
  const { report, messages, viewer, onAddComment, onRemoveComment, focus } = useReport();
  const [text, setText] = useState("");
  const [about, setAbout] = useState("overall");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const items = report.sections.flatMap((s) => s.items);
  const studentMessages = messages.filter((m) => m.role === "user");
  const canWrite = viewer === "faculty" && !!onAddComment;

  function targetFor(value: string): CommentTarget {
    if (value.startsWith("item:")) return { kind: "item", itemId: value.slice(5) };
    if (value.startsWith("message:")) return { kind: "message", messageId: value.slice(8) };
    return { kind: "overall" };
  }
  function label(c: FacultyComment) {
    const t = c.target;
    if (t.kind === "item") { const item = items.find((i) => i.itemId === t.itemId); return `On rubric ${t.itemId}${item ? ` · ${item.name}` : ""}`; }
    if (t.kind === "message") { const m = messages.find((x) => x.id === t.messageId); return m ? <button onClick={() => focus(m.id)} className="font-semibold text-teal-deep hover:underline">On message #{m.sequence}</button> : "On a message"; }
    return "General feedback";
  }
  async function submit() {
    if (!onAddComment || !text.trim()) return;
    setBusy(true); setError("");
    try { await onAddComment(targetFor(about), text.trim()); setText(""); setAbout("overall"); }
    catch (e) { setError(e instanceof Error ? e.message : "The feedback could not be saved."); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-[28px] border-2 border-teal/40 bg-card p-6 md:p-7" aria-labelledby="instructor-feedback">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 id="instructor-feedback" className="font-display text-2xl text-ink">{viewer === "student" ? "Feedback from your instructor" : "Your feedback to the student"}</h2>
        <span className="rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Instructor</span>
      </div>
      <p className="mb-5 text-sm text-ink-3">{viewer === "student" ? "Written by faculty, separate from the AI evaluation above." : "Written by you, separate from the AI evaluation. The student sees it in this section of their report."}</p>

      {report.facultyComments.length ? (
        <ul className="flex flex-col gap-3">
          {report.facultyComments.map((c) => (
            <li key={c.id} className="rounded-2xl border border-teal/30 bg-teal-soft/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                <span><span className="font-semibold text-teal-deep">{label(c)}</span> · {c.author} · {when(c.createdAt)}</span>
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
      ) : <p className="text-sm text-ink-3">{viewer === "student" ? "Your instructor has not added feedback yet." : "No feedback yet."}</p>}

      {canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            About
            <select value={about} onChange={(e) => setAbout(e.target.value)} disabled={busy} className="h-10 w-full min-w-0 max-w-md rounded-xl border border-line bg-white px-3 text-sm font-normal">
              <option value="overall">The encounter overall</option>
              <optgroup label="A rubric item">{items.map((i) => <option key={i.itemId} value={`item:${i.itemId}`}>{i.itemId} · {i.name}</option>)}</optgroup>
              {studentMessages.length > 0 && <optgroup label="A student message">{studentMessages.map((m) => <option key={m.id} value={`message:${m.id}`}>#{m.sequence} · {m.text.length > 60 ? `${m.text.slice(0, 60)}…` : m.text}</option>)}</optgroup>}
            </select>
          </label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={6000} rows={5} disabled={busy} aria-label="Feedback for the student" placeholder="What stood out, what to work on, anything the AI evaluation missed or got wrong." className="w-full rounded-xl border border-line bg-white p-3 text-[15px]" />
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" disabled={busy || !text.trim()} className="h-11 self-start rounded-full bg-teal px-6 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-50">{busy ? "Saving…" : "Post feedback"}</button>
        </form>
      )}
    </section>
  );
}

export default function FeedbackReport(props: Props) {
  const { report, viewer, sample, messages } = props;
  const [focused, setFocused] = useState<string | null>(null);
  const percent = report.maxScore ? Math.round((report.totalScore / report.maxScore) * 100) : 0;
  function focus(messageId: string) {
    setFocused(messageId);
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return (
    <Ctx.Provider value={{ ...props, focused, focus }}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            {props.eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">{props.eyebrow}</p>}
            <h1 className="mt-2 font-display text-4xl leading-[1.05] text-ink md:text-5xl">{props.title}</h1>
            {props.subtitle && <p className="mt-3 text-ink-3">{props.subtitle}</p>}
          </div>
          <div className="ml-auto rounded-[24px] border border-line bg-card px-6 py-4 text-right" aria-label={`Score ${report.totalScore} of ${report.maxScore}`}>
            <p className="flex items-center justify-end gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Score <AiBadge /></p>
            <p className="mt-1 font-display text-5xl leading-none text-ink">{report.totalScore}<span className="text-2xl text-ink-3"> / {report.maxScore}</span></p>
            <p className="mt-2 text-sm text-ink-2">{percent}%{viewer === "faculty" && props.weightedPercent !== undefined && <> · {props.weightedPercent}% weighted for difficulty</>}</p>
          </div>
        </header>

        {sample && (
          <p className="rounded-2xl border border-amber-600/40 bg-amber-soft px-5 py-3 text-sm text-amber-900" role="note">
            <strong>Sample feedback.</strong> Automated scoring is not connected in this build. The scores and comments below are placeholders and do not evaluate this conversation.
          </p>
        )}
        {viewer === "faculty" && report.reviewFlags.length > 0 && (
          <div className="flex gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger" role="alert">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <ul className="flex flex-col gap-1">{report.reviewFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          <Column title="Conversation" aside={<span className="text-xs text-ink-3">{messages.length} messages</span>}><Transcript /></Column>
          <Column title="Evaluation" ai><Evaluation /></Column>
          <Column title="Rubric" ai><Rubric /></Column>
        </div>

        <InstructorFeedback />
      </div>
    </Ctx.Provider>
  );
}
