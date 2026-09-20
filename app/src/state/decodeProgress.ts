/**
 * Pure decode-progress model (ruling R221 item 1): the `decode_progress`
 * events (C3 §3.2) the engine emits while it reads channels out of
 * `data.parquet`, folded into the two answers the notebook renders — one
 * fraction per cell, and one summary line for the whole notebook.
 *
 * No React, no DOM, no IPC. Two consumers fold the same events: the
 * notebook, which draws a per-cell ring from {@link cellDecodeFraction},
 * and the shell's status bar, which draws one chip from
 * {@link decodeSummary}. It lives in `state/` rather than under
 * `Notebook/model/` for exactly that reason — the shell must not import
 * from a page.
 *
 * **Why a burst rather than a running total.** The engine reports work, not
 * requests: a decode faster than ~200 ms is silent, and a cache hit reports
 * nothing at all. So the events that arrive are exactly one burst of slow
 * decodes — usually a session opening — and the moment the last of them
 * finishes there is nothing left to say. The state therefore empties itself
 * on that event rather than accumulating a lifetime tally that would make
 * the second session opened read "12 of 37 channels".
 */
import type { DecodeProgressEvent } from "../ipc/decode_progress";

/** One channel's decode, as last observed. */
export interface ChannelDecode {
  sessionId: string;
  channel: string;
  /** Rows decoded so far, over every pass this decode makes. */
  doneRows: number;
  /** Rows this decode has to get through; never `0` (C3 §3.2). */
  totalRows: number;
  /** Whether this decode's terminal observation has arrived. */
  finished: boolean;
}

/**
 * Every decode currently being reported, keyed by {@link decodeKey}.
 *
 * Empty means nothing slow is decoding — the state every notebook starts and
 * returns to. A `Map` rather than an array because the fold is keyed and a
 * cell looks its own channels up by key.
 */
export type DecodeProgressState = ReadonlyMap<string, ChannelDecode>;

/** The empty state — no decode being reported. */
export const NO_DECODES: DecodeProgressState = new Map();

/**
 * The key one channel's decode is tracked under. Session *and* channel: two
 * selected windows can decode the same channel name from different sessions,
 * and those are two decodes, not one.
 *
 * `::`, the same separator `state/selection.ts`'s `windowKey` uses, and for
 * the same reason: neither half can contain it (a session id is hex, a
 * channel id is an identifier), and it stays readable in a debugger.
 */
export function decodeKey(sessionId: string, channel: string): string {
  return `${sessionId}::${channel}`;
}

/**
 * Folds one `decode_progress` event into `state`.
 *
 * A `finished` event that leaves nothing unfinished empties the state
 * (see this module's note on bursts) — that is what takes the chip and every
 * ring off screen. A `finished` event with other decodes still running only
 * marks its own channel done, so the "n of m channels" count keeps its
 * denominator for as long as the burst lasts.
 *
 * An event with `total_rows <= 0` is ignored rather than stored: the contract
 * forbids one, and dividing by it would put `Infinity` or `NaN` on screen.
 */
export function applyDecodeProgress(state: DecodeProgressState, event: DecodeProgressEvent): DecodeProgressState {
  if (!(event.total_rows > 0)) return state;

  const key = decodeKey(event.session_id, event.channel);
  const next = new Map(state);
  next.set(key, {
    sessionId: event.session_id,
    channel: event.channel,
    doneRows: Math.min(Math.max(event.done_rows, 0), event.total_rows),
    totalRows: event.total_rows,
    finished: event.finished,
  });

  const anyRunning = [...next.values()].some((d) => !d.finished);
  return anyRunning ? next : NO_DECODES;
}

/**
 * The fraction `[0, 1]` of the rows this cell's pending channels have
 * decoded, or `null` when none of them is being reported — the signal
 * `CellFrame` shows a determinate ring for instead of an indeterminate
 * spinner (ruling R221 item 1(a)).
 *
 * Weighted by rows, not by channel count: a cell binding one 7-million-row
 * IMU channel and one 9-thousand-row GPS channel is not half done when the
 * small one lands. Channels of this cell that are *not* being reported are
 * left out of both sides of the fraction entirely — they are either already
 * resident (a hit reports nothing) or too fast to report, and counting them
 * as either done or pending would both be a guess.
 *
 * @param keys This cell's channels as {@link decodeKey}s.
 */
export function cellDecodeFraction(state: DecodeProgressState, keys: readonly string[]): number | null {
  let done = 0;
  let total = 0;
  for (const key of keys) {
    const decode = state.get(key);
    if (decode === undefined) continue;
    done += decode.doneRows;
    total += decode.totalRows;
  }
  return total > 0 ? done / total : null;
}

/**
 * The name of the one channel this cell is still decoding, or `null` when
 * that is not a single well-defined answer — the channel `CellFrame`'s state
 * line names (ruling R250: "fetching IMU0_AccelZ 40 %").
 *
 * `null` when none of this cell's channels is being reported, and `null`
 * again when more than one distinct channel *name* is still unfinished:
 * with two in flight there is no single honest name, and picking one would
 * make the line say the work is somewhere it partly is not. The same
 * channel decoded from two selected sessions is one name and counts once —
 * the reader is told which signal is being read, not how many copies.
 *
 * Finished decodes are excluded: a burst whose last unfinished channel is
 * `IMU0_AccelZ` names that one, whatever already landed.
 *
 * @param keys This cell's channels as {@link decodeKey}s.
 */
export function soleDecodingChannel(state: DecodeProgressState, keys: readonly string[]): string | null {
  const names = new Set<string>();
  for (const key of keys) {
    const decode = state.get(key);
    if (decode === undefined || decode.finished) continue;
    names.add(decode.channel);
    if (names.size > 1) return null;
  }
  return names.size === 1 ? ([...names][0] as string) : null;
}

/** What the status chip shows while a session is loading (ruling R221 item 1(b)). */
export interface DecodeSummary {
  /** Channels whose decode has finished. */
  channelsDone: number;
  /** Channels being reported in this burst — the denominator, which only grows. */
  channelsTotal: number;
  /** Rows decoded over rows to decode, `[0, 1]`. */
  fraction: number;
}

/**
 * The notebook-wide summary, or `null` when nothing is being reported (the
 * chip is then absent, not showing zero).
 */
export function decodeSummary(state: DecodeProgressState): DecodeSummary | null {
  if (state.size === 0) return null;

  let done = 0;
  let total = 0;
  let channelsDone = 0;
  for (const decode of state.values()) {
    done += decode.doneRows;
    total += decode.totalRows;
    if (decode.finished) channelsDone += 1;
  }
  return { channelsDone, channelsTotal: state.size, fraction: total > 0 ? done / total : 0 };
}

/**
 * The chip's one line — `"Loading session · 3 of 9 channels · 41 %"`.
 *
 * The percentage is floored, not rounded: a chip reading "100 %" while a
 * decode is still running is the one thing this text must never say.
 */
export function describeDecodeSummary(summary: DecodeSummary): string {
  const percent = Math.floor(summary.fraction * 100);
  return `Loading session · ${summary.channelsDone} of ${summary.channelsTotal} channels · ${percent} %`;
}
