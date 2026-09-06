/**
 * Pure decision logic for whether a `js` cell's code binds through
 * `ChartCell`'s real viewport/tile-fetch pipeline (Tasks 6-10) instead of
 * a plain sandbox-output mount (L6 Task 13b, R66 item 1). No React, no
 * DOM, no IPC import — `bindingFor` never calls `fetchTile`/`getSession`
 * itself; its caller (`Notebook/index.tsx`) resolves `SessionDetail` and
 * the session's recorded span (lead pre-ruling 2026-09-05 #1) and passes
 * both in.
 */
import { parse } from "../plotForm/parse";
import type { MarkProps, PlotProps } from "../plotForm/types";
import type { ChannelSummary, SessionDetail } from "../../../../ipc/catalog";

/** Where one bound channel's samples come from (L6 Task 18, R77.3):
 *  `"session"` — a real session channel, fetched tile-by-tile through
 *  `ChartCell`'s existing pipeline; `"definition"` — a workbook `math`
 *  definition (`eval_workbook`'s `CellOutput.defs[].name`), fetched whole,
 *  decimated to a budget, via `fetch_host_channel` (C3 §3.4). */
export type BindingChannelSource = "session" | "definition";

/** One distinct channel a form-generated cell's marks reference. */
export interface JsCellBindingChannel {
  channelId: string;
  /** `"definition"` ⇒ this names a workbook `math` definition rather than a
   *  session channel — it has no tile tier, no `TileCacheKey` and no time
   *  window (`fetch_host_channel` takes none, C3 §3.4). */
  source: BindingChannelSource;
  /** This channel's own nominal rate (`ChannelSummary.nominal_rate_hz`), in Hz — feeds `chooseTier`/`tileRange`.
   *  Meaningful only for `source === "session"` — a definition has no
   *  nominal rate; `0` for `source === "definition"`, and never fed to
   *  `chooseTier`/`tileRange` for one. */
  sampleRateHz: number;
  /**
   * The mark(s)' lap scope for this channel occurrence (`MarkProps.lap`):
   * a 1-based lap number, or `null` for session scope. Plumbed through to
   * `NotebookSession`'s registry (lead pre-ruling #2) but **not** applied
   * to narrow the fetched tile window this task -- R52 Q5's `lap_context`
   * and the lap tables are a wave-2 gap, not a bare TODO: `eval_workbook`
   * has no `lap_context` parameter yet (N4) and the tile-fetch path
   * (`model/tiers.ts`/`ipc/tiles.ts`) has no lap-relative addressing at
   * all today.
   */
  lap: number | null;
}

/**
 * The initial time window every channel bound from this cell starts at,
 * before any gesture. `startUs`/`endUs` only -- **not** a full
 * `model/viewport.ts` `Viewport`: this module has no way to know a
 * `ChartCell`'s rendered pixel width (a DOM measurement), so the caller
 * fills in `pixelWidth` from the actual mounted width before constructing
 * a `Viewport` to pass down.
 */
export interface InitialSpan {
  /** Start of the window, in µs since session start (inclusive). Always `0`. */
  startUs: number;
  /** End of the window, in µs since session start (exclusive) -- the session's recorded span. */
  endUs: number;
}

/**
 * What a form-generated `js` cell needs to render through `ChartCell`
 * instead of a plain mount (R66 item 1). One entry per distinct channel
 * the cell's marks reference -- a multi-mark cell binds every distinct
 * channel (R52 Q2: `channel()` materialises per-channel arrays; nothing
 * in the grammar or `ChartCell`'s one-channel-per-instance design lets two
 * marks on different channels share one binding). Mounting more than one
 * `ChartCell` per cell is a design question this task does not answer
 * (lead pre-ruling #3) -- see this task's report.
 */
export interface JsCellBinding {
  /** The cell's parsed form state, for anything a caller needs beyond the channel list (e.g. a future multi-channel overlay). */
  props: PlotProps;
  /** One binding per distinct `marks[*].channel` referenced by `props`, in the order each channel first appears across `marks`. */
  channels: JsCellBindingChannel[];
  /** The initial window every bound channel starts at, before any gesture -- see {@link InitialSpan}'s own doc comment on why it is not a full `Viewport`. */
  initialSpan: InitialSpan;
  /** The `channelId` of the first `source === "session"` entry in `channels`,
   *  or `null` when every bound channel is a `"definition"` (L6 Task 18).
   *  This is the one channel `ChartCell` mounts and fetches a viewport for
   *  (R69(d)) — a definition-only cell has no `ChartCell` at all (Q2(a),
   *  R78) and so no mounted channel. An explicit field, not a caller
   *  recomputing `channels[0]`: `channels[0]` may now be a `"definition"`
   *  entry, and `index.tsx`'s own `// TODO(idl0)` about `binding.channels[0]`
   *  stays true for the session-channel case only. */
  mountedChannelId: string | null;
}

/** Looks up one mark's channel in `sessionDetail.channels` by id, or `null` if it isn't a real channel on this session. */
function findChannel(channels: ChannelSummary[], channelId: string): ChannelSummary | null {
  return channels.find((c) => c.channel_id === channelId) ?? null;
}

