# Review: chart-port-a (R215)

**Rust repo** `idl-rs-worktrees/chart-port-a` @ `75a6ae5` (branch commits:
`4e5e268` histogram, `6d9ccb1` scatter, plus a `main` merge). Files touched:
`core/src/histogram.rs`, `core/src/lib.rs`, `core/src/scatter_wire.rs`,
`tauri/src/commands/histogram.rs`, `tauri/src/commands/mod.rs`,
`tauri/src/commands/scatter.rs`, `tauri/src/lib.rs`.

**App repo** `idl1-app-worktrees/chart-port-a` @ `7b087bd` (branch commits:
`dcf759a` FFT catalog, `c3e587d` histogram, `30c39d5` scatter, `bec6164`
lap-relative axis + variance preset, `eead99b` zero line + signed scales,
`26c7fa5` report follow-up, plus a `main` merge). 51 files touched across
`app/src/ipc/`, `Notebook/graph/`, `Notebook/model/`, `Notebook/plotForm/`,
`Notebook/host/`, `Notebook/components/PropertiesForm.tsx`,
`Notebook/index.tsx`, `Notebook/sandbox/main.ts`, and the two spec files
(`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
`...-c3-ipc-surface.md`).

**Test command run:** `npx vitest run` over the lane's new/changed test
files (`ipc/scatter.test.ts`, `ipc/histogram.test.ts`,
`plotForm/scatter.test.ts`, `plotForm/histogram.test.ts`,
`plotForm/lapRelativeX.test.ts`, `plotForm/timeOptions.test.ts`,
`model/variancePreset.test.ts`, `model/yScaleChoices.test.ts`,
`model/report/renderChart.test.ts`), from `app/` in the app worktree.
**Result:** `Test Files 9 passed (9)`, `Tests 134 passed (134)`. Rust gates
(1399/64/429 passed) were not rerun (cargo slot held by the lane, per
instructions); the two new Rust modules and the `core/src/histogram.rs`
extraction were verified by static reading against their own inline tests
(41 `#[test]` functions across the four touched Rust files), byte offsets
recomputed by hand against `docs/superpowers/specs/.../idl3-c3-ipc-surface.md`'s
`IDLS` layout, and cross-checked against `app/src/ipc/scatter.ts`'s decoder.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/CHANGELOG.md`, `app/TASKS.md` (untouched) | Five items of shipped behaviour (FFT joins the picker, two new IPC commands, lap-relative axis, zero line/signed scales) land with no `CHANGELOG.md`/`TASKS.md` entry in the app repo, despite CLAUDE.md §6 ("Every task touching shipped behaviour updates `CHANGELOG.md` and/or `TASKS.md`"). The brief's Gates section lists "CHANGELOG lines" as part of the merge step, so this may still be pending rather than dropped — but as staged for review it is missing. | Add the CHANGELOG/TASKS lines before the lead merges to `main`; block the merge gate on it, not just the test gate. |
| Minor | `app/src/routes/pages/Notebook/plotForm/parse.ts` (`readYScale`/`parseYField`) | `exponent`/`type: "pow"` parsing is added to the one shared `YAxisProps` reader used by all four chart kinds (time/FFT/histogram/scatter), not scoped to the time cell the brief's item 5 describes. A hand-authored FFT/histogram/scatter cell with `y: { type: "pow", exponent: 2 }` now round-trips as non-custom code, which nothing in C2 §5.3 or the brief asked for. | Confirm with the lead whether `pow`/`exponent` on a non-time y-axis is intentionally in scope; if not, gate it in `readYScale`/`renderYAxis` on the caller's chart kind, or note the extension explicitly in the C2 §5.3 text (currently silent on this). |
| Minor | `core/src/scatter.rs` / `core/src/scatter_wire.rs` doc comments | `scatter_wire.rs`'s module doc claims parity with `fft_wire.rs`'s `IDLF`/`tile.rs`'s `IDLT` "same idiom", which is accurate, but the C3 §3.5 addition states "*Not in this revision:* … a colour-by-third-channel on the point cloud … neither is reachable from a v3 cell yet" — correct, and `scatter_points`'s `color_channel: Option<&str>` parameter is always called with `None` from `fetch_scatter_via`. Not a bug, just worth flagging that the unused parameter (and `ScatterPoints.colors`) is dead code on the IPC path today; no test exercises `Some(color)` from the command side. | No fix required — informational; a future colour-channel lane will need its own coverage of `fetch_scatter_via` with `Some`. |

## Notes on the areas asked to be checked hardest

- **`fetch_histogram`/`fetch_scatter` correctness.** Window resolution order
  in both commands matches `fetch_fft_v2_via`'s established pattern (channel
  existence validated — or column fetched — before `resolve_window`, then
  slicing). `bins_for_width` (`core/src/histogram.rs:97-124`) correctly
  floors at 1 and caps at `max_bins`; `data_range`'s extraction is a pure
  refactor with no behaviour change (verified: the pre/post logic is
  byte-identical, only lifted into a named function). Bin-edge closed-right
  handling (`idx >= bins → bins - 1`) is unchanged pre-existing code. The
  `IDLS` header layout in `scatter_wire.rs` (magic/version/reserved/
  point_count/reserved/4×f64 bounds/x-array/y-array) matches
  `app/src/ipc/scatter.ts`'s `decodeScatter` field-for-field, including the
  8-byte-alignment padding and the "shorter array wins" mismatch rule (both
  sides agree the header is the single source of truth for `point_count`).
  Decimation (`scatter_points`, pre-existing) uses `ceil(len/cap)` stride,
  correctly producing `≤ cap` points and preserving the pre-decimation
  extent as required by C3 §3.5's "bounds are the pre-decimation extent"
  rule — verified by the lane's own
  `fetch_scatter_via_bounds_are_the_pre_decimation_extent_not_the_thinned_cloud`
  test.
