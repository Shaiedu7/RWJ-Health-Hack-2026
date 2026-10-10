import type { PublicCase } from "../types";

// Demo case metadata. The demo service also bundles scripted answers in the browser; real mode must fetch a student-safe patient catalogue.
export const publicCases: PublicCase[] = [
  {
    id: "okafor-abdominal",
    patientName: "Margaret Okafor",
    age: 58,
    sex: "Female",
    mrn: "SIM-004471",
    dob: "Mar 14, 1968",
    appearance: {
      skin: "#d9a98a",
      skinShade: "#c48f70",
      hair: "#aeb2ba",
      brow: "#8d929b",
      hairStyle: "bun",
      glasses: true,
      stubble: false,
      top: "#8f9bb8",
      topShade: "#76839f",
    },
    encounterType: "Acute visit · Urgent care",
    setting: "Urgent care clinic",
    concern: "Stomach discomfort that began yesterday evening.",
    durationMin: 12,
    intro:
      "Margaret is a retired schoolteacher who tends to downplay how she feels. She came in at her daughter's urging.",
    voiceId: "profile:okafor",
    voiceLabel: "Warm, measured alto",
    baseline: "idle",
    allowedBehaviors: ["idle", "listening", "speaking", "anxious", "wincing", "guarding", "relaxed"],
    exampleQuestions: [
      "What brings you in today?",
      "Can you show me where it hurts?",
      "How would you rate the pain out of ten?",
      "Have you had any nausea or fever?",
      "What medications are you taking?",
      "Is there anything you take for the pain?",
      "I can see this has been uncomfortable. Thank you for telling me.",
    ],
  },
  {
    id: "reyes-palpitations",
    patientName: "Daniel Reyes",
    age: 34,
    sex: "Male",
    mrn: "SIM-004472",
    dob: "Jul 02, 1992",
    appearance: {
      skin: "#bd8764",
      skinShade: "#a77352",
      hair: "#2a2220",
      brow: "#2a2220",
      hairStyle: "short",
      glasses: false,
      stubble: true,
      top: "#5d7a69",
      topShade: "#4a6454",
    },
    encounterType: "Primary care · New concern",
    setting: "Primary care clinic",
    concern: "A racing heart and trouble sleeping for the past few weeks.",
    durationMin: 10,
    intro:
      "Daniel is a talkative, apologetic software tester who worries he is being a bother. He warms up when he feels listened to.",
    voiceId: "profile:reyes",
    voiceLabel: "Quick, light tenor",
    baseline: "idle",
    allowedBehaviors: ["idle", "listening", "speaking", "anxious", "relaxed"],
    exampleQuestions: [
      "What brings you in today?",
      "How often does the racing happen?",
      "How much caffeine do you have in a day?",
      "How have things been at work?",
      "Does anyone in your family have thyroid problems?",
      "That sounds like a lot to carry. Thanks for sharing it.",
    ],
  },
];

export const getPublicCase = (id: string): PublicCase =>
  publicCases.find((c) => c.id === id) ?? publicCases[0];
