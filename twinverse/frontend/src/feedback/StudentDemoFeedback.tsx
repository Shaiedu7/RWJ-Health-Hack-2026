import { useEffect, useState } from "react";
import { feedbackApi, LIVE } from "./feedbackApi.ts";
import FeedbackReport from "./FeedbackReport.tsx";
import type { ReviewDetail } from "./types.ts";

/** The student's view of a demo encounter, at /feedback/student?encounter=<id>. Sample data only. */
export default function StudentDemoFeedback() {
  const encounterId = new URLSearchParams(window.location.search).get("encounter") ?? "";
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState(LIVE ? "This page shows demo encounters only." : "");
  useEffect(() => {
    if (LIVE) return;
    feedbackApi.review(encounterId).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : "Feedback is unavailable."));
  }, [encounterId]);
  const questions = detail?.messages.filter((m) => m.role === "user").length ?? 0;
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-6 md:px-6">
        <p className="font-semibold text-teal">Proxy · Student</p>
        <a href="/" className="flex h-11 items-center rounded-full border border-line bg-card px-5 text-sm font-semibold text-ink hover:border-ink">Back to patients</a>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 pb-20 md:px-6">
        {error && <p className="rounded-2xl border border-danger/40 bg-card p-4 text-danger" role="alert">{error}</p>}
        {!detail && !error && <p className="text-ink-3" role="status">Loading feedback…</p>}
        {detail && <FeedbackReport report={detail.report} messages={detail.messages} patientName={detail.entry.patientName} viewer="student" sample={!LIVE} eyebrow="Encounter feedback" title={detail.entry.patientName} subtitle={`${questions} question${questions === 1 ? "" : "s"} asked · ${detail.messages.length} messages`} />}
      </main>
    </div>
  );
}
