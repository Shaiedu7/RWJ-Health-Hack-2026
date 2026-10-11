import { useEffect, useState } from "react";
import { feedbackApi, LIVE } from "./feedbackApi.ts";
import FeedbackReport from "./FeedbackReport.tsx";
import type { CommentTarget, FacultyComment, ReviewDetail, ReviewEntry, StudentRow } from "./types.ts";

const message = (e: unknown) => (e instanceof Error ? e.message : "Service unavailable.");
const day = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Where the faculty page is. Mirrored in the URL so a review can be linked and the back button works. */
type View = { tab: "students" | "encounters"; student: string | null; encounter: string | null };
function readView(): View {
  const q = new URLSearchParams(window.location.search);
  return { tab: q.get("tab") === "encounters" ? "encounters" : "students", student: q.get("student"), encounter: q.get("encounter") };
}
function viewUrl(v: View) {
  const q = new URLSearchParams();
  if (v.tab === "encounters") q.set("tab", "encounters");
  if (v.student) q.set("student", v.student);
  if (v.encounter) q.set("encounter", v.encounter);
  const query = q.toString();
  return query ? `?${query}` : window.location.pathname;
}

const BackButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="h-11 rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink hover:border-ink">← {children}</button>
);
const Failure = ({ error, retry }: { error: string; retry?: () => void }) => (
  <div className="mt-6 rounded-2xl border border-danger/40 bg-card p-5" role="alert">
    <p className="text-danger">{error}</p>
    {retry && <button onClick={retry} className="mt-3 h-10 rounded-full border border-line px-5 text-sm font-semibold">Retry</button>}
  </div>
);

function Review({ encounterId, onBack, backLabel }: { encounterId: string; onBack: () => void; backLabel: string }) {
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
      <BackButton onClick={onBack}>{backLabel}</BackButton>
      {error && <Failure error={error} />}
      {!detail && !error && <p className="mt-6 text-ink-3" role="status">Loading assessment…</p>}
      {detail && (
        <div className="mt-8">
          <FeedbackReport report={detail.report} messages={detail.messages} patientName={detail.entry.patientName} viewer="faculty" sample={!LIVE}
            eyebrow="Assessment" title={detail.entry.studentName} subtitle={`Patient: ${detail.entry.patientName} · ${day(detail.entry.completedAt)} · ${detail.entry.messageCount} messages`}
            weightedPercent={detail.entry.weightedPercent} onAddComment={add} onRemoveComment={remove} />
        </div>
      )}
    </>
  );
}

/** Assessment rows, shared by the all-encounters tab and a student's page. */
function ReviewList({ rows, onOpen, showStudent }: { rows: ReviewEntry[]; onOpen: (encounterId: string) => void; showStudent: boolean }) {
  if (!rows.length) return <p className="mt-6 rounded-[28px] border border-line bg-card p-7 text-ink-3">No completed assessments yet.</p>;
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.encounterId}>
          <button onClick={() => onOpen(row.encounterId)} className="grid w-full gap-x-6 gap-y-2 rounded-[28px] border border-line bg-card p-5 text-left hover:border-teal sm:grid-cols-[1fr_auto] sm:items-center md:p-6">
            <span>
              <span className="block font-display text-xl text-ink">{showStudent ? row.studentName : row.patientName}</span>
              <span className="mt-1 block text-sm text-ink-3">{showStudent ? `${row.patientName} · ` : ""}{day(row.completedAt)} · {row.messageCount} messages</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {row.needsReview && <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger">Review recommended</span>}
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.commentCount ? "bg-teal-soft text-teal-deep" : "bg-paper-2 text-ink-2"}`}>{row.commentCount ? `${row.commentCount} comment${row.commentCount === 1 ? "" : "s"}` : "No feedback yet"}</span>
              <span className="font-mono text-sm text-ink">{row.totalScore} / {row.maxScore}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function useLoad<T>(load: () => Promise<T>, key: string) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setValue(null); setError("");
    load().then((next) => { if (!cancelled) setValue(next); }).catch((e) => { if (!cancelled) setError(message(e)); });
    return () => { cancelled = true; };
  }, [key, attempt]);
  return { value, error, retry: () => setAttempt((n) => n + 1) };
}

function Students({ onOpen }: { onOpen: (studentId: string) => void }) {
  const { value: rows, error, retry } = useLoad<StudentRow[]>(() => feedbackApi.listStudents(), "students");
  return (
    <>
      <p className="max-w-2xl text-ink-3">Each student's average is the mean of their assessment scores. Open a student to see every assessment they have completed.</p>
      {error && <Failure error={error} retry={retry} />}
      {!rows && !error && <p className="mt-6 text-ink-3" role="status">Loading students…</p>}
      {rows && !rows.length && <p className="mt-6 rounded-[28px] border border-line bg-card p-7 text-ink-3">No student has completed an assessment yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.studentId}>
              <button onClick={() => onOpen(row.studentId)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-6 rounded-[28px] border border-line bg-card p-5 text-left hover:border-teal md:p-6">
                <span className="min-w-0">
                  <span className="block truncate font-display text-xl text-ink">{row.studentName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                    {row.assessmentCount} assessment{row.assessmentCount === 1 ? "" : "s"} · last {day(row.lastCompletedAt)}
                    {row.needsReviewCount > 0 && <span className="rounded-full bg-danger-soft px-3 py-0.5 text-xs font-semibold text-danger">{row.needsReviewCount} to review</span>}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-3xl leading-none text-ink">{row.averagePercent === null ? "–" : `${Math.round(row.averagePercent)}%`}</span>
                  <span className="mt-1 block text-xs text-ink-3">{row.averageScore === null ? "Not scored" : `avg ${row.averageScore} / ${row.maxScore}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Student({ studentId, onOpen, onBack }: { studentId: string; onOpen: (encounterId: string) => void; onBack: () => void }) {
  const { value, error, retry } = useLoad(() => feedbackApi.studentReviews(studentId), studentId);
  return (
    <>
      <BackButton onClick={onBack}>All students</BackButton>
      {error && <Failure error={error} retry={retry} />}
      {!value && !error && <p className="mt-6 text-ink-3" role="status">Loading assessments…</p>}
      {value && (
        <>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">Student</p>
              <h1 className="mt-2 font-display text-4xl text-ink">{value.student.studentName}</h1>
              <p className="mt-2 text-ink-3">{value.student.assessmentCount} assessment{value.student.assessmentCount === 1 ? "" : "s"} completed</p>
            </div>
            <div className="rounded-[24px] border border-line bg-card px-6 py-4 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Average score</p>
              <p className="mt-1 font-display text-4xl leading-none text-ink">{value.student.averagePercent === null ? "–" : `${Math.round(value.student.averagePercent)}%`}</p>
              {value.student.averageScore !== null && <p className="mt-1 text-sm text-ink-3">avg {value.student.averageScore} / {value.student.maxScore}</p>}
            </div>
          </div>
          <ReviewList rows={value.reviews} onOpen={onOpen} showStudent={false} />
        </>
      )}
    </>
  );
}

