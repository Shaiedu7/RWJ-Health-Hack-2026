/**
 * Sample feedback used until the scoring backend exists. The report is written for the sample
 * transcript below; applied to any other transcript its scores and wording are placeholders.
 */
import type { FeedbackReport, RubricItemResult, RubricScore, TranscriptMessage } from "./types.ts";

export const SAMPLE_ENCOUNTER_ID = "00000000-0000-4000-8000-000000000001";
export const SAMPLE_PATIENT = "Marcus Ellis (sample)";
export const SAMPLE_STUDENT = "Jordan Lee (sample)";

const LINES: string[] = [
  "Hi Mr. Ellis, my name is Jordan and I'm a second-year medical student. I'll ask you some questions before the doctor comes in. How are you feeling right now?",
  "Honestly, a little nervous. I've had this pressure in my chest since this morning.",
  "I'm sorry, that sounds frightening. Can you tell me more about the pressure?",
  "It's like something heavy sitting right in the middle of my chest. It started while I was carrying groceries up the stairs.",
  "Does it go anywhere else, like your arm or your jaw?",
  "Yeah, it kind of spreads into my left arm.",
  "On a scale of 0 to 10, how bad is it?",
  "Maybe a 7 at its worst. It's about a 5 now.",
  "Have you had anything like this before?",
  "A couple of times this past month when I was walking uphill. I figured it was heartburn.",
  "Any sweating, nausea or shortness of breath with it?",
  "I got pretty sweaty this morning and felt a little sick to my stomach.",
  "Do you have any medical conditions?",
  "High blood pressure. And my doctor said my cholesterol was high last year.",
  "What medications do you take?",
  "Lisinopril. I'm supposed to take a cholesterol pill too, but I stopped a few months ago.",
  "Any allergies?",
  "Penicillin gives me a rash.",
  "Do you smoke?",
  "...A bit. I've been trying to cut down.",
  "OK. Do you drink alcohol?",
  "A couple of beers on the weekend.",
  "Does heart disease run in your family?",
  "My dad had a heart attack at 60. Honestly, that's what has been on my mind all morning.",
  "Got it. Have you had any surgeries?",
  "Just my appendix out when I was a kid.",
  "Thanks, Mr. Ellis. This could be coming from your heart, so we'd like to get an ECG and some blood tests right away. I'll go and get the doctor now.",
  "Okay. Should I be worried?",
];

export const SAMPLE_MESSAGES: TranscriptMessage[] = LINES.map((text, i) => ({
  id: `sample-${i + 1}`,
  role: i % 2 === 0 ? "user" : "assistant",
  text,
  sequence: i + 1,
  createdAt: new Date(Date.UTC(2026, 9, 10, 14, 0, i * 25)).toISOString(),
}));

const SCALE: Record<RubricScore, string> = { 3: "Exceeds expectations", 2: "Meets expectations", 1: "Below expectations" };

