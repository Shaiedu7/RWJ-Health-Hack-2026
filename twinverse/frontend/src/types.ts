export type AvatarState =
  | "idle"
  | "listening"
  | "speaking"
  | "anxious"
  | "wincing"
  | "guarding"
  | "relaxed";

export type ChartSection = "overview" | "history" | "meds" | "labs" | "notes";
export type InfoSource = "patient" | "record";
export type RecordKind = "labs" | "notes" | "imaging";

export interface Appearance {
  skin: string;
  skinShade: string;
  hair: string;
  brow: string;
  hairStyle: "bun" | "short";
  glasses: boolean;
  stubble: boolean;
  top: string;
  topShade: string;
}

export type ArtifactBlock =
  | { kind: "text"; heading?: string; body: string[] }
  | { kind: "table"; heading?: string; columns: string[]; rows: string[][]; flagCol?: number };

export interface Artifact {
  id: string;
  title: string;
  type: string;
  date: string;
  source: string;
  blocks: ArtifactBlock[];
}

/** Everything the student UI may know about a case before the encounter (no hidden facts). */
export interface PublicCase {
  id: string;
  patientName: string;
  age: number;
  sex: string;
  mrn: string;
  dob: string;
  appearance: Appearance;
  encounterType: string;
  setting: string;
  concern: string;
  durationMin: number;
  intro: string;
  voiceId: string;
  voiceLabel: string;
  baseline: AvatarState;
  allowedBehaviors: AvatarState[];
  exampleQuestions: string[];
}

export interface Release {
  section: ChartSection;
  title: string;
  lines: string[];
  source: InfoSource;
  artifact?: Artifact;
}

export interface ChartEntry extends Release {
  id: string;
  disclosedAt: number;
  disclosedAtMs: number;
}

export interface Message {
  id: string;
  role: "student" | "patient";
  text: string;
  t: number;
  topic?: string;
  hesitant?: boolean;
  behavior?: AvatarState;
}

export interface ActivityEvent {
  id: string;
  t: number;
  label: string;
  kind: "start" | "info" | "record" | "end";
}

/** Demo-only browser session state. Never send this structure to the real backend. */
export interface ServiceSession {
  caseId: string;
  asked: Record<string, number>;
  disclosed: string[];
  rapport: boolean;
  records: RecordKind[];
}

export interface FeedbackItem {
  text: string;
  detail?: string;
  evidence?: string[];
}

export interface Feedback {
  summary: string;
  objectives: { text: string; status: "observed" | "partial" | "notObserved" }[];
  elicited: FeedbackItem[];
  missed: { label: string; hint: string }[];
  structure: FeedbackItem[];
  communication: FeedbackItem[];
  strengths: FeedbackItem[];
  improvements: FeedbackItem[];
  next: string[];
}

export interface Encounter {
  id: string;
  caseId: string;
  status: "active" | "finished";
  startedAt: number;
  endedAt?: number;
  messages: Message[];
  chart: ChartEntry[];
  activity: ActivityEvent[];
  session: ServiceSession;
  seen: string[];
  notes: string;
  feedback?: Feedback;
}

export interface AskResult {
  session: ServiceSession;
  reply: { text: string; behavior: AvatarState; topic: string; hesitant: boolean };
  releases: Release[];
}

export interface RecordResult {
  session: ServiceSession;
  status: "released" | "notReady" | "unavailable" | "already";
  message: string;
  release?: Release;
}

export interface StartResult {
  session: ServiceSession;
  opening: { text: string; behavior: AvatarState };
  chart: Release[];
}
