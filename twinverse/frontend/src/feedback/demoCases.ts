/**
 * Three hand-written demo encounters shown on the faculty page until the scoring backend exists.
 * Each report is written for its own three-question transcript and scored against the
 * Virtual Patient Encounter Rubric; nothing here is generated.
 */
import type { FeedbackReport, Importance, ObjectiveResult, RubricScore, TranscriptMessage } from "./types.ts";

export interface DemoCase {
  encounterId: string;
  studentName: string;
  patientName: string;
  messages: TranscriptMessage[];
  report: FeedbackReport;
}

const SCALE: Record<RubricScore, string> = { 3: "Exceeds expectations", 2: "Meets expectations", 1: "Below expectations" };
type RubricItem = { itemId: string; name: string; prompt: string; levels: Record<RubricScore, string> };
const RUBRIC: { sectionId: string; name: string; items: RubricItem[] }[] = [
  { sectionId: "0", name: "Introduction", items: [
    { itemId: "0.1", name: "Introduction / Rapport Building", prompt: "Did the student introduce themselves and set a comfortable tone before clinical questions?", levels: {
      3: "Introduces self (name, role); greets warmly; establishes purpose and agenda; confirms the patient's immediate concern.",
      2: "Brief introduction, moves quickly into questions without building rapport.",
      1: "No introduction; jumps straight into questioning." } },
  ] },
  { sectionId: "1", name: "History Assessment", items: [
    { itemId: "1.1", name: "General HPI", prompt: "Character, location, onset, duration, prior history, radiation, intensity, trigger/improvement, setting, social impact.", levels: {
      3: "Asks 7+ of the 10 items.", 2: "Asks 4–6 of the 10 items.", 1: "Asks 0–3 of the 10 items." } },
    { itemId: "1.2", name: "Case-Specific History", prompt: "Faculty-defined associated symptoms the student should ask about.", levels: {
      3: "Asks about the majority of case-specific symptoms (≥70%).", 2: "Asks about some (30–69%).", 1: "Asks about few or none (<30%)." } },
    { itemId: "1.3", name: "Medical History", prompt: "PMH, PSH, medications, allergies, social history, family history.", levels: {
      3: "Asks about 5–6 categories.", 2: "Asks about 3–4 categories.", 1: "Asks about 0–2 categories." } },
  ] },
  { sectionId: "2", name: "Closing / Counseling", items: [
    { itemId: "2.1", name: "Differential Diagnosis Discussion", prompt: "Did the student share their thinking about what might be going on?", levels: {
      3: "Discusses 3+ appropriate differential diagnoses with the patient.", 2: "Discusses 1–2 appropriate differentials.", 1: "Does not discuss, or discusses incorrect diagnoses." } },
    { itemId: "2.2", name: "Next Steps / Workup", prompt: "Did the student explain what tests or studies they'd recommend?", levels: {
      3: "Explains all expected next steps (labs, imaging, other tests).", 2: "Missing 1–2 key next steps.", 1: "Does not discuss next steps." } },
    { itemId: "2.3", name: "Treatment / Medications", prompt: "Did the student discuss a treatment plan?", levels: {
      3: "Explains an appropriate treatment plan, including side effects, in patient-friendly language.", 2: "Discusses treatment but components are not appropriate or first-line.", 1: "Does not discuss treatment." } },
    { itemId: "2.4", name: "Diagnostic Convergence", prompt: "Did the student's questioning progressively narrow toward a plausible assessment?", levels: {
      3: "Questions build on each other; reasoning visibly converges; closing reflects what was gathered.", 2: "Some evidence of narrowing, but with gaps in the logical chain.", 1: "No visible narrowing; closing does not follow from what was gathered." } },
  ] },
  { sectionId: "3", name: "Organization / Efficiency", items: [
    { itemId: "3.1", name: "Organization of Encounter", prompt: "Did the interview follow a logical structure?", levels: {
      3: "Systematic interview; questions flow logically.", 2: "Mostly organized but a few questions out of order or jumping between topics.", 1: "Interview out of sequence, difficult to follow thought process." } },
    { itemId: "3.2", name: "Efficiency / Pace", prompt: "Did the conversation flow without unnecessary repetition?", levels: {
      3: "Conversation flows well, no unnecessary repetition, builds on prior answers.", 2: "Occasionally re-asks something or does not build on an answer.", 1: "Goes in circles; fails to build on information provided." } },
  ] },
  { sectionId: "4", name: "Communication Quality", items: [
    { itemId: "4.1", name: "Empathy / Rapport", prompt: "Did the student acknowledge patient concerns and build trust?", levels: {
      3: "Acknowledges concerns; validates feelings; shows warmth; patient appears heard.", 2: "Some empathetic responses but inconsistent, formulaic or rushed.", 1: "No acknowledgment of emotions; dismissive or judgmental communication." } },
    { itemId: "4.2", name: "Question Quality", prompt: "Did the student use effective questioning techniques?", levels: {
      3: "Good mix of open-ended and focused follow-up questions; clinically relevant.", 2: "Mostly closed questions but some open-ended ones.", 1: "Almost entirely closed or leading questions; feels like an interrogation." } },
    { itemId: "4.3", name: "Clarity / Professionalism", prompt: "Did the student communicate clearly and maintain professional boundaries?", levels: {
      3: "Patient-friendly language; professional tone; communicates limitations.", 2: "Occasional unexplained jargon or slightly informal tone.", 1: "Unprofessional or confusing language; overstates certainty." } },
    { itemId: "4.4", name: "Handling Sensitive Topics", prompt: "Did the student approach sensitive areas with appropriate framing?", levels: {
      3: "Approaches sensitive topics with appropriate framing and non-judgment.", 2: "Asks about sensitive topics bluntly or without framing, or raises few of them.", 1: "Avoids sensitive topics entirely or handles them inappropriately." } },
    { itemId: "4.5", name: "Listening & Response to Cues", prompt: "Did the student pick up on verbal cues, concerns, and changes in the patient's story?", levels: {
      3: "Recognizes cues and concerns; follows up on important information.", 2: "Responds to obvious cues but overlooks subtler concerns.", 1: "Ignores, contradicts, or prematurely redirects important information." } },
    { itemId: "4.6", name: "Clinical Reasoning & Synthesis", prompt: "Did the student demonstrate sound clinical thinking during the encounter?", levels: {
      3: "Identifies important findings; reasoning is clinically coherent and appropriately cautious.", 2: "Recognizes some key findings but misses connections, alternatives, or uncertainty.", 1: "Reasoning is unsupported, unsafe, or absent when required." } },
  ] },
];

