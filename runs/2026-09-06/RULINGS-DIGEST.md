# idl1 rulings digest — every ruling still in force (2026-09-06)

Read this instead of `runs/2026-09-03/decisions.md`. Each line ends with the
R-number(s) to open in the ledger. Superseded rulings appear only in their
superseding form.

## Process rules

- One cargo process on the machine at a time, across all worktrees, implementer or reviewer. (CLAUDE.md §8, R13)
- Machine-wide `jobs = 4` in `~/.cargo/config.toml`; never override with `-j`. (R13, R13-addendum)
- Gate steps run in the **foreground**; capture with `tee`, never rerun to re-capture. (L2 gate note, L2 LANDED)
- A task's test gate is the filter the dispatch names and must report a non-zero `passed` count. (CLAUDE.md §8, R13)
- `cargo test` filters are substrings of the full test path; `idl-rs-tauri` nests under `commands::<module>::tests::`, so name the module or the test-fn prefix. (L8w gate 1)
- Full suite `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` every four tasks and at the lane gate; never `--workspace`. (CLAUDE.md §8, R13)
- `cargo check -p idl-rs-cli --tests` on any `pub` change in core; `cargo check -p idl-rs-tauri` when a command signature moves. (CLAUDE.md §8, R68, R75)
- Never `cargo fmt`, `cargo tarpaulin`, `cargo doc` inside a task; readers never build. (CLAUDE.md §7/§8)
- No cargo in a UI worktree; UI gate is `npx tsc --noEmit && npx vitest run <filter>`. (operating brief §4)
- **Never amend a reported commit** — once a hash is reported, fixes are follow-up commits. (L7a LANDED, operating brief §4)
- **One writer per worktree**: never dispatch into a worktree with an outstanding dispatch; a fix counts as outstanding. (process near-miss 2026-09-03, R13)
- A reviewer verifying "does it fail without the fix" uses a disposable copy, never a live revert/reset in the lane's worktree. (R11.2)
- **IPC-effects rule**: the decision logic of any effect that starts IPC or `postMessage` work lives in a pure, unit-tested module with an injected async function; the effect only calls it. (IPC-effects process rule 2026-09-05)
- Tightening: effects key their dependency array on **data only** (callbacks in refs), never cancel in-flight work in cleanup, and decide staleness with a monotonic sequence guard. (operating brief §4 tightening)
- A function prop in a dependency array beside a cancelling cleanup is graded **Critical on sight**. (operating brief §4 tightening)
- `CHANGELOG.md` conflicts of independent bullets under one heading: keep both (main's first), note "CHANGELOG: kept both bullets"; any other conflict is STOP and report. (R19 pattern, operating brief §4)
- **NUL-byte check** every file touched: `grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'` must print `0` per file before commit. (L7a/L6 brief step, standing)
- **Amendment-ancestry check**: a brief citing an amendment names its commit hash; the implementer's first step is `git merge-base --is-ancestor <hash> HEAD`, merging main first if it fails. (L6 Task 20 process note)
- **Report cap**: implementer and reviewer reports fill the brief's template and stop — target 15 lines, hard cap 30; detail goes in the findings/commit. Briefs point at files and sections, they do not restate contract text or code. (operating brief §7.2, §7.5)
- Docs-only commits get a lead spot-check; every code commit gets a review. (operating brief §7.4)
- No new dispatch in the last 30 minutes before a known session reset. (operating brief §7.3)
- Every lane owns its own worktree, created with `git worktree add` plus `git submodule update --init -- rust`; the shared checkout stays on `main`. (R9, R10)
- The "remote error: upload-pack: not our ref" message during submodule init is expected with unpushed local branches, not a blocker. (R11.1)
- Ambiguity policy: stop and ask rather than infer; a stop on a real gap is correct behaviour. (CLAUDE.md §1, R54, R58, R65)

## Contracts

- **C1** `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` — session/channel schema; `Channel` carries `t_recorded_us: Option<Vec<i64>>` and `unit: String`; `session.json` gates are decimal degrees. (R5/R7, R8)
- **C2** `…-c2-workbook-v3.md` — workbook v3 grammar; `channel()` yields `{t, v}` records materialised in the sandbox. (R52 Q2)
- **C3** `…-c3-ipc-surface.md` — the IPC surface; the §2 error-kind table is authoritative over any §3.x entry that disagrees. (R57)
- **C4** `…-c4-data-directory.md` — `<data>` layout; `profiles/<id>.idl0p` is synced last-write-wins by `updated_at_ms`. (R6, R8)
- C3 is frozen for UI lanes; a needed command goes in the lane plan's "IPC needs" and builds against a typed stub throwing `not_implemented`. (operating brief §3)
- **R59** — 17 new commands + a §3.10 App group; `save_session_metadata` is last-write-wins with no `conflict` kind (Q1); quarantine deferred to wave 3 (Q2); new binary headers pad to natural alignment, `IDLH` 24 bytes / `IDLF` 16 bytes, `IDLT` unchanged and decoders copy rather than view in place (Q3); new kind `device_rejected` with `detail { ack: "busy" | "precondition" | "write_not_permitted" | "not_implemented" }` (Q4); `set_data_dir` is the sole writer of `data_dir` and `set_settings` ignores it (Q5); `device_status` mirrors `idl_transport::ble_status::DeviceStatus` field for field (Q6).
- **R60** — `import_file` resolves `ImportOutcome { session: SessionSummary, warnings: string[] }`; new §2 kind `import_collision`. (R60.1, R60.2)
- **R67** — `WorkbookEvent` gains `hash: string` (sha256 of the file's bytes after the change) so the UI suppresses its own saves; Rust-side `ExpectedHashSet` already suppresses, so this is defence in depth. (R67 + addendum)
- **R70** — prose crosses the wire as `prose_before_html: string | null`, `prose_after_html: string | null` and `prose_spans: { id, expr }[]` in document order; core's `find_inline_exprs` is the only span scanner; raw HTML in prose is escaped. (R70)
- **R79** — C2 §5.3 gains an FFT chart production: `windowSize`/`hopSize` accept `"all"`, hop is in samples, no bin-count grammar token (host-side cap with a note), y-label seeds "Magnitude (unit)" / "PSD (unit²/Hz)", one spectrum per cell in wave 2. (R79)
- `list_math_builtins` ships `{ name, arity: number[], status: "implemented" | "not_implemented" }`; `unit_rule` is dropped until C2 states unit propagation. (R64.2)
- `eval_workbook` takes `lap_context: { main_lap, overlay_laps[] } | null`; overlay laps are laps of the **same** session in wave 2. (R52 Q5, R64.1)

## Rust / L8w

- `device_rejected` ships as specified but is unreachable on the desktop BLE backend; map it only where an `AckCode` is really surfaced, never by parsing error text. (R63.1)
- `pull_config`'s `config` kind is likewise unreachable: btleplug's Windows `write` returns `Result<()>` and never yields the 0x81 ack. **Task 7b is withdrawn** — documented, not built, until a stack with ack readback (L9 mobile). (R71 + 2026-09-06 correction)
- `preview_channel_registry` covers the SPEC-fixed subset only (IMU, wheel, pressure, HR); configured analog/digital channels have no fixed wire id. (R63.2)
- Pressure channels 20/21 emit no preview row until SPEC §8 states their scale/offset source. (R64.5)
- `fetch_fft`: core `Averaging` gains `None` and `Max`; C3's union is `"none" | "mean" | "median" | "max"`. (R63.3)
- `averaging: "none"` requires exactly one segment — more is `invalid_argument` with `detail: { segments: n }`; a non-finite/non-positive rate or a channel under two samples is `invalid_argument` before any FFT runs; rate derivation `1e6 / median(Δt_us)` lives in core. (R76)
- Catalog SQL stays in `core::store::catalog`; `idl-rs-tauri` does not depend on `rusqlite`. (R68)
- Front matter is serialised by `workbook::v3::front_matter::render_front_matter`; no `format!`-built YAML anywhere in tauri. (R75)
- `overlay_laps`' first entry is the overlay window until lap indexing lands; `session_id: null` with a `lap_context` ignores it silently. (R73)
- C3 §3.4's "name sanitises to empty ⇒ `invalid_argument`" branch is unreachable with the shared sanitiser; kept as documented defence. (L8w gate 3)
- The `list_math_builtins` catalog is proven one-directionally (⊆ the real dispatch); the converse would need the duplicate name list R64.2 forbids. (L8w gate 4)

## Notebook / L6

- Properties + Code editor as designed (D13); the React Flow graph view is wave 3 and re-homes the same Properties form component. (operating brief, R52)
- Eight npm packages pinned by a lead shell task, `htl` at `1.0.0` added to the M0 pins table. (R52 Q1, R53 shell task)
- Editor cell segmentation is a narrow, non-authoritative TS fence scan; Rust remains the only evaluator. (R52 Q3)
- `read_workbook(id) → { markdown, hash, path }`; reading the file through a Tauri fs plugin is rejected (it bypasses `<data>` resolution). (R52 Q4)
- L6 designed the host-channel byte layout and filed it as a C3 §3.4 amendment. (R52 Q6)
- FFT chart is in wave 2; the 1-D histogram is wave 3. (R52 Q7)
- GPS trace draws on plain axes; no basemap, no tile server. (R52 Q8)
- L6 Task 5 was authorised, that task only, to add the sandbox entry to `app/vite.config.ts`. (R56)
- Cursor readout has its own settle instance keyed to pointer position (default 150 ms, named constant) with its own stale sequence; the viewport settle also refreshes it. (R62)
- Axis labels are suggested as `"<label> (<unit>)"` from C1's per-channel `unit`; no quantity→unit table in TS, and unit conversion is a wave-3 engine concern. (R65)
- js cells that `plotForm.parse` bind their channels and mount `ChartCell`; custom-code cells keep the plain mount. (R66.1)
- Inline-span errors use a distinct `spanError { spanId, message }` message, never an overloaded `cellId`. (R66.2, R78 Task 17 Q2)
- Cell outputs (js results, Plot SVG, Inspector values, span values) render **inside the sandbox iframe**; `cellResult.html` is removed and the host receives `cellRendered { cellId, heightPx }`. (R69.1)
- The host keeps gestures, tile cache, settle-bound fetch, cursor readout and the Properties/Code panes; during a gesture it posts `transform { cellId, translateXPx, scaleX }` per frame. (R69.2)
- `ChartCell` is the host-side frame around the iframe-rendered output. (R69.3)
- **Prose is the exception**: `prose_before_html`/`prose_after_html` come from core, are trusted, and the host renders them (the one permitted `dangerouslySetInnerHTML`); span values arrive from the sandbox and are inserted by `textContent` only. (R78 Task 17 Q1, revising R77.2)
- A span error shows in place as text in its span; no banner. (R78 Task 17 Q3)
- The bound-channel registry holds **every** channel of a js cell — `setBoundChannels(cellId, BoundChannel[])`, iterated on settle refetch and rebuild replay. (R72)
- Definition channels re-fetch on rebuild (SPEC §26.4 amended); a definition-only cell mounts `JsCellFrame`, a mixed cell keeps `ChartCell`; `has_t: false` is not bound. (R78 Task 18)
- `CellList` takes an optional `frame?: (cell, output) => ReactNode` wrapper so every cell kind is selectable. (R74)
- FFT: `x` is required in the FFT arm with a required `type`; bin cap 16384 checked before fetch and after decode; `spectrumKey` lives in a dependency-free module under `plotForm/` and nothing under `sandbox/` imports from `ipc/`; the host retains and re-pushes the decoded spectrum on rebuild; the first mark's channel survives a Time → FFT switch. (R80)
- Notebook empty state: rebuild the catalog once per page open only when `list_workbooks` is empty; picker only above one workbook and disabled while edits are dirty; Rescan reports `workbooks_indexed` and `duration_ms`; Notebook UI prefs live in a local `idl1.notebook.ui.v1` key. (R81)
- The Notebook never writes `selection`; the "no session selected — choose one in the Data tab" note stays. (R81 Q3)

## Data / Device / Settings (L7)

- **Data** — has-GPS/has-gates facets are wave 3 (C4 §5 + C3 §3.2 amendment). (R53 Data Q2)
- **Data** — `AppState.selection` is `{ sessionId: string | null, lapContext: { mainLap: number, overlayLaps: number[] } | null }`; L7a writes it, L6 reads it. (R53 Data Q3)
- **Data** — lap counts and lap tables render "—"/empty honestly; no wave-1 import path populates the catalog's lap tables. (R53 Data Q4)
- **Data** — sector count only in wave 2; `LapDetail.sectors` is pinned when lap indexing lands. (R53 Data Q5)
- **Data** — the Track facet is dropped entirely for wave 2, not shown disabled. (R54)
- **Data** — the pasted-path field stays an import path; the native dialog is a Browse button beside it. (R55, R77.1)
- **Device** — no wire arithmetic in TypeScript; wave 2 previews enable state, rate and unit only, via `previewSources()`. (R53 Device Q1, R55)
- **Device** — any positive integer for `analog.sample_rate_hz`; the SPEC §8 gap is restated, not guessed. (R53 Device Q2)
- **Device** — connection state is "last attempt succeeded"; six forms plus the add-channel picker is the correct count. (R53 Device Q4/Q5)
- **Device** — `adc_pin`/`gpio_pin` are `number | null` (`null` = unassigned, key omitted on serialise); an unassigned pin is a validator **error** so `isPushable` is false; no pin range is invented and the UI never auto-selects a pin. (R58, R55)
- **Device** — IMU form defaults 833 Hz / 32 g / 2000 dps are the form's initial state from SPEC §8's worked example, not a firmware claim. (IMU-defaults tracked note)
- **Device** — both IMU mode flags set emits a warning, not an error; `isPushable` unaffected. (IMU mode-flags tracked note)
- **Device** — `device_status` polls at 1 Hz on mount plus a `visibilitychange` pause; after 3 consecutive poll failures show "link lost?" and keep polling; profiles save explicitly with a dirty marker. (R77.4, R78 L7b Task 10)
- **Settings** — sync status and pairing live in Settings; L11 may add a sync action to Data. (R53 Settings Q3)
- **Settings** — `settings.json` wins over `localStorage`; only fields still at engine default are imported; `ui` keys stay in `localStorage`; migration and `set()` failures surface in a `role="status"` line. (R78 L7c Task 8)
- **Settings** — data-directory changes take effect on restart; the BOM strip lives in `paths::resolve_data_dir`. (R53 Settings Q4)
- Settings migration: `settings.json` wins; a field skipped because the file already held a different value is NAMED in the migration `role="status"` line (never silent) — L7c Task 9. R82

## Rust / L2b (landed 2026-09-06, idl-rs 81a7db3)
- `index_session` inserts its own `blobs` row in the same transaction (FK `sessions.blob_sha256`). R84
- `fetch_fft` with a lap: slice first, then the R76 guards on the window's own samples; no new kind. R85
- Multi-overlay math: `overlay: Vec<MathOverlay>`, `variance_*` fold = elementwise NaN-aware mean (fresh decision; idl0 had one overlay). R73 closed
- L2b lap indexing: laps are a stamped cache in `session.json` (`lap_detector_version` added to C1 §6, additive); unresolvable lap flags cleared on renumber; deterministic `visit_id`; re-index only on a stale stamp; R73 shape `overlay: Vec<MathOverlay>`; `fetch_fft` lap via `resolve_lap_window`; `rescan_tracks` in-lane. Plan `runs/2026-09-06/lanes/l2b-laps/`. R83

## Rust / L8x (landed 2026-09-06, idl-rs 52efba8)
- Track writes: one `save_track` (nullable `track_id`), `delete_track`; both return `stale_session_ids` (user triggers `rescan_tracks`); duplicate sector/NZ names allowed; decimal degrees on the wire; no track-editor map UI (R54). R86
- Quarantine: producer is `verify_data_dir(repair:true)` (C4 §7), never import; `resolve_quarantine` actions `restore|discard`; `verify_data_dir` lives in the App group. R86
- Catalog indexes workbooks: rebuild step 6 walks `workbooks/*.idl1wb`; `create_workbook`/`save_workbook` upsert their row. R87

## Sync / L11 (in flight)
- Sync lives in `idl-transport/sync/`; transport depends on core one-directionally; no new crates beyond `axum` (pinned) + `idl-rs` path dep; plain HTTP + per-peer bearer tokens, LAN-only posture. R88
- `data.parquet` version pair orders: importer SemVer, then seam `v<N>`; unparsable ⇒ incomparable, no transfer + warning. R89
- Manifest names blobs by their CAS path (no rehash); locally malformed files are a local-only skipped list and are do-not-touch in `plan_sync`. R90
- `session.json` per-field merge: zero-value = not set; both changed differently ⇒ newer `updated_at_ms`, tie keeps local. `render_workbook` is core's only renderer. R91
- **Ids: one validator in `core::store::sync::ids`**, allow-list per class + post-join containment check; rejects `C:foo` and friends. Bodies capped. R100

## Open items

- Isaac questions 1–5: IMU defaults; IMU mode-flag exclusivity; valid pin sets; whether the firmware can report SD free bytes / GPS fix quality / satellite count / battery millivolts; whether generic channel ids are deterministic from config order. (tracked notes, R58, R59 Q6, R63.2; sub-item 5b pressure 20/21 per R64.5)
- Isaac question 6: a user-configured basemap tile URL as an explicit off-by-default exception to "no CDN, ever". (R52 Q8)
- Isaac question 7: whether lap indexing should move up ahead of the Rust backlog. (R53 Data Q4)
- Isaac questions 8–9: a real FIT/GPX archive for the speed/heading direct path; which sample rate the firmware intends for `IMU2_AccelX`. (R23 Q4/R60, L5 landing)
- Isaac question 10 is disk headroom for Tauri builds; question 11 is closed (build caches removed, 16.9 GB freed). (2026-09-06 disk entries)
- **L10 cosmetic pass**: L6 Task 20's two Minors; SPEC `§26.x` cross-reference cleanup; `JsCellFrame` `minHeight` when a note or error is present. (L6 follow-on LANDED, L6 Task 21 LANDED)
- **Rust backlog**: lap indexing at import; incremental `catalog::insert_session` in place of a full rebuild per import; the cross-session overlay amendment (`overlay: { session_id, lap }[]`). Quarantine commands landed 2026-09-06 (L8x, R86) and are no longer on this list. (R51 Q4, R64.1, R59 Q2, R73)
- MathOverlay multi-lap shape is decided in the same amendment that ships lap indexing. (R73)
- Not yet observed by the lead: 60 fps pan/zoom and end-to-end chart rendering on a real session. (L6 follow-on LANDED)

*Contained decision: the digest omits wave-1 execution-fix rulings (R9–R12, R14–R18, R20–R50) whose subject matter has landed and is now recorded in code, tests and the contracts themselves; the process rules they produced are carried above.*
- **R109** — Editor reaches the studio properties column by `createPortal` into a slot node published through a shell context; state stays in the Notebook page; external hosting is decided by slot presence, never by measured width.
- **R110** — n-D math values are a C2 language extension; the SPEC section lands before any graph UI (spectrogram to peak-frequency is the worked example).
- **R111** — `Selection` becomes an ordered list of sessions with per-session lap context and colour; one representation, no single-session special case; C1/C3 change, done before the lanes that read it.
- **R112** — Calibration lives in the bike profile and binds to a session through the header's existing `config_crc32`; no firmware change, no second source of truth.
- **R113** — Device must report `LoggingElapsed: N` (seconds, monotonic, only while RUNNING) in the §7.3 status payload; firmware work, app degrades to dimmed client-side timing meanwhile.
- **R114** — Wave 3 runs W3.1 foundations, W3.2 maths graph + time/cursors, W3.3 errors + device, W3.4 bike sheet + PDF report (`runs/2026-09-07/WAVE3-PLAN.md`).
