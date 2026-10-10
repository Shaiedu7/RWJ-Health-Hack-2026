import type { Encounter, PublicCase } from "../types";
import Icon from "./Icon";
import PatientAvatar from "./PatientAvatar";

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-xl bg-teal text-white">
        <Icon name="heart" size={16} />
      </span>
      <span className="font-display text-xl tracking-tight text-ink">PatientRoom</span>
    </div>
  );
}

export function PatientCard({ patient, onStart }: { patient: PublicCase; onStart: (id: string) => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[28px] border border-line bg-card transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(18,38,63,0.35)]">
      <div className="relative h-56 overflow-hidden bg-teal-soft">
        <PatientAvatar appearance={patient.appearance} state="relaxed" variant="portrait" className="h-full w-full" />
        <span className="absolute left-4 top-4 rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-teal-deep">{patient.encounterType}</span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h2 className="font-display text-2xl text-ink">{patient.patientName}</h2>
        <p className="mt-0.5 text-sm text-ink-3">
          {patient.age}-year-old {patient.sex.toLowerCase()} · {patient.setting}
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-2">Presenting concern</p>
        <p className="mt-1 text-[17px] leading-snug text-ink">“{patient.concern}”</p>
        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="clock" size={15} /> About {patient.durationMin} min
          </span>
          <button onClick={() => onStart(patient.id)} className="flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition hover:bg-teal-deep">
            Start encounter <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

interface Props {
  cases: PublicCase[];
  active?: Encounter;
  onStart: (id: string) => void;
  onResume: () => void;
}

export default function CaseSelection({ cases, active, onStart, onResume }: Props) {
  const activeCase = active && active.status === "active" ? cases.find((c) => c.id === active.caseId) : undefined;
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <span className="rounded-full border border-dashed border-amber-700/40 bg-amber-soft px-3 py-1 text-xs font-medium text-amber-900">Demo mode · synthetic patients</span>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-8">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-deep">Student workspace</p>
        <h1 className="mt-3 max-w-2xl font-display text-5xl leading-[1.05] text-ink md:text-6xl">Practice encounters</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
          Interview a simulated patient, listen for what is said and how it is said, and build the picture from the chart as it opens up.
        </p>

        {activeCase && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal/40 bg-teal-soft px-5 py-4">
            <p className="text-[15px] text-teal-deep">
              You have an encounter in progress with <strong>{activeCase.patientName}</strong>.
            </p>
            <button onClick={onResume} className="h-10 rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-teal-deep">
              Resume encounter
            </button>
          </div>
        )}

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {cases.map((c) => (
            <PatientCard key={c.id} patient={c} onStart={onStart} />
          ))}
        </div>
      </main>
    </div>
  );
}
