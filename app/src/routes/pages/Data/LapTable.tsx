import { Table, TableBody, TableCell, TableHead, TableHeader as BrandTableHeader, TableRow } from "../../../components/ui/table";
import { ColourPicker } from "@/components/ui/colour-picker";
import { formatLapTimeMs } from "./format";
import { formatNeutralZoneVisits, formatSectors } from "./lapDetailFormat";
import type { DetailView } from "./sessionDetail";

/** Props for [[LapTable]]. */
interface LapTableProps {
  laps: DetailView["laps"];
  /** The lap numbers of `sessionId` currently in `AppState.selection` as a
   *  `{ kind: "lap" }` window — highlights the rows a click has selected. */
  selectedLapNumbers: ReadonlySet<number>;
  /** Fires on a lap row click, with the row's `lapNumber` and the modifier
   *  the click carried (`sessionRow.ts`'s `modifierFromClick`). The caller
   *  (`DetailPane`) owns turning this into the next `AppState.selection` via
   *  `lapSelection.ts`'s `lapRowClicked` — this component only reports the
   *  gesture (S1 Task 12: the first UI path that ever dispatches a lap
   *  selection, R117 item 7's context). */
  onLapClick: (lapNumber: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  /** The selected lap window's colour for `lapNumber`, or `null` when this
   *  lap is not currently selected (no picker is drawn for it). */
  colourFor: (lapNumber: number) => string | null;
  /** Fires when a selected lap's colour swatch is clicked — the caller
   *  dispatches `SET_WINDOW_COLOUR` for that window. */
  onColourChange: (lapNumber: number, colour: string) => void;
}

/** One `presence` value's badge text — shown only for a lap that isn't in
 *  both sources, so a fully-joined row (the common case) stays quiet. */
function presenceBadge(presence: DetailView["laps"][number]["presence"]): string | null {
  if (presence === "session-only") return "not yet indexed";
  if (presence === "catalog-only") return "not in session.json";
  return null;
}

/** The session detail pane's lap table — one row per `lap_number` present
 *  in either `SessionDetail.laps` or `listLaps` (R53 Data Q3/Q4/Q5). Renders
 *  "—"/empty honestly rather than fabricating a value: a `laps` array of
 *  length zero (no wave-1 import path indexes laps yet, R53 Q4) reads as "No
 *  laps recorded for this session." rather than an error. Sectors and
 *  neutral-zone visits render via `lapDetailFormat.ts`'s pure formatters
 *  (C3 §6 item 11, closed) — "—" only when the session-side lap itself is
 *  absent, never as a placeholder for a lap that genuinely has none.
 *
 *  Rows are clickable (S1 Task 12): a plain click selects this lap alone,
 *  shift-click adds it, ctrl/cmd-click toggles it — the same modifier
 *  convention `sessionRow.ts`'s row click uses, so a session and its own
 *  laps compose in one selection. A selected row carries a 3 px `--good`
 *  inset bar (UI-DIRECTION "Data"). */
export function LapTable({ laps, selectedLapNumbers, onLapClick, colourFor, onColourChange }: LapTableProps) {
  if (laps.length === 0) {
    return <p className="font-mono text-sm text-fg-dim">No laps recorded for this session.</p>;
  }

  return (
    <Table>
      <BrandTableHeader>
        <TableRow>
          <TableHead>Lap</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Sectors</TableHead>
          <TableHead>Neutral zones</TableHead>
          <TableHead>Track</TableHead>
          <TableHead>Flags</TableHead>
          <TableHead>Colour</TableHead>
        </TableRow>
      </BrandTableHeader>
      <TableBody>
        {laps.map((lap) => {
          const badge = presenceBadge(lap.presence);
          const flags = [lap.isReference ? "reference" : null, lap.ignored ? "ignored" : null, badge]
            .filter((f): f is string => f !== null)
            .join(", ");
          const selected = selectedLapNumbers.has(lap.lapNumber);
          const colour = colourFor(lap.lapNumber);

          return (
            <TableRow
              key={lap.lapNumber}
              selected={selected}
              aria-selected={selected}
              className="cursor-pointer"
              onClick={(e) => onLapClick(lap.lapNumber, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey })}
            >
              <TableCell>{lap.lapNumber}</TableCell>
              <TableCell>{lap.lapTimeMs === null ? "—" : formatLapTimeMs(lap.lapTimeMs)}</TableCell>
              <TableCell>{formatSectors(lap.sectors)}</TableCell>
              <TableCell>{formatNeutralZoneVisits(lap.neutralZoneVisits)}</TableCell>
              <TableCell>{lap.trackId ?? "—"}</TableCell>
              <TableCell>{flags === "" ? "—" : flags}</TableCell>
              <TableCell>
                {colour !== null && (
                  <ColourPicker label={`Lap ${lap.lapNumber} colour`} colour={colour} onChange={(token) => onColourChange(lap.lapNumber, token)} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
