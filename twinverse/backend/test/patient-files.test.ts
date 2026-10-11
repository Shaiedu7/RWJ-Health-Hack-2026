import test from "node:test";
import assert from "node:assert/strict";
import { validateUpload,validateFileBindings,type PatientFile } from "../lib/patient-files.js";
import { studioContext,releasedFindings,publishedTurnContext } from "../lib/published-context.js";
import { publicEncounter,type Encounter } from "../lib/student-encounters.js";
import { blankFacultyProfile } from "../lib/faculty-patients.js";
import { reviewProfile } from "../lib/faculty-review.js";
test("uploads reject spoofed content and cross-patient file references",()=>{
 validateUpload(Buffer.from("%PDF-1.7 test"),"application/pdf");
 assert.throws(()=>validateUpload(Buffer.from("<script>"),"application/pdf"),/contents/);
 assert.throws(()=>validateUpload(new Uint8Array(2000001),"application/pdf"),/2 MB/);
 const file={id:"x",object_key:"faculty/a/patients/p/id",content_type:"application/pdf"} as PatientFile;
 assert.throws(()=>validateFileBindings({artifacts:[file]},"b","p",{artifacts:[file]}),/authenticated upload/);
 validateFileBindings({artifacts:[file]},"a","p",{artifacts:[file]});
});
test("unreleased report bytes and text stay private, released report is bound to encounter",()=>{
 const p=blankFacultyProfile(),id="e97b0810-00c7-44cd-a218-a9458716af27";
 p["artifacts"]=[{id,title:"ECG report",kind:"report",file_url:"",findings:"SUPPLIED_REPORT_ONLY",object_key:"PRIVATE_OBJECT_KEY",filename:"ecg.pdf",content_type:"application/pdf",reviewed:true,trigger:{type:"exam_requested",value:"ECG"}}];
 p["knowledge"]=[{id:"k",title:"Reference",text:"PRIVATE_REFERENCE",purpose:"teaching_reference",reviewed:true}];
 const c=studioContext("faculty-test","v1",p);
 assert.equal(releasedFindings(c,[]).length,0);
 assert.ok(!JSON.stringify(publishedTurnContext(c,[],"Hi").evidence).includes("SUPPLIED_REPORT_ONLY"));
 const e={encounterId:"e",patientId:"faculty-test",context:c,revision:0,messages:[],requests:{},updatedAt:"now",version:0,mode:"published"} as Encounter;
 assert.ok(!JSON.stringify(publicEncounter(e)).includes("PRIVATE_OBJECT_KEY"));
 assert.ok(!JSON.stringify(c.patientInformation).includes("PRIVATE_REFERENCE"));
 e.messages=[{id:"m",role:"user",text:"Can I request an ECG test?",sequence:1,createdAt:"now"}];
 const visible=publicEncounter(e);assert.equal(visible.chart.documents.length,1);assert.equal(visible.chart.documents[0]?.id,id);assert.ok(!JSON.stringify(visible).includes("PRIVATE_OBJECT_KEY"));
});
test("extracted file text needs faculty review before publishing",()=>{
 const p=blankFacultyProfile();p["artifacts"]=[{id:"x",title:"Report",findings:"source text",reviewed:false}];
 assert.ok(reviewProfile(p).some(i=>i.path==="artifacts"&&i.severity==="critical"));
});
