import { useState } from "react";
import { fmtTime } from "../lib/format";
import type { ActivityEvent } from "../types";
import Icon from "./Icon";

export default function EncounterActivity({ events }: { events: ActivityEvent[] }) {
  const [open, setOpen] = useState(true);
  const list = [...events].reverse();
  return (
    <section aria-label="Encounter activity" className="border-t border-line bg-paper-2/60">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-ink-2">
        Encounter activity
        <Icon name="chevron" size={14} className={`transition ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <ol className="scroll-soft max-h-28 overflow-y-auto px-5 pb-3">
          {list.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 py-0.5 text-[13px] text-ink-2">
              <span className="font-mono text-xs text-ink-3">{fmtTime(e.t)}</span>
              <span className={`size-1.5 shrink-0 translate-y-[-1px] rounded-full ${e.kind === "record" ? "bg-ink" : e.kind === "info" ? "bg-teal" : "bg-ink-3"}`} />
              {e.label}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
