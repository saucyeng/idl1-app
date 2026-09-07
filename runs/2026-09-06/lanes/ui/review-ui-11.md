# Review: UI-11 — shared cursor, chart action menu, keyboard bindings, rect zoom, playback

Commit: `a6e66cd` on branch `ui-notebook`, worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\ui-notebook`
(depends on `bc61d8b` UI-10, merged in the same worktree).

Files touched: `CHANGELOG.md`; `app/src/routes/pages/Notebook/components/ChartCell.tsx`
(+463/-…), `components/CursorReadout.tsx`; `Notebook/index.tsx`; new
`Notebook/interaction/{chartActions,keymap,playback,cursorFollow,peak,rectZoom}.ts`
+ their `*.test.ts`; new `interaction/{ChartContextMenu,PlaybackTransport}.tsx`;
`app/src/shell/TopBar.tsx` (reserved slot only, +9/-4 lines).

## Gate

```
cd app && npx tsc --noEmit && npx vitest run
```
Result: `tsc` clean; **126 test files / 1135 tests passed**, 0 failed. New
`interaction/*.test.ts` files contribute exactly **26** tests (3+4+3+5+9+2),
matching the implementer's report; no pre-existing test was touched.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Major | `Notebook/interaction/PlaybackTransport.tsx:56-73`, `Notebook/index.tsx:1376-1382`, `shell/RouteHost.tsx:60-73` | `PlaybackTransport` is rendered unconditionally by the always-mounted `Notebook/index.tsx` (mount-and-hide, R93/R95) and `createPortal`s into `TopBar.tsx`'s slot, which lives **outside** the `hidden`-attributed route panel `RouteHost` wraps each page in. A portal's target is not part of the React parent's DOM subtree, so the `hidden` attribute that correctly hides the rest of the Notebook page has no effect on it: once a session/worksheet has a `cursorTUs` (which happens as soon as a session/workbook is open, independent of a manual cursor — see below), the play/pause button and running time readout stay visible in the shared `TopBar` on every tab (Device, Data, Settings), merely `disabled` while Notebook is not the active route. This is the exact question the dispatch flagged ("is the portal-by-id approach robust if the Notebook is not mounted") — under this app's actual mount-and-hide model the page is never unmounted, and that is precisely the case the portal does not handle: it needs to render `null` while its own route is hidden, not just pass `disabled`. | Gate the render on `useRouteVisible("notebook")` (already imported/available via `primeState`/`routeVisible` in `index.tsx`) in addition to `disabled`, e.g. don't render `<PlaybackTransport>` at all (or have it return `null`) when the Notebook route isn't the active one. |
| Minor | `Notebook/interaction/PlaybackTransport.tsx:60` | `cursorTUs === null` is the only content gate, but `sharedCursorTUs` can be non-null (and thus show the transport) purely because `manualCursorTUs` was ever set by a click — i.e. the transport appears even for a user who has only ever placed a cursor and never pressed play. This is a much smaller version of the same visibility gap above and is subsumed by fixing it, but worth naming separately: showing a play button for a chart nobody asked to animate is a real, if mild, discoverability/parity question, not just a cross-tab leak. | Covered by the Major fix above; no separate action needed once route-gated. |
| Minor | `app/src/routes/pages/Settings/controls.ts` | `keymap.ts`'s bindings (`ArrowUp/Down` for zoom, no `Alt`, `0` for reset, `z`/`Z` for zoom-to-selection) now disagree with the idl0-ported provisional table in `Settings/controls.ts` (`Alt+→/←`, `F2`, Y-axis zoom that doesn't exist). Correctly and honestly disclosed in both the `keymap.ts` doc comment and the CHANGELOG entry, and `ControlsSection.tsx` already renders a visible "Provisional — bindings land with the Notebook lane" banner (from an earlier lane), so the app itself never claims the stale table is live. Grading Minor rather than Major on that basis — the divergence is real but not silently presented as fact. | Follow-on (already flagged in the CHANGELOG and in `controls.ts`'s own doc comment): have `Settings/controls.ts`'s keyboard group import/compare against `keymap.ts` so the two cannot re-diverge silently. |

## Verified clean (per the dispatch's explicit checks)

- **No IPC on the interaction path, verified by reading the code, not by
  inspection claims.** `ChartCell.tsx`'s shared-cursor effect
  (`Notebook/components/ChartCell.tsx:539-577`) calls `applyViewport` (which
  calls `settleRef.current.notify`, a true debounce per `model/settle.ts`:
  every call does `clearTimeout` then `setTimeout`) and
  `cursorDriverRef.current.notify` (same debounce shape,
  `model/cursorReadoutDriver.ts`) on every playback frame. Both are
  reset-on-every-call debouncers, so a continuously advancing cursor during
  playback never lets either timer fire — `ensureTiles`/`cursorReadout` IPC
  only fires once playback stops or pauses (pause, end-of-span clamp, or
  route-hide). This is exactly the ruling's "pan-visually-then-refetch-once,
  do not stream IPC," achieved through the existing debounce with **no new
  throttle**, matching the CHANGELOG claim.
- **Playback stops when the Notebook route is hidden.** `index.tsx:293-307`
  gates the `requestAnimationFrame` loop on `primeState.running`; `index.tsx:313-317`
  additionally flips `playback.playing` off via `togglePlay` the instant
  `primeState.running` goes false while playing, so a hide-while-playing
  pauses rather than ticking invisibly (R95 applied to playback, as required).
  The app doesn't unmount pages (mount-and-hide, R93), so there is no
  separate unmount case to test beyond this.
- **Clock uses an injected scheduler and cannot double-tick.** `playback.ts`'s
  `tick` takes `elapsedMs` and a `spanUs` bound with no internal timer;
  `index.tsx`'s RAF loop supplies `elapsedMs` from its own `performance.now()`
  diff and calls `setPlayback` once per RAF frame — one `requestAnimationFrame`
  callback outstanding at a time (the effect's own cleanup calls
  `cancelAnimationFrame`). Tests cover start/pause (`togglePlay`), seek is N/A
  (no seek control shipped, consistent with Open question 3's "1× only"
  scope), rate (`speed` multiplier tested at 1 and 2), and end-clamp
  (`tick — elapsed past the span end`, `tick — a long frame gap overshooting
  by more than one span`).
- **Keyboard bindings do not fight CodeMirror/inputs.** `handleKeyDown` is
  wired to `onKeyDown` on the chart `<div tabIndex={0}>`
  (`ChartCell.tsx:795-802`), not `window` — a scoped listener structurally
  cannot receive keydowns while a CodeMirror editor or another input has
  focus, so there is nothing for a runtime check to guard and no dedicated
  test is needed (rendering/focus plumbing isn't unit-tested per CLAUDE.md
  §4); `keymap.test.ts` covers the pure binding table itself.
- **Shared cursor state lives in `index.tsx` (R99), decision logic in pure
  modules.** `manualCursorTUs`/`playback` state and `sharedCursorTUs`
  derivation are in `index.tsx`; `interaction/playback.ts` and
  `interaction/cursorFollow.ts` hold the actual "what time is it now" /
  "what does a chart show" logic and have no React/DOM/IPC import. Per-cell
  `cursorReadoutDriver` instances are kept exactly as R62 requires — only
  the cursor *time* is shared, not the readout driver.
- **Effects rule.** Both new/touched effects that matter
  (`index.tsx:293-307` RAF loop, `index.tsx:313-317` pause-on-hide,
  `ChartCell.tsx:539-577` shared-cursor pan) have data-only dependency
  arrays (`[playback.playing, primeState.running]`,
  `[primeState.running, playback.playing]`,
  `[cursorTUs, playing, sessionSpanUs, applyViewport]` where `applyViewport`
  is itself a `useCallback` keyed only on `sessionSpanUs`). None cancels
  in-flight IPC from its cleanup; the RAF loop's cleanup only cancels the
  animation frame, which is the local-state loop itself, not IPC.
- **`TopBar.tsx` touched only via the reserved slot** — a 4-line comment/attr
  change to the existing placeholder `<div>`, no new props, no shell-owned
  state added; the portal building block itself is sound (id lookup,
  resize-recheck, graceful `null` on absent slot) — the flaw is the missing
  route-visibility gate noted above, not the portal mechanism.
- **R69 intact.** Nothing in this commit touches the sandbox iframe, adds a
  host→sandbox channel, or injects host HTML into the sandbox; all rendering
  changed is host-side (`ChartCell`, `CursorReadout`, `TopBar` slot).
- **No colour literal outside `tokens.css`, no `box-shadow`** — verified by
  grep across every new/touched file in this commit; `CursorReadout.tsx`'s
  restyle uses `border-rule`/`bg-surface-2`/`text-fg`/`text-destructive`
  token classes only.
- **Parity gaps honestly disclosed**: Y-axis zoom and multi-cursor swap
  (idl0) dropped for lack of a landed Y-axis/second cursor; figure export
  correctly deferred to decision 28; no cascading submenu since the action
  set is flat. `chartActions.ts`'s own doc comment states the "a menu item
  that does nothing is worse than an absent one" rationale.
- **Tests**: A/A/A with blank lines, named `thing — condition — result`
  throughout the six new `*.test.ts` files; `chartActions.test.ts`'s pairing
  test derives keymap-bound actions from `actionForKey` itself rather than
  duplicating the table, so the two modules are structurally prevented from
  silently disagreeing.
- **CHANGELOG** entry matches the landed code point for point, including the
  honest disclosure of the `Settings/controls.ts` divergence and the parity
  gaps; no reformatting of untouched lines observed in the diff.

## Verdict rationale

The interaction-path/IPC discipline this task was riskiest on (continuous
playback vs. the settle debounce) is implemented correctly and verified
against the actual debounce code, not just the implementer's inspection
claim. Tests, doc comments, token usage and disclosure are all solid. The
one real defect — the playback transport leaking into the shared top bar on
every tab because a portal ignores its React ancestor's `hidden` attribute
under this app's mount-and-hide model — is a genuine, user-visible
regression that will appear the first time anyone loads a Notebook session
and switches tabs. It is a small, mechanical fix (gate on route visibility)
but it is real incorrect behavior, not a nitpick, so this is not clean.

VERDICT: NEEDS_FIXES
