export type FeedbackItem = {category:string;observation:string;suggestion:string;messageSequences:number[]};
export type Feedback = {summary:string;objectiveStatus:string;generatedAt:string;strengths:FeedbackItem[];improvements:FeedbackItem[];elicited:FeedbackItem[];missed:FeedbackItem[]};
export function readFeedback(value: unknown): Feedback {
 const f=value as Feedback;
 if(!f || typeof f.summary!=="string" || typeof f.objectiveStatus!=="string" || typeof f.generatedAt!=="string")throw new Error("The feedback response was invalid. Please retry.");
 for(const key of ["strengths","improvements","elicited","missed"] as const) {
  if(!Array.isArray(f[key]) || f[key].some(i=>!i || typeof i.category!=="string" || typeof i.observation!=="string" || typeof i.suggestion!=="string" || !Array.isArray(i.messageSequences) || i.messageSequences.some(n=>!Number.isSafeInteger(n))))throw new Error("The feedback response was invalid. Please retry.");
 }
 return f;
}
