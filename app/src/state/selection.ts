/**
 * Selection is an ordered list of {@link SelectionWindow}s (C1 §6.1, ruling
 * R115/R117): the app picks *windows of time-series data*, and a session, a
 * lap and an explicit drag range are three ways to name the same kind of
 * object, not three different concepts. Session-to-session and lap-to-lap
 * comparison are therefore the same operation on the same structure.
 *
 * Pure and dependency-free by design (`columnVisibility.ts`'s pattern):
 * no `react` import, no `@/*` alias import, nothing vitest's `node`
 * environment cannot resolve. This module owns no IPC and no React state —
 * `AppState.tsx` (Task 8) holds the list and dispatches through the
 * functions here.
 */

/** The span a window covers within one session, C1 §6.1's `Span`. */
export type Span =
  | { kind: "session" }
  | { kind: "lap"; lapNumber: number }
  | { kind: "range"; t0Us: number; t1Us: number };

/**
 * One selected window (C1 §6.1 `Window`). `t0Us`/`t1Us` on a `"range"` span
 * are **session-relative microseconds from that session's first sample's
 * hardware timestamp**, not epoch time (C1 §6.1, ruling R117 item 1) — the
 * same axis as `Channel.t_us`. A reader who assumes epoch and compares two
 * windows' `t0Us` values across different sessions gets a meaningless
 * result; only a window's own `sessionId` gives its `t_us` axis meaning.
 *
 * `colour` is a chart token name (`--chart-1` … `--chart-8`), resolved
 * through `Notebook/theme/series.ts`'s `seriesColor` — never a hex literal
 * (ruling R117 item 6).
 */
export interface SelectionWindow {
  sessionId: string;
  span: Span;
  colour: string;
}

/** The eight chart token names, in cycle order (`tokens.css`, UI-1). Kept
 *  as this module's own copy rather than importing
 *  `Notebook/theme/series.ts` — that module lives in the routes/pages
 *  layer and this one is app state; both are pinned to the same eight
 *  names by `tokenSheet.test.ts` against `tokens.css`, so they cannot
 *  silently drift apart. */
const CHART_TOKEN_NAMES = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  "--chart-8",
] as const;

/** The part of {@link windowKey} contributed by `span` alone. */
function spanKey(span: Span): string {
  switch (span.kind) {
    case "session":
      return "session";
    case "lap":
      return `lap:${span.lapNumber}`;
    case "range":
      return `range:${span.t0Us}:${span.t1Us}`;
  }
}

/**
 * A stable string identity for `w`, for use as a React key and as an effect
 * dependency (operating brief §4's "keys on data only" rule). Built from
 * `sessionId` and `span` only — **never** `colour`, so recolouring a window
 * does not change its identity.
 *
 * Two windows over the same `sessionId` with different `span`s always
 * produce different keys (R117 item 2: a repeated `sessionId` is legal and
 * is the normal case — lap-to-lap comparison — and must never collapse).
 * Two windows that happen to resolve to the *same* span (C1 §6.1: "the same
 * lap in two colours in two roles") legitimately produce the *same* key —
 * that pair is not deduplicated by this module (see {@link nextWindows}),
 * so a caller needing a unique React key per list entry must combine this
 * with the entry's array index.
 */
export function windowKey(w: SelectionWindow): string {
  return `${w.sessionId}::${spanKey(w.span)}`;
}

/**
 * How a selection click combines with the existing selection. Named after
 * the gesture a UI binds it to (Task 12/13's concern, not this module's):
 * a plain click is `"replace"`, a shift-click is `"add"`, a ctrl/cmd-click
 * is `"toggle"`.
 */
export type SelectionModifier = "replace" | "add" | "toggle";

/**
 * Computes the next selection list from `current` plus a `clicked` window,
 * per `modifier`:
 *
 * - `"replace"` — the plain click. Discards `current` entirely; the result
 *   is `[clicked]`.
 * - `"add"` — the shift-click. Appends `clicked` to the end of `current`
 *   unconditionally, preserving order. This can produce two windows with
 *   the same {@link windowKey} (same session, same span) — that is legal
 *   (C1 §6.1) and is how a caller deliberately selects the same lap twice
 *   to give it a second colour/role; this function does not guess at
 *   de-duplication.
 * - `"toggle"` — the ctrl/cmd-click. If any window in `current` has the
 *   same {@link windowKey} as `clicked`, **every** matching entry is
 *   removed (toggling a session/lap off removes all of its occurrences,
 *   not just the first). Otherwise `clicked` is appended, same as `"add"`.
 *
 * The empty list is "nothing selected" (decision 48) and is a legal result
 * of `"toggle"` removing the last window, or a legal starting `current`.
 */
export function nextWindows(
  current: readonly SelectionWindow[],
  clicked: SelectionWindow,
  modifier: SelectionModifier,
): SelectionWindow[] {
  switch (modifier) {
    case "replace":
      return [clicked];
    case "add":
      return [...current, clicked];
    case "toggle": {
      const key = windowKey(clicked);
      const withoutMatches = current.filter((w) => windowKey(w) !== key);
      return withoutMatches.length === current.length ? [...current, clicked] : withoutMatches;
    }
  }
}

/**
 * The chart token to assign to the next window being added to `windows`,
 * cycling `--chart-1` … `--chart-8` by list position (`windows.length % 8`,
 * matching `seriesColor`'s wrap rule). **Past eight windows the cycle
 * repeats**: a 9th window reuses `--chart-1`, a 10th reuses `--chart-2`,
 * and so on — two windows then share a colour on screen. This module does
 * not refuse a 9th window or invent a ninth colour; token count is fixed
 * by `tokens.css` (UI-1) and collision past eight is a known, accepted
 * limit rather than an error.
 */
export function assignColour(windows: readonly SelectionWindow[]): string {
  return CHART_TOKEN_NAMES[windows.length % CHART_TOKEN_NAMES.length];
}

/** Formats a session-relative microsecond offset as seconds for a human
 *  label (`12.340s`), matching the precision a boundary-drag cursor reads
 *  (millisecond). Not a general time formatter — just this chip's need. */
function formatOffsetUs(us: number): string {
  return `${(us / 1_000_000).toFixed(3)}s`;
}

/**
 * The short human label for `w`, for the top-bar selection chip (Task 13).
 * A raw `sessionId` is a 32-char hex id and must never appear in the UI, so
 * this module has no way to resolve one itself and takes `sessionName`
 * instead — the caller resolves it from the session catalog (by
 * `w.sessionId`) before calling this function. This keeps the module pure
 * and catalog-free while ruling out the id ever leaking into a label.
 *
 * - `"session"` span: the session name alone (the whole recording).
 * - `"lap"` span: `"<sessionName> · Lap <n>"`.
 * - `"range"` span: `"<sessionName> · <t0>–<t1>"`, offsets formatted as
 *   seconds from the session's first sample (see {@link SelectionWindow}).
 */
export function describeWindow(w: SelectionWindow, sessionName: string): string {
  switch (w.span.kind) {
    case "session":
      return sessionName;
    case "lap":
      return `${sessionName} · Lap ${w.span.lapNumber}`;
    case "range":
      return `${sessionName} · ${formatOffsetUs(w.span.t0Us)}–${formatOffsetUs(w.span.t1Us)}`;
  }
}
