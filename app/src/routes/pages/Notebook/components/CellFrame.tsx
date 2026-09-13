import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { NoteBlock } from "@/components/brand/NoteBlock";
import { StatusDot } from "@/components/brand/StatusDot";
import type { ScannedCell } from "../model/cells";
import { isCellBusy, isCellStale, type CellStatus } from "../model/cellStatus";
import { denseGeometry } from "../model/denseMode";
import { plotStatusGlyph, SETTLE_FADE_MS, type CellChromeMode, type PlotLegendEntry } from "../model/plotChrome";

/** Tailwind text-colour utility for each {@link CellStatus} — the two
 *  waiting states read as inactive (`--fg-faint`), settled as `--good`,
 *  error as `--accent` (the brand alert colour), matching every other
 *  status dot in the app. */
const STATUS_DOT_CLASS: Record<CellStatus, string> = {
  queued: "text-fg-faint",
  evaluating: "text-fg-faint",
  stale: "text-fg-faint",
  settled: "text-good",
  error: "text-accent",
};

/** Props for {@link CellFrame}. */
export interface CellFrameProps {
  /** This cell's non-authoritative scan record (`model/cells.ts`) — read
   *  for its `id` (`data-cell-id`) and `kind` (the kicker). `CellFrame`
   *  never re-derives or re-renders a cell's output itself, that is
   *  `children`. */
  cell: ScannedCell;
  /** This cell's 0-based position in document order — the kicker falls
   *  back to `"{KIND} · {index+1}"` since a `ScannedCell` carries no name
   *  of its own (C2 §2.2 has no cell-name attribute). */
  index: number;
  /** Whether this is the currently open cell (`Notebook/index.tsx`'s
   *  `selectedCellId`, Task 13's own selection state — `CellFrame` keeps
   *  no selection state of its own, per the brief's "one source of truth"
   *  rule). */
  selected: boolean;
  /** Fired on click. `Notebook/index.tsx` decides what selecting this cell
   *  means (including doing nothing for a cell whose scan found no `id` —
   *  see its own call site's doc comment); this component only reports the
   *  gesture. */
  onSelect: () => void;
  /**
   * This cell's own evaluation state (ruling R210, UI-DIRECTION
   * "Notebook": a `StatusDot` per cell), from
   * `Notebook/model/cellStatus.ts`. `"evaluating"` additionally renders a
   * grey overlay with a spinner *over* `children`, which stay mounted
   * underneath — decision 59's rule that a result never blanks while it is
   * being recomputed.
   */
  status: CellStatus;
  /**
   * How far through its channel decodes this cell is, `[0, 1]`, or `null`
   * when none of its channels is being decoded (ruling R221 item 1(a);
   * `Notebook/model/decodeProgress.ts`).
   *
   * A non-`null` value replaces the indeterminate spinner with a determinate
   * ring in both chromes. `null` is the common case and is not the same as
   * `0`: a decode fast enough to finish inside ~200 ms never reports at all,
   * and a ring stuck at zero for such a cell would be worse than no ring.
   */
  decodeFraction?: number | null;
  /** This cell's error message, shown as an in-place `NoteBlock` whenever
   *  there is one — deliberately not gated on `status === "error"`, so a
   *  failed cell that is now re-evaluating keeps its message on screen
   *  under the spinner instead of flickering away and back (decision 59
   *  again). `undefined` renders nothing. In `"overlay"` chrome the same
   *  text is the ✕ glyph's tooltip instead (ruling R216 item 2). */
  error?: string;
  /** Whether this cell's source is currently revealed (decision 30) —
   *  `model/codeVisibility.ts`'s `isCodeVisible`; `CellFrame` keeps no
   *  revealed-code state of its own. */
  codeVisible: boolean;
  /** Fired when the code-toggle button is clicked. Does not also select
   *  the cell — the two are independent gestures (`handleToggle` below
   *  stops the click from bubbling into `onSelect`). */
  onToggleCode: () => void;
  /** This cell's decoded source text, shown in place above `children` while
   *  `codeVisible` — `undefined` (e.g. a cell whose scan found no id, so no
   *  body could be decoded) hides the toggle button entirely, since there
   *  would be nothing for it to reveal. */
  code?: string;
  /**
   * Which chrome this cell draws (ruling R216 item 2/3,
   * `model/plotChrome.ts`'s `cellChromeMode`, or `denseMode.ts`'s
   * `denseChromeMode` when dense stacking is on). Optional, defaulting to
   * `"band"` — every caller from before R216 keeps exactly the R210 header
   * row it had.
   */
  chrome?: CellChromeMode;
  /** Whether dense stacking is on (ruling R216 item 3) — removes this
   *  frame's gap and padding. Optional, defaulting to today's spacing. */
  dense?: boolean;
  /** Whether this cell hides its own top margin to read as sharing the x
   *  axis of the chart above it (`denseMode.ts`'s `sharesXAxisAbove`).
   *  Purely visual: nothing about either chart's axes changes. */
  sharesXAxisAbove?: boolean;
  /** The plot's centred title — the cell's `# label:` line
   *  (`graph/cellDisplayName.ts`'s `cellLabelFromBody`), or `undefined` for
   *  no title row at all. `"overlay"` chrome only. */
  title?: string;
  /** This plot's series key (`model/plotChrome.ts`'s `plotLegendEntries`),
   *  already empty for a single-series plot. `"overlay"` chrome only. */
  legend?: readonly PlotLegendEntry[];
  /** Opens this cell in the Properties form — the context menu's own
   *  "Properties" item (ruling R216 item 2). `undefined` omits the item. */
  onOpenProperties?: () => void;
  /** Frames this cell in the maths graph — the context menu's "Tidy in
   *  graph" item. `undefined` omits the item. */
  onTidyInGraph?: () => void;
  /** This cell's already-rendered output — `CellList.tsx`'s per-kind
   *  renderer (`MathCell`/`TableCell`/the injected `renderJsCell`) or its
   *  pending placeholder. `CellFrame` only adds the selection chrome
   *  around it; it never builds this itself. */
  children: ReactNode;
}