/** Student turns are numbered 1–3; a citation is the nth thing the student said. */
type Turn = 1 | 2 | 3;
interface Spec {
  encounterId: string;
  studentName: string;
  patientName: string;
  completedAt: string;
  /** Alternating student, patient lines. */
  lines: string[];
  summary: string;
  /** Keyed by rubric item ID. */
  scores: Record<string, [score: RubricScore, rationale: string, turns: Turn[]]>;
  objectives: [text: string, outcome: ObjectiveResult["outcome"], explanation: string, turns: Turn[]][];
  elicited: [label: string, importance: Importance, turns: Turn[]][];
  missed: [label: string, importance: Importance, explanation: string][];
  strengths: [text: string, turns: Turn[]][];
  improvements: [text: string, suggestion: string, turns: Turn[]][];
  suggestions: string[];
  annotations: [turn: Turn, sentiment: "strength" | "improvement", comment: string][];
}

function build(spec: Spec): DemoCase {
  const end = Date.parse(spec.completedAt);
  const messages: TranscriptMessage[] = spec.lines.map((text, i) => ({
    id: `${spec.encounterId}-${i + 1}`,
    role: i % 2 === 0 ? "user" : "assistant",
    text,
    sequence: i + 1,
    createdAt: new Date(end - (spec.lines.length - 1 - i) * 40_000).toISOString(),
  }));
  const ids = (turns: Turn[]) => turns.map((n) => `${spec.encounterId}-${n * 2 - 1}`);
  const sections = RUBRIC.map((section) => ({ sectionId: section.sectionId, name: section.name, items: section.items.map((item) => {
    const scored = spec.scores[item.itemId];
    if (!scored) throw new Error(`Demo case ${spec.encounterId} has no score for ${item.itemId}.`);
    const [score, rationale, turns] = scored;
    return { itemId: item.itemId, name: item.name, prompt: item.prompt, score, descriptor: item.levels[score], rationale, evidenceMessageIds: ids(turns) };
  }) }));
  const all = sections.flatMap((s) => s.items);
  const report: FeedbackReport = {
    reportId: `demo-report-${spec.encounterId}`,
    encounterId: spec.encounterId,
    generatedAt: spec.completedAt,
    rubricName: "Virtual Patient Encounter Rubric",
    scale: SCALE,
    totalScore: all.reduce((sum, i) => sum + i.score, 0),
    maxScore: all.length * 3,
    reviewFlags: all.filter((i) => i.score === 1 && (i.itemId === "4.3" || i.itemId === "4.6")).map((i) => `${i.name} scored 1. Faculty review is recommended.`),
    summary: spec.summary,
    sections,
    learningObjectives: spec.objectives.map(([text, outcome, explanation, turns], i) => ({ objectiveId: `lo-${i + 1}`, text, outcome, explanation, evidenceMessageIds: ids(turns) })),
    findings: {
      elicited: spec.elicited.map(([label, importance, turns]) => ({ label, importance, evidenceMessageIds: ids(turns) })),
      missed: spec.missed.map(([label, importance, explanation]) => ({ label, importance, explanation })),
    },
    strengths: spec.strengths.map(([text, turns]) => ({ text, evidenceMessageIds: ids(turns) })),
    improvements: spec.improvements.map(([text, suggestion, turns]) => ({ text, suggestion, evidenceMessageIds: ids(turns) })),
    suggestions: spec.suggestions,
    annotations: spec.annotations.map(([turn, sentiment, comment]) => ({ messageId: ids([turn])[0]!, sentiment, comment })),
    facultyComments: [],
  };
  return { encounterId: spec.encounterId, studentName: spec.studentName, patientName: spec.patientName, messages, report };
}

