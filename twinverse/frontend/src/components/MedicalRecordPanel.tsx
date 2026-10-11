import { useEffect, useRef, useState } from "react";
import { fmtTime } from "../lib/format";
import type { Artifact, ChartEntry, ChartSection, PublicCase, RecordKind } from "../types";
import Icon from "./Icon";

const TABS: { id: ChartSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "meds", label: "Medications & allergies" },
  { id: "labs", label: "Labs & imaging" },
  { id: "notes", label: "Notes" },
];

const REQUESTS: { kind: RecordKind; label: string }[] = [
  { kind: "labs", label: "Laboratory results" },
  { kind: "notes", label: "Prior clinic notes" },
  { kind: "imaging", label: "Imaging reports" },
];

interface Props {
  patient: PublicCase;
  entries: ChartEntry[];
  seen: string[];
  notes: string;
  onNotes: (v: string) => void;
  onSeen: (ids: string[]) => void;
  onOpenArtifact: (a: Artifact) => void;
  onRequest: (k: RecordKind) => Promise<void>;
  disabled: boolean;
}

export default function MedicalRecordPanel({ patient, entries, seen, notes, onNotes, onSeen, onOpenArtifact, onRequest, disabled }: Props) {
  const [tab, setTab] = useState<ChartSection>("overview");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<RecordKind | null>(null);
  const [now, setNow] = useState(Date.now());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const unseen = (s: ChartSection) => entries.filter((e) => e.section === s && !seen.includes(e.id));
  useEffect(() => {
    const ids = unseen(tab).map((e) => e.id);
    if (!ids.length) return;
    const t = setTimeout(() => onSeen(ids), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, entries, seen]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const n = TABS[(i + d + TABS.length) % TABS.length];
    setTab(n.id);
    document.getElementById(`tab-${n.id}`)?.focus();
  };

  const list = entries.filter((e) => e.section === tab);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h2 className="font-display text-2xl text-ink">Patient chart</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {patient.patientName} · {patient.age} y · {patient.sex} · <span className="font-mono text-xs">{patient.mrn}</span>
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenu(!menu)}
            disabled={disabled}
            aria-expanded={menu}
            aria-haspopup="menu"
            className="flex h-10 items-center gap-2 rounded-full border border-teal/50 bg-teal-soft px-4 text-sm font-semibold text-teal-deep transition hover:border-teal disabled:opacity-50"
          >
            <Icon name="folder" size={16} /> Request records
          </button>
          {menu && (
            <div role="menu" className="anim-rise absolute right-0 top-12 z-20 w-60 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
              {REQUESTS.map((r) => (
                <button
                  key={r.kind}
                  role="menuitem"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(r.kind);
                    setMenu(false);
                    await onRequest(r.kind);
                    setBusy(null);
                  }}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-paper-2 disabled:opacity-50"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Patient chart sections" className="scroll-soft flex gap-1 overflow-x-auto border-b border-line px-5">
        {TABS.map((t, i) => {
          const on = tab === t.id;
          const dot = unseen(t.id).length > 0 && !on;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={on}
              aria-controls="chart-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`relative shrink-0 whitespace-nowrap px-3 pb-3 pt-2 text-[13px] font-semibold transition ${on ? "text-teal-deep" : "text-ink-3 hover:text-ink"}`}
            >
              {t.label}
              {dot && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-teal align-middle" aria-label="new information" />}
              {on && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-teal" />}
            </button>
          );
        })}
      </div>

      <div id="chart-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="scroll-soft min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {tab === "notes" && (
          <div className="mb-4">
            <label htmlFor="student-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">
              Your notes
            </label>
            <textarea
              id="student-notes"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={5}
              placeholder="Jot down observations, questions and thoughts as you go."
              className="w-full resize-y rounded-2xl border border-line bg-card px-4 py-3 text-[15px] leading-relaxed placeholder:text-ink-3 focus:border-teal"
            />
          </div>
        )}
        {list.length === 0 && tab !== "notes" && (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink-3">No information available in this section yet.</p>
        )}
        {list.length === 0 && tab === "notes" && <p className="text-sm text-ink-3">No information available in this section yet.</p>}
        <ul className="flex flex-col gap-3">
          {list.map((e) => {
            const fresh = now - e.disclosedAtMs < 6000;
            const isNew = !seen.includes(e.id);
            return (
              <li key={e.id} className={`rounded-2xl border border-line bg-card p-4 ${fresh ? "anim-arrive" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mr-auto text-[15px] font-semibold text-ink">{e.title}</h3>
                  {isNew && e.disclosedAt > 0 && <span className="rounded-full bg-teal px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">New</span>}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      e.source === "patient" ? "border border-teal/50 bg-teal-soft text-teal-deep" : "bg-ink text-white"
                    }`}
                  >
                    {e.source === "patient" ? "Patient reported" : "Clinical record"}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm leading-relaxed text-ink-2">
                  {e.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-ink-3">
                    <Icon name="clock" size={12} /> {e.disclosedAt === 0 ? "Available at start" : `Disclosed at ${fmtTime(e.disclosedAt)}`}
                  </span>
                  {e.artifact && (
                    <button
                      onClick={() => onOpenArtifact(e.artifact!)}
                      className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-teal-deep hover:border-teal"
                    >
                      <Icon name="file" size={13} /> Open {e.artifact.type.toLowerCase()}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