function Encounters({ onOpen }: { onOpen: (encounterId: string) => void }) {
  const { value: rows, error, retry } = useLoad(() => feedbackApi.listReviews(), "encounters");
  return (
    <>
      <p className="max-w-2xl text-ink-3">Every completed assessment, newest first.</p>
      {error && <Failure error={error} retry={retry} />}
      {!rows && !error && <p className="mt-6 text-ink-3" role="status">Loading assessments…</p>}
      {rows && <ReviewList rows={rows} onOpen={onOpen} showStudent />}
    </>
  );
}

export default function FacultyFeedback() {
  // Sample data lives in this browser, so it needs no sign-in. Real reviews require a faculty session.
  const [access, setAccess] = useState<"checking" | "granted" | "denied">(LIVE ? "checking" : "granted");
  const [view, setView] = useState<View>(readView);
  useEffect(() => {
    if (!LIVE) return;
    fetch("/api/faculty/auth/me", { cache: "no-store" }).then(async (r) => setAccess(r.ok && (await r.json()).role === "faculty" ? "granted" : "denied")).catch(() => setAccess("denied"));
  }, []);
  useEffect(() => {
    const onPop = () => setView(readView());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function go(next: View) {
    setView(next);
    window.history.pushState(null, "", viewUrl(next));
    window.scrollTo({ top: 0 });
  }
  const wide = !!view.encounter;
  const tab = (name: View["tab"], label: string) => (
    <button role="tab" aria-selected={view.tab === name} onClick={() => go({ tab: name, student: null, encounter: null })}
      className={`h-11 rounded-full px-5 text-sm font-semibold ${view.tab === name ? "bg-teal text-white" : "border border-line bg-card text-ink hover:border-ink"}`}>{label}</button>
  );
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-6 md:px-6 ${wide ? "max-w-[1600px]" : "max-w-5xl"}`}>
        <p className="font-semibold text-teal">Proxy · Faculty</p>
        <nav className="flex flex-wrap gap-4 text-sm font-semibold text-teal-deep"><a className="hover:underline" href="/faculty.html">Patient Studio</a><a className="hover:underline" href="/">Student view</a></nav>
      </header>
      <main className={`mx-auto px-4 pb-20 md:px-6 ${wide ? "max-w-[1600px]" : "max-w-5xl"}`}>
        {access === "checking" && <p className="text-ink-3" role="status">Checking faculty sign-in…</p>}
        {access === "denied" && <section className="rounded-[28px] border border-line bg-card p-7"><h1 className="font-display text-2xl">Faculty sign-in required</h1><p className="mt-3 text-ink-3">Sign in with a faculty account to review student assessments.</p><a href="/api/auth/login?destination=faculty" className="mt-5 inline-block rounded-full bg-teal px-5 py-3 text-sm font-semibold text-white">Sign in</a></section>}
        {access === "granted" && !LIVE && <p className="mb-6 rounded-2xl border border-amber-600/40 bg-amber-soft px-5 py-3 text-sm text-amber-900" role="note"><strong>Sample data.</strong> This shows a built-in sample plus encounters ended in this browser. Feedback is stored in this browser only.</p>}
        {access === "granted" && (view.encounter ? (
          <Review encounterId={view.encounter} backLabel={view.student ? "This student's assessments" : view.tab === "encounters" ? "All encounters" : "All students"}
            onBack={() => go({ ...view, encounter: null })} />
        ) : view.student ? (
          <Student studentId={view.student} onOpen={(encounter) => go({ ...view, encounter })} onBack={() => go({ tab: "students", student: null, encounter: null })} />
        ) : (
          <>
            <h1 className="font-display text-4xl text-ink">Student assessments</h1>
            <div role="tablist" aria-label="Browse by" className="mb-6 mt-5 flex gap-2">{tab("students", "Students")}{tab("encounters", "All encounters")}</div>
            {view.tab === "students"
              ? <Students onOpen={(student) => go({ tab: "students", student, encounter: null })} />
              : <Encounters onOpen={(encounter) => go({ ...view, encounter })} />}
          </>
        ))}
      </main>
    </div>
  );
}
