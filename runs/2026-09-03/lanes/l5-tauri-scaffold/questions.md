# L5 — questions for the lead

Appended by the brief writer for Tasks 8, 11–14 (2026-09-04). Each question
was raised because it is structural — later work builds on the answer — and
each brief proceeds on the recommended answer with the affected section
marked PROVISIONAL.

### Q1 — L1 landed **no** catalog read API; may L5 add one to `rust/core`?
- **Where:** `rust/core/src/store/catalog.rs` (whole file: `open_catalog:136`, `rebuild_catalog:183` — write/rebuild only; `grep` for `fn list_sessions|get_session|list_laps|list_workbooks|list_tracks|get_track|struct SessionSummary` across `core/src` and `cli/src` returns **zero** hits at idl-rs `main` = `e0440bb`).
- **Context:** L5 plan Task 8's gate is "L1 has landed catalog read functions in `rust/core`". It has not, and L1 is merged and closed. C3 §3.2's seven commands cannot be thin wrappers over nothing, and the queries are "bytes on disk" — CLAUDE.md §2 puts them in `core`, not in `idl-rs-tauri`. Two sub-parts: (a) the seven read functions; (b) a `SessionHandle::from_session(Session)` constructor (`session/handle.rs`), needed by Tasks 11/12/14 because `read_session_parquet` yields a `Session` and the only existing constructor, `from_channels` (`handle.rs:243-280`), hard-codes `source_format = Gpx` and blanks `blob_sha256`/`unit`.
- **Blast radius:** structural
- **Recommended answer:** Yes, both, under the same precedent that authorised L3 to edit landed L1 files (ledger R25/L3-R28). (a) goes in a **new** file `rust/core/src/store/catalog_read.rs` so no L1 file is rewritten, only `store/mod.rs` gains `pub mod catalog_read;`. (b) is a ~10-line additive constructor in `handle.rs`. Both are `pub` additions to `core`, so every task touching them also runs `cargo check -p idl-rs-cli --tests` (CLAUDE.md §8).
- **Proceeded on:** the recommended answer. `brief-task8.md` writes `store/catalog_read.rs`; `brief-task11.md` adds `from_session` and Tasks 12/13/14 reuse it.
- **Affected outputs:** `brief-task8.md` (all of it), `brief-task11.md` §"Step 1", `brief-task12.md`, `brief-task14.md` (session loading)
- **Your answer:** ACCEPTED (R40). Both parts. Precedent is L3's authorisation to extend landed L1 files; a new `store/catalog_read.rs` keeps L1's own files untouched. `from_session` is required and its absence is itself a finding — `from_channels` hard-coding `source_format = Gpx` and blanking `blob_sha256`/`unit` is a latent bug for every non-GPX session, so the new constructor must carry the real values, and Task 11's brief should say so rather than treating it as a mechanical addition. Both tasks run `cargo check -p idl-rs-cli --tests`.

### Q2 — `eval_workbook(id)` has no session argument; against what does it resolve `[Channel]`?
- **Where:** C3 §3.4 (`eval_workbook(id: string)`, spec line 475); `core/src/workbook/v3/eval.rs:95-101` (`eval_cells(doc, structural, lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext)`)
- **Context:** `eval_cells` requires a channel lookup and a lap context; C3's command signature supplies neither, and C2 has no front-matter session binding — only a host variable `session` documented as "**active** session metadata" (C2 line 574). Without an answer the command either evaluates against nothing (every `[Channel]` → `math_unknown_channel`) or invents a binding.
- **Blast radius:** structural
- **Recommended answer:** the active session is a UI selection, not a workbook property. Amend C3 §3.4 to `eval_workbook(id: string, session_id: string | null)`; `null` means no session bound, and the command then evaluates with an empty `SessionHandle` and `MathLapContext::empty()`, so channel refs surface as per-cell `math_unknown_channel` rather than a command rejection. Lap context in wave 1 comes from `session.json`'s `laps[]` when a session *is* bound.
- **Proceeded on:** the recommended answer; `app/src/ipc/workbook.ts`'s `evalWorkbook` gains the same second argument.
- **Affected outputs:** `brief-task11.md` §"Step 3" (marked PROVISIONAL)
- **Your answer:** ACCEPTED as recommended (R41). The active session is a UI selection, not a workbook property — that is what "the workbook is a file; the app is a live viewer of it" means. C3 §3.4 amended. `null` evaluating to per-cell `math_unknown_channel` rather than a command-level rejection is right: one unbound reference must not blank a whole notebook.

### Q3 — the host-channel byte path C3 §3.4 assigns to this task: build it now or defer?
- **Where:** C3 §3.4, "Host-channel byte path — open item, owner L5" (spec lines 543-563)
- **Context:** C3 assigns the `HostChannel {length, t, v}` binary layout to "L5's workbook-command task" (this is Task 11) and says it needs a new contract revision. Its only consumer is L6's sandboxed notebook iframe, which is wave 2 and does not exist. Building a byte format now fixes a wire layout with no consumer to validate it against.
- **Blast radius:** structural
- **Recommended answer:** defer to wave 2, with L6. Task 11 ships `CellDefResult.value` as C3's `HostChannelRef { length, has_t }` marker only (which C3 §3.4 already fixes as the JSON representation) and a `// TODO(idl0):` naming the deferred command. No contract revision this wave.
- **Proceeded on:** the recommended answer.
- **Affected outputs:** `brief-task11.md` §"Step 3" (marked PROVISIONAL)
- **Your answer:** ACCEPTED as recommended (R45). Defer the host-channel byte path to wave 2 with L6. Fixing a wire layout whose only consumer does not exist yet is how you get a format nobody can validate; `HostChannelRef { length, has_t }` is already the JSON representation C3 §3.4 fixes, and it is enough for wave 1. `TODO(idl0)` names the deferred command. No contract revision.

