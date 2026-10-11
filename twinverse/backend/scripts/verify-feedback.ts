import { writeFileSync } from "node:fs";
import { loadPreviewContext } from "../lib/preview-context.js";
import { bedrockJson, ensureGuide, loadGuideSource, type Guide } from "../lib/encounter-guide.js";
import { buildTranscript, evaluateTranscript, finalizeEvaluation } from "../lib/encounter-feedback.js";
import type { ChatMessage } from "../lib/preview-conversation.js";
// Runs the real guide + rubric evaluation against a synthetic transcript. The guide is kept in memory,
// so nothing is written to DynamoDB and no student encounter is modified.
const context=await loadPreviewContext();
const guides=new Map<string,Guide>();
const { guide, difficulty }=await ensureGuide(context,{cache:{get:async(_p,k)=>guides.get(k),put:async(_p,k,g)=>{guides.set(k,g);}},call:bedrockJson,load:loadGuideSource});
const at=(s:number)=>new Date(Date.UTC(2026,0,1,0,0,s)).toISOString();
const messages=[{id:"a",role:"user",text:"Hi Wyatt, I'm the student working with you today. Is it okay if I ask you about how you've been feeling?",sequence:1,createdAt:at(0)},{id:"b",role:"assistant",text:"Yeah, that's okay.",sequence:2,createdAt:at(5)},{id:"c",role:"user",text:"What medications are you taking, and how do you feel about taking them?",sequence:3,createdAt:at(20)},{id:"d",role:"assistant",text:"I take metformin and glipizide. I'm not always comfortable talking about my health.",sequence:4,createdAt:at(25)}] as ChatMessage[];
const turns=buildTranscript(messages);
const result=finalizeEvaluation(await evaluateTranscript(guide,turns,bedrockJson),guide,turns,difficulty);
writeFileSync(process.argv[2]??"/private/tmp/twinverse-feedback-verification.json",JSON.stringify({kind:"Synthetic transcript verification - no student encounter modified",...result},null,2));
console.log(JSON.stringify({valid:true,scoring:result.scoring,reviewFlags:result.feedback.reviewFlags.length,items:result.items.length}));
