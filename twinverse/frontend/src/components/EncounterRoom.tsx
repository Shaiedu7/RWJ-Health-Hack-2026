import { useEffect, useMemo, useRef, useState } from "react";
import { usePatientAudio } from "../hooks/usePatientAudio";
import { fmtTime } from "../lib/format";
import { SimulatedTranscriber, voiceAdapter } from "../services/voice";
import { elapsedSec, type Prefs, type ReplyEvent } from "../state/useEncounterStore";
import type { Artifact, AvatarState, Encounter, PublicCase, RecordKind } from "../types";
import ArtifactViewer from "./ArtifactViewer";
import ConversationPanel from "./ConversationPanel";
import EncounterActivity from "./EncounterActivity";
import Icon from "./Icon";
import MedicalRecordPanel from "./MedicalRecordPanel";
import MessageComposer from "./MessageComposer";
import Modal from "./Modal";
import PatientAudio from "./PatientAudio";
import PatientAvatar, { RoomBackdrop } from "./PatientAvatar";

interface Props {
  encounter: Encounter;
  patient: PublicCase;
  prefs: Prefs;
  pending: boolean;
  lastReply: ReplyEvent | null;
  saveStatus: "saved" | "saving";
  onAsk: (text: string) => void;
  onRequestRecord: (k: RecordKind) => Promise<{ message: string }>;
  onMarkSeen: (ids: string[]) => void;
  onNotes: (v: string) => void;
  onFinish: () => void;
  onBack: () => void;
}

const PREVIEW: AvatarState[] = ["idle", "listening", "speaking", "anxious", "wincing", "guarding", "relaxed"];