- **plotForm round-trip.** `generate.ts`'s `renderMarkOptions` emits
  `x: "t"` when `xField` is unset — byte-identical to the pre-lane
  generator — and `zeroLine` is only emitted when `=== true`, so a landed
  time cell with neither option generates unchanged bytes. `parse.ts`
  normalises a parsed `x: "t"` back to `xField` absent (not `"t"`) so
  `parse(generate(p))` stays deep-equal to `p`; `readZeroRule`/
  `readMarksArray` correctly treat `[Plot.ruleY([0])]` alone as legal (no
  data marks) and reset the cursor on a non-match. `detectChartKind`'s
  fixed-offset token lookahead (`marksIdx+3`/`+7`) was hand-traced against
  both the empty-array and zero-line-first cases and is correct.
- **Per-window fetch effects (`Notebook/index.tsx`).** The histogram and
  scatter effects (`index.tsx:2458-2600`, `2621-2762`) are structurally
  identical to the FFT effect they were copied from, with the one
  documented and correct adaptation: both append `|${wKey}` to
  `bindingIdentity(binding)` because a histogram/scatter host-var key
  carries no window dimension (unlike FFT's, which already does per
  R129/R134) — without it every window after the first would be
  misidentified as already-current and never fetched. Decision-61 pruning
  of deselected windows, `CellRunSequencer` cancellation via
  `histogramRunKey`/`scatterRunKey`, and cell-deletion cleanup
  (`index.tsx:2028-2058`, matching the FFT block above it) are all present
  for both new effects — no leak found on chart-type switch or cell
  deletion.
- **Layer calls.** `tr` (`host/protocol.ts`'s `combineChannelWindows`) is
  axis geometry derived from already-fetched samples, not synced or stored
  — defensible in the host per CLAUDE.md §2, and the doc comment states the
  reasoning explicitly. `equalAspectDomain` (`ipc/scatter.ts`) is likewise
  pure display-domain squaring over already-decoded bounds, not a number
  the sync model depends on — defensible. The histogram `values` array is
  computed in Rust (`tauri/src/commands/histogram.rs:193-197`), never
  derived from `counts`/`total` in TypeScript — correctly on the Rust side
  of CLAUDE.md §2's line, and the `NaN`-avoidance guard for `total == 0` is
  present and tested.
- **Doc comments / units / typed errors.** Every new public Rust symbol
  carries a doc comment with units stated in prose (`g`, `mm`, `s`, "the
  channel's own unit"); all four new Rust error paths return typed
  `IpcError`/`IpcErrorKind` with `detail` payloads, no `Err(String)`, no
  production-path `unwrap()` (all 41 `unwrap()`s in the diff are inside
  `#[cfg(test)]`). TypeScript test names follow `thing — condition — result`
  with Arrange/Act/Assert and blank lines throughout the sampled files
  (`variancePreset.test.ts`, `yScaleChoices.test.ts`, `scatter.test.ts`,
  `histogram.test.ts`).

## Verdict rationale

The Rust and TypeScript halves of this port are careful, consistent with
established idioms (`_via` split, `CellRunSequencer` keying, C3 window-
resolution order), and the wire format is byte-verified against its
decoder. The 134 targeted vitest cases pass. The one finding that should
block merge is procedural, not a code defect: no `CHANGELOG.md`/`TASKS.md`
entry yet for five items of shipped behaviour, which CLAUDE.md §6 requires
and the brief's own Gates section names as a merge-step deliverable — worth
flagging now so it isn't dropped at merge time. The `pow`/`exponent`
round-trip being available on non-time chart kinds is a minor, likely
harmless scope question for the lead rather than a bug.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-11\REVIEW-chart-port-a.md
COUNTS: critical=0 important=1 minor=2
