import { getPublicCase } from "../data/publicCases";
import { RAPPORT, scripts, type CaseScript } from "../mock/scripts";
import type {
  AskResult,
  Feedback,
  FeedbackItem,
  Message,
  PublicCase,
  RecordKind,
  RecordResult,
  ServiceSession,
  StartResult,
} from "../types";
import { publicCases } from "../data/publicCases";

/**
 * Boundary between the student UI and the backend.
 * Production: FastAPI endpoints (POST /encounters, /encounters/{id}/ask, /records, /finish) that call
 * AWS Bedrock for dialogue, persist state in DynamoDB and read artifacts from S3. The real client must only receive released content. This demo imports hidden scripted data
 * into the browser bundle. The separate src/integration client is the proposed real API boundary.
 */
export interface EncounterService {
  listCases(): PublicCase[];
  start(caseId: string): Promise<StartResult>;
  ask(session: ServiceSession, text: string): Promise<AskResult>;
  requestRecord(session: ServiceSession, kind: RecordKind): Promise<RecordResult>;
  assess(session: ServiceSession, messages: Message[], durationSec: number): Promise<Feedback>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OPEN_Q = /^\s*(what|how|tell me|can you tell|could you tell|can you describe|could you describe|describe|walk me|help me understand)\b/i;
const CLOSING = /(anything else|summar|to make sure i|did i (miss|forget)|any questions|questions for me|next steps|what we.ll do)/i;

export const isOpenQuestion = (text: string) => OPEN_Q.test(text);

const script = (id: string): CaseScript => scripts[id] ?? scripts[publicCases[0].id];

class MockEncounterService implements EncounterService {
  listCases() {
    return publicCases;
  }

  async start(caseId: string): Promise<StartResult> {
    const s = script(caseId);
    await sleep(2200);
    return {
      session: { caseId, asked: {}, disclosed: [], rapport: false, records: [] },
      opening: s.opening,
      chart: s.initialChart,
    };
  }

  async ask(session: ServiceSession, text: string): Promise<AskResult> {
    const s = script(session.caseId);
    const profile = getPublicCase(session.caseId);
    const q = text.toLowerCase();
    const next: ServiceSession = { ...session, asked: { ...session.asked }, disclosed: [...session.disclosed] };
    const gotRapport = RAPPORT.test(q);
    if (gotRapport) next.rapport = true;
    const allow = (b: AvatarState | undefined): AvatarState =>
      b && profile.allowedBehaviors.includes(b) ? b : "idle";

    await sleep(900 + Math.random() * 500);

    const topic = s.topics.find((t) => t.category !== "rapport" && t.patterns.some((p) => p.test(text)));
    if (!topic) {
      if (gotRapport) {
        const r = s.topics.find((t) => t.category === "rapport")!;
        next.asked.rapport = (next.asked.rapport ?? 0) + 1;
        return { session: next, reply: { text: r.reply, behavior: allow(r.behavior), topic: "rapport", hesitant: false }, releases: [] };
      }
      const n = next.asked.unknown ?? 0;
      next.asked.unknown = n + 1;
      return {
        session: next,
        reply: { text: s.fallbacks[n % s.fallbacks.length], behavior: allow("idle"), topic: "unknown", hesitant: false },
        releases: [],
      };
    }

    const count = next.asked[topic.id] ?? 0;
    next.asked[topic.id] = count + 1;
    if (topic.hesitant && count === 0 && !next.rapport) {
      return {
        session: next,
        reply: { text: topic.hesitant.text, behavior: allow(topic.behavior), topic: topic.id, hesitant: true },
        releases: [],
      };
    }
    const fresh = !next.disclosed.includes(topic.id);
    if (fresh) next.disclosed.push(topic.id);
    return {
      session: next,
      reply: { text: topic.reply, behavior: allow(topic.behavior), topic: topic.id, hesitant: false },
      releases: fresh ? (topic.releases ?? []) : [],
    };
  }

