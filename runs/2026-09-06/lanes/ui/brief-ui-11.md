# UI-11 — shared cursor, chart action menu, keyboard zoom/pan, playback transport

The day-one chart interactions (decision 27): one cursor per worksheet shared
by every chart in it, a right-click action menu, keyboard zoom and pan, and a
play button that runs the cursor at live speed while every plot pans. Playback
is a feature, not an animation (decision 18). ONE commit.

Worktree: `…/idl1-app-worktrees/ui-8` (the Notebook worktree).
**Depends on UI-10 committed there.** Merge `main` first (R19).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-8"
git merge-base --is-ancestor <UI-10 commit hash> HEAD && echo GATE-OK
grep -c "playback\|PlaybackSlot" app/src/shell/TopBar.tsx
```
`GATE-OK` and `>= 1` — UI-4 reserved a transport slot in the top bar. If the
slot is absent, STOP and ask rather than restructuring the shell.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 18, 27 and the
"Cursor/hover" paragraph of "Chart style rules for Plot";
`FLUTTER-UI-SURVEY.md` §7 (`ChartContextMenu`, the ~20-value `ChartAction`
enum, keyboard shortcuts) — this enum is the port target; the direction's "over
the L6 action set" means: whatever the landed code can already do;
`runs/2026-09-06/RULINGS-DIGEST.md` (Notebook + interaction lines);
`runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4 and its tightening (read twice —
this task is closest to the effects rule);
`app/src/routes/pages/Notebook/model/{cursor,cursorReadoutDriver,viewport,hover,settle,tiers,tileCache}.ts`
and `components/{ChartCell,CursorReadout}.tsx` in full; `app/src/shell/TopBar.tsx`;
`app/src/routes/pages/Notebook/theme/plotTheme.ts` (UI-8's cursor colours);
`app/src/components/ui/context-menu.tsx` (UI-3).

## Where

- **New:** `app/src/routes/pages/Notebook/interaction/chartActions.ts` + test,
  `interaction/keymap.ts` + test, `interaction/playback.ts` + test,
  `interaction/ChartContextMenu.tsx`, `interaction/PlaybackTransport.tsx`.
- **Edited:** `components/ChartCell.tsx` (mount the menu and the keymap over
  the existing gesture code), `components/CursorReadout.tsx` (restyle to the
  token chips), `app/src/shell/TopBar.tsx` (**the reserved transport slot
  only** — UI-4 owns the rest of that file; change nothing else in it).
- `CHANGELOG.md`.
- The direction writes `app/src/notebook/interaction/`; the real Notebook lives
  under `app/src/routes/pages/Notebook/`, so `interaction/` sits beside
  `model/` and `theme/`.

## Interfaces

```ts
// interaction/chartActions.ts
/** The chart action set, ported from idl0's `ChartAction` enum
 *  (FLUTTER-UI-SURVEY §7) and narrowed to what the landed viewport/cursor
 *  code can actually do today. An action this code cannot perform is not in
 *  the union — a menu item that does nothing is worse than an absent one. */
export type ChartAction =
  | "zoomIn" | "zoomOut" | "zoomToSelection" | "resetZoom"
  | "panLeft" | "panRight"
  | "setCursor" | "clearCursor" | "cursorToPeak"
  | "toggleCode" | "copyValue";
/** Which actions apply in a given context, in menu order, with separators. */
export function actionsFor(ctx: { hasCursor: boolean; hasSelection: boolean; canReset: boolean }): (ChartAction | "-")[];
/** The label and keyboard hint shown for an action. */
export function actionLabel(a: ChartAction): { label: string; hint: string | null };

// interaction/keymap.ts
/** Keyboard zoom/pan bindings (decision 27). Pure: a KeyboardEvent-shaped
 *  record in, an action or null out — so every binding is tested without a
 *  DOM, and a modifier collision is a failing test rather than a surprise. */
export function actionForKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): ChartAction | null;

// interaction/playback.ts
/** Live-speed playback: a pure tick that advances the shared cursor.
 *  `speed` is a multiple of real time (1 = live). Returns the new cursor
 *  time and whether playback should stop (end of span reached). Clamped to
 *  the session span so a long frame gap cannot run the cursor off the end. */
export interface PlaybackState { tUs: bigint; playing: boolean; speed: number; }
export function tick(state: PlaybackState, elapsedMs: number, spanUs: [bigint, bigint]): PlaybackState;
export function togglePlay(state: PlaybackState): PlaybackState;
```

## Rules that decide whether this task is correct

- **The cursor is per worksheet and shared.** Every chart in the worksheet
  reads the same cursor time; playback moves that one cursor. Do not give a
  chart its own playback clock.
- **No IPC on the interaction path** (CLAUDE.md §2, P6). A playback frame moves
  the cursor and pans the existing viewport transform. Re-fetching tiles,
  re-computing an FFT window or asking for a cursor readout happens through the
  **existing settle path** (`model/settle.ts`, `CURSOR_SETTLE_MS`,
  `isStaleSettleResult`) — not once per frame. If live-speed playback makes the
  settle fire continuously, that is a real design question: STOP and report
  rather than inventing a throttle.
- **Effects rule.** The `requestAnimationFrame` loop advances local state only;
  it is not an IPC effect. Any effect that starts IPC keeps its dependency
  array on data, keeps callbacks in refs, never cancels in flight, and decides
  staleness with the existing monotonic sequence guard. A function prop in a
  dependency array beside a cancelling cleanup is Critical on sight.
- **Drag-rectangle zoom** reuses `model/viewport.ts`'s `zoomAt`/`clampTo`; do
  not write a second transform.

## Tests

`actionsFor — no cursor, no selection — the menu omits clearCursor and
zoomToSelection`; `actionsFor — every context — no two separators adjacent and
none leading or trailing`; `actionLabel — every ChartAction — a label, and a
hint exactly when keymap.ts binds it` (this pairs the two modules: an unbound
action must not advertise a shortcut); `actionForKey — each binding — its
action`; `actionForKey — a bound key with an unexpected modifier — null`;
`tick — playing at speed 1 for 1000 ms — the cursor advances 1 000 000 µs`;
`tick — elapsed past the span end — clamped to the end and playing false`;
`tick — not playing — unchanged`; `togglePlay — from the end of the span —
restarts from the beginning or stays put` (decide, document, test).

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
```
Non-zero `passed`; pre-existing Notebook tests unchanged.

## Steps

- [ ] 1. Entry gate. 2. `chartActions.ts` + tests. 3. `keymap.ts` + tests.
      4. `playback.ts` + tests. 5. `ChartContextMenu` over UI-3's
      `context-menu`. 6. Keyboard bindings mounted on the focused chart, not
      on `window` (a global key handler would fight the CodeMirror editor).
      7. `PlaybackTransport` in the reserved top-bar slot, driving the shared
      cursor. 8. `CursorReadout` restyled to token chips. 9. Gate.
      10. `tokenSheet.test.ts` green. 11. NUL check. 12. CHANGELOG.
      13. Commit `app: shared cursor actions, keyboard bindings and playback
      transport (UI-11)`.

## Do not

- Do not add an IPC command or a stub.
- Do not fetch, re-tile or re-compute per animation frame.
- Do not add figure export (decision 28) or a cascading submenu unless the
  landed action set needs one.
- Do not change `model/viewport.ts`, `model/settle.ts` or `model/cursor.ts`
  behaviour; call them.
- Do not edit `TopBar.tsx` beyond the reserved slot, and do not touch other
  pages.

## Spec discipline

**Spec-during** — playback and the keyboard bindings are new user-visible
behaviour. CHANGELOG bullet, and list the final key bindings in the report so
the lead can put them in Settings' controls section (UI-7 renders them from
`Settings/controls.ts`; say whether they now disagree).

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
that pre-existing counts are unchanged; the shipped `ChartAction` variants and
any idl0 action deliberately dropped; the final key bindings as one compact
list; what playback does at the end of the span; whether live-speed playback
triggers the settle path continuously (and what you did about it); parity gaps;
anything needing a ruling.

## Open questions

1. **Does playback re-compute FFT/spectrogram windows live?** Decision 18 says
   yes in principle. *Recommendation:* pan the existing rasters during
   playback and re-compute on pause or on settle; a per-frame FFT is IPC on
   the interaction path, which CLAUDE.md §2 forbids. If Isaac wants live
   re-computation, that is a contract-level performance question for wave 3.
2. **Where the keyboard bindings are listed for the user.** *Recommendation:*
   `Settings/controls.ts`'s `SpecRow` list, fed from `keymap.ts` so the two
   cannot disagree. If that cross-page import is unwelcome, duplicate the table
   and add a test that compares them.
3. **Playback speed control.** The direction names live speed only.
   *Recommendation:* ship `speed` in the state and expose 1× only; the
   transport gets a speed menu when someone asks for it.
