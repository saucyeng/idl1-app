import { formatLapTimeMs } from "./format";
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
 *  laps recorded for this session." rather than an error. Sector data is a
 *  count only (R53 Q5) — never a per-sector time. */
export function LapTable({ laps }: LapTableProps) {
  if (laps.length === 0) {
    return <p>No laps recorded for this session.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Lap</th>
          <th>Time</th>
          <th>Sectors</th>
          <th>Track</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
        {laps.map((lap) => {
          const badge = presenceBadge(lap.presence);
          const flags = [lap.isReference ? "reference" : null, lap.ignored ? "ignored" : null, badge]
            .filter((f): f is string => f !== null)
            .join(", ");

          return (
            <tr key={lap.lapNumber}>
              <td>{lap.lapNumber}</td>
              <td>{lap.lapTimeMs === null ? "—" : formatLapTimeMs(lap.lapTimeMs)}</td>
              <td>{lap.sectorCount === null ? "—" : lap.sectorCount}</td>
              <td>{lap.trackId ?? "—"}</td>
              <td>{flags === "" ? "—" : flags}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
