import WyattAvatar from "./components/WyattAvatar";
import { connectAvatarAudio } from "./avatarAudio";
import { readFeedback, type Feedback } from "./feedback.ts";
import { VoiceConversation, type VoiceState } from "./voiceConversation.ts";
import { useEffect, useRef, useState } from "react";
import { RICH_WYATT_ID, parsePatient, parseEncounter, parseSummaries, type Patient, type Encounter, type EncounterSummary } from "./previewApi.ts";
const preview = "?mode=development-preview";
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, cache: "no-store" });
  if (response.status === 401) throw Object.assign(new Error("Your sign-in session ended. Sign in again to restore your saved encounter."), { status: 401 });
  if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("The backend is temporarily unavailable. Your saved conversation is safe; please retry.");
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || "Request failed."), { status: response.status });
  return result;
}
export default function App() {
  const voice = useRef<VoiceConversation | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("off");
  const currentEncounter = useRef<Encounter | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackError, setFeedbackError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [room, setRoom] = useState(false);
  const [savedEncounters, setSavedEncounters] = useState<EncounterSummary[]>([]);
  const [selectedId, setSelectedId] = useState(new URLSearchParams(window.location.search).get("encounter"));
  const [loading, setLoading] = useState(false);
  const [playingReply, setPlayingReply] = useState(false);
  const [audioBusy, setAudioBusy] = useState<string | null>(null);
  const [audioError, setAudioError] = useState("");
  const audioController = useRef<AbortController | null>(null);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState(new URLSearchParams(window.location.search).has("authError") ? "Sign-in could not be verified. Please try again." : "");
  const [reload, setReload] = useState(0);
  const pending = useRef<{ requestId: string; revision: number; text: string; encounterId: string } | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  currentEncounter.current = encounter;
  function report(error: unknown) {
    if (error instanceof Error && "status" in error && error.status === 401) { setSignedIn(false); setPatient(null); setEncounter(null); setRoom(false); voice.current?.stop(); }
    setError(error instanceof Error ? error.message : "Service unavailable.");
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (response.status === 401) return;
      if (!response.ok) throw new Error("Login service unavailable.");
      const session = await response.json(); if (session.role === "faculty") {window.location.replace("/faculty.html"); return;} if (!controller.signal.aborted) setSignedIn(session.signedIn === true);
    }).catch(error => { if (!controller.signal.aborted) report(error); }).finally(() => { if (!controller.signal.aborted) setCheckingLogin(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false; setLoading(true); setError("");
    void (async () => {
      try {
        const saved = parseSummaries(await api(`/api/encounters${preview}`));
        if (!cancelled) setSavedEncounters(saved);
        if (selectedId) {
          const response = await api(`/api/encounters/${selectedId}${preview}`);
          const restored = parseEncounter(response.encounter);
          if (!cancelled && response.encounter.endedAt) { setProcessing(true); if (response.encounter.feedback) setFeedback(readFeedback(response.encounter.feedback)); else setFeedbackError("Your session is saved. Select Retry feedback to generate your assessment."); }
          if (!cancelled) { setPatient(restored.patient); setEncounter(restored); setRoom(true); }
        } else {
          const catalogue = await api(`/api/patients${preview}`);
          if(!Array.isArray(catalogue.patients))throw new Error("Patient list unavailable.");
          const cards=catalogue.patients.map(parsePatient);
          if (!cancelled) {setPatients(cards);setPatient(cards[0]??null);}
        }
      } catch (error) { if (!cancelled) report(error); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [signedIn, reload, selectedId]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" }); }, [encounter?.messages.length]);
  useEffect(() => {
    if (!encounter?.busy || sending) return;
    const timer = window.setTimeout(() => setReload(r => r + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [encounter?.busy, reload, sending]);
  useEffect(() => { audioController.current?.abort(); setAudioBusy(null); setAudioError(""); return () => audioController.current?.abort(); }, [encounter?.encounterId, signedIn]);
  async function replyAudio(encounterId: string, messageId: string, signal: AbortSignal) {
    const response = await fetch(`/api/encounters/${encounterId}/speech${preview}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }), signal, cache: "no-store" });
    if (response.status === 401) { const expired = Object.assign(new Error("Your sign-in session ended. Sign in again to restore your saved encounter."), { status: 401 }); report(expired); throw expired; }
    if (!response.ok || !response.headers.get("Content-Type")?.startsWith("audio/")) {
      let message = "Audio is unavailable. You can keep typing.";
      if (response.headers.get("Content-Type")?.includes("application/json")) message = (await response.json()).message || message;
      throw new Error(message);
    }
    return response.arrayBuffer();
  }
  const playback = useRef<AudioContext | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => () => { voice.current?.stop(); playing.current?.stop(); void playback.current?.close(); }, []);
  useEffect(() => { voice.current?.stop(); playing.current?.stop(); playing.current = null; setPlayingReply(false); }, [encounter?.encounterId, signedIn]);
  async function speak(messageId: string) {
    if (!encounter || audioBusy) return;
    const controller = new AbortController(); audioController.current = controller;
    setAudioBusy(messageId); setAudioError("");
    try {
      playback.current ??= new AudioContext(); await playback.current.resume(); playing.current?.stop(); playing.current = null;
      const bytes = await replyAudio(encounter.encounterId,messageId,controller.signal);
      if (controller.signal.aborted) return;
      const buffer = await playback.current.decodeAudioData(bytes); if (controller.signal.aborted) return;
      const source = playback.current.createBufferSource(); source.buffer = buffer; const disconnectAvatar = connectAvatarAudio(source,playback.current); playing.current = source;
      source.onended = () => { disconnectAvatar(); if (playing.current === source) { playing.current = null; setPlayingReply(false); } }; setPlayingReply(true); source.start();
    } catch (error) { if (!controller.signal.aborted) setAudioError(error instanceof Error ? error.message : "Audio unavailable. You can keep typing."); }
    finally { if (!controller.signal.aborted) setAudioBusy(null); }
  }
  function startVoice() {
    if (!encounter || voiceState !== "off") return;
    audioController.current?.abort(); playing.current?.stop(); playing.current = null; setAudioError("");
    const conversation = new VoiceConversation(setVoiceState,setAudioError,async (blob, signal) => {
      try {
      const current = currentEncounter.current; if (!current) throw new Error("Open an encounter first.");
      const result = await api(`/api/encounters/${current.encounterId}/transcription${preview}`,{method:"POST",headers:{"Content-Type":blob.type},body:blob,signal});
      if (signal.aborted) throw new Error("Conversation stopped.");
      setText(result.text); conversation.thinking();
      const next = await submitMessage(result.text, signal);
      if (signal.aborted) throw new Error("Conversation stopped.");
      const reply = next.messages.at(-1); if (!reply || reply.role !== "assistant") throw new Error("No saved patient reply available.");
      return await replyAudio(next.encounterId,reply.id,signal);
      } catch (error) { report(error); throw error; }
    });
    voice.current = conversation; void conversation.start();
  }
  function selectEncounter(id: string) {
    setSelectedId(id); window.history.replaceState(null, "", `/?encounter=${encodeURIComponent(id)}`);
  }
  async function reviewSession() {
    if (!encounter || reviewing) return;
    setReviewing(true); setFeedbackError("");
    try { const result = await api(`/api/encounters/${encounter.encounterId}/finish${preview}`, { method: "POST", signal: AbortSignal.timeout(95000) }); setFeedback(readFeedback(result.feedback)); }
    catch (error) { setFeedbackError(error instanceof Error ? error.message : "Feedback unavailable. Your conversation is saved."); }
    finally { setReviewing(false); }
  }
  function endSession() {
    voice.current?.stop(); audioController.current?.abort(); playing.current?.stop(); playing.current = null; setPlayingReply(false); setAudioBusy(null); setFeedback(null); setFeedbackError(""); setProcessing(true); void reviewSession();
  }
  function showPatients() { setProcessing(false); setPatient(null); setSelectedId(null); setRoom(false); setEncounter(null); setText(""); pending.current = null; window.history.replaceState(null, "", "/"); setReload(r => r + 1); }
  async function openRoom(selectedPatient = patient) {
    setLoading(true); setError("");
    try {
      const result = await api(`/api/encounters${preview}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: selectedPatient?.patientId }) });
      const next = parseEncounter(result.encounter); setEncounter(next); setRoom(true); selectEncounter(next.encounterId);
    } catch (error) { report(error); } finally { setLoading(false); }
  }
  async function submitMessage(message: string, signal?: AbortSignal) {
    const current = currentEncounter.current;
    if (!current || current.readOnly || !message.trim()) throw new Error("Open an available encounter first.");
    if (!pending.current || pending.current.text !== message.trim() || pending.current.revision !== current.revision || pending.current.encounterId !== current.encounterId) pending.current = { requestId: crypto.randomUUID(), revision: current.revision, text: message.trim(), encounterId: current.encounterId };
    setSending(true); setError("");
    try {
      const result = await api(`/api/encounters/${current.encounterId}/messages${preview}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.current), signal });
      const next = parseEncounter(result.encounter); currentEncounter.current = next; setEncounter(next); pending.current = null; setText(""); return next;
    } finally { setSending(false); }
  }
  async function send() {
    if (sending || !text.trim()) return;
    playback.current ??= new AudioContext(); void playback.current.resume().catch(() => undefined);
    try { const next = await submitMessage(text); const reply = next.messages.at(-1); if (reply?.role === "assistant") await speak(reply.id); } catch (error) { report(error); }
  }
  async function signOut() {
    voice.current?.stop(); audioController.current?.abort(); playing.current?.stop(); playing.current = null;
    try { const result = await api("/api/auth/logout", { method: "POST" }); window.location.assign(result.logoutUrl); } catch (error) { report(error); }
  }
  if (processing) return <main className="min-h-dvh bg-paper text-ink p-6 md:p-12"><p className="text-teal font-semibold">TwinVerse · Student</p><section className="mx-auto mt-10 max-w-4xl rounded-2xl border border-line bg-white p-8"><h1 className="font-display text-3xl">{feedback ? "Encounter feedback" : reviewing ? "Reviewing your session" : "Session ended"}</h1>{reviewing && <p className="mt-4" role="status">Comparing your saved interview with the patient’s learning objectives…</p>}{feedbackError && <div className="mt-4" role="alert"><p>{feedbackError}</p><button className="mt-3 rounded border px-4 py-2" onClick={() => void reviewSession()}>Retry feedback</button></div>}{feedback && <><p className="mt-3 text-sm text-ink-3">AI-generated educational feedback · {new Date(feedback.generatedAt).toLocaleString()}</p><p className="mt-4">{feedback.summary}</p><p className="mt-3 rounded bg-paper p-3">{feedback.objectiveStatus}</p>{([['strengths','Strengths'],['elicited','Findings elicited'],['missed','Findings to explore'],['improvements','Next attempt']] as const).map(([key,title])=><section key={key} className="mt-6"><h2 className="font-display text-xl">{title}</h2>{feedback[key].length===0?<p className="mt-2 text-ink-3">No supported observations in this category.</p>:feedback[key].map((item,i)=><article key={i} className="mt-3 rounded-xl border border-line p-4"><h3 className="font-semibold">{item.category}</h3><p className="mt-2">{item.observation}</p><p className="mt-2 text-teal">Next step: {item.suggestion}</p>{item.messageSequences.map(n=><blockquote key={n} className="mt-3 border-l-2 border-teal pl-3 text-sm text-ink-3">Exchange {n}: {encounter?.messages.find(m=>m.sequence===n)?.text}</blockquote>)}</article>)}</section>)}</>}<button className="mt-8 rounded-lg bg-teal px-5 py-3 text-white" disabled={reviewing} onClick={showPatients}>Back to patients</button></section></main>;
  if (!signedIn && !checkingLogin) return <main className="min-h-dvh bg-paper px-6 py-16 text-ink flex items-center justify-center sm:px-10">
    <section className="w-full max-w-5xl text-center" aria-labelledby="welcome-title">
      <h1 id="welcome-title" className="font-display text-5xl sm:text-6xl">Welcome</h1>
      <p className="mt-5 text-lg text-ink-3">Choose where you want to work, then sign in with your demo account.</p>
      {error && <p role="alert" className="mt-6 text-danger">{error}</p>}
      <div className="mt-12 grid gap-7 sm:grid-cols-2">
        <a href="/api/auth/login" className="group flex min-h-96 flex-col items-center justify-center rounded-3xl border border-line bg-white/70 px-8 py-12 transition hover:border-teal hover:bg-white hover:shadow-sm">
          <span className="flex size-20 items-center justify-center rounded-full bg-teal-soft text-teal-deep"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 9 10-5 10 5-10 5-10-5Z"/><path d="M6 11v6c3 3 9 3 12 0v-6M22 9v7"/></svg></span>
          <h2 className="mt-7 font-display text-3xl">Student</h2>
          <p className="mt-4 max-w-xs text-lg text-ink-3">Interview a virtual patient and get feedback on your encounter.</p>
          <span className="mt-7 font-semibold text-teal-deep">Start an encounter <span aria-hidden="true">→</span></span>
        </a>
        <a href="/api/auth/login?destination=faculty" className="group flex min-h-96 flex-col items-center justify-center rounded-3xl border border-line bg-white/70 px-8 py-12 transition hover:border-teal hover:bg-white hover:shadow-sm">
          <span className="flex size-20 items-center justify-center rounded-full bg-teal-soft text-teal-deep"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1.5"/><path d="M9 12h6M9 16h6"/></svg></span>
          <h2 className="mt-7 font-display text-3xl">Faculty</h2>
          <p className="mt-4 max-w-xs text-lg text-ink-3">Build and publish virtual patients for student encounters.</p>
          <span className="mt-7 font-semibold text-teal-deep">Open Patient Studio <span aria-hidden="true">→</span></span>
        </a>
      </div>
    </section>
  </main>;
  return <main className="min-h-dvh bg-paper text-ink p-6 md:p-12">
    <header className="mb-6 flex justify-between gap-4"><div><p className="text-teal font-semibold">Proxy · Student</p><h1 className="font-display text-3xl mt-2">{room ? "Patient encounter" : "Choose a patient"}</h1></div>{signedIn && <button className="rounded border px-4 py-2 self-start" onClick={() => void signOut()}>Sign out</button>}</header>
    {signedIn && room && <button className="mb-4 rounded border px-4 py-2" disabled={sending} onClick={showPatients}>Choose patient / saved encounters</button>}
    {checkingLogin && <p role="status">Checking student login…</p>}
    {!checkingLogin && !signedIn && <section className="rounded-xl border border-line bg-white p-6"><h2 className="text-xl font-semibold">Welcome to TwinVerse</h2><p className="my-3">Choose where you want to work, then sign in with your demo account.</p><div className="flex flex-wrap gap-3"><a className="inline-block rounded-lg bg-teal text-white px-5 py-3" href="/api/auth/login">Student · Start an encounter</a><a className="inline-block rounded-lg border border-teal text-teal px-5 py-3" href="/api/auth/login?destination=faculty">Faculty · Patient Studio</a></div></section>}

    {error && <div className="mb-4 rounded border border-red-300 bg-white p-4" role="alert"><p>{error}</p>{signedIn && <button className="mt-2 rounded border px-4 py-2" onClick={() => setReload(r => r + 1)}>Refresh saved conversation</button>}</div>}
    {loading && <p role="status" className="mb-4">Loading saved patient and conversation…</p>}
    {signedIn && !room && <div className="grid gap-4 md:grid-cols-2">{patients.map(card=><section key={card.patientId} className="rounded-xl border border-line bg-white p-6"><h2 className="text-2xl font-display">{card.fields.name}</h2><p className="mt-2">Age {card.fields.age ?? "not supplied"} · {card.fields.background ?? "Background not supplied"}</p><button disabled={loading} className="mt-5 rounded-lg bg-teal text-white px-5 py-3 disabled:opacity-50" onClick={() => void openRoom(card)}>Start encounter</button></section>)}</div>}

    {signedIn && !room && savedEncounters.length > 0 && <section className="mt-6 rounded-xl border border-line bg-white p-6"><h2 className="font-display text-xl">Your saved encounters</h2><ul className="mt-3 space-y-3">{savedEncounters.map(saved => <li key={saved.encounterId}><button className="rounded border px-4 py-2 text-left" disabled={loading} onClick={() => selectEncounter(saved.encounterId)}>{saved.patientName ?? "Wyatt Nelson"}{saved.readOnly ? " · Archived" : ""} · {saved.messageCount} messages · {new Date(saved.updatedAt).toLocaleString()}</button></li>)}</ul></section>}
    {signedIn && patient && room && encounter && <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border border-line bg-white p-6">{(encounter.patientId===RICH_WYATT_ID || encounter.patient.fields.name.toLowerCase()==="wyatt nelson")?<WyattAvatar />:<div className="rounded-xl bg-paper p-8 text-center text-ink-3">{encounter.patient.fields.name}</div>}<h2 className="font-display text-2xl mt-4">{encounter.patient.fields.name}</h2><p className="mt-2">Age: {encounter.patient.fields.age ?? "Not supplied"}</p>{encounter.readOnly && <p className="my-3 text-amber-800">This encounter is archived. You can read it or start a new encounter.</p>}
        <div ref={transcript} className="mt-5 space-y-3 max-h-96 overflow-y-auto" role="log" aria-label="Saved patient conversation" aria-live="polite">{encounter.messages.length === 0 && <p className="text-ink-3">Introduce yourself and ask the patient how they’re feeling.</p>}{encounter.messages.map(message => <div key={message.id} className={`rounded-xl p-3 ${message.role === "user" ? "bg-paper" : "bg-teal/10"}`}><strong>{message.role === "user" ? "You" : encounter.patient.fields.name}</strong><p className="mt-1 whitespace-pre-wrap">{message.text}</p>{message.role === "assistant" && !encounter.readOnly && <button className="mt-2 rounded border px-3 py-1" disabled={!!audioBusy || voiceState !== "off"} onClick={() => void speak(message.id)}>{audioBusy === message.id ? "Preparing audio…" : "Hear reply"}</button>}</div>)}</div>
        {voiceState === "off" && (audioBusy || playingReply) && <button className="mt-3 rounded border px-3 py-1" onClick={() => { audioController.current?.abort(); playing.current?.stop(); playing.current = null; setPlayingReply(false); setAudioBusy(null); }}>Stop audio</button>}
        {audioError && <p className="my-3 text-red-700" role="alert">{audioError}</p>}
        {!encounter.readOnly && <div className="mt-4 rounded-xl bg-paper p-4"><p role="status" className="font-semibold">{({off:"Voice conversation",starting:"Starting microphone…",listening:"Listening…",transcribing:"Understanding your question…",thinking:"The patient is thinking…",speaking:"The patient is speaking…"})[voiceState]}</p>{voiceState === "off" ? <><p className="mt-1 text-sm text-ink-3">Your microphone questions are transcribed through ElevenLabs. Pause when you finish; the patient will reply aloud.</p><button className="mt-3 rounded-lg bg-teal px-4 py-2 text-white" disabled={sending || encounter.busy || voiceState !== "off"} onClick={startVoice}>Start conversation</button></> : <div className="mt-3 flex gap-2"><button className="rounded border px-4 py-2" onClick={() => { voice.current?.stop(); setReload(r => r + 1); }}>Stop conversation</button>{voiceState === "listening" && <button className="rounded border px-4 py-2" onClick={() => voice.current?.finishQuestion()}>Done speaking</button>}{voiceState === "speaking" && <button className="rounded border px-4 py-2" onClick={() => voice.current?.interrupt()}>Interrupt patient</button>}</div>}</div>}
        {(sending || encounter.busy) && <p className="my-3" role="status">The patient is replying…</p>}
        {!encounter.readOnly && <form className="mt-5" onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="message" className="font-semibold">Talk to {encounter.patient.fields.name}</label><textarea id="message" value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={sending || encounter.busy || voiceState !== "off"} placeholder="Type your question…" className="mt-2 w-full rounded border p-3" /><button type="submit" disabled={sending || encounter.busy || voiceState !== "off" || !text.trim()} className="mt-2 rounded-lg bg-teal text-white px-5 py-3 disabled:opacity-50">{sending ? "Sending…" : "Send message"}</button></form>}<p className="mt-3 text-sm text-ink-3">Your conversation is saved. You can speak or type.</p>
      </section>
      <section className="flex flex-col rounded-2xl border border-line bg-white p-6"><h2 className="font-display text-xl">Medical chart</h2>{encounter.chart.entries.length === 0 ? <p className="mt-6">No clinical details have been discussed in this encounter yet.</p> : <dl className="mt-5 space-y-3">{encounter.chart.entries.map((entry, i) => <div key={`${i}-${entry.label}`}><dt className="font-semibold capitalize">{entry.label}</dt><dd className="mt-1">{entry.value}</dd></div>)}</dl>}{encounter.chart.documents.length===0?<p className="mt-6 text-ink-3">No reports available yet.</p>:<section className="mt-6"><h3 className="font-semibold">Reports</h3>{encounter.chart.documents.map(doc=><article key={doc.id} className="mt-3 rounded border border-line p-4"><h4 className="font-semibold">{doc.title}</h4><p className="mt-2 whitespace-pre-wrap">{doc.findings}</p><a className="mt-2 inline-block text-teal underline" target="_blank" rel="noopener" href={`/api/encounters/${encounter.encounterId}/documents/${doc.id}${preview}`}>{doc.contentType==="application/pdf"?"Download PDF":"Open report"}</a></article>)}</section>}<div className="mt-auto flex justify-end pt-8"><button className="rounded-lg bg-teal px-5 py-3 text-white" disabled={sending || encounter.busy || voiceState === "transcribing" || voiceState === "thinking"} onClick={endSession}>End session</button></div></section>
    </div>}
  </main>;
}
