import { LapTable } from "./LapTable";
import type { DetailView } from "./sessionDetail";

/** Props for [[DetailPane]]. */
interface DetailPaneProps {
  view: DetailView;
  /** Text from `describeIpcError` when `listLaps` failed with a kind other
   *  than `not_found` (that kind is not an error for this pane, R53 Data
   *  Q4 — it renders via `view.laps` being empty instead). Null when
   *  `listLaps` succeeded or wasn't attempted. */
  lapsErrorText: string | null;
  onClose: () => void;
}

/** The Data tab's session detail pane, over one `toDetailView` result (C3
 *  §3.2's `get_session` + `list_laps`, R53 Data Q3). Metadata, the channel
 *  table, and the lap table — no editing, no delete, no track-create
 *  affordance at wave 2 (Parity gaps table: those are Task 7/Task 8 and
 *  beyond this task's scope). */
export function DetailPane({ view, lapsErrorText, onClose }: DetailPaneProps) {
  return (
    <div className="data-detail-pane" role="region" aria-label="Session detail">
      <div className="data-detail-header">
        <h2>
          {view.venue} · {view.eventName === "" ? "(no event)" : view.eventName}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <dl className="data-detail-meta">
        <dt>Rider</dt>
        <dd>{view.rider === "" ? "—" : view.rider}</dd>
        <dt>Bike</dt>
        <dd>{view.bike === "" ? "—" : view.bike}</dd>
        <dt>Event session</dt>
        <dd>{view.eventSession === "" ? "—" : view.eventSession}</dd>
        <dt>Tag</dt>
        <dd>{view.tag === "" ? "—" : view.tag}</dd>
        <dt>Comment</dt>
        <dd>{view.shortComment === "" ? "—" : view.shortComment}</dd>
      </dl>

      <h3>Channels</h3>
      {view.channels.length === 0 ? (
        <p>No channels recorded for this session.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Source</th>
              <th>Kind</th>
              <th>Unit</th>
              <th>Samples</th>
              <th>Nominal rate</th>
            </tr>
          </thead>
          <tbody>
            {view.channels.map((c) => (
              <tr key={c.channelId}>
                <td>{c.channelId}</td>
                <td>{c.sourceKind}</td>
                <td>{c.channelKind}</td>
                <td>{c.unit}</td>
                <td>{c.sampleCount}</td>
                {/* Metadata only — never used to synthesize time (C1 §3.5). */}
                <td>{c.nominalRateHz} Hz (metadata only, not used for timing)</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Laps</h3>
      {lapsErrorText !== null ? <p role="alert">{lapsErrorText}</p> : <LapTable laps={view.laps} />}
    </div>
  );
}
