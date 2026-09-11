import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Field } from "@/components/ui/field";
import { scrubValue, type ScrubRange } from "@/components/ui/numberScrub";
import { cn } from "@/lib/utils";

/** Props for {@link NumberField}. */
export interface NumberFieldProps extends ScrubRange {
  /** The control's name, in sentence case. */
  label: string;
  /** The current value, or `null` for "not set" — an empty field, not a
   *  zero. Every control in the Properties form distinguishes the two (an
   *  absent `strokeWidth` means "Plot's default", not "0 px"). */
  value: number | null;
  /** The unit suffix shown inside the field, right-aligned: `px`, `Hz`,
   *  `samples`. Omitted renders no suffix. R212 item 5's "unit suffix". */
  unit?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Fires with the new value, or `null` when the field is cleared. */
  onChange: (value: number | null) => void;
  /** One short line under the field — a computed readout, or why the field
   *  is disabled. */
  hint?: React.ReactNode;
  className?: string;
}

/**
 * A labelled number input with a unit suffix and drag-to-scrub (ruling R212
 * item 5), at the Notebook density scale.
 *
 * **The label is the scrub handle.** Dragging the *field* would fight text
 * selection and the caret; dragging the label is unambiguous, and the
 * `ew-resize` cursor on it is the only affordance needed. Shift drags fine,
 * Alt coarse — `numberScrub.ts` owns that arithmetic and is where it is
 * tested.
 *
 * A scrub is one gesture, so it commits on every move: this is local React
 * state feeding the form's own `onChange`, which regenerates Plot code in
 * the browser. No IPC is on this path (CLAUDE.md §3), and the sandbox
 * re-render it triggers is already coalesced (`host/rerenderCoalescer.ts`).
 */
export function NumberField({ label, value, unit, disabled = false, placeholder, onChange, hint, className, step, min, max }: NumberFieldProps) {
  const range: ScrubRange = { step, min, max };
  const [scrubbing, setScrubbing] = useState(false);
  const origin = useRef<{ x: number; value: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (disabled) return;
    // A field with no value yet scrubs from zero — the alternative, refusing
    // to scrub at all, leaves the only way to set it as typing.
    origin.current = { x: event.clientX, value: value ?? 0 };
    setScrubbing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLSpanElement>): void {
    const start = origin.current;
    if (start === null) return;
    onChange(scrubValue(start.value, event.clientX - start.x, range, event));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (origin.current === null) return;
    origin.current = null;
    setScrubbing(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <Field label={label} hint={hint} disabled={disabled} className={className}>
      {(id) => (
        <>
          <span
            aria-hidden
            title={`Drag to change ${label.toLowerCase()} (shift for fine, alt for coarse)`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn(
              "h-[var(--nb-control-h)] w-[var(--nb-pad)] shrink-0 cursor-ew-resize rounded-[var(--radius-structural)] bg-rule",
              disabled && "cursor-not-allowed opacity-50",
              scrubbing && "bg-fg-dim"
            )}
          />
          <span className="flex min-w-0 items-center rounded-[var(--radius-structural)] border border-rule bg-control focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-focus">
            <input
              id={id}
              type="number"
              inputMode="decimal"
              value={value ?? ""}
              step={step}
              min={min}
              max={max}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
              className="w-16 min-w-0 bg-transparent px-[var(--nb-pad)] text-right font-mono text-[length:var(--nb-text-label)] tabular-nums text-fg outline-none disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {unit !== undefined && <span className="pr-[var(--nb-pad)] font-mono text-[length:var(--nb-text-label)] text-fg-faint">{unit}</span>}
          </span>
        </>
      )}
    </Field>
  );
}