/** Milliseconds since this cell last settled, re-rendering once when the
 *  ✓ is due to fade (ruling R216 item 2). `null` until the first settle in
 *  this mount, which `plotStatusGlyph` reads as "just now".
 *
 *  One timer, armed on the settle and cleared on any other transition — not
 *  an interval and not a `requestAnimationFrame` loop: the glyph has
 *  exactly one thing to do after a settle (disappear, once, 2 s later), so
 *  it costs one `setTimeout` per settle and nothing at all at rest. */
function useMsSinceSettle(status: CellStatus): number | null {
  const settledAt = useRef<number | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (status !== "settled") {
      settledAt.current = null;
      return;
    }
    settledAt.current = Date.now();
    const timer = setTimeout(() => force((n) => n + 1), SETTLE_FADE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return settledAt.current === null ? null : Date.now() - settledAt.current;
}

/** The 12 px status glyph overlaid on a plot's top-left corner (ruling
 *  R216 item 2). An error's ✕ carries the message: hovering shows it,
 *  clicking pins it open until clicked again. */
/**
 * The determinate form of the busy glyph (ruling R221 item 1(a)): a 12 px
 * ring filled clockwise to `fraction` of a turn.
 *
 * An SVG circle with a dash pattern rather than a rotating icon — the point
 * is that it does *not* animate. A decode that has stopped moving shows a
 * ring that has stopped moving, which is the honest picture and the one a
 * spinner cannot draw.
 *
 * Drawn with `currentColor`, so it inherits whatever the glyph's own span
 * sets, and rotated so 0 starts at twelve o'clock rather than three.
 */
function DecodeRing({ fraction }: { fraction: number }) {
  const RADIUS = 5;
  const circumference = 2 * Math.PI * RADIUS;
  const swept = Math.min(Math.max(fraction, 0), 1) * circumference;

  return (
    <svg viewBox="0 0 12 12" className="size-full" aria-hidden="true">
      <circle cx="6" cy="6" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <circle
        cx="6"
        cy="6"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={`${swept} ${circumference}`}
        transform="rotate(-90 6 6)"
      />
    </svg>
  );
}

function StatusGlyph({
  status,
  error,
  msSinceSettle,
  decodeFraction,
}: {
  status: CellStatus;
  error?: string;
  msSinceSettle: number | null;
  decodeFraction?: number | null;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const glyph = plotStatusGlyph(status, msSinceSettle);
  // The ring only ever replaces the spinner: a settled or failed cell shows
  // its tick or its cross whatever a late decode event says.
  const ring = glyph === "spinner" && decodeFraction !== null && decodeFraction !== undefined ? decodeFraction : null;

  if (glyph === "none") return null;

  const showError = error !== undefined && glyph === "cross" && (pinned || hovered);

  return (
    <div className="pointer-events-none absolute top-1 left-1 z-10 flex items-start gap-1">
      <span
        className={`pointer-events-auto flex size-[12px] items-center justify-center ${glyph === "cross" ? "cursor-pointer text-accent" : glyph === "tick" ? "text-good" : "text-fg-faint"}`}
        role={glyph === "cross" ? "button" : "status"}
        aria-label={
          glyph === "cross"
            ? "Evaluation failed"
            : glyph === "tick"
              ? "Settled"
              : ring !== null
                ? `Loading channels, ${Math.floor(ring * 100)} %`
                : "Evaluating"
        }
        tabIndex={glyph === "cross" ? 0 : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={(e) => {
          if (glyph !== "cross") return;
          e.stopPropagation();
          setPinned((open) => !open);
        }}
      >
        {ring !== null ? <DecodeRing fraction={ring} /> : glyph === "spinner" ? <Loader2Icon className="size-[12px] animate-spin" /> : glyph === "tick" ? "✓" : "✕"}
      </span>
      {showError && (
        /* Full message, mono, selectable (R216 item 2). `pointer-events-auto`
           so the text can actually be swept and copied — the wrapper turns
           them off so the rest of the corner never eats a plot gesture. */
        <span className="pointer-events-auto max-w-[48ch] rounded-[var(--radius-structural)] border border-accent bg-surface px-[var(--nb-pad)] py-px font-mono text-[length:var(--nb-text-label)] break-words text-accent select-text">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * The per-cell chrome mounted through `CellList.tsx`'s `frame` hook
 * (Task 15, ruling R74; restyled UI-10; ruling R216 items 2 and 3).
 *
 * Two shapes, chosen by `chrome`:
 *
 * - **`"band"`** — every non-chart kind, and every kind while dense
 *   stacking is off: the R210 header row, an uppercase tracked kicker, a
 *   `StatusDot`, and the "Show code" button, exactly as before.
 * - **`"overlay"`** — chart cells (R216 item 2). The row stops existing.
 *   The status becomes a 12 px glyph in the plot's own top-left corner,
 *   which fades 2 s after a settle and stays put on an error with the
 *   message on hover. "Show code" moves into the plot's right-click menu
 *   and onto `Alt`+`C`. A `# label:` becomes a centred title in the plot's
 *   top margin, and a plot with more than one series gets a compact legend
 *   in its top-right. "JS 01" is not a title and does not appear.
 *
 * The selected state shows as a `--surface-2` fill plus the app's reserved
 * 3 px `--good` inset bar in both shapes.
 */
export default function CellFrame({
  cell,
  index,
  selected,
  onSelect,
  status,
  decodeFraction = null,
  error,
  codeVisible,
  onToggleCode,
  code,
  chrome = "band",
  dense = false,
  sharesXAxisAbove = false,
  title,
  legend,
  onOpenProperties,
  onTidyInGraph,
  children,
}: CellFrameProps) {
  const kicker = `${cell.kind.toUpperCase()} · ${String(index + 1).padStart(2, "0")}`;
  const geometry = denseGeometry(dense);
  const msSinceSettle = useMsSinceSettle(status);
  const overlay = chrome === "overlay";

  function handleToggleCode(e: MouseEvent): void {
    e.stopPropagation();
    onToggleCode();
  }

  const output = (
    <div className="relative">
      {overlay && <StatusGlyph status={status} error={error} msSinceSettle={msSinceSettle} decodeFraction={decodeFraction} />}
      {overlay && title !== undefined && (
        /* Centred in the plot's own top margin (R216 item 2) — absolutely
           positioned rather than a row of its own, so a plot with no label
           is not one line shorter than a plot with one. */
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 truncate px-6 text-center font-mono text-[length:var(--nb-text-label)] tracking-[var(--tracking-label)] text-fg">
          {title}
        </div>
      )}
      {overlay && legend !== undefined && legend.length > 0 && (
        <div className="pointer-events-none absolute top-0 right-1 z-10 flex max-w-[50%] flex-col items-end gap-px" aria-label="Series">
          {legend.map((entry) => (
            <span key={entry.key} className="flex items-center gap-[var(--nb-pad)] font-mono text-[length:var(--nb-text-label)] text-fg-dim">
              <span aria-hidden className="size-[6px] shrink-0" style={{ background: `var(${entry.colour})` }} />
              <span className="truncate">{entry.label}</span>
            </span>
          ))}
        </div>
      )}
      {children}
      {overlay && isCellStale(status) && (
        /* Decision 59 for chart cells: the plot itself greys while it
           recomputes, keeping its last picture visible underneath. The
           spinner is already drawn by `StatusGlyph` in the plot's own
           top-left corner, so this wash carries no spinner of its own. */
        <div className="pointer-events-none absolute inset-0 z-10 bg-surface/60" aria-hidden="true" />
      )}
      {isCellBusy(status) && !overlay && (
        /* Decision 59: the wash is drawn only over a result that exists and
           is out of date (`isCellStale`). A cell evaluating for the first
           time spins over its own empty box with no wash — greying nothing
           would claim the blank space is stale data. */
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center ${isCellStale(status) ? "bg-surface/60" : ""}`}
          role="status"
          aria-label={
            decodeFraction !== null
              ? `Loading channels, ${Math.floor(decodeFraction * 100)} %`
              : isCellStale(status)
                ? "Recomputing, showing the previous result"
                : "Evaluating"
          }
        >
          {/* Ruling R221 item 1(a): a determinate ring while this cell's own
              channels are decoding, the indeterminate spinner otherwise. */}
          {decodeFraction !== null ? (
            <span className="block size-5 text-fg-dim">
              <DecodeRing fraction={decodeFraction} />
            </span>
          ) : (
            <Loader2Icon className="size-5 animate-spin text-fg-dim" />
          )}
        </div>
      )}
    </div>
  );

  const body = (
    <div
      className={`flex flex-col border-l-[3px] ${selected ? "border-good bg-surface-2" : "border-transparent"}`}
      style={{
        gap: geometry.gapPx,
        paddingInline: geometry.paddingXPx,
        paddingBlock: geometry.paddingYPx,
        // R216 item 3: the lower of two stacked time charts hides its own
        // top margin so the pair reads as one continuous x axis. Negative
        // margin, not a height change — neither chart is redrawn.
        marginTop: sharesXAxisAbove ? -1 : undefined,
      }}
      data-cell-id={cell.id ?? undefined}
      data-selected={selected}
      data-register-cell=""
      data-chrome={chrome}
      onClick={onSelect}
    >
      {!overlay && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] font-medium tracking-[var(--tracking-kicker)] text-fg-dim uppercase">{kicker}</span>
          <div className="flex items-center gap-3">
            <StatusDot className={STATUS_DOT_CLASS[status]}>{status}</StatusDot>
            {code !== undefined && (
              <Button type="button" size="xs" emphasis="normal" onClick={handleToggleCode} aria-pressed={codeVisible}>
                {codeVisible ? "Hide code" : "Show code"}
              </Button>
            )}
          </div>
        </div>
      )}
      {codeVisible && code !== undefined && (
        <pre className="overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-control p-3 font-mono text-xs text-fg">{code}</pre>
      )}
      {output}
      {/* In overlay chrome the message lives in the ✕'s tooltip instead
          (R216 item 2) — a `NoteBlock` under the plot is the row this
          ruling removes, in another form. */}
      {error !== undefined && !overlay && <NoteBlock className="border-accent text-accent">{error}</NoteBlock>}
    </div>
  );

  if (!overlay) return body;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      {/* R216 item 2: "Show code" leaves the plot surface for this menu and
          for Alt+C. "Copy as PNG" is not offered — the plot lives inside
          the sandbox iframe (R69), so the host has no node to serialise
          without a new sandbox round trip, which the ruling makes
          conditional on being cheap. It is not. */}
      <ContextMenuContent className="idl-dense">
        {code !== undefined && <ContextMenuItem onSelect={onToggleCode}>{codeVisible ? "Hide code" : "Show code"}</ContextMenuItem>}
        {(onOpenProperties !== undefined || onTidyInGraph !== undefined) && code !== undefined && <ContextMenuSeparator />}
        {onOpenProperties !== undefined && <ContextMenuItem onSelect={onOpenProperties}>Properties</ContextMenuItem>}
        {onTidyInGraph !== undefined && <ContextMenuItem onSelect={onTidyInGraph}>Tidy in graph</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}