export function buildSampleReport(encounterId: string, messages: TranscriptMessage[]): FeedbackReport {
  const asked = messages.filter((m) => m.role === "user");
  /** IDs of the student's nth questions (0-based); positions past the end of the transcript are dropped. */
  const q = (...positions: number[]) => positions.flatMap((n) => (asked[n] ? [asked[n].id] : []));
  const item = (itemId: string, name: string, prompt: string, score: RubricScore, descriptor: string, rationale: string, evidenceMessageIds: string[]): RubricItemResult => ({ itemId, name, prompt, score, descriptor, rationale, evidenceMessageIds });

  const sections = [
    { sectionId: "0", name: "Introduction", items: [
      item("0.1", "Introduction / Rapport Building", "Did the student introduce themselves and set a comfortable tone before clinical questions?", 3,
        "Introduces self (name, role); greets warmly; asks how the patient is feeling; establishes purpose and agenda.",
        "You gave your name and role, explained what would happen next, and opened by asking how the patient was feeling.", q(0)),
    ] },
    { sectionId: "1", name: "History Assessment", items: [
      item("1.1", "General HPI", "Character, location, onset, duration, prior history, radiation, intensity, trigger/improvement, setting, social impact.", 2,
        "Asks 4–6 of the 10 items.",
        "You covered character, radiation, intensity and prior episodes. You did not ask how long the pain lasts, what eases or worsens it, or how it affects daily life; onset and setting were volunteered rather than asked.", q(1, 2, 3, 4)),
      item("1.2", "Case-Specific History", "Faculty-defined associated symptoms the student should ask about.", 3,
        "Asks about the majority of case-specific symptoms (≥70%).",
        "One question covered sweating, nausea and shortness of breath, which are the associated symptoms defined for this case.", q(5)),
      item("1.3", "Medical History", "PMH, PSH, medications, allergies, social history, family history.", 3,
        "Asks about 5–6 categories.",
        "All six categories were asked: conditions, medications, allergies, smoking and alcohol, family history and surgeries.", q(6, 7, 8, 9, 11, 12)),
    ] },
    { sectionId: "2", name: "Closing / Counseling", items: [
      item("2.1", "Differential Diagnosis Discussion", "Did the student share their thinking about what might be going on?", 2,
        "Discusses 1–2 appropriate differentials.",
        "You told the patient the pain could be coming from the heart. No alternative explanations were mentioned.", q(13)),
      item("2.2", "Next Steps / Workup", "Did the student explain what tests or studies they'd recommend?", 2,
        "Missing 1–2 key next steps.",
        "You named an ECG and blood tests. You did not say what the blood tests look for or mention monitoring or imaging.", q(13)),
      item("2.3", "Treatment / Medications", "Did the student discuss a treatment plan?", 1,
        "Does not discuss treatment.",
        "The encounter ended without any discussion of treatment.", q(13)),
      item("2.4", "Diagnostic Convergence", "Did the student's questioning progressively narrow toward a plausible assessment?", 2,
        "Some evidence of narrowing, but with gaps in the logical chain.",
        "Radiation, associated symptoms and family history all narrowed toward a cardiac cause, but the exertional pattern from earlier in the month was not followed up.", q(2, 5, 11)),
    ] },
    { sectionId: "3", name: "Organization / Efficiency", items: [
      item("3.1", "Organization of Encounter", "Did the interview follow a logical structure?", 3,
        "Systematic interview: chief concern → HPI → medical history → social/family history → closing.",
        "The interview moved from the presenting complaint through history, medications, social and family history to a closing statement without jumping around.", q(0, 6, 13)),
      item("3.2", "Efficiency / Pace", "Did the conversation flow without unnecessary repetition?", 3,
        "Conversation flows well, no unnecessary repetition.",
        "No question was repeated and no time was spent on tangents.", []),
    ] },
    { sectionId: "4", name: "Communication Quality", items: [
      item("4.1", "Empathy / Rapport", "Did the student acknowledge patient concerns and build trust?", 2,
        "Some empathetic responses but inconsistent.",
        "You acknowledged the patient's fear early on. Later, when he said his father's heart attack had been on his mind all morning, you replied “Got it” and changed topic.", q(1, 12)),
      item("4.2", "Question Quality", "Did the student use effective questioning techniques?", 2,
        "Mostly closed yes/no questions but some open-ended ones.",
        "One open question (“Can you tell me more about the pressure?”) produced the richest answer of the encounter. Almost every question after it was closed.", q(1, 8, 9)),
      item("4.3", "Clarity / Professionalism", "Did the student communicate clearly and maintain professional boundaries?", 3,
        "Patient-friendly language; professional tone; communicates limitations.",
        "Plain language throughout, and you were clear that you are a student and that the doctor would follow.", q(0, 13)),
      item("4.4", "Handling Sensitive Topics", "Did the student approach sensitive areas with appropriate framing?", 2,
        "Asks about sensitive topics but bluntly or without framing.",
        "“Do you smoke?” was asked with no framing. The patient hesitated and minimised, and the amount was never established.", q(9, 10)),
      item("4.5", "Listening & Response to Cues", "Did the student pick up on verbal cues, concerns, and changes in the patient's story?", 1,
        "Ignores or prematurely redirects important information.",
        "Two cues were passed over: the patient said he had stopped his cholesterol medication, and he said his father's heart attack was worrying him. Each was followed by an unrelated question.", q(8, 12)),
      item("4.6", "Clinical Reasoning & Synthesis", "Did the student demonstrate sound clinical thinking during the encounter?", 2,
        "Recognizes some key findings but misses connections or alternatives.",
        "You recognised the cardiac picture and acted on it. The stopped statin and the month of exertional symptoms were not connected to it.", q(4, 13)),
    ] },
  ];

  const all = sections.flatMap((s) => s.items);
  return {
    reportId: `sample-report-${encounterId}`,
    encounterId,
    generatedAt: messages.at(-1)?.createdAt ?? new Date(0).toISOString(),
    rubricName: "Virtual Patient Encounter Rubric",
    scale: SCALE,
    totalScore: all.reduce((sum, i) => sum + i.score, 0),
    maxScore: all.length * 3,
    reviewFlags: all.filter((i) => i.score === 1 && (i.itemId === "4.3" || i.itemId === "4.6")).map((i) => `${i.name} scored 1. Faculty review is recommended even though the total may be high.`),
    summary: "A well-organised, professional interview that reached the right area of concern. The history was broad, and the associated symptoms were covered efficiently. The main gaps were in listening: two things the patient offered (stopping his cholesterol medication, and fear about his father's heart attack) were not followed up, and the encounter closed without answering his last question or discussing treatment.",
    sections,
    learningObjectives: [
      { objectiveId: "lo-1", text: "Characterise chest pain using a structured history of presenting illness.", outcome: "partial", explanation: "Character, radiation, severity and prior episodes were covered; duration and relieving or aggravating factors were not.", evidenceMessageIds: q(1, 2, 3, 4) },
      { objectiveId: "lo-2", text: "Identify cardiovascular risk factors.", outcome: "met", explanation: "Hypertension, high cholesterol, smoking and family history were all elicited.", evidenceMessageIds: q(6, 9, 11) },
      { objectiveId: "lo-3", text: "Explore medication adherence without judgment.", outcome: "notMet", explanation: "The patient said he had stopped his cholesterol medication. The reason was never asked.", evidenceMessageIds: q(7, 8) },
      { objectiveId: "lo-4", text: "Recognise and respond to the patient's emotional cues.", outcome: "notMet", explanation: "The patient's worry about his father's heart attack and his closing question were both left unanswered.", evidenceMessageIds: q(12, 13) },
    ],
    findings: {
      elicited: [
        { label: "Central chest pressure radiating to the left arm", importance: "critical", evidenceMessageIds: q(1, 2) },
        { label: "Earlier exertional episodes over the past month", importance: "critical", evidenceMessageIds: q(4) },
        { label: "Sweating and nausea with this episode", importance: "important", evidenceMessageIds: q(5) },
        { label: "Hypertension and high cholesterol", importance: "important", evidenceMessageIds: q(6) },
        { label: "Father had a heart attack at 60", importance: "important", evidenceMessageIds: q(11) },
        { label: "Penicillin allergy (rash)", importance: "important", evidenceMessageIds: q(8) },
        { label: "Alcohol: a couple of beers at weekends", importance: "minor", evidenceMessageIds: q(10) },
      ],
      missed: [
        { label: "How much he smokes, and for how long", importance: "critical", explanation: "He said “a bit” and the amount was not pursued. Pack-years change the risk picture." },
        { label: "Why he stopped his cholesterol medication", importance: "important", explanation: "The reason (cost, side effects, belief) decides what can be done about it." },
        { label: "What relieves the pain", importance: "important", explanation: "Whether rest eases it helps separate cardiac from other causes." },
        { label: "How long each episode lasts", importance: "important", explanation: "Duration was never asked for this or the earlier episodes." },
        { label: "Occupation", importance: "minor", explanation: "Work was not asked about, so its bearing on the plan is unknown." },
      ],
    },
    strengths: [
      { text: "Clear introduction with name, role and what to expect.", evidenceMessageIds: q(0) },
      { text: "Acknowledged the patient's fear before asking an open question, which produced the most detailed answer of the encounter.", evidenceMessageIds: q(1) },
      { text: "Covered three associated symptoms in a single, clear question.", evidenceMessageIds: q(5) },
      { text: "Complete medical history across all six categories in a logical order.", evidenceMessageIds: q(6, 12) },
    ],
    improvements: [
      { text: "The patient said he had stopped a medication and the next question was about allergies.", suggestion: "Pause on it: “You mentioned you stopped the cholesterol pill. What led to that?”", evidenceMessageIds: q(8) },
      { text: "Smoking was asked bluntly and the hesitant answer was accepted.", suggestion: "Frame it (“I ask everyone about this”) and then quantify: how many a day, for how many years.", evidenceMessageIds: q(9, 10) },
      { text: "The patient's worry about his father's heart attack was met with “Got it.”", suggestion: "Name the worry before moving on: “That must make this morning even more frightening.”", evidenceMessageIds: q(12) },
      { text: "The encounter ended before the patient's question, “Should I be worried?”, could be answered.", suggestion: "Before leaving, ask what questions the patient has and answer honestly within your role.", evidenceMessageIds: q(13) },
    ],
    suggestions: [
      "After each answer, check whether the patient offered something new before asking your next planned question.",
      "Finish the HPI with duration, relieving and aggravating factors, and effect on daily life before moving to past history.",
      "Introduce sensitive questions with a normalising sentence, then ask for amounts.",
      "Close by summarising what you heard, naming more than one possibility, and inviting questions.",
    ],
    annotations: [
      ...q(0).map((messageId) => ({ messageId, sentiment: "strength" as const, comment: "Name, role and agenda in the first sentence." })),
      ...q(1).map((messageId) => ({ messageId, sentiment: "strength" as const, comment: "Empathy followed by an open question." })),
      ...q(5).map((messageId) => ({ messageId, sentiment: "strength" as const, comment: "Efficient screen for associated symptoms." })),
      ...q(8).map((messageId) => ({ messageId, sentiment: "improvement" as const, comment: "The patient had just said he stopped a medication. That was the moment to ask why." })),
      ...q(9).map((messageId) => ({ messageId, sentiment: "improvement" as const, comment: "No framing for a sensitive question." })),
      ...q(12).map((messageId) => ({ messageId, sentiment: "improvement" as const, comment: "An emotional cue was passed over." })),
      ...q(13).map((messageId) => ({ messageId, sentiment: "improvement" as const, comment: "Only one possibility named, and no chance for the patient to ask questions." })),
    ],
    facultyComments: [],
  };
}
