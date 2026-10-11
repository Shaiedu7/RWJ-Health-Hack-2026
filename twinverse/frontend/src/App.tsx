import { VoiceConversation, type VoiceState } from "./voiceConversation.ts";
import wyattPortrait from "./assets/wyatt-nelson.png";
import { useEffect, useRef, useState } from "react";
import { RICH_WYATT_ID, parsePatient, parseEncounter, parseSummaries, type Patient, type Encounter, type EncounterSummary } from "./previewApi.ts";
const preview = "?mode=development-preview";
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, cache: "no-store" });
  if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("Unable to connect. Please try again shortly.");
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
    if (error instanceof Error && "status" in error && error.status === 401) { setSignedIn(false); setPatient(null); setEncounter(null); setRoom(false); setSelectedId(null); }
    setError(error instanceof Error ? error.message : "Service unavailable.");
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (response.status === 401) return;
      if (!response.ok) throw new Error("Login service unavailable.");
      const session = await response.json(); if (!controller.signal.aborted) setSignedIn(session.signedIn === true);
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
      const source = playback.current.createBufferSource(); source.buffer = buffer; source.connect(playback.current.destination); playing.current = source;
      source.onended = () => { if (playing.current === source) { playing.current = null; setPlayingReply(false); } }; setPlayingReply(true); source.start();
    } catch (error) { if (!controller.signal.aborted) setAudioError(error instanceof Error ? error.message : "Audio unavailable. You can keep typing."); }
    finally { if (!controller.signal.aborted) setAudioBusy(null); }
  }
  function startVoice() {
    if (!encounter || voiceState !== "off") return;
    audioController.current?.abort(); playing.current?.stop(); playing.current = null; setAudioError("");
    const conversation = new VoiceConversation(setVoiceState,setAudioError,async (blob, signal) => {
      const current = currentEncounter.current; if (!current) throw new Error("Open an encounter first.");
      const result = await api(`/api/encounters/${current.encounterId}/transcription${preview}`,{method:"POST",headers:{"Content-Type":blob.type},body:blob,signal});
      if (signal.aborted) throw new Error("Conversation stopped.");
      setText(result.text); conversation.thinking();
      const next = await submitMessage(result.text, signal);
      if (signal.aborted) throw new Error("Conversation stopped.");
      const reply = next.messages.at(-1); if (!reply || reply.role !== "assistant") throw new Error("No saved patient reply available.");
      return replyAudio(next.encounterId,reply.id,signal);
    });
    voice.current = conversation; void conversation.start();
  }
  function selectEncounter(id: string) {
    setSelectedId(id); window.history.replaceState(null, "", `/?encounter=${encodeURIComponent(id)}`);
  }
  function endSession() {
    voice.current?.stop(); audioController.current?.abort(); playing.current?.stop(); playing.current = null; setPlayingReply(false); setAudioBusy(null); setProcessing(true);
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
  if (processing) return <main className="min-h-dvh bg-paper text-ink p-6 md:p-12"><p className="text-teal font-semibold">TwinVerse · Student</p><section className="mx-auto mt-24 max-w-lg rounded-2xl border border-line bg-white p-10 text-center"><div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-4 border-teal/20 border-t-teal" aria-hidden="true" /><h1 className="font-display text-3xl">Processing your session</h1><p className="mt-4 text-ink-3" role="status">{sending || encounter?.busy ? "Finishing your last exchange…" : "Session ended. Your saved conversation remains available."}</p><p className="mt-3 text-sm text-ink-3">Session review isn’t available yet.</p><button className="mt-8 rounded-lg bg-teal px-5 py-3 text-white" disabled={sending || encounter?.busy} onClick={showPatients}>Back to patients</button></section></main>;
  return <main className="min-h-dvh bg-paper text-ink p-6 md:p-12">
    <header className="mb-6 flex justify-between gap-4"><div><p className="text-teal font-semibold">TwinVerse · Student <span className="ml-2 rounded bg-teal/10 px-2 py-1 text-xs font-normal">Demo</span></p><h1 className="font-display text-3xl mt-2">{room ? "Patient encounter" : "Choose a patient"}</h1></div>{signedIn && <button className="rounded border px-4 py-2 self-start" onClick={() => void signOut()}>Sign out</button>}</header>
    {signedIn && room && <button className="mb-4 rounded border px-4 py-2" disabled={sending} onClick={showPatients}>Choose patient / saved encounters</button>}
    {checkingLogin && <p role="status">Checking student login…</p>}
    {!checkingLogin && !signedIn && <section className="rounded-xl border border-line bg-white p-6"><h2 className="text-xl font-semibold">Welcome to TwinVerse</h2><p className="my-3">Choose where you want to work, then sign in with your demo account.</p><div className="flex flex-wrap gap-3"><a className="inline-block rounded-lg bg-teal text-white px-5 py-3" href="/api/auth/login">Student · Start an encounter</a><a className="inline-block rounded-lg border border-teal text-teal px-5 py-3" href="/api/auth/login?destination=faculty">Faculty · Patient Studio</a></div></section>}
    {!checkingLogin && signedIn && !room && <a className="inline-block mb-4 rounded border border-teal px-4 py-2 text-teal" href="/faculty.html">Open Faculty Patient Studio</a>}
    {error && <div className="mb-4 rounded border border-red-300 bg-white p-4" role="alert"><p>{error}</p>{signedIn && <button className="mt-2 rounded border px-4 py-2" onClick={() => setReload(r => r + 1)}>Refresh saved conversation</button>}</div>}
    {loading && <p role="status" className="mb-4">Loading saved patient and conversation…</p>}
    {signedIn && !room && <div className="grid gap-4 md:grid-cols-2">{patients.map(card=><section key={card.patientId} className="rounded-xl border border-line bg-white p-6"><h2 className="text-2xl font-display">{card.fields.name}</h2><p className="mt-2">Age {card.fields.age ?? "not supplied"} · {card.fields.background ?? "Background not supplied"}</p><button disabled={loading} className="mt-5 rounded-lg bg-teal text-white px-5 py-3 disabled:opacity-50" onClick={() => void openRoom(card)}>Start encounter</button></section>)}</div>}

    {signedIn && !room && savedEncounters.length > 0 && <section className="mt-6 rounded-xl border border-line bg-white p-6"><h2 className="font-display text-xl">Your saved encounters</h2><ul className="mt-3 space-y-3">{savedEncounters.map(saved => <li key={saved.encounterId}><button className="rounded border px-4 py-2 text-left" disabled={loading} onClick={() => selectEncounter(saved.encounterId)}>{saved.patientName ?? "Wyatt Nelson"}{saved.readOnly ? " · Archived" : ""} · {saved.messageCount} messages · {new Date(saved.updatedAt).toLocaleString()}</button></li>)}</ul></section>}
    {signedIn && patient && room && encounter && <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border border-line bg-white p-6">{encounter.patientId===RICH_WYATT_ID?<img src={wyattPortrait} alt="Wyatt Nelson" className="h-64 w-full rounded-xl bg-paper object-contain" />:<div className="rounded-xl bg-paper p-8 text-center text-ink-3">{encounter.patient.fields.name}</div>}<h2 className="font-display text-2xl mt-4">{encounter.patient.fields.name}</h2><p className="mt-2">Age: {encounter.patient.fields.age ?? "Not supplied"}</p>{encounter.readOnly && <p className="my-3 text-amber-800">This encounter is archived. You can read it or start a new encounter.</p>}
        <div ref={transcript} className="mt-5 space-y-3 max-h-96 overflow-y-auto" role="log" aria-label="Saved patient conversation" aria-live="polite">{encounter.messages.length === 0 && <p className="text-ink-3">Introduce yourself and ask the patient how they’re feeling.</p>}{encounter.messages.map(message => <div key={message.id} className={`rounded-xl p-3 ${message.role === "user" ? "bg-paper" : "bg-teal/10"}`}><strong>{message.role === "user" ? "You" : encounter.patient.fields.name}</strong><p className="mt-1 whitespace-pre-wrap">{message.text}</p>{message.role === "assistant" && !encounter.readOnly && <button className="mt-2 rounded border px-3 py-1" disabled={!!audioBusy || voiceState !== "off"} onClick={() => void speak(message.id)}>{audioBusy === message.id ? "Preparing audio…" : "Hear reply"}</button>}</div>)}</div>
        {voiceState === "off" && (audioBusy || playingReply) && <button className="mt-3 rounded border px-3 py-1" onClick={() => { audioController.current?.abort(); playing.current?.stop(); playing.current = null; setPlayingReply(false); setAudioBusy(null); }}>Stop audio</button>}
        {audioError && <p className="my-3 text-red-700" role="alert">{audioError}</p>}
        {!encounter.readOnly && <div className="mt-4 rounded-xl bg-paper p-4"><p role="status" className="font-semibold">{({off:"Voice conversation",starting:"Starting microphone…",listening:"Listening…",transcribing:"Understanding your question…",thinking:"The patient is thinking…",speaking:"The patient is speaking…"})[voiceState]}</p>{voiceState === "off" ? <><p className="mt-1 text-sm text-ink-3">Your microphone questions are transcribed through ElevenLabs. Pause when you finish; the patient will reply aloud.</p><button className="mt-3 rounded-lg bg-teal px-4 py-2 text-white" disabled={sending || encounter.busy || voiceState !== "off"} onClick={startVoice}>Start conversation</button></> : <div className="mt-3 flex gap-2"><button className="rounded border px-4 py-2" onClick={() => { voice.current?.stop(); setReload(r => r + 1); }}>Stop conversation</button>{voiceState === "listening" && <button className="rounded border px-4 py-2" onClick={() => voice.current?.finishQuestion()}>Done speaking</button>}{voiceState === "speaking" && <button className="rounded border px-4 py-2" onClick={() => voice.current?.interrupt()}>Interrupt patient</button>}</div>}</div>}
        {(sending || encounter.busy) && <p className="my-3" role="status">The patient is replying…</p>}
        {!encounter.readOnly && <form className="mt-5" onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="message" className="font-semibold">Talk to {encounter.patient.fields.name}</label><textarea id="message" value={text} onChange={event => setText(event.target.value)} maxLength={2000} disabled={sending || encounter.busy || voiceState !== "off"} placeholder="Type your question…" className="mt-2 w-full rounded border p-3" /><button type="submit" disabled={sending || encounter.busy || voiceState !== "off" || !text.trim()} className="mt-2 rounded-lg bg-teal text-white px-5 py-3 disabled:opacity-50">{sending ? "Sending…" : "Send message"}</button></form>}<p className="mt-3 text-sm text-ink-3">Your conversation is saved. You can speak or type.</p>
      </section>
      <section className="flex flex-col rounded-2xl border border-line bg-white p-6"><h2 className="font-display text-xl">Medical chart</h2>{encounter.chart.entries.length === 0 ? <p className="mt-6">No clinical details have been discussed in this encounter yet.</p> : <dl className="mt-5 space-y-3">{encounter.chart.entries.map((entry, i) => <div key={`${i}-${entry.label}`}><dt className="font-semibold capitalize">{entry.label}</dt><dd className="mt-1">{entry.value}</dd></div>)}</dl>}<p className="mt-6 text-ink-3">No reports available.</p><div className="mt-auto flex justify-end pt-8"><button className="rounded-lg bg-teal px-5 py-3 text-white" onClick={endSession}>End session</button></div></section>
    </div>}
  </main>;
}
