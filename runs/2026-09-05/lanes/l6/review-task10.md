# L6 Task 10 review — cursor readout on settle

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`, commit under review `b82cd4a8beaf6a5fce00dec2e6b5d246e4e07cbb`.
Working tree was clean at review time (no unrelated uncommitted changes present).

Files touched (per `git show --stat`): `CHANGELOG.md`,
`app/src/routes/pages/Notebook/components/ChartCell.tsx`,
`app/src/routes/pages/Notebook/components/CursorReadout.tsx`,
`app/src/routes/pages/Notebook/model/cursor.ts`,
`app/src/routes/pages/Notebook/model/cursor.test.ts`. All within
`Notebook/**` + `CHANGELOG.md` — no ownership violation. No touch to
`package.json`/lockfiles — no new dependency.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage.reporter=json-summary src/routes/pages/Notebook/model/cursor
```
`tsc` was silent (no errors). Vitest:
```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
Matches the implementer's reported "5 passed, 0 failed" and the brief's
expected count exactly. No `coverage/` directory was produced (no coverage
provider installed in this worktree — `--coverage.reporter` was a no-op, not
a failure); nothing to delete. Coverage was instead checked by inspection
against the brief's Step-1 test list (see Checks performed).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `ChartCell.tsx:334-343` (`handlePointerLeave`) | The dispatch's own check item — "the pointer-leave clears the readout" — is not met. `handlePointerLeave` sets `lastPointerXRef.current = null` (correctly gating the *next* settle's fetch) but never calls `setReadoutRows(null)`. Since `settleRef.current.notify()` is only invoked from the drag branch of `handlePointerMove` (line 312) and from `handleWheel` (line 352) — never from a plain hover move or from pointer-leave — a readout populated by an earlier pan/zoom settle stays on screen, showing values for a cursor position that no longer exists, indefinitely after the pointer leaves the chart, until the user starts another pan/zoom gesture. Concretely: pan to settle (readout shows values at the settled pixel), move the mouse without dragging, then move it off the chart — the panel still displays the stale row set. | Call `setReadoutRows(null)` directly in `handlePointerLeave` (mirroring the `setHover(null)` call two lines above it), in addition to clearing `lastPointerXRef`. |
| Minor | `ChartCell.tsx:281-285` (cursor-fetch `.catch`) | `cursorReadout`'s `invalid_argument` (an unknown requested channel, C3 §3.7) is swallowed identically to every other error, with a `// TODO(idl0):` noting the panel keeps its last rows. The dispatch flagged this as worth checking; it is not a new pattern this task introduces — it explicitly mirrors the already-reviewed/landed Task 8 tile-fetch swallow one block above (line 247-251), same TODO style, same rationale. Neither this task's brief nor the standing brief mandates distinguishing `invalid_argument` from a transient fetch failure at the effect layer, so this is a pre-existing-pattern gap the task matches rather than introduces (mitigating), not a defect unique to this commit. | If the lead wants `invalid_argument` distinguished from a swallowed transient error, that's a cross-cutting change affecting Task 8's/Task 9's swallow sites too, not a Task-10-only fix. |
| Minor | `cursor.ts:87` (`formatReadout`'s `labels[channel] ?? channel` fallback) | The label-fallback branch (documented in the doc comment, and called out explicitly in the brief) has no dedicated test in the 5-test list — all three `formatReadout` tests supply a label for every channel present in `values`. This matches the brief's own Step-1 list exactly (5 tests, no more), so it is not an implementer deviation — the gap originates in the brief's test list, not this commit. | None needed against this commit; if a lead wants the fallback covered, it's a brief-list addition, not a rework. |

No Critical findings.

## Checks performed (all pass)

- `cursorRequestFor`'s pixel→time formula (`viewport.startUs + (pixelX / viewport.pixelWidth) * (viewport.endUs - viewport.startUs)`) matches Task 8's `zoomAt`'s own `anchorUs = viewport.startUs + pixelX * usPerPixel` convention exactly (verified against `viewport.ts`); returns `null` for `pixelX < 0` or `pixelX > viewport.pixelWidth`, confirmed by both boundary tests (`-1` and `801` against `pixelWidth: 800`).
- The readout fetch fires only from the settle path: traced `handlePointerMove` end-to-end — it writes only `lastPointerXRef.current` and (in the hover branch) `setHover`; it never calls `settleRef.current.notify()` except inside the drag branch, and never calls `fetchCursorReadout`/`cursorReadout`/`invoke` directly. Confirmed via `git show b82cd4a | grep -n "invoke("` (only match is inside a doc comment listing forbidden call sites, not a real call) and `grep -nE "onPointerMove|onWheel|onTouchMove|requestAnimationFrame"` (only the same doc-comment mention).
- The stale-settle guard (`isStaleSettleResult`, Task 8) is applied to the cursor fetch too (`ChartCell.tsx:276`), using the same `seqAtDispatch` captured once at the top of `onSettleRef.current` and shared with the tile fetch — a slow cursor-readout response for a superseded settle is dropped rather than overwriting a newer one.
- `null` values render as the literal text `"no data"` in `CursorReadout.tsx` (`` `${row.label}: ${row.value === null ? "no data" : row.value}` ``) — never `0`/blank, matching R31 and the "Do not" list.
- A channel absent from `readout.values` is omitted from `formatReadout`'s output (it iterates `Object.keys(readout.values)`, never the caller's requested channel list) — confirmed by the third `formatReadout` test (`rear-shock` requested via `labels` but absent from `readout.values`, and absent from the result).
- The implementer's judgment calls, per the brief's own invitation to make them: no separate pure gate beyond `cursorRequestFor`'s null-outside-plot check (the only other gating condition, "no last-known pointer position," is a plain `=== null` check on local ref state, not decision logic worth a tested pure function) — reasonable, and matches the brief's own framing of the trade-off; single-channel request `[channelId]` — correct for a cell that plots exactly one channel; optional `channelLabel` prop with documented fallback to the raw channel id — reasonable and documented.
- Purity: `model/cursor.ts` imports nothing from `react`, `@tauri-apps/api`, or any DOM global — confirmed by inspection and by `git show b82cd4a | grep -nE "import (react|@tauri-apps|document|window)" -i` (no hits in `cursor.ts`). `CursorReadout.tsx` is a component (not `plotForm/`/`model/`), so the purity rule doesn't apply to it; it correctly imports only `ReadoutRow`'s type and React.
- `ChartCell`'s new props (`fetchCursorReadout`, `channelLabel`) are documented with units/behaviour; `ChartCell` still has no caller anywhere in the tree (`grep -rln "<ChartCell"` returns nothing) — Task 13's wiring claim in the brief holds.
- Doc comments carry units: `pixelX`/CSS px, `tUs`/`startUs`/`endUs` in µs, all present on exported symbols in `cursor.ts`, `cursor.test.ts`'s helper types imported correctly, `ChartCellProps`'s new fields.
- Tests: A/A/A with blank lines between sections in all 5 tests; names match the brief's Step-1 list verbatim; `cursor.test.ts` is beside `cursor.ts` as `*.test.ts`.
- Hygiene: single-line commit message, no AI attribution trailer; explicit paths in the commit (matches the brief's `git add` list); nothing under `docs/` touched; no `cargo` invocation anywhere; CHANGELOG bullet matches the brief's Step 4 text verbatim.

## Verdict rationale

The pixel→time math, R31 null-handling, omission-vs-null distinction, stale-settle
guard reuse, purity, hygiene, and gate all check out correctly and match the
brief's rulings. The one real defect is that `handlePointerLeave` doesn't clear
the visible readout panel itself — it only prevents a *future* settle from
re-fetching, but since settle in this lane only fires on a pan/zoom gesture (never
on a plain hover-then-leave), a stale readout for a cursor position that no
longer exists can persist on screen indefinitely with no further gesture. This
is a small, mechanical fix (one `setReadoutRows(null)` call). The two Minor
items are pre-existing-pattern matches (the swallow-and-TODO style already
landed in Task 8) or a gap in the brief's own test list, not implementer
deviations, and don't block a fix-up dispatch.

VERDICT: NEEDS_FIXES
