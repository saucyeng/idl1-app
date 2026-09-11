import { useId, type ReactNode } from "react";

import { SectionHead } from "@/components/brand/SectionHead";
import { cn } from "@/lib/utils";

/**
 * The label-and-control pairing every Notebook properties control is built
 * from (ruling R212 item 5). One row: a label on the left at the density
 * scale's label size, the control on the right, an optional hint under it.
 *
 * It exists so that "a labelled control" is one decision made once, rather
 * than a `<label>Text <input/></label>` written thirty different ways —
 * which is what the Properties form was before R212, and why nothing in it
 * lined up. Every size here comes from `tokens.css`'s `--nb-*` scale; the
 * component sets no length of its own.
 *
 * `htmlFor` is generated and handed to `children` as a render prop rather
 * than being guessed, so clicking a label always focuses its own control,
 * including for the Radix-based controls whose real input is nested.
 */
export interface FieldProps {
  /** The control's name, in sentence case. */
  label: string;
  /** One short line under the control — a unit note, a reason a control is
   *  disabled, a computed readout. Omitted renders no row at all. */
  hint?: ReactNode;
  /** True to render the whole row muted and stop pointer events; the
   *  control itself must still carry its own `disabled`. */
  disabled?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, disabled = false, className, children }: FieldProps) {
  const id = useId();

  return (
    <div className={cn("flex flex-col gap-px", disabled && "opacity-50", className)}>
      <div className="flex min-w-0 items-center justify-between gap-[var(--nb-gap)]">
        <label htmlFor={id} className="shrink-0 truncate font-mono text-[length:var(--nb-text-label)] text-fg-dim">
          {label}
        </label>
        <div className="flex min-w-0 items-center gap-[var(--nb-pad)]">{children(id)}</div>
      </div>
      {hint !== undefined && <p className="text-right font-mono text-[length:var(--nb-text-label)] text-fg-faint">{hint}</p>}
    </div>
  );
}

/**
 * A named group of fields (R212 item 5's "a section header per group").
 * Reuses `components/brand/SectionHead.tsx` — the app's one section header,
 * an uppercase tracked kicker with a hairline running to the right edge
 * (UI-DIRECTION decision 34 and the "Type" scale) — rather than inventing a
 * second heading style for one form.
 */
export function FieldGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-[var(--nb-gap)]", className)}>
      <SectionHead className="text-[length:var(--nb-text-label)]">{title}</SectionHead>
      <div className="flex flex-col gap-[var(--nb-gap)]">{children}</div>
    </section>
  );
}