const WYATT_OBJECTIVES = [
  "Open the encounter in a way that puts a shy adolescent at ease.",
  "Ask about bowel habits and medication adherence without judgment.",
  "Counsel on diabetes management in developmentally appropriate language.",
];

const goodWyatt = build({
  encounterId: "00000000-0000-4000-8000-000000000101",
  studentName: "Shaied (first-year)",
  patientName: "Wyatt Nelson",
  completedAt: "2026-10-11T14:30:00Z",
  lines: [
    "Hi Wyatt, I'm Shaied, a first-year medical student. I'd like to hear how things have been going and then we'll make a plan together — how are you feeling today?",
    "Okay, I guess. Kind of tired lately, and I'm thirsty all the time, especially at soccer practice.",
    "I ask all my patients about digestion since blood sugar affects it — any stomach trouble or issues going to the bathroom, and how's it been going with taking your metformin?",
    "Um… it's kind of embarrassing, but I don't go very often and my stomach hurts sometimes. And the metformin makes me feel sick, so I skip it a lot. I mostly just drink soda at practice.",
    "Your blood sugar's likely running high from missed doses and sugary drinks, and the constipation is probably low fiber — don't stop the metformin, try taking it with food, and swap one soda for water at practice. I'll confirm everything with the supervising clinician.",
    "With food… okay, I could try that. And I guess I could do water for one of them.",
  ],
  summary: "A short, warm and well-judged encounter. You introduced yourself, framed a sensitive question so that a shy patient answered honestly, and gave advice that used exactly what he told you. The score is held back by breadth rather than quality: with three questions, most of the history was never asked, and no tests were mentioned.",
  scores: {
    "0.1": [3, "You gave your name and role, said what would happen (“then we'll make a plan together”) and opened by asking how he was feeling.", [1]],
    "1.1": [1, "None of the ten HPI items was asked. Wyatt volunteered tiredness and thirst, but onset, duration, severity and what makes them better or worse were not explored.", [1, 2]],
    "1.2": [2, "You asked about two of the case-specific areas, bowel habits and metformin tolerance. Urinary frequency and blurred vision were not asked about.", [2]],
    "1.3": [1, "Medications were the only category asked. Allergies, past medical and surgical history, family history and social history were not covered.", [2]],
    "2.1": [2, "You gave two explanations: high blood sugar from missed doses and sugary drinks, and constipation from low fibre. No alternative for either was mentioned.", [3]],
    "2.2": [1, "No tests were mentioned. A repeat HbA1c, a lipid panel and an eye check for his symptoms would be expected here.", [3]],
    "2.3": [3, "Clear, appropriate advice in plain language: keep taking metformin, take it with food to ease the nausea he described, and swap one soda for water.", [3]],
    "2.4": [2, "Your closing followed directly from his answers. With only one history question there was little narrowing to observe.", [2, 3]],
    "3.1": [3, "Introduction, a focused question, then a closing plan, in a logical order.", [1, 2, 3]],
    "3.2": [3, "Nothing was repeated, and each turn built on the previous answer.", [2, 3]],
    "4.1": [2, "The tone was warm and collaborative throughout. When Wyatt said the topic was embarrassing, you moved straight to advice without acknowledging it.", [1, 3]],
    "4.2": [3, "Two open questions (“how are you feeling”, “how's it been going with…”) and one focused one. The second turn combined three questions; he answered all of them, but a quieter patient might not.", [1, 2]],
    "4.3": [3, "Plain language with no jargon, and you were clear that the supervising clinician would confirm the plan.", [3]],
    "4.4": [3, "“I ask all my patients about digestion since blood sugar affects it” normalised the question and gave a reason for it. He then disclosed constipation and skipped doses.", [2]],
    "4.5": [3, "Your advice picked up each thing he offered: the nausea (take it with food), the skipped doses and the soda at practice.", [3]],
    "4.6": [3, "You linked missed doses and sugary drinks to his thirst and tiredness, and were appropriately cautious. Low fibre is a reasonable guess, but his diet was not asked about.", [3]],
  },
  objectives: [
    [WYATT_OBJECTIVES[0]!, "met", "Name, role and a shared agenda in the first sentence, followed by an open question.", [1]],
    [WYATT_OBJECTIVES[1]!, "met", "The question was framed as routine and tied to blood sugar. Wyatt disclosed both constipation and skipped doses.", [2]],
    [WYATT_OBJECTIVES[2]!, "partial", "The advice was concrete and linked to soccer practice. Fibre was named as the cause of constipation but no fibre advice was given, and he was not asked which change felt doable.", [3]],
  ],
  elicited: [
    ["Skips metformin because it makes him feel sick", "critical", [2]],
    ["Constipation with abdominal discomfort", "critical", [2]],
    ["Drinks mostly soda at practice", "important", [2]],
    ["Tiredness and constant thirst (volunteered)", "important", [1]],
  ],
  missed: [
    ["Blurred vision", "critical", "A symptom of high blood sugar that he has and was not asked about."],
    ["Frequent urination", "important", "He mentioned thirst; the matching question about urination was not asked."],
    ["Avoids fruit and vegetables", "important", "Diet was not asked about, so the low-fibre explanation was assumed rather than confirmed."],
    ["Allergies", "important", "Not asked."],
    ["Family history of metabolic syndrome", "minor", "Not asked."],
  ],
  strengths: [
    ["A complete introduction that set a shared agenda.", [1]],
    ["Framing a sensitive question as routine, with a reason, which led to two honest disclosures.", [2]],
    ["Advice built from the patient's own words: nausea, skipped doses and soda at practice.", [3]],
    ["Clear about your role and that the clinician would confirm the plan.", [3]],
  ],
  improvements: [
    ["Wyatt said the topic was embarrassing and the next thing he heard was advice.", "Acknowledge it first: “Thanks for telling me. That's really common and nothing to be embarrassed about.”", [3]],
    ["Constipation was put down to low fibre without asking what he eats.", "Ask him to walk you through a normal day of eating and drinking before explaining the cause.", [3]],
    ["The plan did not include any tests.", "Name the checks you would suggest: a repeat HbA1c, a cholesterol panel and an eye exam.", [3]],
    ["Three questions were asked in one turn.", "Ask about digestion first, then about the metformin once he has answered.", [2]],
  ],
  suggestions: [
    "When a patient volunteers a symptom, explore it: when it started, how bad it is, what makes it better or worse.",
    "Ask about urination and vision whenever a patient with diabetes mentions thirst.",
    "Cover allergies, family history and other conditions before moving to a plan.",
    "End by asking which change feels doable and what questions the patient has.",
  ],
  annotations: [
    [1, "strength", "Name, role and agenda, then an open question."],
    [2, "strength", "Normalising frame for a sensitive question."],
    [3, "strength", "Advice uses what the patient said."],
    [3, "improvement", "He had just said he was embarrassed; that was not acknowledged."],
  ],
});

