import { useEffect, useState } from "react";
import { feedbackApi, LIVE } from "./feedbackApi.ts";
import FeedbackReport from "./FeedbackReport.tsx";
import type { CommentTarget, FacultyComment, ReviewDetail, ReviewEntry } from "./types.ts";

const message = (e: unknown) => (e instanceof Error ? e.message : "Service unavailable.");
const day = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Review({ encounterId, onBack }: { encounterId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setDetail(null); setError("");
    feedbackApi.review(encounterId).then((next) => { if (!cancelled) setDetail(next); }).catch((e) => { if (!cancelled) setError(message(e)); });
    return () => { cancelled = true; };
  }, [encounterId]);
  const update = (facultyComments: FacultyComment[]) => setDetail((current) => current && { ...current, report: { ...current.report, facultyComments } });
  const add = async (target: CommentTarget, text: string) => update(await feedbackApi.addComment(encounterId, target, text));
  const remove = async (commentId: string) => { try { update(await feedbackApi.removeComment(encounterId, commentId)); } catch (e) { setError(message(e)); } };
  return (
    <>
      <button onClick={onBack} className="h-11 rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink hover:border-ink">← All encounters</button>
      {error && <p className="mt-4 rounded-2xl border border-danger/40 bg-card p-4 text-danger" role="alert">{error}</p>}
      {!detail && !error && <p className="mt-6 text-ink-3" role="status">Loading encounter…</p>}
      {detail && (
        <>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">Encounter feedback</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] text-ink md:text-5xl">{detail.entry.studentName}</h1>
          <p className="mt-3 text-ink-3">Patient: {detail.entry.patientName} · {day(detail.entry.completedAt)} · {detail.entry.messageCount} messages</p>
          <div className="mt-8"><FeedbackReport report={detail.report} messages={detail.messages} patientName={detail.entry.patientName} viewer="faculty" sample={!LIVE} onAddComment={add} onRemoveComment={remove} /></div>
        </>
      )}
    </>
  );
}

function Reviews({ onOpen }: { onOpen: (encounterId: string) => void }) {
  const [rows, setRows] = useState<ReviewEntry[] | null>(null);
  const [error, setError] = useState("");
  const load = () => { setError(""); feedbackApi.listReviews().then(setRows).catch((e) => setError(message(e))); };
  useEffect(load, []);
  return (
    <>
      <h1 className="font-display text-4xl text-ink">Student encounters</h1>
      <p className="mt-3 max-w-2xl text-ink-3">Open an encounter to read the student's feedback report and add your own comments. Students see your comments in their report.</p>
      {!LIVE && <p className="mt-5 rounded-2xl border border-amber-600/40 bg-amber-soft px-5 py-3 text-sm text-amber-900" role="note"><strong>Sample data.</strong> This list shows a built-in sample plus encounters ended in this browser. Comments are stored in this browser only.</p>}
      {error && <div className="mt-6 rounded-2xl border border-danger/40 bg-card p-5" role="alert"><p className="text-danger">{error}</p><button onClick={load} className="mt-3 h-10 rounded-full border border-line px-5 text-sm font-semibold">Retry</button></div>}
      {!rows && !error && <p className="mt-6 text-ink-3" role="status">Loading encounters…</p>}
      {rows && !rows.length && <p className="mt-6 rounded-[28px] border border-line bg-card p-7 text-ink-3">No student has completed an encounter yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.encounterId}>
              <button onClick={() => onOpen(row.encounterId)} className="grid w-full gap-x-6 gap-y-2 rounded-[28px] border border-line bg-card p-5 text-left hover:border-teal sm:grid-cols-[1fr_auto] sm:items-center md:p-6">
                <span>
                  <span className="block font-display text-xl text-ink">{row.studentName}</span>
                  <span className="mt-1 block text-sm text-ink-3">{row.patientName} · {day(row.completedAt)} · {row.messageCount} messages</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {row.needsReview && <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger">Review recommended</span>}
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.commentCount ? "bg-teal-soft text-teal-deep" : "bg-paper-2 text-ink-2"}`}>{row.commentCount ? `${row.commentCount} comment${row.commentCount === 1 ? "" : "s"}` : "No comments yet"}</span>
                  <span className="font-mono text-sm text-ink">{row.totalScore} / {row.maxScore}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function FacultyFeedback() {
  // Sample data lives in this browser, so it needs no sign-in. Real reviews require a faculty session.
  const [access, setAccess] = useState<"checking" | "granted" | "denied">(LIVE ? "checking" : "granted");
  const [selected, setSelected] = useState(new URLSearchParams(window.location.search).get("encounter"));
  useEffect(() => {
    if (!LIVE) return;
    fetch("/api/faculty/auth/me", { cache: "no-store" }).then(async (r) => setAccess(r.ok && (await r.json()).role === "faculty" ? "granted" : "denied")).catch(() => setAccess("denied"));
  }, []);
  function open(encounterId: string | null) {
    setSelected(encounterId);
    window.history.replaceState(null, "", encounterId ? `?encounter=${encodeURIComponent(encounterId)}` : window.location.pathname);
    window.scrollTo({ top: 0 });
  }
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 md:px-6">
        <p className="font-semibold text-teal">Proxy · Faculty</p>
        <nav className="flex flex-wrap gap-4 text-sm font-semibold text-teal-deep"><a className="hover:underline" href="/faculty.html">Patient Studio</a><a className="hover:underline" href="/">Student view</a></nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 md:px-6">
        {access === "checking" && <p className="text-ink-3" role="status">Checking faculty sign-in…</p>}
        {access === "denied" && <section className="rounded-[28px] border border-line bg-card p-7"><h1 className="font-display text-2xl">Faculty sign-in required</h1><p className="mt-3 text-ink-3">Sign in with a faculty account to review student encounters.</p><a href="/api/auth/login?destination=faculty" className="mt-5 inline-block rounded-full bg-teal px-5 py-3 text-sm font-semibold text-white">Sign in</a></section>}
        {access === "granted" && (selected ? <Review encounterId={selected} onBack={() => open(null)} /> : <Reviews onOpen={open} />)}
      </main>
    </div>
  );
}
