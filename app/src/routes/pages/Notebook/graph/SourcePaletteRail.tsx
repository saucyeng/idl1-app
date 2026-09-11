import { useMemo, useState } from "react";

import { filterSourcePalette, type PaletteGroup, type PaletteRow, type SourcePalette } from "../model/sourcePalette";
import type { PaletteDragSource } from "../model/graphPaletteDrop";
import type { UnitLabel } from "../../../../ipc/workbook";
import { NODE_KIND_CUES, NODE_KINDS, type NodeKind } from "./nodeKind";

/** The legend's own one-character stand-in for each kind's card glyph
 *  (R214 item 1) — a footer line has room for a character, not for the
 *  card's inline SVG, and these read as the same three things: a waveform,
 *  a function, a chart. */
const LEGEND_GLYPH: Record<NodeKind, string> = { source: "∿", derived: "ƒ", chart: "▦" };

/** The `dataTransfer` MIME type a palette row's drag carries — a JSON-
 *  encoded {@link PaletteDragSource}. `GraphCanvas.tsx`'s own drop handler
 *  reads this same constant, so the two files can't drift on the wire
 *  format between a `dragstart` and its `drop`. */
export const PALETTE_DRAG_MIME = "application/x-idl1-source-palette-row";

/** Props for {@link SourcePaletteRail}. */
export interface SourcePaletteRailProps {
  /** Already scoped to the current selection (`sourcePalette.ts`'s
   *  `buildSourcePalette`) — this component computes no decision of its
   *  own, only search-filters and renders. */
  palette: SourcePalette;
  /** The Settings preference "Colour-code graph nodes" (R214 item 1) — the
   *  footer legend shows a colour swatch per kind only while it is on, so
   *  the key never names a cue the canvas isn't drawing. */
  colourCoded: boolean;
}

/** One collapsible group's own open/closed state, keyed by its label —
 *  a `Set` of *collapsed* labels (not open ones) so a freshly-appearing
 *  group (a session resolving, a new channel prefix) defaults to open
 *  without this component needing to know about it in advance. */
type CollapsedGroups = Set<string>;

/** The unit badge's own text/tooltip for a channel or definition row
 *  (R154/R164, R160's unit column — landed now that the field exists).
 *  Renders the three states distinctly, per this task's own rule: `known`
 *  shows the unit itself; `dimensionless` shows nothing at all (`null`,
 *  not an empty-looking placeholder — a count genuinely has no unit);
 *  `unknown` shows an explicit `?` marker with the reason as its tooltip,
 *  so a reader can tell "no unit" apart from "we don't know" at a glance. */
function unitBadge(unit: UnitLabel): { text: string; title?: string } | null {
  if (unit.state === "known") return { text: unit.text };
  if (unit.state === "unknown") return { text: "?", title: unit.reason };
  return null;
}

/** One draggable row — name, and a `Rate: … Hz` badge for a channel or a
 *  `= value` badge for a constant (decision: "each row shows name and
 *  rate"; a constant has no rate, so it shows its own value instead — the
 *  analogous "what would I be dragging in" fact). A definition's rate is
 *  `null` until `CellDefResult` carries one (R147/R152) — its badge is
 *  omitted rather than shown blank (R152: a blank column invites a guess).
 *  A channel/definition row also gets its own unit badge, right of the
 *  rate one, from {@link unitBadge} — a constant row has none (its `= value`
 *  badge already says everything this row needs to say). */
function PaletteRowView({ row }: { row: PaletteRow }) {
  const badge =
    row.kind === "channel" ? `${row.rateHz} Hz` : row.kind === "constant" ? `= ${row.value}` : row.kind === "definition" && row.sampleRateHz !== null ? `${row.sampleRateHz} Hz` : null;
  const unit = row.kind === "channel" || row.kind === "definition" ? unitBadge(row.unit) : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        const source: PaletteDragSource = { kind: row.kind, name: row.name };
        e.dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify(source));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={
        "flex cursor-grab items-center justify-between gap-2 rounded-[var(--radius-structural)] px-2 py-1 text-label-2 text-fg hover:bg-surface-2 active:cursor-grabbing" +
        (row.kind === "channel" && row.partial ? " text-fg-faint" : "")
      }
      title={row.kind === "channel" && row.partial ? `${row.name} — missing from at least one selected session` : row.name}
    >
      <span className="truncate">{row.name}</span>
      {unit !== null && (
        <span className="shrink-0 text-fg-faint" title={unit.title}>
          {unit.text}
        </span>
      )}
      {badge !== null && <span className="shrink-0 text-fg-faint">{badge}</span>}
    </div>
  );
}

