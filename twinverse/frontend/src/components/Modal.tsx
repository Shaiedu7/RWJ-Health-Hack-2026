import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "center" | "right";
  children: ReactNode;
  footer?: ReactNode;
  initialFocus?: "close" | "first";
  wide?: boolean;
  describedBy?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, side = "center", children, footer, initialFocus = "close", wide, describedBy }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement as HTMLElement;
    const nodes = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const target = initialFocus === "close" ? panel.current?.querySelector<HTMLElement>("[data-close]") : nodes?.[0];
    (target ?? nodes?.[0])?.focus();
    return () => prev.current?.focus?.();
  }, [open, initialFocus]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    if (e.key === "Tab") {
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (!items.length) return;
      const f = items[0];
      const l = items[items.length - 1];
      if (e.shiftKey && document.activeElement === f) {
        e.preventDefault();
        l.focus();
      } else if (!e.shiftKey && document.activeElement === l) {
        e.preventDefault();
        f.focus();
      }
    }
  };

  const right = side === "right";
  return (
    <div className={`fixed inset-0 z-50 flex ${right ? "justify-end" : "items-center justify-center p-4"}`} onKeyDown={onKey}>
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        className={`anim-rise relative flex max-h-full flex-col bg-card shadow-2xl ${
          right ? "h-full w-full max-w-[560px] border-l border-line" : `w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-3xl border border-line`
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <button data-close onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2">
            <Icon name="close" />
          </button>
        </div>
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
