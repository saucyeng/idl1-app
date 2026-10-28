/**
 * Bare-identifier binding of every `math` definition, plus the `laps` and
 * `session` ambient host variables (C2 §5.1's first, `laps` and `session`
 * rows; §3.6.5 "Binding to JS").
 *
 * A definition is reachable as `channel("name")` only once a chart cell has
 * asked for it (`channelBindDriver.ts`); §5.1 promises more: *every* `math`
 * definition is a host variable **by name**, bound by rank, so a js cell can
 * write `Plot.lineY(lt, …)` and a prose span `${med.toFixed(2)}` without any
 * `channel(...)` call. This module is the data half of that: it turns the
 * `fetch_host_channel_v2` results (C3 §3.4's `IDLH` v2 bytes, decoded) into
 * the value to bind. It computes nothing — decoding and arrangement only.
 *
 * **What the wire carries decides what binds.** `IDLH` v2 holds a rank-0
 * value as one `v` sample with no axis, and a rank-1 value as `t`/`v` plus an
 * `axis_kind` (time, frequency or lap). It has no representation of a rank
 * ≥ 2 value or of a `win` axis, so those stay unbound (a reference to one
 * fails with the sandbox's ordinary "is not defined") until the wire grows
 * one — a contract change, not made here.
 */
import type { SessionDetail } from "../../../../ipc/catalog";
import type { AxisKindValue, DecodedHostChannel } from "../../../../ipc/hostChannel";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { combineChannelWindows, type WindowDescriptor } from "../host/protocol";

/** One selected window's fetch request: the wire window plus the descriptor
 *  its samples are tagged with when several windows are combined. */
export interface DefinitionWindow {
  window: SelectedWindow;
  descriptor: WindowDescriptor;
}

/** The IPC this driver needs, injected so it never imports `ipc/workbook.ts`
 *  (same shape as `LapDeps`). */
export interface DefinitionBindDeps {
  fetchHostChannel: (window: SelectedWindow | null, defName: string, budget: number) => Promise<DecodedHostChannel>;
}

/** What to bind for one definition. */
export type DefinitionBinding =
  /** Rank 0 (C2 §3.6.5): the bare number, taken from the first window that
   *  answered — a bare number has no window dimension to carry the rest. */
  | { kind: "scalar"; value: number }
  /** Rank 1: the combined per-window series, with the axis the engine
   *  reported (`Time` → `t`, `Lap` → `lap`, `Frequency` → `f`). */
  | {
      kind: "series";
      length: number;
      t: Float64Array;
      v: Float64Array;
      tr: Float64Array;
      w: Float64Array;
      windows: WindowDescriptor[];
      axisKind: AxisKindValue;
    }
  /** Nothing the wire can carry as a bound value (an axis-less vector, or no
   *  window answered). Left unbound. */
  | { kind: "unbound" };

/** One window's decoded answer. */
export interface DefinitionWindowResult {
  descriptor: WindowDescriptor;
  decoded: DecodedHostChannel;
}

/**
 * Decides what `results` (one per window that answered, in selection order)
 * bind to. The first result fixes the rank: an axis-less value with exactly
 * one sample is rank 0; one with an axis is rank 1 on `axisKind`. Later
 * results whose axis kind differs from the first are dropped (a definition
 * has one shape; a disagreeing window is a stale or failed one, and mixing
 * axes in one record array would draw nonsense).
 */
export function planDefinitionBinding(results: readonly DefinitionWindowResult[]): DefinitionBinding {
  if (results.length === 0) return { kind: "unbound" };
  const first = results[0].decoded;
  if (!first.hasT) {
    return first.v.length === 1 ? { kind: "scalar", value: first.v[0] } : { kind: "unbound" };
  }
  const same = results.filter((r) => r.decoded.hasT && r.decoded.axisKind === first.axisKind);
  const combined = combineChannelWindows(same.map((r) => ({ descriptor: r.descriptor, t: r.decoded.t, v: r.decoded.v })));
  return {
    kind: "series",
    length: combined.length,
    t: combined.t,
    v: combined.v,
    tr: combined.tr,
    w: combined.w,
    windows: combined.windows,
    axisKind: first.axisKind,
  };
}