/** One labelled, collapsible group of rows. */
function PaletteGroupView({ group, collapsed, onToggle }: { group: PaletteGroup<PaletteRow>; collapsed: boolean; onToggle: () => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1 px-2 py-1 text-label-2 text-fg-dim hover:text-fg"
      >
        <span>{collapsed ? "▸" : "▾"}</span>
        <span>{group.label}</span>
        <span className="text-fg-faint">({group.rows.length})</span>
      </button>
      {!collapsed && <div className="flex flex-col">{group.rows.map((row) => <PaletteRowView key={`${row.kind}:${row.name}`} row={row} />)}</div>}
    </div>
  );
}

/** The channel groups' own status line when they aren't a plain, ready
 *  union — R153: an unresolved selection says so, never renders as an
 *  ordinary empty list. */
function channelsStatusLine(palette: SourcePalette): string | null {
  if (palette.channelsAvailability === "no-selection") return "Select a session on the Data tab to see its channels.";
  if (palette.channelsAvailability === "loading") return "Loading channels…";
  if (palette.pendingSessionCount > 0) return `Channels shown so far — ${palette.pendingSessionCount} more selected session(s) still loading.`;
  return null;
}

/**
 * The maths graph's source palette (ruling R160): a collapsible rail on
 * the canvas, closed by default, listing the three droppable source kinds
 * — raw channels of the current selection, workbook constants, and
 * already-declared definitions — search-first and grouped. Dragging a row
 * onto the canvas is `GraphCanvas.tsx`'s job (it owns the `<ReactFlow>`
 * drop target and the document edit via `graphPaletteDrop.ts`); this
 * component only starts the drag.
 */
export default function SourcePaletteRail({ palette, colourCoded }: SourcePaletteRailProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<CollapsedGroups>(new Set());

  const filtered = useMemo(() => filterSourcePalette(palette, query), [palette, query]);
  const channelsStatus = channelsStatusLine(palette);
  const hasAnyRows = filtered.channelGroups.length > 0 || filtered.constants.length > 0 || filtered.definitions.length > 0;

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open source palette"
        className="flex items-center gap-1 self-start rounded-[var(--radius-structural)] border border-rule bg-control px-2 py-1 text-label-2 text-fg-dim hover:text-fg"
      >
        ▹ Sources
      </button>
    );
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-rule bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-rule px-2 py-2">
        <span className="text-label-2 text-fg-dim">Sources</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close source palette" className="text-fg-faint hover:text-fg">
          ✕
        </button>
      </div>
      <div className="border-b border-rule p-2">
        <input
          type="text"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-[var(--radius-structural)] border border-rule bg-control px-2 py-1 text-label-2 text-fg"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {filtered.definitions.map((g) => (
          <PaletteGroupView key={`definition:${g.label}`} group={g} collapsed={collapsedGroups.has(`definition:${g.label}`)} onToggle={() => toggleGroup(`definition:${g.label}`)} />
        ))}
        {filtered.constants.map((g) => (
          <PaletteGroupView key={`constant:${g.label}`} group={g} collapsed={collapsedGroups.has(`constant:${g.label}`)} onToggle={() => toggleGroup(`constant:${g.label}`)} />
        ))}
        {channelsStatus !== null && <div className="px-2 py-1 text-label-2 text-fg-faint">{channelsStatus}</div>}
        {filtered.channelGroups.map((g) => (
          <PaletteGroupView key={`channel:${g.label}`} group={g} collapsed={collapsedGroups.has(`channel:${g.label}`)} onToggle={() => toggleGroup(`channel:${g.label}`)} />
        ))}
        {!hasAnyRows && channelsStatus === null && <div className="px-2 py-1 text-label-2 text-fg-faint">No matches for &ldquo;{query}&rdquo;.</div>}
      </div>
      {/* R214 item 1: "Legend: a one-line key in the palette rail footer."
          The three node kinds, named, each with the same glyph its cards
          carry — and its colour swatch only while the Settings toggle is
          on, since the key must describe what is actually drawn. */}
      <div className="flex items-center gap-2 border-t border-rule px-2 py-1 text-label-2 text-fg-faint">
        {NODE_KINDS.map((kind) => (
          <span key={kind} className="flex items-center gap-1" title={NODE_KIND_CUES[kind].hint}>
            {colourCoded && <span aria-hidden="true" className="inline-block h-2 w-1" style={{ background: NODE_KIND_CUES[kind].stripeVar }} />}
            <span aria-hidden="true">{LEGEND_GLYPH[kind]}</span>
            {NODE_KIND_CUES[kind].label}
          </span>
        ))}
      </div>
    </div>
  );
}
