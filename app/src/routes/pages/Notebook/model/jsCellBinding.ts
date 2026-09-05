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

/** One distinct channel a form-generated cell's marks reference. */
export interface JsCellBindingChannel {
  channelId: string;
  /** This channel's own nominal rate (`ChannelSummary.nominal_rate_hz`), in Hz — feeds `chooseTier`/`tileRange`. */
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
}

/** Looks up one mark's channel in `sessionDetail.channels` by id, or `null` if it isn't a real channel on this session. */
function findChannel(channels: ChannelSummary[], channelId: string): ChannelSummary | null {
  return channels.find((c) => c.channel_id === channelId) ?? null;
}

/**
 * `plotForm.parse`s `code`; returns `null` when it doesn't (custom code --
 * plain mount) or when any referenced channel is not in
 * `sessionDetail.channels` (an unknown channel is never fetched -- a plain
 * mount with a visible note instead, per this task's dispatch) or when
 * `sessionDetail`/`sessionSpanUs` is not yet available (nothing to bind
 * against). Pure: no IPC, no DOM, no React.
 *
 * @param sessionSpanUs The session's recorded span in µs (lead pre-ruling
 *   #1: `SessionSummary.duration_ms`, or the coarsest-tile fallback),
 *   already resolved by the caller. `null` while still resolving --
 *   treated the same as no session selected.
 */
export function bindingFor(
  cell: { id: string; code: string },
  sessionDetail: SessionDetail | null,
  sessionSpanUs: number | null
): JsCellBinding | null {
  if (sessionDetail === null || sessionSpanUs === null) return null;

  const props = parse(cell.code);
  if (props === null) return null;

  const channels: JsCellBindingChannel[] = [];
  const seen = new Set<string>();
  for (const mark of props.marks as MarkProps[]) {
    if (seen.has(mark.channel)) continue;
    const channel = findChannel(sessionDetail.channels, mark.channel);
    if (channel === null) return null;
    seen.add(mark.channel);
    channels.push({
      channelId: channel.channel_id,
      sampleRateHz: channel.nominal_rate_hz,
      lap: mark.lap ?? null,
    });
  }

  return {
    props,
    channels,
    initialSpan: { startUs: 0, endUs: sessionSpanUs },
  };
}

/**
 * A stable string identity for the one channel `Notebook/index.tsx`
 * actually binds into `ChartCell` (`binding.channels[0]`, lead pre-ruling
 * #3) plus the initial span -- used to detect "this cell's binding
 * changed" (a different channel, a different lap, or a re-resolved
 * session span) without a deep-equal over the whole `JsCellBinding`.
 * Two bindings with the same identity are treated as the same binding: no
 * re-fetch, no `setBoundChannel` call. Pure string formatting, no IPC.
 */
export function bindingIdentity(binding: JsCellBinding): string {
  const first = binding.channels[0];
  if (first === undefined) return "no-channel";
  return `${first.channelId}|${first.lap ?? "session"}|${binding.initialSpan.startUs}|${binding.initialSpan.endUs}`;
}

/**
 * Names the first `marks[*].channel` in `code` that is not present in
 * `sessionDetail.channels`, or `null` when `code` is custom (`parse`
 * returns `null`) or every referenced channel resolves. Split out from
 * {@link bindingFor} so a caller whose binding came back `null` can tell
 * "custom code, plain mount as always" apart from "form-generated, but
 * naming a channel this session doesn't have" -- the two plain-mount cases
 * this task's dispatch requires a visibly different note for. Pure, same
 * guarantees as `bindingFor`.
 */
export function unresolvedChannelId(code: string, sessionDetail: SessionDetail): string | null {
  const props = parse(code);
  if (props === null) return null;

  for (const mark of props.marks as MarkProps[]) {
    if (findChannel(sessionDetail.channels, mark.channel) === null) {
      return mark.channel;
    }
  }
  return null;
}
