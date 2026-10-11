import { useCallback, useEffect, useRef, useState } from "react";
import { encounterService } from "../services/encounterService";
import type { ActivityEvent, AvatarState, ChartEntry, Encounter, Message, RecordKind, Release } from "../types";

export type View = "cases" | "setup" | "room" | "feedback";
export interface Prefs {
  voiceEnabled: boolean;
  micEnabled: boolean;
}
interface Persisted {
  view: View;
  setupCaseId?: string;
  encounter?: Encounter;
  prefs: Prefs;
}
export interface ReplyEvent {
  id: string;
  message: Message;
  behavior: AvatarState;
}

const KEY = "patientroom.demo.v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    /* ignore corrupt storage */
  }
  return { view: "cases", prefs: { voiceEnabled: true, micEnabled: true } };
}

const SECTION_LABEL: Record<string, string> = {
  overview: "Overview",
  history: "History",
  meds: "Medications & allergies",
  labs: "Labs & imaging",
  notes: "Notes",
};

export const elapsedSec = (e: Encounter, now = Date.now()) => Math.max(0, Math.floor(((e.endedAt ?? now) - e.startedAt) / 1000));

export function useEncounterStore() {
  const [state, setState] = useState<Persisted>(load);
  const [phase, setPhase] = useState<"preparing" | "assessing" | null>(null);
  const [pending, setPending] = useState(false);
  const [lastReply, setLastReply] = useState<ReplyEvent | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const ref = useRef(state);
  ref.current = state;
  const first = useRef(true);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveStatus("saving");
    const t = setTimeout(() => setSaveStatus("saved"), 650);
    return () => clearTimeout(t);
  }, [state]);

  const patchEncounter = useCallback((fn: (e: Encounter) => Encounter) => {
    setState((s) => (s.encounter ? { ...s, encounter: fn(s.encounter) } : s));
  }, []);

  const stamp = (releases: Release[], t: number): ChartEntry[] =>
    releases.map((r) => ({ ...r, id: uid(), disclosedAt: t, disclosedAtMs: Date.now() }));

  const activityFor = (entries: ChartEntry[], t: number): ActivityEvent[] =>
    entries.map((e) => ({
      id: uid(),
      t,
      kind: e.artifact ? "record" : "info",
      label: e.artifact ? `Record released: ${e.artifact.type}` : `Added to chart: ${SECTION_LABEL[e.section]}`,
    }));

  const runAssessment = useCallback(async (enc: Encounter) => {
    setPhase("assessing");
    const feedback = await encounterService.assess(enc.session, enc.messages, elapsedSec(enc));
    setState((s) => (s.encounter ? { ...s, view: "feedback", encounter: { ...s.encounter, feedback } } : s));
    setPhase(null);
  }, []);

  useEffect(() => {
    const e = ref.current.encounter;
    if (e?.status === "finished" && !e.feedback && ref.current.view === "room") void runAssessment(e);
  }, [runAssessment]);

  const openSetup = (caseId: string) => setState((s) => ({ ...s, view: "setup", setupCaseId: caseId }));
  const setPrefs = (prefs: Prefs) => setState((s) => ({ ...s, prefs }));
  const backToCases = () => setState((s) => ({ ...s, view: "cases" }));
  const resume = () => setState((s) => ({ ...s, view: s.encounter?.feedback ? "feedback" : "room" }));

  const begin = async (caseId: string, prefs: Prefs) => {
    setState((s) => ({ ...s, prefs }));
    setPhase("preparing");
    const res = await encounterService.start(caseId);
    const startedAt = Date.now();
    const opening: Message = { id: uid(), role: "patient", text: res.opening.text, t: 0, topic: "opening", behavior: res.opening.behavior };
    const chart = stamp(res.chart, 0);
    const enc: Encounter = {
      id: uid(),
      caseId,
      status: "active",
      startedAt,
      messages: [opening],
      chart,
      activity: [{ id: uid(), t: 0, kind: "start", label: "Encounter started" }],
      session: res.session,
      seen: chart.map((c) => c.id),
      notes: "",
    };
    setLastReply({ id: opening.id, message: opening, behavior: res.opening.behavior });
    setState((s) => ({ ...s, view: "room", encounter: enc }));
    setPhase(null);
  };

  const ask = async (text: string) => {
    const enc = ref.current.encounter;
    if (!enc || enc.status !== "active" || pending || !text.trim()) return;
    const t = elapsedSec(enc);
    const q: Message = { id: uid(), role: "student", text: text.trim(), t };
    patchEncounter((e) => ({ ...e, messages: [...e.messages, q] }));
    setPending(true);
    const res = await encounterService.ask(enc.session, q.text);
    const t2 = elapsedSec(enc);
    const reply: Message = { id: uid(), role: "patient", text: res.reply.text, t: t2, topic: res.reply.topic, hesitant: res.reply.hesitant, behavior: res.reply.behavior };
    const entries = stamp(res.releases, t2);
    patchEncounter((e) => ({
      ...e,
      session: res.session,
      messages: [...e.messages, reply],
      chart: [...e.chart, ...entries],
      activity: [...e.activity, ...activityFor(entries, t2)],
    }));
    setPending(false);
    setLastReply({ id: reply.id, message: reply, behavior: res.reply.behavior });
  };

  const requestRecord = async (kind: RecordKind) => {
    const enc = ref.current.encounter;
    if (!enc || enc.status !== "active") return { status: "unavailable" as const, message: "" };
    const res = await encounterService.requestRecord(enc.session, kind);
    const t = elapsedSec(enc);
    const entries = res.release ? stamp([res.release], t) : [];
    const label = { labs: "laboratory results", notes: "prior notes", imaging: "imaging reports" }[kind];
    patchEncounter((e) => ({
      ...e,
      session: res.session,
      chart: [...e.chart, ...entries],
      activity: [
        ...e.activity,
        { id: uid(), t, kind: "record", label: res.status === "released" ? `Requested ${label}` : `Requested ${label}: not released` },
        ...(entries.length ? activityFor(entries, t) : []),
      ],
    }));
    return res;
  };

  const markSeen = (ids: string[]) =>
    patchEncounter((e) => (ids.every((i) => e.seen.includes(i)) ? e : { ...e, seen: [...new Set([...e.seen, ...ids])] }));
  const setNotes = (notes: string) => patchEncounter((e) => ({ ...e, notes }));

  const finish = () => {
    const enc = ref.current.encounter;
    if (!enc) return;
    const ended: Encounter = {
      ...enc,
      status: "finished",
      endedAt: Date.now(),
      activity: [...enc.activity, { id: uid(), t: elapsedSec(enc), kind: "end", label: "Encounter ended" }],
    };
    setState((s) => ({ ...s, encounter: ended }));
    void runAssessment(ended);
  };

  const tryAgain = () => {
    const caseId = ref.current.encounter?.caseId;
    setState((s) => ({ ...s, view: "setup", setupCaseId: caseId, encounter: undefined }));
    setLastReply(null);
  };

  return { state, phase, pending, lastReply, saveStatus, openSetup, setPrefs, backToCases, resume, begin, ask, requestRecord, markSeen, setNotes, finish, tryAgain };
}
