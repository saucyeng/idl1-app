/** The eight chart token names a colour picker may offer (R117 item 6:
 *  never a hex, never a free colour input — `tokenSheet.test.ts` enforces
 *  the set). Kept as this module's own copy rather than importing
 *  `state/selection.ts`'s or `Notebook/theme/series.ts`'s private copies —
 *  those two modules already keep their own copies of the same list for the
 *  same reason (both are pinned to `tokens.css` by `tokenSheet.test.ts`, so
 *  none of the three can silently drift from another). */
const CHART_TOKENS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6", "--chart-7", "--chart-8"] as const;

/** Props for [[ColourPicker]]. */
interface ColourPickerProps {
  /** The window's current `colour` (a `--chart-N` token name). */
  colour: string;
  /** Fires with the clicked token name — the caller dispatches
   *  `SET_WINDOW_COLOUR`. */
  onChange: (token: string) => void;
  label: string;
}

/** A row of eight swatch buttons, one per chart token — decision 84's
 *  per-window colour picker, shared by [[DetailPane]] (a session window)
 *  and [[LapTable]] (a lap window). Presentational only (rendering is not
 *  unit-tested, CLAUDE.md §4); the fixed token set is enforced by
 *  `tokenSheet.test.ts`, and this component has no path to a hex value —
 *  every swatch paints `var(--chart-N)`, never a literal colour. */
export function ColourPicker({ colour, onChange, label }: ColourPickerProps) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {CHART_TOKENS.map((token) => (
        <button
          key={token}
          type="button"
          aria-label={token}
          aria-pressed={token === colour}
          onClick={(e) => {
            e.stopPropagation();
            onChange(token);
          }}
          className="size-4 shrink-0 rounded-full border border-rule outline-offset-2 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-fg"
          style={{ backgroundColor: `var(${token})` }}
        />
      ))}
    </div>
  );
}
