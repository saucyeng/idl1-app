/**
 * Pure, unit-tested driver for resolving `AppState.selection.sessionId`
 * into the `SessionDetail` and recorded session span (lead pre-ruling
 * 2026-09-05 #1, `runs/2026-09-05/lanes/l6/brief-task13b.md`) that
 * `model/jsCellBinding.ts`'s `bindingFor` needs. Follows the same shape as
 * `openEvalDriver.ts` (the tightened IPC-effects rule,
 * `runs/2026-09-05/lanes/l6/review-STANDING.md`): `Notebook/index.tsx`'s
 * effect depends only on `sessionId` and calls this driver, which owns
 * every branch and dispatches typed actions instead of the effect body
 * deciding anything itself.
 */
import type { DecodedTile } from "../../../../ipc/tiles";
import type { SessionDetail } from "../../../../ipc/catalog";
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
 * Resolves `sessionId`'s `SessionDetail` and recorded span, once.
 * `sessionId === null` (no session selected) dispatches both as `null`
 * immediately, matching `bindingFor`'s own "nothing to bind against"
 * treatment. Never throws — every rejection dispatches `null` instead, so
 * a caller never needs its own top-level `.catch`.
 *
 * @param isStale Checked after every `await`, same contract as
 *   `openEvalDriver.ts`'s `runOpenAndEval`.
 */
export async function runSessionSpan(
  deps: SessionSpanDeps,
  sessionId: string | null,
  dispatch: SessionSpanDispatch,
  isStale: () => boolean
): Promise<void> {
  if (sessionId === null) {
    dispatch({ type: "sessionDetail", detail: null });
    dispatch({ type: "sessionSpan", spanUs: null });
    return;
  }

  let detail: SessionDetail;
  try {
    detail = await deps.getSession(sessionId);
  } catch {
    if (!isStale()) {
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
  } catch {
    if (!isStale()) {
      dispatch({ type: "sessionSpan", spanUs: null });
    }
  }
}