const badWyatt = build({
  encounterId: "00000000-0000-4000-8000-000000000102",
  studentName: "Fourth-year student (senior)",
  patientName: "Wyatt Nelson",
  completedAt: "2026-10-11T14:20:00Z",
  lines: [
    "Wyatt Nelson? You're here for your diabetes — are you taking your metformin?",
    "…Sometimes.",
    "How much junk food are you eating? That's probably why your weight is where it is.",
    "I don't know. Some. The pills make my stomach hurt, so…",
    "If you keep this up you'll end up on insulin and lose your eyesight — stop the soda, eat better, exercise. We're done.",
    "Okay.",
  ],
  summary: "This encounter did not establish the trust a shy adolescent needs in order to talk. There was no introduction, the questions were closed or judgmental, and the one important thing Wyatt offered, that his medication hurts his stomach, was passed over. The closing predicted insulin and loss of eyesight as certainties and ended the visit without a workable plan. Faculty review is recommended.",
  scores: {
    "0.1": [1, "No name, role or purpose was given. The first sentence was a closed question about medication.", [1]],
    "1.1": [1, "None of the ten HPI items was asked. No current symptom was explored.", [1, 2]],
    "1.2": [1, "Thirst, urination, tiredness, vision and bowel habits were not asked about.", []],
    "1.3": [1, "Medications and diet were touched on. Allergies, family history, and past medical and surgical history were not.", [1, 2]],
    "2.1": [1, "No explanation of what might be going on was shared. Weight was attributed to “junk food” before any history was taken.", [2]],
    "2.2": [1, "No tests or follow-up were mentioned.", [3]],
    "2.3": [2, "Diet and exercise were mentioned, but as instructions with no detail. The stomach upset that is causing missed doses was not addressed.", [3]],
    "2.4": [1, "The conclusion was reached before any information was gathered, and did not use what Wyatt said.", [2, 3]],
    "3.1": [2, "The order (medication, diet, closing) can be followed, but there was no opening, no history and no real close.", [1, 3]],
    "3.2": [2, "Nothing was repeated, but no turn built on the answer before it.", [2, 3]],
    "4.1": [1, "No concern was acknowledged. “That's probably why your weight is where it is” is a judgment, and “We're done” closed the conversation.", [2, 3]],
    "4.2": [1, "One closed question and one leading question with a judgment attached. Wyatt's answers were one or two words.", [1, 2]],
    "4.3": [1, "“You'll end up on insulin and lose your eyesight” states a possible outcome as certain and uses fear to persuade. Your role was never explained.", [3]],
    "4.4": [1, "Weight and diet are sensitive for this patient and were raised as blame, with no framing.", [2]],
    "4.5": [1, "Wyatt said “The pills make my stomach hurt, so…” and trailed off. That explains the missed doses and was ignored.", [3]],
    "4.6": [1, "The assessment rested on assumption. The cause of missed doses was offered and not used, and no symptoms were checked.", [2, 3]],
  },
  objectives: [
    [WYATT_OBJECTIVES[0]!, "notMet", "There was no introduction, and the first question put him on the defensive.", [1]],
    [WYATT_OBJECTIVES[1]!, "notMet", "Adherence was asked as a yes/no challenge and bowel habits were never raised.", [1]],
    [WYATT_OBJECTIVES[2]!, "notMet", "The counselling was a warning followed by three instructions, with nothing he could act on.", [3]],
  ],
  elicited: [
    ["Takes metformin only sometimes", "critical", [1]],
    ["Metformin makes his stomach hurt (volunteered)", "critical", [2]],
  ],
  missed: [
    ["Why he skips doses", "critical", "He started to explain and was not asked to continue."],
    ["Constipation and abdominal discomfort", "critical", "Never asked. He is embarrassed about it and will not volunteer it."],
    ["Thirst, frequent urination, tiredness and blurred vision", "critical", "No current symptoms were asked about."],
    ["What he actually eats and drinks", "important", "“Junk food” was assumed. Soda at practice and avoiding vegetables were never established."],
    ["Allergies and family history", "important", "Not asked."],
    ["What matters to him", "minor", "His motivation is soccer performance, which was never explored."],
  ],
  strengths: [
    ["You raised medication adherence, which is the central issue in this case.", [1]],
    ["You named sugary drinks, diet and activity, which are the right areas to work on.", [3]],
  ],
  improvements: [
    ["The encounter began with the patient's name and a closed question.", "Start with your name, your role and what the visit is for, then ask how he is doing.", [1]],
    ["Weight was linked to “junk food” as a judgment.", "Ask without blame: “Walk me through what you eat and drink on a normal school day.”", [2]],
    ["Wyatt said the pills hurt his stomach and it was not picked up.", "Follow the cue: “That sounds unpleasant. Is that why some doses get missed?”", [3]],
    ["Complications were stated as certainties to frighten him.", "Be honest and proportionate: “Keeping your sugar down now protects your eyes later, and there are ways to make the tablets easier to take.”", [3]],
    ["The visit ended with “We're done.”", "Close by agreeing one small step and asking what questions he has.", [3]],
  ],
  suggestions: [
    "Introduce yourself and state the purpose before any clinical question.",
    "Replace judgments with open questions, and let the patient describe his own habits.",
    "When a patient gives a reason for not taking a medication, explore it before giving advice.",
    "Explain risks truthfully without predicting the worst outcome as certain.",
  ],
  annotations: [
    [1, "improvement", "No introduction; opens with a closed question."],
    [2, "improvement", "A judgment about weight before any history."],
    [3, "improvement", "He had just said the pills hurt his stomach. That was ignored."],
    [3, "improvement", "Overstates certainty and ends the visit abruptly."],
  ],
});