  async requestRecord(session: ServiceSession, kind: RecordKind): Promise<RecordResult> {
    const s = script(session.caseId);
    const rec = s.records[kind];
    await sleep(700);
    if (!rec) return { session, status: "unavailable", message: "No matching records on file for this patient." };
    if (session.records.includes(kind)) return { session, status: "already", message: "This record has already been added to the chart." };
    if (!rec.requires.every((t) => session.disclosed.includes(t))) {
      return { session, status: "notReady", message: "This record can't be released yet. Continue the interview and try again." };
    }
    return {
      session: { ...session, records: [...session.records, kind], disclosed: [...session.disclosed, `record:${kind}`] },
      status: "released",
      message: `Released: ${rec.release.artifact?.title ?? rec.release.title}`,
      release: rec.release,
    };
  }

  async assess(session: ServiceSession, messages: Message[], durationSec: number): Promise<Feedback> {
    await sleep(2400);
    return buildFeedback(script(session.caseId), session, messages, durationSec);
  }
}

import type { AvatarState } from "../types";

function buildFeedback(s: CaseScript, session: ServiceSession, messages: Message[], durationSec: number): Feedback {
  const students = messages.filter((m) => m.role === "student");
  const patientTopic = messages.filter((m) => m.role === "patient" && m.topic && m.topic !== "opening");
  const evidenceFor = (topics: string[]) =>
    patientTopic.filter((m) => topics.includes(m.topic!) && !m.hesitant).map((m) => m.id).slice(0, 2);

  const hit = (id: string) => {
    const f = s.keyFindings.find((k) => k.id === id)!;
    return f.topics.some((t) => session.disclosed.includes(t));
  };
  const elicited: FeedbackItem[] = s.keyFindings
    .filter((f) => hit(f.id))
    .map((f) => ({ text: f.label, detail: f.detail, evidence: evidenceFor(f.topics) }));
  const missed = s.keyFindings.filter((f) => !hit(f.id)).map((f) => ({ label: f.label, hint: f.askHint }));

  const objectives = s.objectives.map((o) => {
    const n = o.findings.filter(hit).length;
    return { text: o.text, status: (n === o.findings.length ? "observed" : n > 0 ? "partial" : "notObserved") as "observed" | "partial" | "notObserved" };
  });

  const good: FeedbackItem[] = [];
  const improve: FeedbackItem[] = [];
  const structure: FeedbackItem[] = [];
  const communication: FeedbackItem[] = [];

  if (students.length === 0) {
    structure.push({ text: "No questions were asked, so there is no interview structure to review." });
  } else {
    const first = students[0];
    const firstReply = messages[messages.indexOf(first) + 1];
    const evFirst = firstReply?.role === "patient" ? [firstReply.id] : undefined;
    if (isOpenQuestion(first.text)) {
      const it = { text: "You opened with an open-ended question, inviting the patient to tell their story.", evidence: evFirst };
      structure.push(it);
      good.push(it);
    } else {
      const it = { text: "Your first question was closed or narrow. An open opener usually draws out more of the patient's own account.", evidence: evFirst };
      structure.push(it);
      improve.push(it);
    }

    const cat = (m: Message) => s.topics.find((t) => t.id === m.topic)?.category;
    const order = patientTopic.filter((m) => cat(m) === "hpi" || cat(m) === "background");
    const firstHpi = order.findIndex((m) => cat(m) === "hpi");
    const firstBg = order.findIndex((m) => cat(m) === "background");
    if (firstHpi >= 0 && firstBg >= 0) {
      if (firstHpi < firstBg) {
        const it = { text: "You explored the presenting concern before moving into background history, a logical progression.", evidence: [order[firstHpi].id, order[firstBg].id] };
        structure.push(it);
        good.push(it);
      } else {
        const it = { text: "You moved into background topics before characterising the main concern. Settling the presenting problem first keeps the interview anchored.", evidence: [order[firstBg].id, order[firstHpi].id] };
        structure.push(it);
        improve.push(it);
      }
    } else if (firstHpi < 0 && order.length) {
      improve.push({ text: "The interview focused on background topics without fully characterising the presenting concern." });
    }

    const last = students[students.length - 1];
    if (students.length >= 4 && CLOSING.test(last.text)) {
      const it = { text: "You closed by summarising or inviting questions, which helps the patient feel heard." };
      structure.push(it);
      good.push(it);
    } else if (students.length >= 4) {
      const it = { text: "The encounter ended without a summary or an invitation for the patient to add anything. Closing this way often surfaces missed concerns." };
      structure.push(it);
      improve.push(it);
    }

    const rapportMsgs = messages.filter((m) => m.role === "patient" && m.topic === "rapport");
    if (rapportMsgs.length) {
      const it = { text: "You acknowledged how the patient was feeling, and the patient became more open afterwards.", evidence: [rapportMsgs[0].id] };
      communication.push(it);
      good.push(it);
    } else {
      const it = { text: "You did not acknowledge the patient's feelings. A brief empathic statement can change how much a hesitant patient shares." };
      communication.push(it);
      improve.push(it);
    }

    const hesitantMsg = messages.find((m) => m.role === "patient" && m.hesitant);
    if (hesitantMsg) {
      const later = patientTopic.find((m) => m.topic === hesitantMsg.topic && !m.hesitant && messages.indexOf(m) > messages.indexOf(hesitantMsg));
      if (later) {
        const it = { text: "When the patient hesitated, you returned to the topic respectfully and they shared more.", evidence: [hesitantMsg.id, later.id] };
        communication.push(it);
        good.push(it);
      } else {
        const it = { text: "The patient hesitated on a topic and the conversation moved on. A gentle second ask can open sensitive subjects.", evidence: [hesitantMsg.id] };
        communication.push(it);
        improve.push(it);
      }
    }

    const open = students.filter((m) => isOpenQuestion(m.text)).length;
    communication.push({ text: `You asked ${open} open-ended and ${students.length - open} narrower question${students.length - open === 1 ? "" : "s"}. A blend of both is usually effective.` });
    const avg = students.reduce((a, m) => a + m.text.split(/\s+/).length, 0) / students.length;
    if (avg <= 14) {
      const it = { text: "Your questions were short and focused, easy for the patient to answer." };
      communication.push(it);
      good.push(it);
    } else {
      const it = { text: "Several questions were long or combined multiple asks. Asking one thing at a time keeps answers clear." };
      communication.push(it);
      improve.push(it);
    }
    const unknown = messages.filter((m) => m.role === "patient" && m.topic === "unknown");
    if (unknown.length >= 2) {
      improve.push({ text: "The patient could not interpret several questions. Rephrase plainly if you do not get an answer.", evidence: unknown.map((m) => m.id).slice(0, 2) });
    }
  }

  elicited.slice(0, 2).forEach((e) => good.push({ text: `You elicited the ${e.detail}.`, evidence: e.evidence }));
  missed.slice(0, 3).forEach((m) => improve.push({ text: m.hint }));

  const mins = Math.max(1, Math.round(durationSec / 60));
  const names = elicited.slice(0, 3).map((e) => e.detail).join(", ");
  const summary =
    `${s.summaryIntro} Over about ${mins} minute${mins === 1 ? "" : "s"} you asked ${students.length} question${students.length === 1 ? "" : "s"}.` +
    (elicited.length ? ` You gathered information on ${names}${elicited.length > 3 ? " and more" : ""}.` : " No key information was gathered.") +
    (missed.length ? " Some important areas were not explored; they are listed below." : " You covered every key area for this case.");

  return { summary, objectives, elicited, missed, structure, communication, strengths: good, improvements: improve, next: s.nextTips };
}

export const encounterService: EncounterService = new MockEncounterService();
export type { RecordKind };