### Q4 — `fetch_raster`'s `Histogram2dParams.x_bins`/`y_bins` vs the command's own `width`/`height`
- **Where:** C3 §3.6 (spec lines 656-673); `core/src/raster.rs:144-152` (`build_histogram2d_raster_bytes(xs, ys, width, height, range_x, range_y)` → `histogram2d(xs, ys, width as usize, height as usize, …)`)
- **Context:** C3 passes both a pixel size (`width`/`height`) and a bin count (`x_bins`/`y_bins`) for the same grid. The landed encoder has one grid: one bin per pixel, no rebinning (unlike the spectrogram path, which does rebin). So the two argument pairs must agree or one is meaningless.
- **Blast radius:** structural
- **Recommended answer:** one bin per pixel is the honest rendering for a 2-D histogram (rebinning counts would misrepresent them). `fetch_raster`/`fetch_raster_meta` reject `x_bins != width || y_bins != height` with `invalid_argument` and `detail { x_bins, y_bins, width, height }`, rather than silently preferring one. Record it as a C3 §3.6 note.
- **Proceeded on:** the recommended answer.
- **Affected outputs:** `brief-task13.md` §"Step 3" (marked PROVISIONAL)
- **Your answer:** ACCEPTED with a reason added (R42). Reject `x_bins != width || y_bins != height` with `invalid_argument`. I considered deleting the redundant fields instead, and kept them deliberately: bins < pixels — an upsampled display of a coarse histogram — is a legitimate future, and keeping the fields reserves the space for it rather than requiring a contract change to add them back. C3 §3.6 now says both the constraint and why the fields survive.

### Q5 — `fetch_tile` has no `column_count` argument, but the encoder requires one
- **Where:** C3 §3.5 (`fetch_tile(session_id, channel, tier, tile_index)`, spec line 567; `column_count` "chosen by the caller/L3 to match the rendered chart width", spec line 601); `core/src/tile.rs:28-34` (`build_tile_bytes(samples, t_us, tier, tile_index, column_count)`)
- **Context:** the column region exists so hover never needs IPC, at the chart's own pixel width. Only the frontend knows that width, and the command has no argument to carry it. Either the command grows one or the column region is pinned to a constant and can never match the chart.
- **Blast radius:** structural
- **Recommended answer:** amend C3 §3.5 to `fetch_tile(session_id, channel, tier, tile_index, column_count)`, `column_count: u32` validated `1..=4096` (`invalid_argument` outside), and `fetchTile(sessionId, channel, tier, tileIndex, columnCount)` TS-side. This is additive to the request only; the binary layout is unchanged (the header already carries `column_count`).
- **Proceeded on:** the recommended answer.
- **Affected outputs:** `brief-task14.md` §"Step 3" and §"Step 5" (marked PROVISIONAL)
- **Your answer:** ACCEPTED as recommended (R43). C3 §3.5 amended to carry `column_count`, validated `1..=4096`. The column region's entire purpose is matching the chart's pixel width so hover costs no IPC; a constant would have defeated it. Request-only — the binary layout already carries the value in its header.

### Q6 — `save_workbook(id, markdown)` carries no based-on hash, so C4 §4 step 4 cannot run
- **Where:** C3 §3.4 (`save_workbook(id: string, markdown: string)`, spec line 517); C4 §4 steps 3–4 (spec lines 211-224); `core/src/store/atomic.rs:80-115` (`write_atomic(data_root, target, bytes, based_on_hash: Option<&str>)` — `None` means "target must not exist", and against an existing file it *fails* with `RenameConflict`)
- **Context:** C4 §4 mandates the optimistic check for `workbooks/*.idl1wb` and describes the exact race it prevents (an external editor's write clobbered between build and rename). The command signature gives the backend no `H0` to check against. Note `write_atomic(…, None)` against an existing file does not skip the check — it errors — so "just pass None" is not even a silent-clobber option; it makes every save of an existing workbook fail.
- **Blast radius:** structural
- **Recommended answer:** amend C3 §3.4 to `save_workbook(id: string, markdown: string, based_on_hash: string | null)`, where `null` means "creating a new workbook" (target must not exist) and a non-null value is the hash the editor last read — matching `write_atomic`'s existing contract exactly. A `RenameConflict` maps to `invalid_argument` with `detail { expected, found }` — C3 §2's kind vocabulary has no conflict kind and inventing one is a contract change this question is not asking for; the naming gap is recorded here for the lead.
- **Proceeded on:** the recommended answer, including the `invalid_argument` mapping.
- **Affected outputs:** `brief-task11.md` §"Step 2" (marked PROVISIONAL)
- **Your answer:** ACCEPTED, and the naming gap is closed rather than recorded (R44). `save_workbook` gains `based_on_hash: string | null`, matching `write_atomic`'s existing contract. But the `invalid_argument` mapping is rejected: a save conflict is not a caller error, it is a recoverable condition the UI must present differently ("this file changed elsewhere — reload?"). C3 §2 gains a fifth cross-cutting kind, **`conflict`**, with `detail { expected, found }`. Adding it now, before L6 types against the surface, is the same argument that moved R27 earlier — cheap now, expensive once there is a UI built on the wrong shape.
