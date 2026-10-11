import { useEffect, useState } from "react";
import type { Encounter } from "../previewApi.ts";
import { feedbackApi, LIVE } from "./feedbackApi.ts";
import FeedbackReport from "./FeedbackReport.tsx";
import type { FeedbackReport as Report } from "./types.ts";

export default function StudentFeedback({ encounter, onBack }: { encounter: Encounter; onBack: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const name = encounter.patient.fields.name;
  const questions = encounter.messages.filter((m) => m.role === "user").length;
  const subtitle = `${questions} question${questions === 1 ? "" : "s"} asked · ${encounter.messages.length} messages`;

  useEffect(() => {
    if (!questions) return;
    const controller = new AbortController();
    setReport(null); setError("");
    feedbackApi.studentReport({ encounterId: encounter.encounterId, patientName: name, messages: encounter.messages }, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setReport(next); })
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Feedback is unavailable."); });
    return () => controller.abort();
  }, [encounter.encounterId, encounter.revision, attempt]);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-6 md:px-6">
        <p className="font-semibold text-teal">Proxy · Student</p>
        <button onClick={onBack} className="h-11 rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink hover:border-ink">Back to patients</button>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 pb-20 md:px-6">
        {!report && (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">Encounter feedback</p>
            <h1 className="mt-3 font-display text-4xl leading-[1.05] text-ink md:text-5xl">{name}</h1>
            <p className="mt-3 text-ink-3">{subtitle}</p>
          </>
        )}
        <div className={report ? "" : "mt-8"}>
          {!questions ? (
            <section className="rounded-[28px] border border-line bg-card p-7"><h2 className="font-display text-2xl">Nothing to review yet</h2><p className="mt-3 text-ink-3">This encounter has no conversation. Start a new encounter and talk to the patient to receive feedback.</p></section>
          ) : error ? (
            <section className="rounded-[28px] border border-danger/40 bg-card p-7" role="alert"><h2 className="font-display text-2xl">Feedback is not available</h2><p className="mt-3 text-ink-2">{error}</p><p className="mt-1 text-sm text-ink-3">Your conversation is saved.</p><button onClick={() => setAttempt((n) => n + 1)} className="mt-5 h-11 rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-deep">Try again</button></section>
          ) : !report ? (
            <section className="rounded-[28px] border border-line bg-card p-10 text-center" role="status"><div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-4 border-teal/20 border-t-teal" aria-hidden="true" /><h2 className="font-display text-2xl">Reviewing your encounter</h2><p className="mt-3 text-ink-3">This can take up to a minute. Your conversation is saved.</p></section>
          ) : (
            <FeedbackReport report={report} messages={encounter.messages} patientName={name} viewer="student" sample={!LIVE} eyebrow="Encounter feedback" title={name} subtitle={subtitle} />
          )}
        </div>
      </main>
    </div>
  );
}