const goodChest = build({
  encounterId: "00000000-0000-4000-8000-000000000103",
  studentName: "Shaied (first-year)",
  patientName: "John Marcus",
  completedAt: "2026-10-11T14:10:00Z",
  lines: [
    "Hi John, I'm Shaied, a first-year medical student — I'll ask you a few questions, then we'll go over a plan and I'll bring the doctor in. What brought you in today?",
    "I've been getting this pressure in my chest for about a month. It comes on when I take the stairs or carry something heavy, and it goes away when I rest.",
    "That sounds frightening, let me pull your ECG report. Can you describe what the pressure feels like, and when it comes on do you get short of breath, sweaty, or sick to your stomach?",
    "Like something heavy sitting on the middle of my chest. I get sweaty and a bit sick, and I have to stop to catch my breath. My dad had a heart attack at 60, so with my blood pressure, I'm worried.",
    "My main concern is this could be your heart given the exertion pattern, your blood pressure, and your family history — we'd want an ECG, blood tests, and a stress test, and if the pressure ever comes at rest or lasts more than a few minutes, call 911. I'll confirm with the doctor.",
    "Okay. That's a lot to take in, but thank you for being straight with me.",
  ],
  summary: "A focused, safe encounter that reached the right concern quickly. You introduced yourself clearly, acknowledged his fear, screened for the key associated symptoms in one question, and tied your assessment to three things he told you. You also gave clear advice on when to call 911. The gaps are breadth and treatment: most of the history was volunteered rather than asked, only one diagnosis was discussed, and no treatment was mentioned.",
  scores: {
    "0.1": [3, "Name, role, what would happen and who comes next, then an open question about why he came.", [1]],
    "1.1": [1, "You asked about character. Onset, trigger and relief were volunteered; location, radiation, duration, intensity and effect on daily life were not asked.", [2]],
    "1.2": [3, "One question covered shortness of breath, sweating and nausea, the associated symptoms defined for this case.", [2]],
    "1.3": [1, "No history category was asked. Blood pressure and his father's heart attack were volunteered; medications, allergies, smoking and surgeries are unknown.", []],
    "2.1": [2, "You named the heart as your main concern and said why. No other possibility, such as reflux or a strained muscle, was mentioned.", [3]],
    "2.2": [3, "ECG, blood tests and a stress test are the expected next steps for this case.", [3]],
    "2.3": [1, "No treatment was discussed. The advice on when to call 911 is good safety-netting but is not a treatment plan.", [3]],
    "2.4": [3, "Your closing drew together the exertional pattern, his blood pressure and his family history, all taken from his answers.", [3]],
    "3.1": [3, "Introduction, presenting complaint, focused symptom question, then assessment and plan.", [1, 2, 3]],
    "3.2": [3, "Nothing was repeated and each turn used the answer before it.", [2, 3]],
    "4.1": [3, "“That sounds frightening” acknowledged his fear before the next question, and he thanked you for being straight with him.", [2]],
    "4.2": [3, "An open question (“What brought you in today?”), then an open description of the pressure, then a focused symptom screen.", [1, 2]],
    "4.3": [3, "Plain language, clear about being a student, and twice said the doctor would confirm.", [1, 3]],
    "4.4": [2, "No sensitive topic was raised. Smoking and alcohol matter in this case and were not asked about.", []],
    "4.5": [3, "You used what he volunteered, his father's heart attack and his blood pressure, in your explanation.", [3]],
    "4.6": [3, "You recognised the exertional pattern as the key finding, stayed cautious (“could be”), and gave a clear threshold for emergency care.", [3]],
  },
  objectives: [
    ["Characterise chest pain using a structured history of presenting illness.", "partial", "Character and associated symptoms were asked. Location, radiation, duration and severity were not.", [2]],
    ["Identify cardiovascular risk factors.", "partial", "Hypertension and family history were used in your reasoning, but he volunteered them. Smoking and cholesterol were not asked about.", [3]],
    ["Recognise when chest pain needs urgent assessment and say so clearly.", "met", "You named the heart as the main concern and told him exactly when to call 911.", [3]],
  ],
  elicited: [
    ["Exertional chest pressure for a month, relieved by rest (volunteered)", "critical", [1]],
    ["Heavy, central pressure", "critical", [2]],
    ["Sweating, nausea and breathlessness with episodes", "critical", [2]],
    ["Father had a heart attack at 60 (volunteered)", "important", [2]],
    ["High blood pressure (volunteered)", "important", [2]],
  ],
  missed: [
    ["Whether the pressure spreads to the arm or jaw", "critical", "Radiation was not asked about and helps separate cardiac from other causes."],
    ["Smoking history", "critical", "A major risk factor that was never raised."],
    ["Current medications and whether he takes them", "important", "Not asked, so the stopped cholesterol medication was not found."],
    ["How long each episode lasts and how severe it is", "important", "Not asked."],
    ["Allergies", "important", "Not asked. This matters before any medication is given."],
  ],
  strengths: [
    ["A complete introduction that told him what to expect and who would follow.", [1]],
    ["Named his fear before asking the next question.", [2]],
    ["Screened three associated symptoms in a single clear question.", [2]],
    ["Explained your reasoning using his own history, and gave a specific instruction on when to call 911.", [3]],
  ],
  improvements: [
    ["You said you would pull his ECG report, then listed an ECG as a next step without saying what the one on file showed.", "Tell him what you saw, or say that the doctor will go through it and whether a new one is needed.", [2, 3]],
    ["Only the heart was mentioned as a possible cause.", "Name one or two alternatives and why they are less likely: “It could also be reflux or a strained muscle, but the pattern with exertion points to the heart.”", [3]],
    ["No treatment was discussed.", "Outline what treatment usually involves and one side effect for each, within your role.", [3]],
    ["His risk factors were volunteered, not asked.", "Ask directly about smoking, cholesterol, medications and allergies before giving your assessment.", [3]],
  ],
  suggestions: [
    "Complete the description of the pain: where it is, whether it spreads, how long it lasts and how bad it gets.",
    "Ask about smoking with a normalising frame, then ask for amounts.",
    "Check medications and allergies in every encounter, however short.",
    "After giving a plan, ask what questions the patient has.",
  ],
  annotations: [
    [1, "strength", "Name, role, agenda and an open question."],
    [2, "strength", "Empathy first, then an efficient symptom screen."],
    [3, "strength", "Reasoning explained, with clear safety-netting."],
    [3, "improvement", "The ECG you pulled was not mentioned again, and no treatment was discussed."],
  ],
});

export const DEMO_CASES: DemoCase[] = [goodWyatt, badWyatt, goodChest];
