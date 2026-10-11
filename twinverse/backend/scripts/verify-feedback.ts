import { writeFileSync } from "node:fs";
import { loadPreviewContext } from "../lib/preview-context.js";
import { generateFeedback } from "../lib/encounter-feedback.js";
import type { Encounter } from "../lib/student-encounters.js";
const context=await loadPreviewContext();
const encounter={encounterId:"verification-only",patientId:context.patientId,context,revision:2,version:2,mode:"development-preview",requests:{},updatedAt:new Date().toISOString(),messages:[{id:"a",role:"user",text:"Hi Wyatt, I'm the student working with you today. Is it okay if I ask you about how you've been feeling?",sequence:1,createdAt:"verification"},{id:"b",role:"assistant",text:"Yeah, that's okay.",sequence:2,createdAt:"verification"},{id:"c",role:"user",text:"What medications are you taking, and how do you feel about taking them?",sequence:3,createdAt:"verification"},{id:"d",role:"assistant",text:"I take metformin and glipizide. I'm not always comfortable talking about my health.",sequence:4,createdAt:"verification"}]} as Encounter;
const feedback=await generateFeedback(encounter);
writeFileSync(process.argv[2]??"/private/tmp/twinverse-feedback-verification.json",JSON.stringify({kind:"Synthetic transcript verification - no student encounter modified",feedback},null,2));
console.log(JSON.stringify({valid:true,counts:Object.fromEntries(["strengths","elicited","missed","improvements"].map(k=>[k,feedback[k as keyof typeof feedback] instanceof Array?(feedback[k as keyof typeof feedback] as unknown[]).length:0]))}));
