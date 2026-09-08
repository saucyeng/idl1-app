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
- **R117** — S1 selection: session-relative range origin; repeated sessionId legal; `_v2` commands with one deprecation revision; per-window eval (does NOT deliver cross-window maths/ghost delta — that is the R73 amendment); deleted-session windows dropped with a stated reason; colour is a `--chart-N` token; `fetch_host_channel` lap-context gap fixed in Task 5. `main_lap_window` indexing defect confirmed real.
- **R118** — n-D shapes: additive C3 error `detail`; `t`-alias kept through wave 3 and *migrated* (not just dropped) at the next version bump; `"t:lap"` unambiguous under per-window eval and `"t:win"` NOT specified (it is cross-window maths, R73 amendment); `fetch_raster(kind:"matrix")` deferred; iEKF components unnamed.
- **R119** — A `range` window that does not overlap its session is a typed `InvalidArgument` error, not a zero-width `(t,t)` tuple (inclusive slicing makes `(T,T)` select ONE sample, not zero); partial overlap still clamps. C1 §6.1's "empty window" sentence struck.
- **R120** — `range` windows with `t0_us >= t1_us` are `InvalidArgument` too (amends R119): C1 states the ordering as part of the type, and inclusive slicing turns an in-span `(T,T)` into a silent one-sample result. `session_span_us` in microseconds accepted.
- **R121** — `eval_workbook_v2` returns a per-window result (outputs or that window's error); window-attributable failures (bad session, unknown lap, R119/R120 range errors) fail only their entry, call-level failures (unknown/unparseable workbook) fail the call. C3 §3.4 amended; the lap-to-lap test must be able to tell the two windows apart.
- **R122** — A window must slice the `ChannelLookup` handed to evaluation (`SessionHandle::slice_by_time`), not just supply `MathLapContext` bounds: today bare channel refs evaluate over the whole session, so per-lap definitions silently return session-wide numbers. Slice, do not NaN-mask.
- **R123** (supersedes R122) — The window is the domain of **aggregation and display**, never of computation: definitions evaluate over the whole session (filters settle, integrators keep history), reductions (`max`/`mean`/`rms`/`variance_*`/single-spectrum `fft`) aggregate over the window, viewport is independent. Do NOT slice the `ChannelLookup`; extend window-awareness to every reduction.
- **R124** — All 11 scalar aggregates (`mean`/`max`/`min`/`rms`/`std`/`sum`/`count`/`first`/`last`/`median`/`p`) plus single-spectrum `fft` are window-scoped; do NOT ship a subset. Aggregate over an index subslice, never a NaN mask (NaN already means "gap", and masking allocates session-length per call). Rate-0 args unwindowed; `spectrogram` stays session-wide (retains a time axis, STFT is local).
- **R125** — Per-session evaluation cache deferred to a follow-up, keyed `(session_id, definition, workbook revision)` with **no window in the key** — valid precisely because R123 makes computation window-invariant. Trigger: the lap-time table, where per-lap columns cost O(N laps × session length).
- **R126** — Resolved windows are half-open `[t0, t1)`; `SpanDto::Session` must resolve to `[first_us, last_us + 1)` or a whole-session window silently drops the final sample (verified). Lap spans are gate crossings and already correct. R119 range clamping uses the same end.
- **R127** — Sandbox host vars stay keyed by definition name (never window-qualified); payload gains `w` (window index per sample) plus a `windows` descriptor carrying colour; a single window is byte-identical to today; **windows are separated by a NaN break** so pre-multi-window cells render n segments instead of one bogus joined line; `spectrumKey` gains the window index.
- **R128** — Half-open bounds require half-open overlap operators (`t1 <= start || t0 >= end`); and `window_index_range` must map any non-sentinel `start >= end` to an EMPTY range, never the whole channel — a range past the session end was returning the session-wide aggregate. Follow-up: replace the `(0.0,0.0)` gate-off sentinel with an `Option`.
- **R129** — (a) Amends R127 item 5: spectra carry the window dimension in the payload like channels (`{length,f,m,w}` + descriptor), `spectrumKey` gains NO window index, and C2 §5.3 needs no grammar change — the cell-side addressing gap disappears. (b) An interim shim may narrow scope, never widen it: `lapFromWindow` silently turned a `range` window into a whole-session FFT; a range span must fail visibly until Task 11 migrates the driver.
- **R130** — `resolve_window`'s `Lap` arm validates `start_time_secs < end_time_secs` (`InvalidArgument` otherwise), mirroring R120: an empty lap `(0.0,0.0)` from a corrupted `session.json` was indistinguishable from the "no window" sentinel and returned the whole channel. Detector cannot produce it; validation closes the trust boundary anyway. R128's `Option` follow-up still stands.
- **R131** — Per-window eval state mirrors the wire union (`Map<windowKey, {kind:"ok",outputs} | {kind:"error",error}>`); order stays in `AppState.selection` only; the reducer prunes deselected windows. The chart viewport is **window-relative** (offset from each window's own start, per decision 55), so overlaid laps align from their own starts; a shorter window renders absence past its end. `channelBindDriver` is Task 11b; until then >1 window raises a typed cell error rather than showing window 0.
- **R132** — With >1 window selected, non-chart cells (math, table, prose `${…}`, completions) may keep reading the primary window but MUST name which window they are showing, via `jsCellNote`'s existing `windowCount`; single-window output unchanged. Real multi-window layout for non-chart kinds deferred to the maths lane. FFT cell-shape check against the primary window only: filed follow-up (needs windows over different sessions).
- **R133** — An effect's dependency array and an inner identity/memo cache are two staleness gates **in series**: fixing the deps does not fix a cache that re-answers the same question. Channel-bind identity becomes per-(cell, window), mirroring the FFT effect that already worked. When fixing a stale-dependency defect, check every gate between the dependency and the work.
- **R134** — Time/cursor lane: sandbox is NOT on the pointer path (iframe is `pointer-events:none`), so cursor state lives in the host on a pub/sub bus, no new interaction-path messages. Strip = one stacked lane per window; shift-drag pans; dragging a lap boundary converts it to a `range` **with a visible label change**; viewport not persisted; distance-on-X ships disabled with its reason (core follow-on); playback stops at the primary window's end, named; hover drives the card, pin freezes it; optional `plotRect` on `cellRendered` is the only protocol change. The `endUs = Infinity` sentinel is removed before the strip exists.
- **R135** — Maths-graph plan accepted. Node positions live in an optional front-matter `graph:` key — the only home where a move is not a cell-content change (C2 §7.1 merges front matter per key, §7.2 compares cell bytes). Ports show **unknown** shapes as unknown, never guessed; the edge scanner reuses `tokenizeMath` (no second parser); rename is atomic; grey by reachability; node status worst-wins with the card naming the split, a whole-window failure being a canvas banner. **Pre-existing defect found: `render_front_matter` drops unknown top-level keys, silently stripping data on save (decision 75) — fixed in the lane's Rust task, ships regardless.**
- **R136** (supersedes R134 item 5) — Distance-on-X stays disabled in W3.2; a naive cumulative-distance axis is easy and **wrong for comparison** (line choice makes each lap's arc length differ, so overlays misalign by a growing error). Lap-distance alignment becomes its own spec-first **core** lane. Isaac's known failure mode: gates get noisy at switchbacks. Lead's recommendation to test, not assume: reference-path **station** projection with heading disambiguation + monotonic progression, which makes gates a derived quantity rather than a competing estimator.
- **R137** (amends R134 item 2) — Pointer gestures are a **swappable input map** (event → action) with runtime-selectable presets in user prefs: trackpad (pinch=zoom, two-finger=pan), two-wheel mouse (wheel=zoom, horizontal wheel=pan), basic mouse (shift-drag=pan). Decision 56's drag-to-zoom-region is the default in every preset. Renderer-only, never synced, never part of a workbook; the table is a pure tested module so a new preset needs no handler change.
- **R138** — "Resolved" has ONE definition: an effect's readiness gate must use the same code path as the consumer's inclusion test, never a parallel `has()` check. Third occurrence of the R133 shape (gate and work disagreeing about readiness), this time in the span dimension. Also: click-to-unpin blessed explicitly; lazy-init the cursor bus ref.
- **R139** — The cursor card reads the combined `{t,v,w}` payload the host already builds for the sandbox (retained in a ref, filtered by `w`), NOT per-window tiles and NOT primary-only. No new fetch, no IPC on hover, correct for N windows by construction; a pin may still do IPC for the exact readout (R134 item 7).
- **R140** — R135's "no second tokenizer" is about the *expression grammar*; a line-splitting layer above `tokenizeMath` is fine (precedent: `cells.ts` mirrors `scan_cells`), **provided comment/label detection comes from `tokenizeMath`'s own `comment`/`labelComment` tokens, never an independent `#` scan**. Gap filed: `tokenizeMath` does not tokenize string literals, so a `#` inside a string argument likely reads as a comment — reconcile with core's tokenizer when C2 §3.6 lands.
- **R141** — `ChannelSummary.channel_id` **is** the `[Name]` reference text (not a hash); `graphStatus.ts` reuses `jsCellBinding.ts`'s existing `findChannel`/`unresolvedChannelId` predicate rather than a third spelling of "resolves". Graph status takes **both** the ordered `SelectionWindow[]` and the resolved `windows` map: selection gives denominator and order, the map gives outcomes, absent-but-selected = pending (spinner). Never add a "pending" entry to the map — that gives absence two meanings again.
- **R142** — Recorded design criterion (Isaac): the math language is measured against **scipy/numpy/xarray** convention because *models are trained on it*. Catalog is already ~80% conventional. Priorities: (1) **false friends** like `angle` (vs `numpy.angle` = complex phase) are worse than invented names — rename first; (2) free renames `p`→`percentile`, `clamp`→`clip`, `if`→`where`, `integrate`→`cumulative_trapezoid`, `differentiate`→`gradient`; (3) C2 §3.6's named-axis reductions are **xarray** semantics — adopting `dim=` needs keyword arguments (open for Isaac); (4) `[Channel]`/`{cell}` refs kept as deliberate DSL. Cheapest to do now — renames are a version bump plus migration (decision 75).
- **R143** — Keyword arguments approved for C2 §3.2 (enables xarray-style `mean(x, dim="f")`). **Naming policy:** mirror scipy/numpy when semantically equivalent; when NOT equivalent, choose a deliberately different name — a false friend is worse than an invented name. **First application: `fft` actually computes Welch** (`core/src/fft.rs` is `welch()`), so rename `fft` -> `welch`, freeing `fft` for a real DFT. Plus `angle`, `p`->`percentile`, `clamp`->`clip`, `if`->`where`, `integrate`->`cumulative_trapezoid`, `differentiate`->`gradient`. Migration required (decision 75): old spellings parse one revision, rewritten on save.
- **R144** — `CellDefResult` gains `unit: string | null` (additive; `null` = genuinely dimensionless, never "unknown"). The engine already derives units (C2 §3.3 output-unit column, C1 §4.1 channel units) and drops them at the IPC boundary, so the node card, cursor card, inline `${…}` spans and the PDF report all show bare numbers. Consumers must never infer a unit from a name or label. Scheduled as its own Rust + C3 task.
- **R145** — A rename rewrites `[Name]` refs in math cells **and** form-generated plot code (safe: we generated it), **never** arbitrary JS in hand-written cells or prose `${…}` spans, and **reports every reference it could not update** ("renamed; 2 references in cell X not updated"). The broken-reference *consequence* is already handled by grey/unresolved rendering; the defect was that it happened silently. Refusing the rename is not the answer — decisions 45a/76 make it one gesture.
- **R146** (corrects R143) — The language `fft` is **not** welch: `eval.rs:940` is a single windowed magnitude spectrum, while charts call `welch` (`rasters.rs:508`) — **the notebook and the charts compute different spectra under one name today**. Fix: expose `periodogram` (single-segment) and `welch` (averaged) as scipy names them, retire `fft` and reserve it for a true complex DFT. `differentiate`→`gradient` withdrawn (backward vs central difference). Worst false friends are `variance_time`/`variance_dist` (lap deltas, not σ²). Two reachable panics filed (`clamp`, `butter`). R136's GPS-Doppler claim is unverified in-repo.
- **R147** — The maths lane landed 12 tasks and 126 tests but **wired only 2 gestures**: `graphEdits`'s five mutations are pure, tested and unreachable. Decision 76 measures the lane in *gestures*, so it currently scores near zero while every gate passes — unwired correct code is still correct code, so no gate can see this. **Rule: a task plan must land one gesture end to end early, and each capability must be reachable in the task that introduces it.** Every lane closes with an honest gap list (this is the second real find today). Lane merges as-is; 45a gesture wiring is the next dispatch, ahead of polish.
- **R144 amended** — `CellDefResult` gains `sample_rate_hz: number | null` alongside `unit`: the maths lane hit the same wire gap from the node-details side (only `ChannelSummary.nominal_rate_hz` exists; a computed definition has no rate on the wire though `eval.rs` constructs one). Second consumer to hit it — a contract defect, not a UI want.
- **R148** — Charts were blank because `bindingFor` requires `plotForm/parse` to recognise the **whole cell**; any unrecognised key (`height`, `opacity`, a `var()` stroke, a preceding statement) makes it "custom" and the host never binds or fetches its channels, so `channel(...)` returns `[]` **silently**. Two fixes: (1) an unparseable cell must show a note saying no channels were bound — the silence violates section D; (2) binding must be driven by **extracting `channel(…)`/`spectrum(…)` calls** (as `mathExpr` extracts refs) rather than parsing the whole cell, or hand-written cells can never receive data — which contradicts the runtime-editable premise.
