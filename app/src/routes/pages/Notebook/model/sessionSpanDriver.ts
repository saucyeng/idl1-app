/**
 * Pure, unit-tested driver for resolving one selected {@link SelectedWindow}
 * into the `SessionDetail` and recorded session span (lead pre-ruling
 * 2026-09-05 #1, `runs/2026-09-05/lanes/l6/brief-task13b.md`) that
 * `model/jsCellBinding.ts`'s `bindingFor` needs. Follows the same shape as
 * `openEvalDriver.ts` (the tightened IPC-effects rule,
 * `runs/2026-09-05/lanes/l6/review-STANDING.md`): `Notebook/index.tsx`'s
 * effect depends only on data (a stable key derived from the window, never
 * the object identity) and calls this driver, which owns every branch and
 * dispatches typed actions instead of the effect body deciding anything
 * itself.
 *
 * Migrated from `sessionId: string | null` to `window: SelectedWindow |
 * null` (C1 §6.1, ruling R111/R115/R117) — this driver resolves one
 * window's `session_id` and reads `Span`/`colour` no further, so it is
 * **per-window**: a caller with several selected windows calls
 * `runSessionSpan` once per window (its own `isStale`/dispatch pair), not
 * once for "the selection". Only `session_id` is consulted here; the
 * window's `span`/`colour` are unrelated to resolving `SessionDetail` or
 * the session's *recorded* span (the whole-session duration used to size
 * `bindingForTime`'s `initialSpan`, unaffected by which lap/range is
 * selected — R123: computation and the initial viewport are session-wide,
 * only aggregation is window-scoped, and this driver produces neither).
 */
import type { DecodedTile } from "../../../../ipc/tiles";
import type { SessionDetail } from "../../../../ipc/catalog";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { MAX_TIER } from "./tiers";
import { spanFromCoarsestTile } from "./sessionSpan";

/** `columnCount` for the one-off coarsest-tile fallback fetch (lead pre-ruling #1) — an arbitrary but stable choice, since this tile's samples are only read for their column *times*, never rendered at this resolution. */
export const FALLBACK_TILE_COLUMN_COUNT = 256;

/** The IPC calls this driver needs, injected so it never imports `ipc/*` directly. */
export interface SessionSpanDeps {
  getSession: (sessionId: string) => Promise<SessionDetail>;
  /** Only the two fields this driver reads, from `ipc/catalog.ts`'s `listSessions`. */
  listSessions: () => Promise<{ session_id: string; duration_ms: number | null }[]>;
  fetchTile: (
    sessionId: string,
    channel: string,
    tier: number,
    tileIndex: number,
    columnCount: number
  ) => Promise<DecodedTile>;
}

/** One resolved piece of session-span state, dispatched independently since `detail` typically resolves before `spanUs` does. */
export type SessionSpanAction =
  | { type: "sessionDetail"; detail: SessionDetail | null }
  | { type: "sessionSpan"; spanUs: number | null };

/** Dispatches one `SessionSpanAction` — a caller's `useState` setters, or a test's recorder. */
export type SessionSpanDispatch = (action: SessionSpanAction) => void;

/**
 * Resolves `window`'s `SessionDetail` and recorded span, once. `window ===
 * null` (no window selected) dispatches both as `null` immediately,
 * matching `bindingFor`'s own "nothing to bind against" treatment. Never
 * throws — every rejection dispatches `null` instead, so a caller never
 * needs its own top-level `.catch`.
 *
 * @param isStale Checked after every `await`, same contract as
 *   `openEvalDriver.ts`'s `runOpenAndEval`.
 */
export async function runSessionSpan(
  deps: SessionSpanDeps,
  window: SelectedWindow | null,
  dispatch: SessionSpanDispatch,
  isStale: () => boolean
): Promise<void> {
  if (window === null) {
    dispatch({ type: "sessionDetail", detail: null });
    dispatch({ type: "sessionSpan", spanUs: null });
    return;
  }
  const sessionId = window.session_id;

  let detail: SessionDetail;
  try {
    detail = await deps.getSession(sessionId);
  } catch (error) {
    // A `getSession` rejection dispatches the same `null` a caller sees
    // for "no window selected" -- deliberately, so every consumer keeps
    // one "nothing to bind against" state rather than two. Too risky to
    // narrow into its own visible state within this task (it would need a
    // new dispatch variant and a UI treatment, R153 audit note): flagged
    // here so the failure is at least not silent everywhere.
    if (!isStale()) {
      console.warn(`[sessionSpanDriver] getSession(${JSON.stringify(sessionId)}) failed:`, error);
      dispatch({ type: "sessionDetail", detail: null });
      dispatch({ type: "sessionSpan", spanUs: null });
    }
    return;
  }
  if (isStale()) return;
  dispatch({ type: "sessionDetail", detail });

  try {
    const summaries = await deps.listSessions();
    if (isStale()) return;
    const summary = summaries.find((s) => s.session_id === sessionId);
    if (summary?.duration_ms !== undefined && summary.duration_ms !== null) {
      dispatch({ type: "sessionSpan", spanUs: summary.duration_ms * 1000 });
      return;
    }

    // Fallback (lead pre-ruling #1): no `duration_ms` from the catalog —
    // read the recorded span off the first channel's coarsest tile
    // (`MAX_TIER`, index 0), never `sample_count / nominal_rate_hz`.
    if (detail.channels.length === 0) {
      dispatch({ type: "sessionSpan", spanUs: null });
      return;
    }
    const first = detail.channels[0];
    const tile = await deps.fetchTile(sessionId, first.channel_id, MAX_TIER, 0, FALLBACK_TILE_COLUMN_COUNT);
    if (isStale()) return;
    const span = spanFromCoarsestTile(tile);
    dispatch({ type: "sessionSpan", spanUs: span === null ? null : span.endUs - span.startUs });
  } catch (error) {
    // Same shape as the `getSession` catch above: `spanUs: null` reads as
    // "still resolving" to `bindingFor`, not as a failure. Flagged rather
    // than fixed here for the same reason (R153 audit note).
    if (!isStale()) {
      console.warn(`[sessionSpanDriver] resolving the session span for ${JSON.stringify(sessionId)} failed:`, error);
      dispatch({ type: "sessionSpan", spanUs: null });
    }
  }
}
