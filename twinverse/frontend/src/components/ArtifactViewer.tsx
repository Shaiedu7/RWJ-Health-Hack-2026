import type { Artifact } from "../types";
import Modal from "./Modal";

export default function ArtifactViewer({ artifact, onClose }: { artifact: Artifact | null; onClose: () => void }) {
  return (
    <Modal open={!!artifact} onClose={onClose} title={artifact?.title ?? "Record"} side="right">
      {artifact && (
        <article>
          <p className="mb-4 rounded-xl border border-dashed border-amber-700/40 bg-amber-soft px-3 py-2 text-xs text-amber-900">
            Synthetic demonstration record. Not real patient data and not for clinical use.
          </p>
          <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
            <dt className="text-ink-3">Record type</dt>
            <dd className="font-medium">{artifact.type}</dd>
            <dt className="text-ink-3">Date</dt>
            <dd className="font-medium">{artifact.date}</dd>
            <dt className="text-ink-3">Source</dt>
            <dd className="font-medium">{artifact.source}</dd>
          </dl>
          <div className="flex flex-col gap-6">
            {artifact.blocks.map((b, i) => (
              <section key={i}>
                {b.heading && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-teal-deep">{b.heading}</h3>}
                {b.kind === "text" ? (
                  <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink">
                    {b.body.map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-ink-3">
                        {b.columns.map((c) => (
                          <th key={c} scope="col" className="py-2 pr-3 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r, ri) => (
                        <tr key={ri} className="border-b border-line/70">
                          {r.map((cell, ci) => (
                            <td key={ci} className={`py-2 pr-3 ${ci === 0 ? "font-medium" : "font-mono text-[13px]"}`}>
                              {ci === b.flagCol && cell ? <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger">{cell}</span> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>
        </article>
      )}
    </Modal>
  );
}