export default function EncounterRoom({ encounter, patient, prefs, pending, lastReply, saveStatus, onAsk, onRequestRecord, onMarkSeen, onNotes, onFinish, onBack }: Props) {
  const [now, setNow] = useState(Date.now());
  const [mobileTab, setMobileTab] = useState<"patient" | "chart">("patient");
  const [expanded, setExpanded] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [toast, setToast] = useState("");
  const [demo, setDemo] = useState(false);
  const [transient, setTransient] = useState<AvatarState | null>(null);
  const [preview, setPreview] = useState<AvatarState | null>(null);
  const handled = useRef<string | null>(null);

  const audio = usePatientAudio({ adapter: voiceAdapter, voiceEnabled: prefs.voiceEnabled });
  const transcriber = useMemo(() => new SimulatedTranscriber(() => patient.exampleQuestions), [patient]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!lastReply || handled.current === lastReply.id) return;
    handled.current = lastReply.id;
    setTransient(lastReply.behavior);
    void audio.play({ messageId: lastReply.message.id, text: lastReply.message.text, voiceId: patient.voiceId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastReply]);

  useEffect(() => {
    if (!transient || audio.status === "playing" || audio.status === "loading") return;
    const t = setTimeout(() => setTransient(null), 2800);
    return () => clearTimeout(t);
  }, [transient, audio.status]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => setPreview(null), 4500);
    return () => clearTimeout(t);
  }, [preview]);

  const patientMsgs = encounter.messages.filter((m) => m.role === "patient");
  const lastPatient = patientMsgs[patientMsgs.length - 1];
  const words = lastPatient?.text.split(" ") ?? [];
  const mine = audio.current?.messageId === lastPatient?.id;
  const shown = mine && audio.status === "playing" ? Math.ceil(audio.progress * words.length) : mine && audio.status === "loading" ? 0 : words.length;

  const avatarState: AvatarState = preview ?? transient ?? (pending ? "listening" : patient.baseline);
  const statusLabel = pending || audio.status === "loading" ? "Preparing response" : audio.status === "playing" ? "Speaking" : "Listening";

  const stopAll = () => {
    audio.stop();
    transcriber.cancel();
  };

  const request = async (k: RecordKind) => {
    const res = await onRequestRecord(k);
    setToast(res.message);
  };

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-card px-4 py-2.5 sm:px-6">
        <button
          onClick={() => {
            stopAll();
            onBack();
          }}
          className="flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink-2 hover:bg-paper-2"
        >
          <Icon name="back" size={16} /> <span className="hidden sm:inline">Back to cases</span>
        </button>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl text-ink">{patient.patientName}</h1>
          <span className="rounded-full bg-teal-soft px-3 py-1 text-xs font-semibold text-teal-deep">Simulated encounter</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-mono text-sm text-ink" aria-label="Elapsed time">
            <Icon name="clock" size={14} /> {fmtTime(elapsedSec(encounter, now))}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-3" role="status">
            {saveStatus === "saving" ? (
              <>
                <span className="anim-ring inline-block size-3 rounded-full border-2 border-ink-3 border-t-transparent" /> Saving…
              </>
            ) : (
              <>
                <Icon name="check" size={13} className="text-teal" /> Saved
              </>
            )}
          </span>
          <button onClick={() => setEndOpen(true)} className="h-10 rounded-full border border-ink bg-card px-5 text-sm font-semibold text-ink transition hover:bg-ink hover:text-white">
            End encounter
          </button>
        </div>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-line bg-card px-4 py-1.5 lg:hidden" role="tablist" aria-label="Workspace view">
        {(["patient", "chart"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={mobileTab === t} onClick={() => setMobileTab(t)} className={`flex-1 rounded-full py-2 text-sm font-semibold ${mobileTab === t ? "bg-ink text-white" : "text-ink-2"}`}>
            {t === "patient" ? "Patient" : "Chart"}
          </button>
        ))}
      </div>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[55fr_45fr]">
        {/* Patient interaction */}
        <section aria-label="Patient interaction" className={`${mobileTab === "patient" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          {!expanded && (
            <div className="relative h-[34vh] max-h-[370px] min-h-[240px] shrink-0 overflow-hidden border-b border-line">
              <RoomBackdrop />
              <PatientAvatar appearance={patient.appearance} state={avatarState} speaking={audio.status === "playing"} mouthLevelRef={audio.mouthRef} className="absolute inset-0 h-full w-full" />
              <div className="absolute left-4 top-4 flex items-center gap-3 rounded-full bg-card/90 py-1.5 pl-4 pr-3 shadow-sm backdrop-blur">
                <span className="font-display text-base text-ink">{patient.patientName}</span>
                <span className="flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-2" role="status">
                  <span className={`size-2 rounded-full ${statusLabel === "Speaking" ? "anim-rec bg-teal" : statusLabel === "Listening" ? "bg-teal" : "bg-amber-500"}`} />
                  {statusLabel}
                </span>
              </div>
              <div className="absolute right-4 top-4">
                <button onClick={() => setDemo(!demo)} aria-expanded={demo} className="flex h-9 items-center gap-2 rounded-full bg-card/90 px-3.5 text-xs font-semibold text-ink-2 shadow-sm backdrop-blur hover:text-ink">
                  <Icon name="sliders" size={14} /> Demo controls
                </button>
                {demo && (
                  <div className="anim-rise scroll-soft absolute right-0 top-11 z-20 max-h-[300px] w-80 overflow-y-auto rounded-2xl border border-line bg-card p-4 text-sm shadow-xl">
                    <p className="mb-3 text-xs text-ink-3">For demonstration only. Not part of the student workflow.</p>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">Example questions</h3>
                    <ul className="mb-4 flex flex-col gap-1">
                      {patient.exampleQuestions.map((q) => (
                        <li key={q}>
                          <button disabled={pending} onClick={() => onAsk(q)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-paper-2 disabled:opacity-50">
                            {q}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">Avatar preview</h3>
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {PREVIEW.map((s) => {
                        const ok = patient.allowedBehaviors.includes(s);
                        return (
                          <button
                            key={s}
                            disabled={!ok}
                            onClick={() => setPreview(preview === s ? null : s)}
                            aria-pressed={preview === s}
                            title={ok ? undefined : "Not part of this patient's profile"}
                            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize disabled:cursor-not-allowed disabled:opacity-35 ${preview === s ? "border-teal bg-teal-soft text-teal-deep" : "border-line text-ink-2 hover:border-teal"}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" checked={audio.simulateFailure} onChange={(e) => audio.setSimulateFailure(e.target.checked)} className="size-4 accent-teal" />
                      Simulate voice failure on next reply
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="shrink-0 border-b border-line bg-card px-5 py-3" aria-label="Captions">
            <p className="min-h-[3.1rem] text-[17px] leading-snug text-ink">
              {words.map((w, i) => (
                <span key={i} className={i < shown ? "" : "text-ink/25"}>
                  {w}{" "}
                </span>
              ))}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-between px-5 pb-0 pt-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">Conversation</h2>
            <button onClick={() => setExpanded(!expanded)} aria-pressed={expanded} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-teal-deep hover:bg-teal-soft">
              <Icon name={expanded ? "shrink" : "expand"} size={13} /> {expanded ? "Show patient" : "Expand transcript"}
            </button>
          </div>
          <div className="min-h-[120px] flex-1">
            <ConversationPanel messages={encounter.messages} patientName={patient.patientName} pending={pending} />
          </div>
          <MessageComposer
            onSend={onAsk}
            disabled={pending}
            transcriber={transcriber}
            onRecordStart={audio.stop}
            micAvailable={prefs.micEnabled}
            footer={<PatientAudio audio={audio} hasResponse={patientMsgs.length > 0} />}
          />
        </section>

        {/* Patient chart */}
        <section aria-label="Patient chart" className={`${mobileTab === "chart" ? "flex" : "hidden"} relative min-h-0 flex-col border-l border-line bg-paper lg:flex`}>
          <div className="min-h-0 flex-1">
            <MedicalRecordPanel
              patient={patient}
              entries={encounter.chart}
              seen={encounter.seen}
              notes={encounter.notes}
              onNotes={onNotes}
              onSeen={onMarkSeen}
              onOpenArtifact={setArtifact}
              onRequest={request}
              disabled={pending}
            />
          </div>
          <EncounterActivity events={encounter.activity} />
          {toast && (
            <div role="status" className="anim-rise absolute bottom-40 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-white shadow-xl">
              {toast}
            </div>
          )}
        </section>
      </main>

      <ArtifactViewer artifact={artifact} onClose={() => setArtifact(null)} />

      <Modal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="End encounter"
        describedBy="end-desc"
        footer={
          <>
            <button onClick={() => setEndOpen(false)} className="h-11 rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-ink">
              Continue encounter
            </button>
            <button
              onClick={() => {
                stopAll();
                setEndOpen(false);
                onFinish();
              }}
              className="h-11 rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-deep"
            >
              Finish and review
            </button>
          </>
        }
      >
        <p id="end-desc" className="text-[15px] leading-relaxed text-ink-2">
          Finish this encounter and generate feedback?
        </p>
      </Modal>
    </div>
  );
}
