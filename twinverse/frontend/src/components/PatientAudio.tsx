import type { PatientAudioController } from "../hooks/usePatientAudio";
import Icon from "./Icon";

const btn =
  "grid size-8 place-items-center rounded-full border border-line bg-card text-ink-2 transition hover:border-teal hover:text-teal-deep disabled:cursor-not-allowed disabled:opacity-40";

export default function PatientAudio({ audio, hasResponse }: { audio: PatientAudioController; hasResponse: boolean }) {
  const { status, muted, volume, voiceEnabled } = audio;
  const busy = status === "playing" || status === "loading";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" role="group" aria-label="Patient voice controls">
      <div className="flex items-center gap-1.5">
        <button onClick={audio.replay} disabled={!hasResponse || status === "loading"} className={btn} aria-label="Replay last patient response" title="Replay last response">
          <Icon name="replay" size={15} />
        </button>
        <button onClick={audio.stop} disabled={!busy} className={btn} aria-label="Stop playback" title="Stop playback">
          <Icon name="stop" size={14} />
        </button>
        <button
          onClick={() => audio.setMuted(!muted)}
          disabled={!voiceEnabled}
          className={btn}
          aria-pressed={muted}
          aria-label={muted ? "Unmute patient voice" : "Mute patient voice"}
          title={muted ? "Unmute" : "Mute"}
        >
          <Icon name={muted || !voiceEnabled ? "mute" : "volume"} size={15} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!voiceEnabled || muted}
          onChange={(e) => audio.setVolume(Number(e.target.value))}
          aria-label="Patient voice volume"
          className="h-1 w-20 cursor-pointer accent-teal disabled:opacity-40"
        />
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-2" aria-live="polite">
        {!voiceEnabled && <span>Voice off. Text only.</span>}
        {voiceEnabled && status === "loading" && (
          <span className="flex items-center gap-1.5">
            <span className="anim-ring inline-block size-3 rounded-full border-2 border-teal border-t-transparent" /> Loading patient voice…
          </span>
        )}
        {voiceEnabled && status === "playing" && <span className="text-teal-deep">Playing</span>}
        {status === "failed" && (
          <span className="flex items-center gap-2 text-danger">
            <Icon name="alert" size={14} /> Voice unavailable. You can continue with text.
            <button onClick={audio.replay} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </span>
        )}
      </div>
      <span className="ml-auto rounded-full border border-dashed border-amber-700/40 bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber-900" title="Patient speech is simulated in this prototype. No ElevenLabs connection is active.">
        Demo mode · simulated voice
      </span>
    </div>
  );
}