/** One completed (non-stale) bind. */
export interface DefinitionBindAction {
  /** The definition's name — the identifier it is bound under. */
  name: string;
  binding: DefinitionBinding;
}

/**
 * The subset of `names` that appear as whole identifiers in any of `sources`
 * (js cell code, inline `${…}` expressions). Only these are worth fetching:
 * a workbook may define a hundred definitions that only tables read, and
 * each fetch can cost a whole-session evaluation per window. A false
 * positive (a name inside a string or comment) costs one extra fetch; a
 * false negative cannot occur, since a bare identifier reference must spell
 * the name.
 */
export function referencedDefinitionNames(names: readonly string[], sources: readonly string[]): string[] {
  const identifiers = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/[A-Za-z_$][\w$]*/g)) identifiers.add(match[0]);
  }
  return names.filter((name) => identifiers.has(name));
}

/**
 * Fetches `defName` over every window in `windows`, one window at a time,
 * and dispatches the {@link DefinitionBinding} they plan to. Sequential on
 * purpose: each fetch may evaluate a whole session, so a fan-out multiplies
 * peak memory by the window count. A window whose fetch rejects (a
 * definition that fails to evaluate over that window, an unknown name)
 * simply contributes nothing; if none answer, nothing is dispatched and the
 * name stays unbound. `isStale()` is checked after every await: `true` means
 * a newer run superseded this one, and nothing more is fetched or dispatched.
 *
 * @param budget Largest number of points per window (C3 §3.4, `1..=65536`).
 */
export async function runDefinitionBind(
  deps: DefinitionBindDeps,
  windows: readonly DefinitionWindow[],
  defName: string,
  budget: number,
  dispatch: (action: DefinitionBindAction) => void,
  isStale: () => boolean
): Promise<void> {
  const results: DefinitionWindowResult[] = [];
  for (const w of windows) {
    try {
      results.push({ descriptor: w.descriptor, decoded: await deps.fetchHostChannel(w.window, defName, budget) });
    } catch {
      // This window contributes nothing.
    }
    if (isStale()) return;
  }
  const binding = planDefinitionBinding(results);
  if (binding.kind === "unbound") return;
  dispatch({ name: defName, binding });
}

/** One entry of the `laps` host variable (C2 §5.1). */
export interface HostLap {
  /** 1-based lap number. */
  number: number;
  /** Lap start, seconds, session-relative. */
  startT: number;
  /** Lap end, seconds, session-relative. */
  endT: number;
}

/** The `laps` host variable's value: `detail`'s lap table (`session.json`
 *  `laps[]`) as `{number, startT, endT}`, seconds session-relative, in file
 *  order. `[]` when there is no session. */
export function hostLaps(detail: SessionDetail | null): HostLap[] {
  if (detail === null) return [];
  return detail.laps.map((l) => ({ number: l.lap_number, startT: l.start_time_secs, endT: l.end_time_secs }));
}

/** The `session` host variable's value (C2 §5.1). */
export interface HostSession {
  /** Session id. */
  id: string;
  /** Display name; omitted when empty. */
  name?: string;
  /** Session start, Unix epoch milliseconds; 0 = unknown (C1 §3.1). */
  timestampUtcMs: number;
}

/** The `session` host variable's value for `detail` (named `name`), or `null`
 *  when there is no session (the sandbox's own startup default). */
export function hostSession(detail: SessionDetail | null, name: string): HostSession | null {
  if (detail === null) return null;
  return name === ""
    ? { id: detail.session_id, timestampUtcMs: detail.timestamp_utc_ms }
    : { id: detail.session_id, name, timestampUtcMs: detail.timestamp_utc_ms };
}
