# Review: chart-port-b (R217, tier B — map / lap table / lap progression / spectrogram)

**Commits reviewed.** App worktree `main...HEAD` (5 commits: 1c2b189 contract,
3a4548a ipc mirrors, 03c1f17 plotForm grammar, 35fd0af picker/defaults,
759a475 merge, a3323d0 CHANGELOG). Rust worktree commit `d31c086`.

**Files touched.** App: `app/src/ipc/gps.ts`, `app/src/ipc/rasters.ts`,
`plotForm/{types,parse,generate,gpsKey}.ts` + `plotForm/chartTierB.test.ts`,
`graph/{chartTypeCatalog,chartTypeIcons,graphToChart}.ts`,
`model/{graphEdits,propertiesForm}.ts`, `components/PropertiesForm.tsx`,
`model/report/document.ts`, C2/C3 spec docs, `CHANGELOG.md`.
Rust: `core/src/gps_projection.rs`, `core/src/gps_wire.rs`,
`core/src/table/{model,eval}.rs`, `core/src/workbook/v3/{table_cell,host_channel_wire}.rs`,
`tauri/src/commands/{gps,rasters,workbook}.rs`, `cli/src/table_cmd.rs`.

**Test command.** Not run — read-only static review per dispatch (owner
already reported Rust 1484 passed, idl-rs-tauri 434 passed, tsc clean, 2419
vitest passed, vite build clean). Claims verified by reading the referenced
test bodies and call sites, not by re-running the gate.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `idl-rs-worktrees/chart-port-b/core/src/table/eval.rs:206-260` (and `model.rs:56-92`, `tauri/src/commands/workbook.rs`) | `TableModel.rowSource: "windowLaps"` is only a schema field that round-trips (parse/serialize tests only) — no code anywhere derives "one row per lap of each selected window" the way C2 §4 and the R217.2 ruling describe. `evaluate_table`/`evaluate_table_multi` unconditionally iterate `table.rows` (the authored set `windowLaps` is supposed to ignore), and neither `cli/src/table_cmd.rs` nor any `tauri/src/commands/*` consumes `row_source`. `mainRowId`/`"fastest"` is likewise stored but never resolved into `MathLapContext::baseline_row`, and the §3.5 validation rule ("`fastest` under `rowSource: authored` is an error") is not implemented. | Either implement row derivation (and the `mainRowId` → `baseline_row` wiring, and the validation rule) before merge, or strike the "is the live behaviour" / CHANGELOG claim and mark it a follow-up like the host-var binding gap already is. |
| Critical | `app/src/routes/pages/Notebook-worktrees/chart-port-b/CHANGELOG.md:75` and C2 §4/§6 text (`docs/.../2026-09-03-idl1-c2-workbook-v3.md:2678`) | CHANGELOG says "a table cell can take its rows from the selected windows' laps," and C2 §6 explicitly asserts `rowSource: "windowLaps"` "**is** the live behaviour" — both false per the engine gap above. This is a shipped-behaviour claim, not a documented open question (unlike the host-var-binding and no-table-UI gaps, which the dispatch already flags as known). | Same fix as above — correct the claim or land the derivation. |
| Important | `app/src/routes/pages/Notebook/model/graphEdits.ts:184-186` | Confirmed dead/duplicated branch: the explicit `if (props.chart === "spectrogram")` arm in `renameChannelInProps` does exactly what the unconditional fallthrough at line 187 already does (both `return { ...props, mark: { ...props.mark, channel: newName } }`), reached only after the guard at line 180 already ensures `props.mark.channel === oldName`. Harmless but dead. | Delete lines 184-186 (the `fft` arm at 181-183 has the same redundancy against the fallthrough, worth the same trim). |
| Minor | `idl-rs-worktrees/chart-port-b/cli/src/table_cmd.rs:474-475` | New `row_source`/`main_row_id` lines in the test helper are indented to 28/16 spaces respectively — inconsistent with the surrounding 16-space block (not a wholesale reformat, but a locally malformed indent CLAUDE.md's hand-matching rule would flag on inspection). | Fix indentation to match the struct literal's existing 16-space fields. |
| Minor | `app/src/routes/pages/Notebook/plotForm/gpsKey.ts:24-26` | Doc comment states `gpsKey`/`rasterKey` are "computed identically on the host side (`model/jsCellBinding.ts`) and the sandbox side (`sandbox/main.ts`)" as present-tense fact; neither file is touched by this lane (the dispatch's own known-gap note), so today nothing calls this from either side. | Reword to future/intended tense, or note it's unwired pending the host-var binding lane, matching how the draft's own open question 1 is phrased. |
| Minor | `idl-rs-worktrees/chart-port-b/tauri/src/commands/workbook.rs:728-733,811-816` | `encode_host_channel_idlh` is always called with `AxisKind::Time` — honestly commented as a placeholder until C2 §3.6's shape system exists, but worth flagging since it means `axis_kind` never actually reaches `Lap`/`Frequency` from any live caller yet; IDLH v2 is wire-ready but not yet exercised end-to-end. | No action needed if this is accepted as a stated follow-up (it is documented in the code); confirm the lead is aware IDLH v2's new field is currently decorative. |

**Verified clean (no finding).** `IDLG` v1 header/byte layout: Rust encoder
(`core/src/gps_wire.rs`, `HEADER_LEN=16`, x/y/t/[c] blocks) matches the C3 §3.5
contract text byte-for-byte and matches the TS decoder (`app/src/ipc/gps.ts`)
field-for-field, including the `has_c`-gated fourth block and NaN-preserving
colour resampling. `IDLH` v2 (`axis_kind` in bytes 16-17, 6 reserved bytes,
header still 24 bytes, every v1 payload offset unchanged) matches contract and
tests. `fetch_raster_v2`/`fetch_raster_meta_v2` clamp width/height to
2048×1024 (never refuse) exactly as C2 §5.3/C3 §3.6 rule, with a window
resolved via `resolve_window` before any sample read (R85/R123 ordering).
`RowContext.lapIndex` → `lapNumber` migration is correct: 1-based, `#[serde(alias
= "lapIndex")]` accepts the old key, `lap_windows` now matches by lap number
(not index) with a test proving the base-1 fix (`lap(0,…)`→lap number 1 is
the *first* lap, was silently the second). `chartTypeCatalog.ts`/`parse.ts`'s
`detectChartKind` lookahead correctly discriminates `gps`/`trackGeometry`
(map), bare-identifier-then-comma (lap), and `spectrogram` callees using the
same fixed-offset heuristic the pre-existing kinds already use — not a new
smell. Grammar round-trip tests in `chartTierB.test.ts` cover the required
literals (`aspectRatio: 1`, `fx: "w"`), the `gps(null)` vs `gps("x")`
distinction, and the underlay-mark ordering, and are named/AAA-shaped
consistently with the rest of the lane.

**Verdict rationale.** The wire formats, grammar, migration renames and
round-trips for all three chart-cell kinds are careful and match the contract
byte-for-byte and production-for-production — this is solid work. But the
lapTable half of the ruling (R217 item 2) is asserted as landed, complete
behaviour in both the CHANGELOG and the C2 contract text ("is the live
behaviour"), when in fact only the JSON schema round-trips; no engine or
tauri code derives `windowLaps` rows, resolves `mainRowId: "fastest"`, or
enforces the stated validation rule. That is a spec/code disagreement the
brief's own "no more, no less" and "silent deviations are findings even when
the code is good" rules squarely cover, and it is materially different from
the already-flagged, honestly-caveated host-var-binding and no-table-UI gaps.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\chart-port-b\runs\2026-09-11\REVIEW-chart-port-b.md
COUNTS: critical=2 important=1 minor=3
NOTES: lapTable's rowSource:"windowLaps" row derivation, mainRowId resolution and validation rule are claimed as landed/live in CHANGELOG and C2 §6 but are not implemented anywhere in core/tauri/cli — everything else (GPS wire, IDLH v2, raster clamping, lapNumber migration, grammar round-trips) checks out clean.