/**
 * `plotForm.parse`s `code`; returns `null` when it doesn't (custom code --
 * plain mount) or when any referenced channel is not in
 * `sessionDetail.channels` and not a name in `definitionNames` either (an
 * unresolvable channel is never fetched -- a plain mount with a visible
 * note instead, per this task's dispatch) or when `sessionDetail`/
 * `sessionSpanUs` is not yet available (nothing to bind against). Pure: no
 * IPC, no DOM, no React.
 *
 * @param sessionSpanUs The session's recorded span in µs (lead pre-ruling
 *   #1: `SessionSummary.duration_ms`, or the coarsest-tile fallback),
 *   already resolved by the caller. `null` while still resolving --
 *   treated the same as no session selected.
 * @param definitionNames Every workbook `math` definition name a mark may
 *   bind to instead of a session channel (L6 Task 18, R77.3) --
 *   `eval_workbook`'s own `CellOutput.defs[].name`, restricted by the
 *   caller (`index.tsx`) to definitions with a recorded time axis
 *   (`CellDefResult.value.has_t`, C3 §3.4): a `has_t: false` definition has
 *   no axis to chart against and is treated exactly like an unresolvable
 *   channel here (Q3(a), R78) -- the caller distinguishes the two notes
 *   ("not part of this session" vs "has no recorded axis") itself, since
 *   this module never sees `has_t` for a name it excludes.
 */
export function bindingFor(
  cell: { id: string; code: string },
  sessionDetail: SessionDetail | null,
  sessionSpanUs: number | null,
  definitionNames: ReadonlySet<string>
): JsCellBinding | null {
  if (sessionDetail === null || sessionSpanUs === null) return null;

  const props = parse(cell.code);
  if (props === null) return null;

  const channels: JsCellBindingChannel[] = [];
  const seen = new Set<string>();
  for (const mark of props.marks as MarkProps[]) {
    if (seen.has(mark.channel)) continue;
    seen.add(mark.channel);

    const channel = findChannel(sessionDetail.channels, mark.channel);
    if (channel !== null) {
      channels.push({
        channelId: channel.channel_id,
        source: "session",
        sampleRateHz: channel.nominal_rate_hz,
        lap: mark.lap ?? null,
      });
      continue;
    }

    if (definitionNames.has(mark.channel)) {
      channels.push({
        channelId: mark.channel,
        source: "definition",
        sampleRateHz: 0,
        lap: mark.lap ?? null,
      });
      continue;
    }

    return null;
  }

  const mountedChannelId = channels.find((c) => c.source === "session")?.channelId ?? null;

  return {
    props,
    channels,
    initialSpan: { startUs: 0, endUs: sessionSpanUs },
    mountedChannelId,
  };
}

/**
 * A stable string identity for everything `Notebook/index.tsx`'s channel-
 * bind effect fetches for this cell -- every distinct bound channel (id,
 * `source` and lap) plus the initial span -- used to detect "this cell's
 * binding changed" without a deep-equal over the whole `JsCellBinding`.
 * Two bindings with the same identity are treated as the same binding: no
 * re-fetch, no `setBoundChannels` call. Includes each channel's `source`
 * (L6 Task 18) so a name moving from unresolvable to `"definition"`, or
 * from `"definition"` to `"session"` (e.g. a newly selected session now has
 * a channel of that name), always produces a different identity -- not
 * only `channels[0]`/the mounted channel, since the effect re-fetches every
 * distinct channel, not only the mounted one (R72). Pure string
 * formatting, no IPC.
 */
export function bindingIdentity(binding: JsCellBinding): string {
  if (binding.channels.length === 0) return "no-channel";
  const parts = binding.channels.map((c) => `${c.channelId}|${c.source}|${c.lap ?? "session"}`);
  return `${parts.join(",")}|${binding.initialSpan.startUs}|${binding.initialSpan.endUs}`;
}

/**
 * Names the first `marks[*].channel` in `code` that is not present in
 * `sessionDetail.channels`, or `null` when `code` is custom (`parse`
 * returns `null`) or every referenced channel resolves. Split out from
 * {@link bindingFor} so a caller whose binding came back `null` can tell
 * "custom code, plain mount as always" apart from "form-generated, but
 * naming a channel this session doesn't have" -- the two plain-mount cases
 * this task's dispatch requires a visibly different note for. A name in
 * `definitionNames` is never reported unresolved (L6 Task 18) -- it
 * resolves through `bindingFor`'s `"definition"` path instead; the caller
 * is responsible for the further distinction of a definition with no
 * recorded axis (see `bindingFor`'s own doc comment on `definitionNames`).
 * Pure, same guarantees as `bindingFor`.
 */
export function unresolvedChannelId(code: string, sessionDetail: SessionDetail, definitionNames: ReadonlySet<string>): string | null {
  const props = parse(code);
  if (props === null) return null;

  for (const mark of props.marks as MarkProps[]) {
    if (findChannel(sessionDetail.channels, mark.channel) === null && !definitionNames.has(mark.channel)) {
      return mark.channel;
    }
  }
  return null;
}
