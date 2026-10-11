import type { AvatarState, RecordKind, Release, Artifact } from "../types";

export interface Topic {
  id: string;
  category: "hpi" | "background" | "rapport";
  patterns: RegExp[];
  reply: string;
  behavior?: AvatarState;
  hesitant?: { text: string };
  releases?: Release[];
}

export interface RecordScript {
  requires: string[];
  release: Release;
}

export interface KeyFinding {
  id: string;
  label: string;
  detail: string;
  topics: string[];
  askHint: string;
}

export interface CaseScript {
  opening: { text: string; behavior: AvatarState };
  initialChart: Release[];
  topics: Topic[];
  fallbacks: string[];
  records: Partial<Record<RecordKind, RecordScript>>;
  keyFindings: KeyFinding[];
  objectives: { text: string; findings: string[] }[];
  summaryIntro: string;
  nextTips: string[];
}

export const RAPPORT =
  /(i'?m sorry|sounds (hard|difficult|stressful|scary|like a lot)|must (be|have been)|i (can )?(see|understand|imagine)|thank you for|thanks for|that.s (hard|difficult|a lot)|uncomfortable|take your time|no rush|worried|scary)/i;

const lab = (id: string, title: string, date: string, source: string, blocks: Artifact["blocks"]): Artifact => ({
  id,
  title,
  type: "Laboratory report",
  date,
  source,
  blocks,
});

/* ───────────────────────── Case 1 · Margaret Okafor ───────────────────────── */

const okafor: CaseScript = {
  opening: {
    text: "Hello. I'm Margaret. My stomach has been bothering me since yesterday, probably nothing, but my daughter insisted I come in.",
    behavior: "guarding",
  },
  initialChart: [
    {
      section: "overview",
      title: "Check-in summary",
      source: "record",
      lines: ["58-year-old female", "Visit type: acute, walk-in", "Reason for visit (as recorded): stomach discomfort"],
    },
    {
      section: "overview",
      title: "Triage vitals",
      source: "record",
      lines: ["BP 128/78 mmHg", "Heart rate 96 bpm", "Temperature 37.8 °C", "Respiratory rate 18/min", "SpO₂ 98% on room air"],
    },
  ],
  topics: [
    {
      id: "otc",
      category: "background",
      patterns: [/over.the.counter|ibuprofen|advil|motrin|nsaid|pain ?killer|pain relie|anything (for|to help) (the|with) pain|for the pain|aspirin|tylenol|acetaminophen|supplement|vitamin|remed/i],
      behavior: "anxious",
      hesitant: { text: "Oh... just something from the drugstore. It's really nothing worth writing down." },
      reply: "Ibuprofen. Maybe four or five of them a day since yesterday morning. I didn't want you to think I was fussing over nothing.",
      releases: [
        { section: "meds", title: "Ibuprofen (over the counter)", source: "patient", lines: ["Approximately 4–5 tablets per day since yesterday morning", "Dose per tablet not stated"] },
      ],
    },
    {
      id: "allergies",
      category: "background",
      patterns: [/allerg|reaction to/i],
      behavior: "relaxed",
      reply: "Penicillin. I came out in a rash years ago, so they always make a note of it.",
      releases: [{ section: "meds", title: "Allergy: penicillin", source: "patient", lines: ["Reaction: skin rash", "Timing: many years ago"] }],
    },
    {
      id: "meds",
      category: "background",
      patterns: [/medication|medicine|prescri|pills|tablets|what are you taking|\btaking\b/i],
      behavior: "idle",
      reply: "A blood pressure tablet every morning. Lisinopril, ten milligrams. And a few things for the pain, but nothing special.",
      releases: [{ section: "meds", title: "Lisinopril 10 mg daily", source: "patient", lines: ["Taken every morning for blood pressure"] }],
    },
    {
      id: "severity",
      category: "hpi",
      patterns: [/scale|how bad|severity|severe|out of (10|ten)|how much (does it )?hurt|intens|rate (it|the|your)/i],
      behavior: "wincing",
      reply: "Maybe a six when I'm sitting still. Closer to an eight if I cough or the car goes over a bump.",
      releases: [{ section: "history", title: "Pain severity", source: "patient", lines: ["About 6/10 at rest", "Up to 8/10 with coughing or jolting movement"] }],
    },
    {
      id: "onset",
      category: "hpi",
      patterns: [/when (did|was)|\bstart(ed)?\b|\bbegan\b|how long|onset|first notice|\bsince\b/i],
      behavior: "idle",
      reply: "Yesterday evening, around dinnertime. I didn't finish my plate, which isn't like me.",
      releases: [{ section: "history", title: "Onset", source: "patient", lines: ["Began yesterday evening around dinner", "Left part of the meal uneaten"] }],
    },
    {
      id: "associated",
      category: "hpi",
      patterns: [/nausea|vomit|fever|appetite|bowel|diarrh|constipat|other symptoms|anything else (going on|bothering)|associated|chills|queas|urin|poop|stool/i],
      behavior: "idle",
      reply: "I felt queasy last night and haven't wanted to eat since. I haven't thrown up. I felt a bit feverish, I think, but I didn't check.",
      releases: [{ section: "history", title: "Associated symptoms", source: "patient", lines: ["Nausea and reduced appetite", "Possible feverishness last night (not measured)", "Denies vomiting"] }],
    },
    {
      id: "location",
      category: "hpi",
      patterns: [/where|locat|point to|show me|radiat|spread|moved?|character|sharp|dull|describe the pain|what kind of pain|what does it feel|feel like|\bhurt/i],
      behavior: "guarding",
      reply: "It started around my belly button, kind of dull. Then this afternoon it moved down here, on the right side. It's sharper now, especially when I move.",
      releases: [{ section: "history", title: "Pain location and character", source: "patient", lines: ["Began near the umbilicus as a dull ache", "Now felt in the right lower abdomen, sharper", "Worse with movement"] }],
    },
    {
      id: "pmh",
      category: "background",
      patterns: [/medical history|past history|history of|conditions|surgeries|surgery|operations|hospital|health problems|chronic|illness/i],
      behavior: "idle",
      reply: "High blood pressure, that's the main one. And I had a hysterectomy years ago. Nothing else I can think of.",
      releases: [{ section: "history", title: "Past medical history", source: "patient", lines: ["Hypertension", "Hysterectomy (patient recalls as years ago)"] }],
    },
    {
      id: "social",
      category: "background",
      patterns: [/smok|alcohol|drink|\blive\b|living|social|lifestyle|diet|hobb|support|at home|retire|occupation/i],
      behavior: "relaxed",
      reply: "I live on my own, a few streets from my daughter. I taught for thirty years, and now I mostly garden. My tomatoes are coming in, you should see them. Oh, sorry, I'm rambling. A glass of wine now and then, no cigarettes.",
      releases: [{ section: "history", title: "Social history", source: "patient", lines: ["Retired teacher, lives alone near daughter", "Occasional wine; does not smoke"] }],
    },
    {
      id: "symptoms",
      category: "hpi",
      patterns: [/what brings|brings you|what.s going on|what happened|tell me|how can i help|symptom|how are you feeling|what.s (the problem|the matter|been bothering)|problem|\bpain\b|stomach|belly|abdom/i],
      behavior: "guarding",
      reply: "It's just a stomach ache, really. It comes and goes. I've had worse.",
      releases: [{ section: "history", title: "Presenting concern (patient's words)", source: "patient", lines: ["“A stomach ache” since yesterday", "Comes and goes, per patient"] }],
    },
    {
      id: "rapport",
      category: "rapport",
      patterns: [/(?!)/],
      behavior: "relaxed",
      reply: "Thank you for saying that. I've been trying not to make a fuss, but it really is worse than I've let on.",
    },
  ],
  fallbacks: [
    "I'm sorry, I'm not sure how to answer that. Could you ask it another way?",
    "Hmm. I don't have much to say about that. Is there something about how I've been feeling you'd like to know?",
  ],
  records: {
    labs: {
      requires: ["symptoms"],
      release: {
        section: "labs",
        title: "CBC, CRP and basic metabolic panel",
        source: "record",
        lines: ["Collected today, 09:47", "Report available to open"],
        artifact: lab("lab-okafor", "CBC with differential, CRP and BMP", "Oct 10, 2026 · 09:47", "Clinic point-of-care lab (synthetic)", [
          {
            kind: "table",
            heading: "Results",
            columns: ["Test", "Result", "Reference", "Flag"],
            flagCol: 3,
            rows: [
              ["White blood cells", "14.8 ×10⁹/L", "4.0–11.0", "High"],
              ["Neutrophils", "82 %", "40–70", "High"],
              ["Hemoglobin", "13.1 g/dL", "12.0–15.5", ""],
              ["Platelets", "288 ×10⁹/L", "150–400", ""],
              ["C-reactive protein", "46 mg/L", "< 5", "High"],
              ["Sodium", "138 mmol/L", "135–145", ""],
              ["Potassium", "4.1 mmol/L", "3.5–5.0", ""],
              ["Creatinine", "0.9 mg/dL", "0.6–1.1", ""],
            ],
          },
        ]),
      },
    },
    notes: {
      requires: ["meds"],
      release: {
        section: "notes",
        title: "Prior primary care note",
        source: "record",
        lines: ["Riverside Family Medicine, Aug 2025", "Report available to open"],
        artifact: {
          id: "note-okafor",
          title: "Primary care follow-up note",
          type: "Prior note",
          date: "Aug 19, 2025",
          source: "Riverside Family Medicine (synthetic)",
          blocks: [
            {
              kind: "text",
              heading: "Assessment and plan",
              body: [
                "58-year-old woman seen for routine hypertension follow-up. Blood pressure 126/76 mmHg on lisinopril 10 mg daily; tolerating well.",
                "Past surgical history: total abdominal hysterectomy (2009). No other abdominal surgery on record.",
                "Allergy list reviewed: penicillin (rash).",
                "Counselled to limit regular NSAID use while on an ACE inhibitor. Return in 12 months or sooner if needed.",
              ],
            },
          ],
        },
      },
    },
    imaging: {
      requires: ["location", "associated"],
      release: {
        section: "labs",
        title: "CT abdomen and pelvis report",
        source: "record",
        lines: ["Imaging report finalised today", "Report available to open"],
        artifact: {
          id: "img-okafor",
          title: "CT abdomen and pelvis with IV contrast",
          type: "Imaging report",
          date: "Oct 10, 2026 · 10:31",
          source: "Radiology department (synthetic)",
          blocks: [
            { kind: "text", heading: "Technique", body: ["Axial CT of the abdomen and pelvis following intravenous contrast."] },
            {
              kind: "text",
              heading: "Findings",
              body: [
                "The appendix is dilated to 12 mm with mural thickening and hyperenhancement. Periappendiceal fat stranding is present, with a small volume of free fluid in the right lower quadrant.",
                "No extraluminal gas, abscess or drainable collection. Remaining bowel, liver, gallbladder, pancreas, kidneys and pelvic structures are unremarkable.",
              ],
            },
            { kind: "text", heading: "Impression", body: ["Findings are compatible with acute appendicitis without evidence of perforation."] },
            { kind: "text", body: ["No image files are attached to this synthetic demonstration report."] },
          ],
        },
      },
    },
  },
  keyFindings: [
    { id: "migration", label: "Pain began near the umbilicus and moved to the right lower abdomen", detail: "pain location and character", topics: ["location"], askHint: "Ask the patient to describe where the pain started and where it is now." },
    { id: "onset", label: "Onset yesterday evening with reduced appetite", detail: "timing of onset", topics: ["onset"], askHint: "Establish exactly when symptoms began." },
    { id: "severity", label: "Pain worse with movement and coughing", detail: "severity and aggravating factors", topics: ["severity"], askHint: "Ask for severity and what makes it better or worse." },
    { id: "associated", label: "Nausea and possible fever", detail: "associated symptoms", topics: ["associated"], askHint: "Screen for nausea, vomiting, fever and bowel or urinary changes." },
    { id: "otc", label: "Regular ibuprofen use over the last day", detail: "over-the-counter analgesic use", topics: ["otc"], askHint: "Ask directly about over-the-counter pain relievers; she may not volunteer them." },
    { id: "meds", label: "Lisinopril for hypertension", detail: "regular medications", topics: ["meds"], askHint: "Review regular prescription medications." },
    { id: "allergy", label: "Penicillin allergy (rash)", detail: "allergy history", topics: ["allergies"], askHint: "Confirm drug allergies and the reaction." },
    { id: "pmh", label: "Hypertension and prior hysterectomy", detail: "past medical and surgical history", topics: ["pmh"], askHint: "Cover past medical and surgical history." },
    { id: "imaging", label: "CT report released after a focused history", detail: "imaging request", topics: ["record:imaging"], askHint: "Once the history is focused, request relevant imaging." },
  ],
  objectives: [
    { text: "Characterise acute abdominal pain: onset, location, migration, severity and aggravating factors.", findings: ["migration", "onset", "severity"] },
    { text: "Screen for associated symptoms before narrowing the differential.", findings: ["associated"] },
    { text: "Elicit medications, including over-the-counter use a patient may under-report, and allergies.", findings: ["otc", "meds", "allergy"] },
    { text: "Request investigations only when the history supports them.", findings: ["imaging"] },
  ],
  summaryIntro: "You interviewed Margaret Okafor, a patient who tends to minimise her symptoms.",
  nextTips: [
    "Begin with an open question, then narrow with specific questions about pain location, character and timing.",
    "When a patient is vague about medications, ask again about over-the-counter products.",
    "Pause after a hesitant answer and invite the patient to say more.",
  ],
};

/* ───────────────────────── Case 2 · Daniel Reyes ───────────────────────── */

const reyes: CaseScript = {
  opening: {
    text: "Hi, thanks for seeing me. Sorry, I'm a little nervous. My heart keeps racing and I can't sleep, and honestly it's freaking me out a bit.",
    behavior: "anxious",
  },
  initialChart: [
    {
      section: "overview",
      title: "Check-in summary",
      source: "record",
      lines: ["34-year-old male", "Visit type: new concern, scheduled", "Reason for visit (as recorded): palpitations, poor sleep"],
    },
    {
      section: "overview",
      title: "Triage vitals",
      source: "record",
      lines: ["BP 134/84 mmHg", "Heart rate 102 bpm", "Temperature 36.8 °C", "Respiratory rate 16/min", "SpO₂ 99% on room air"],
    },
  ],
  topics: [
    {
      id: "caffeine",
      category: "background",
      patterns: [/caffeine|coffee|energy drink|\btea\b|soda|stimulant|red bull|monster|espresso/i],
      behavior: "anxious",
      hesitant: { text: "Um, a couple of coffees? Like a normal amount, I think." },
      reply: "Okay, honestly, it's more like four coffees and two or three energy drinks on deadline days. I didn't want to sound irresponsible.",
      releases: [{ section: "history", title: "Caffeine intake", source: "patient", lines: ["About 4 coffees daily", "2–3 energy drinks on busy days"] }],
    },
    {
      id: "substances",
      category: "background",
      patterns: [/alcohol|drinking|smok|vape|drugs|cannabis|marijuana|tobacco|recreational/i],
      behavior: "idle",
      reply: "A beer or two on weekends. I don't smoke or vape, and no drugs.",
      releases: [{ section: "history", title: "Alcohol and substances", source: "patient", lines: ["1–2 beers on weekends", "No tobacco, vaping or recreational drugs"] }],
    },
    {
      id: "family",
      category: "background",
      patterns: [/family|mother|father|parents|runs in/i],
      behavior: "idle",
      reply: "My mom has a thyroid thing. She takes a pill for it. I don't know the details.",
      releases: [{ section: "history", title: "Family history", source: "patient", lines: ["Mother: thyroid condition, on daily medication", "Details not known to patient"] }],
    },
    {
      id: "pmh",
      category: "background",
      patterns: [/medical history|past history|conditions|surgeries|surgery|illness|diagnos|heart (problems|disease)/i],
      behavior: "idle",
      reply: "Nothing major. I had my appendix out when I was twelve. Otherwise I've always been healthy.",
      releases: [{ section: "history", title: "Past medical history", source: "patient", lines: ["No chronic conditions reported", "Appendectomy at age 12"] }],
    },
    {
      id: "allergies",
      category: "background",
      patterns: [/allerg|reaction to/i],
      behavior: "relaxed",
      reply: "Pollen, mostly. No medicine allergies that I know of.",
      releases: [{ section: "meds", title: "Allergies", source: "patient", lines: ["Seasonal pollen", "No known drug allergies"] }],
    },
    {
      id: "meds",
      category: "background",
      patterns: [/medication|medicine|prescri|pills|supplement|decongest|over.the.counter|\botc\b|\btaking\b/i],
      behavior: "idle",
      reply: "No prescriptions. Sometimes a decongestant when my allergies flare up.",
      releases: [{ section: "meds", title: "Medications", source: "patient", lines: ["No regular prescription medicines", "Occasional over-the-counter decongestant"] }],
    },
    {
      id: "sleep",
      category: "hpi",
      patterns: [/sleep|insomnia|\brest\b|tired|fatigue|\bnights?\b|wake/i],
      behavior: "anxious",
      reply: "I lie awake around two in the morning, thinking about work, and my heart starts going. Then I'm wrecked the next day.",
      releases: [{ section: "history", title: "Sleep", source: "patient", lines: ["Wakes around 2 a.m. with racing thoughts", "Daytime exhaustion"] }],
    },
    {
      id: "associated",
      category: "hpi",
      patterns: [/chest|dizz|faint|breath|sweat|tremor|shak|weight|appetite|other symptoms|bowel|heat intol|associated|pass(ed)? out|lighthead/i],
      behavior: "anxious",
      reply: "No fainting. Sometimes a bit of pressure in my chest when it's racing, and my hands shake. I get sweaty too. I'm not sure about my weight.",
      releases: [{ section: "history", title: "Associated symptoms", source: "patient", lines: ["Occasional chest pressure during episodes", "Hand tremor and sweating", "No fainting reported"] }],
    },
    {
      id: "onset",
      category: "hpi",
      patterns: [/when (did|was)|\bstart(ed)?\b|\bbegan\b|how long|onset|first notice|\bsince\b|weeks/i],
      behavior: "idle",
      reply: "About three weeks. Around when things got crazy at work, I think.",
      releases: [{ section: "history", title: "Onset", source: "patient", lines: ["About three weeks ago", "Patient links timing to a busy period at work"] }],
    },
    {
      id: "stress",
      category: "background",
      patterns: [/stress|\bwork\b|\bjob\b|mood|anxi|worr|nervous|overwhelm|\blife\b|at home|pressure/i],
      behavior: "anxious",
      hesitant: { text: "It's fine. Busy, you know. Everyone's busy." },
      reply: "We had layoffs a month ago. I'm covering two people's work now and I'm scared I'm next. I don't tell anyone that.",
      releases: [{ section: "history", title: "Work and stress", source: "patient", lines: ["Layoffs at workplace about a month ago", "Covering additional workload", "Worried about job security"] }],
    },
    {
      id: "symptoms",
      category: "hpi",
      patterns: [/what brings|brings you|what.s going on|what happened|tell me|how can i help|symptom|how are you feeling|racing|heart|palpitation|describe|problem|how often|frequen|episodes|what.s it like/i],
      behavior: "anxious",
      reply: "It's like my heart suddenly flutters and pounds. It happens a few times a day, mostly in the afternoon and at night when I'm trying to sleep. Each time lasts maybe ten or fifteen minutes.",
      releases: [{ section: "history", title: "Presenting concern (patient's words)", source: "patient", lines: ["Episodes of heart fluttering or pounding", "A few times a day, mostly afternoon and night", "Each lasting roughly 10–15 minutes"] }],
    },
    {
      id: "rapport",
      category: "rapport",
      patterns: [/(?!)/],
      behavior: "relaxed",
      reply: "Thanks. That actually helps. I feel a bit less silly about being here.",
    },
  ],
  fallbacks: [
    "Sorry, I'm not sure I follow. Could you ask that a different way?",
    "I'm not sure how to answer that one. Is there something about how I've been feeling you'd like to know?",
  ],
  records: {
    labs: {
      requires: ["associated"],
      release: {
        section: "labs",
        title: "Thyroid panel, CBC and metabolic panel",
        source: "record",
        lines: ["Collected at check-in today", "Report available to open"],
        artifact: lab("lab-reyes", "TSH, free T4, CBC and metabolic panel", "Oct 10, 2026 · 08:55", "Clinic laboratory (synthetic)", [
          {
            kind: "table",
            heading: "Results",
            columns: ["Test", "Result", "Reference", "Flag"],
            flagCol: 3,
            rows: [
              ["TSH", "2.4 mIU/L", "0.4–4.0", ""],
              ["Free T4", "1.2 ng/dL", "0.8–1.8", ""],
              ["Hemoglobin", "15.0 g/dL", "13.5–17.5", ""],
              ["White blood cells", "7.1 ×10⁹/L", "4.0–11.0", ""],
              ["Glucose (random)", "92 mg/dL", "70–140", ""],
              ["Sodium", "140 mmol/L", "135–145", ""],
              ["Potassium", "4.3 mmol/L", "3.5–5.0", ""],
            ],
          },
        ]),
      },
    },
    notes: {
      requires: ["symptoms"],
      release: {
        section: "notes",
        title: "Prior urgent care note",
        source: "record",
        lines: ["Northside Urgent Care, 9 days ago", "Report available to open"],
        artifact: {
          id: "note-reyes",
          title: "Urgent care visit note",
          type: "Prior note",
          date: "Oct 1, 2026",
          source: "Northside Urgent Care (synthetic)",
          blocks: [
            {
              kind: "text",
              heading: "Summary",
              body: [
                "34-year-old man with two weeks of intermittent palpitations. Examination unremarkable.",
                "12-lead ECG: sinus tachycardia at 104 bpm, no ST-segment changes, normal intervals.",
                "Discharged with advice to arrange primary care follow-up. No medications started.",
              ],
            },
          ],
        },
      },
    },
  },
  keyFindings: [
    { id: "pattern", label: "Episodic palpitations, a few times daily, lasting 10–15 minutes", detail: "pattern of the palpitations", topics: ["symptoms"], askHint: "Ask how often the episodes happen, how long they last and what they feel like." },
    { id: "onset", label: "Onset about three weeks ago", detail: "timing of onset", topics: ["onset"], askHint: "Establish when it started and what was happening then." },
    { id: "associated", label: "Chest pressure, tremor and sweating during episodes", detail: "associated symptoms", topics: ["associated"], askHint: "Screen for chest pain, syncope, tremor, sweating and weight change." },
    { id: "caffeine", label: "High caffeine and energy drink intake", detail: "caffeine use", topics: ["caffeine"], askHint: "Ask specifically about coffee, energy drinks and other stimulants; he may understate it at first." },
    { id: "stress", label: "Workplace layoffs and job-security worry", detail: "psychosocial stressors", topics: ["stress"], askHint: "Explore stress and what has changed recently, gently and without rushing." },
    { id: "sleep", label: "Early-morning waking with racing thoughts", detail: "sleep pattern", topics: ["sleep"], askHint: "Ask about sleep onset, waking and daytime effects." },
    { id: "family", label: "Mother has a thyroid condition", detail: "family history", topics: ["family"], askHint: "Take a family history, including thyroid and heart disease." },
    { id: "meds", label: "Occasional decongestant use", detail: "medications and supplements", topics: ["meds"], askHint: "Ask about prescription and over-the-counter medicines." },
    { id: "labs", label: "Laboratory results released after targeted history", detail: "laboratory request", topics: ["record:labs"], askHint: "Request laboratory results once you have a structured symptom review." },
  ],
  objectives: [
    { text: "Characterise palpitations: frequency, duration, triggers and associated symptoms.", findings: ["pattern", "onset", "associated"] },
    { text: "Explore lifestyle contributors, including caffeine and stimulant use, sleep and stress.", findings: ["caffeine", "stress", "sleep"] },
    { text: "Build a complete background: medications, family history.", findings: ["meds", "family"] },
    { text: "Use results to refine, not anchor, your thinking.", findings: ["labs"] },
  ],
  summaryIntro: "You interviewed Daniel Reyes, an anxious and apologetic patient who opens up with a respectful approach.",
  nextTips: [
    "Return to sensitive topics gently if the first answer feels brief or guarded.",
    "Name the patient's concern aloud before moving to the next topic.",
    "Compare family history clues with objective results before settling on a cause.",
  ],
};

export const scripts: Record<string, CaseScript> = {
  "okafor-abdominal": okafor,
  "reyes-palpitations": reyes,
};
