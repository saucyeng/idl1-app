# Review — UI-10 Notebook frame + R95 pausing

Commit: `bc61d8b` on branch `ui-notebook`, worktree
`idl1-app-worktrees/ui-notebook` (built on UI-9 `21f3df8`).
Files touched: `CHANGELOG.md`; `Notebook/components/{CellFrame,CellList,
EditorPanes,JsCellFrame,WorkbookBar}.tsx`; `Notebook/index.tsx`;
`Notebook/model/{codeVisibility,editorPlacement,outputRegister,
sandboxLifecycle}.ts` + their `*.test.ts`.

## Gate

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
```
`tsc`: clean, no errors. `vitest`: **50 files / 521 passed** (0 failed) — matches
implementer's reported count exactly, 24 new tests across the four new pure
modules (verified by counting each test file's `it(...)` blocks: sandboxLifecycle
9, outputRegister 4, editorPlacement 6, codeVisibility 5 = 24).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | none | — |

No Critical, Important, or Minor findings.

## Verification detail

**Pausing (R95 items 2/3), traced end to end:**
- `model/sandboxLifecycle.ts`'s `sandboxShouldRun`/`initialSandboxPrimeState`/
  `nextSandboxPrimeState` are pure and unit-tested for every transition
  (hidden→visible bumps `primeEpoch`, visible→hidden leaves it, no-change
  returns the same reference). `index.tsx:113-117` wires `useRouteVisible("notebook")`
  (UI-4's pre-existing `shell/routeVisibility.tsx`, untouched) through this
  module into `primeState`, a plain data value.
- Three effects gate on `primeState.running` only (data-only dependency,
  no callback in the array): the `SandboxHost` mount effect
  (`index.tsx:183-195`, cleanup `host.dispose()`), the `watchWorkbook`
  subscription (`index.tsx:212-224`, cleanup sets `disposed`), and the
  debounced `eval_workbook` timer (`index.tsx:238-249`, cleanup
  `clearTimeout`). Each satisfies the tightening rule: hiding runs the
  effect's own cleanup (a "this subscription/timer is no longer current"
  event, not a cancelled in-flight promise), and no callback prop appears
  in any of the three dependency arrays. `host/SandboxHost.ts` is untouched
  (confirmed: not in the commit's file list) — no `pause()`/`resume()` pair
  was added, this task uses React's mount/unmount cycle directly, matching
  the CHANGELOG's claim.
- **Re-prime and the boundIdentityRef clear.** `primeEpochSeenRef` compares
  against `primeState.primeEpoch` inside the `setCells`/inline-spans effect
  (`index.tsx:764-768`) and clears `boundIdentityRef` exactly once per
  epoch (a strict `!==` check followed by updating the seen-ref) — not on
  every ordinary cell edit, since those don't change `primeEpoch`. This
  effect runs before the channel-bind and FFT-bind effects in the same
  commit (declared earlier, and React's passive-effect order is
  declaration order) and populates the fresh `SandboxHost` first, so the
  later effects observe a live host when they run.
- **Stale pre-hide result landing after a re-prime.** Traced the exact
  scenario the brief calls out. `boundIdentityRef` is only a "should a new
  run start" gate; staleness is decided by `CellRunSequencer` (a per-cell
  monotonic counter, shared by every run kind, untouched by this task).
  On a hidden→visible transition, `boundIdentityRef` is cleared, so the
  channel-bind and FFT-bind effects treat every cell's binding as new and
  call `cellRunSequencerRef.current.start(cellId)` again, which bumps the
  sequence and makes any earlier, still-pending run's `isStale()` callback
  return true. Verified both drivers actually call `isStale()` before
  dispatching any state-changing action: `channelBindDriver.ts` checks it
  after every per-channel `await` and again before the final
  `boundChannels`/`chartWindow` dispatch; `fftDriver.ts` checks it once
  after its single `await`, before calling `dispatchFft`. A pre-hide
  fetch that resolves after the epoch bump is therefore dropped, not
  applied against the new epoch's state. `sandboxHostRef.current?.…` calls
  inside stale-but-somehow-reached code paths are additionally guarded by
  optional chaining against a disposed (torn-down) host.

**Everything else:**
- `model/outputRegister.ts`, `editorPlacement.ts`, `codeVisibility.ts` match
  the brief's interfaces and named test cases exactly. `editorPlacement.ts`
  imports `shell/layout.ts`'s `resolveLayout` rather than restating 600/1200
  (its own test asserts the two can't drift). `outputRegister.ts` thins
  `Settings/theme.ts`'s pre-existing `resolveRegister`/`OutputRegister`
  rather than re-implementing the width rule (R93/UI-7 Q1 recommendation).
  Neither `Settings/theme.ts`, `prefsStore.ts`, `prefs.ts`,
  `shell/routeVisibility.tsx`, nor `shell/layout.ts` was modified (`git diff
  main bc61d8b` on those paths is empty) — read-only imports as the plan requires.
- The register preference is read via a second `PrefsStore` object
  (`createPrefsStore(localStorageBackend())`) wrapping the same
  `idl1.settings.prefs.v1` localStorage document Settings' own instance
  uses, not a third storage key — matches R93/the brief's Open Question 1
  ruling. Absent (`null`) falls back to `defaultRegister(width)`.
- `WorkbookBar.tsx`: rescan, create, dirty guard, and rebuild-report
  behaviour is unchanged (same handlers, same conditions), only restyled
  onto shadcn primitives plus the new worksheet-tabs placeholder (disabled
  `+`, disclosed as a parity gap: no multi-worksheet backend concept yet)
  and the register `ToggleGroup`.
- `CellFrame.tsx`: kicker, `StatusDot`, code toggle, `--surface-2` +
  `--good` inset-bar selection, and error `NoteBlock` all present and
  token-driven (`text-fg-dim`, `text-good`, `text-accent`, `border-rule`,
  `bg-control` — all Tailwind classes resolving to `tokens.css` custom
  properties, confirmed against `tokens.css`). Span errors remain in-place
  text inside `ProseBlock` (untouched) — no promotion to a banner.
  `JsCellFrame.tsx` duplicates `NoteBlock`'s class string as a literal
  rather than importing the component; verified this is necessary, not
  cosmetic laziness: `app/vitest.config.ts` has no `@` alias (only
  `vite.config.ts`, dev/build-only), and the pre-existing
  `jsCellFrameHeight.test.ts` imports `DEFAULT_JS_CELL_HEIGHT_PX` from this
  same file, putting `NoteBlock`'s `@/lib/utils` import on that test's
  module graph if it were imported directly.
- `EditorPanes.tsx`: `js` cells now show Properties/Code as `Tabs`; other
  kinds render bare `CodePane`, unwrapped — matches decision 29.
- Wide: `ResizablePanelGroup` lives inside `index.tsx`'s own returned tree
  (not a second outer split touching shell columns, which remain
  untouched). Medium: `editorPanesElement` renders inline under the
  open cell only when `placement === "inline"` and `cell.id === openCellId`.
  Narrow: output is read-only (`outputIsReadOnly` gates `editorPanesElement`
  to `null`), Properties opens in `BrandSheet` (uses `sheetSideFor`, not
  reimplemented) — but only for `kind === "js"`; math/table cells have no
  narrow editor, correctly and explicitly disclosed as a parity gap in the
  CHANGELOG rather than silently dropped.
- No color literal or `box-shadow` found anywhere in the commit's diff
  (`grep` for hex codes and `box-shadow` across `git show bc61d8b`: no
  matches). `host/**` has zero files in the commit's stat — confirmed
  untouched. No NUL bytes in any changed file.
- CHANGELOG bullet is accurate against the code read (spot-checked every
  specific claim above) and discloses both R98 items (unpersisted
  wide-layout split width; the inert-`watchWorkbook`-callback pattern with
  no C3 unsubscribe) plus three parity gaps, matching the ruling's own
  wording of the same two ambiguities.

## Verdict rationale

Every check the dispatch called out as the review's centre of gravity — the
pausing correctness, its sequencing guards, and the tightened effects rule —
traces cleanly through the code with no gap: dependency arrays are
data-only, cleanups only unsubscribe/clear timers, and the one place a
stale async result could corrupt a fresh epoch is guarded by a pre-existing,
unmodified monotonic sequencer that this task correctly triggers via the
`boundIdentityRef` clear. The three new pure modules match their brief
interfaces and test names verbatim. Existing behaviour (WorkbookBar's
rescan/create/dirty-guard, the R69/R72 replay order, host/** isolation) is
preserved. The gate passes with the reported count, and the CHANGELOG's
claims all check out against the code.

VERDICT: CLEAN
