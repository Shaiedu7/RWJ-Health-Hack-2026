import test from "node:test";
import assert from "node:assert/strict";
import { finishEncounter, parseFeedback, feedbackInput, type EncounterFeedback } from "../lib/encounter-feedback.js";
import { openEncounter, sendTurn, type Encounter, type EncounterStore } from "../lib/student-encounters.js";
import { studioContext } from "../lib/published-context.js";
import { blankFacultyProfile } from "../lib/faculty-patients.js";
function memory(): EncounterStore {
 const values=new Map<string,Encounter>();
 return {get:async(o,id)=>structuredClone(values.get(o+id)),list:async()=>[],save:async(o,next,v)=>{const prev=values.get(o+next.encounterId);if(v!==undefined&&prev?.version!==v)throw new Error("revision mismatch");values.set(o+next.encounterId,structuredClone(next));}};
}
function result(): EncounterFeedback {return {generatedAt:new Date().toISOString(),summary:"No interview exchanges were saved.",objectiveStatus:"No supplied objectives.",strengths:[],improvements:[],elicited:[],missed:[]};}
test("finished trials are owned, immutable, logged and feedback survives reload",async()=>{
 const store=memory(),p=blankFacultyProfile(); const context=studioContext("faculty-test","v1",p);
 const e=await openEncounter(store,"student-a",context);let calls=0;
 const generator=async()=>{calls++;return result();};
 await assert.rejects(finishEncounter(store,"student-b",e.encounterId,generator),/unavailable/);
 await finishEncounter(store,"student-a",e.encounterId,generator);
 const saved=await store.get("student-a",e.encounterId);assert.ok(saved?.endedAt);assert.equal(saved.feedback?.summary,result().summary);
 await finishEncounter(store,"student-a",e.encounterId,generator);assert.equal(calls,1);
 await assert.rejects(sendTurn(store,"student-a",{encounterId:e.encounterId,requestId:"r",revision:0,text:"Hi"},async()=>({text:"Hi",evidenceIds:[]})),/ended/);
});
test("feedback retry preserves the ended trial when generation fails",async()=>{
 const store=memory(),e=await openEncounter(store,"a",studioContext("faculty-test","v1",blankFacultyProfile()));
 await assert.rejects(finishEncounter(store,"a",e.encounterId,async()=>{throw new Error("Bedrock unavailable");}),/unavailable/);
 assert.ok((await store.get("a",e.encounterId))?.endedAt);
 assert.equal((await store.get("a",e.encounterId))?.feedback,undefined);
 await finishEncounter(store,"a",e.encounterId,async()=>result());
 assert.ok((await store.get("a",e.encounterId))?.feedback);
});
test("feedback rejects invented exchange citations and unsupported strengths",()=>{
 const e={messages:[{sequence:1,role:"user",text:"Hello"}]} as Encounter;
 const invalid={...result(),strengths:[{category:"Empathy",observation:"Student reassured the patient",suggestion:"Continue",messageSequences:[9]}]};
 assert.throws(()=>parseFeedback(JSON.stringify(invalid),e),/evidence/);
 const first=invalid.strengths[0];assert.ok(first);first.messageSequences=[];assert.throws(()=>parseFeedback(JSON.stringify(invalid),e),/student message evidence/);
 e.messages.push({sequence:2,role:"assistant",text:"I feel tired"} as Encounter["messages"][number]);
 first.messageSequences=[2];assert.throws(()=>parseFeedback(JSON.stringify(invalid),e),/student message evidence/);
});
test("feedback considers only released chart reports and omits file storage and hidden teaching answers",()=>{
 const p=blankFacultyProfile();p["artifacts"]=[{id:"report",title:"Sample report",findings:"Reviewed text",reviewed:true,object_key:"SECRET_STORAGE_KEY",trigger:{type:"exam_requested",value:"sample report"}}];
 p["learning"]={objectives:["Request the sample report"],competencies:[],key_questions_to_ask:["HIDDEN_ANSWER"]};
 const e={context:studioContext("faculty-test","v1",p),messages:[]} as unknown as Encounter;
 assert.deepEqual(feedbackInput(e).availableReports,[]);
 e.messages=[{sequence:1,role:"user",text:"Can I request the sample report test?"}] as Encounter["messages"];
 assert.deepEqual(feedbackInput(e).availableReports,["Sample report"]);
 assert.doesNotMatch(JSON.stringify(feedbackInput(e)),/SECRET_STORAGE_KEY|HIDDEN_ANSWER/);
});
