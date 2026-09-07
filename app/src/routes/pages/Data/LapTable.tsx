import { Table, TableBody, TableCell, TableHead, TableHeader as BrandTableHeader, TableRow } from "../../../components/ui/table";
import { formatLapTimeMs } from "./format";
import { formatNeutralZoneVisits, formatSectors } from "./lapDetailFormat";
import type { DetailView } from "./sessionDetail";

/** Props for [[LapTable]]. */
interface LapTableProps {
  laps: DetailView["laps"];
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
 *  absent, never as a placeholder for a lap that genuinely has none. */
export function LapTable({ laps }: LapTableProps) {
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
        </TableRow>
      </BrandTableHeader>
      <TableBody>
        {laps.map((lap) => {
          const badge = presenceBadge(lap.presence);
          const flags = [lap.isReference ? "reference" : null, lap.ignored ? "ignored" : null, badge]
            .filter((f): f is string => f !== null)
            .join(", ");

          return (
            <TableRow key={lap.lapNumber}>
              <TableCell>{lap.lapNumber}</TableCell>
              <TableCell>{lap.lapTimeMs === null ? "—" : formatLapTimeMs(lap.lapTimeMs)}</TableCell>
              <TableCell>{formatSectors(lap.sectors)}</TableCell>
              <TableCell>{formatNeutralZoneVisits(lap.neutralZoneVisits)}</TableCell>
              <TableCell>{lap.trackId ?? "—"}</TableCell>
              <TableCell>{flags === "" ? "—" : flags}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
