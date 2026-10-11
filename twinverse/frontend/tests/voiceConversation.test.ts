import { test } from "node:test";
import assert from "node:assert/strict";
import { SilenceDetector } from "../src/voiceConversation.ts";
test("silence alone never submits a turn; sustained speech needs a pause", () => {
 const d = new SilenceDetector(); assert.equal(d.sample(0,2000),false);
 for (let i=0;i<4;i++) assert.equal(d.sample(0.06,3000+i*100),false);
 assert.equal(d.sample(0,4000),false); assert.equal(d.sample(0,4600),true);
});
test("resumed speech resets the pause and a short noise does not submit", () => {
 const d = new SilenceDetector(); d.sample(0.1,1000); assert.equal(d.sample(0,4000),false);
 for(let i=0;i<4;i++) d.sample(0.1,5000+i*100);
 d.sample(0.1,6100); assert.equal(d.sample(0,7000),false); assert.equal(d.sample(0,7500),true);
});

test("stopping during microphone permission setup releases a late stream and never sends audio", async () => {
 const {VoiceConversation}=await import("../src/voiceConversation.ts");
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
 const originalContext=Object.getOwnPropertyDescriptor(globalThis,"AudioContext");
 const originalRecorder=Object.getOwnPropertyDescriptor(globalThis,"MediaRecorder");
 let release!: (value: unknown)=>void; let stopped=0; let sent=0;
 const media=new Promise(resolve=>{release=resolve;});
 class Context {state="running";async resume(){}async close(){this.state="closed";}}
 Object.defineProperty(globalThis,"AudioContext",{configurable:true,value:Context});
 Object.defineProperty(globalThis,"MediaRecorder",{configurable:true,value:class {}});
 Object.defineProperty(globalThis,"navigator",{configurable:true,value:{mediaDevices:{getUserMedia:()=>media}}});
 const states:string[]=[];const errors:string[]=[];
 try{
 const voice=new VoiceConversation(s=>states.push(s),e=>errors.push(e),async()=>{sent++;return new ArrayBuffer(0);});
 const starting=voice.start();await Promise.resolve();voice.stop();release({getTracks:()=>[{stop(){stopped++;}}]});await starting;
 assert.equal(stopped,1);assert.equal(sent,0);assert.equal(states.at(-1),"off");assert.deepEqual(errors,[]);
 }finally{
 for(const [name,descriptor] of [["navigator",originalNavigator],["AudioContext",originalContext],["MediaRecorder",originalRecorder]] as const){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}
 }
});
