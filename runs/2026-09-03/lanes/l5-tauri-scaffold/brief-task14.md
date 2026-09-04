# L5 Task 14 — implementer brief (tile command + the end-to-end render; C3 §3.5) — LAST TASK

You are the implementer for L5 Task 14 — the lane's payoff. A real `.idl0`
goes through parse → store → tile encoder → binary IPC → pixels on screen, and
the M0 smoke path is deleted on the way out. TDD, two commits, then report.

**Task 9 (import commands, L2) is deferred with L2 and does not exist**, so nothing in the app
can import a file. That does not block this task: `.idl0` import lives in **core**
(`idl_rs::store::import::import_idl0`, `core/src/store/import.rs:177`, landed by L1 under ruling
R18) and is reachable from the CLI (`idl-rs import --data-dir <data> <file>.idl0`,
`cli/src/main.rs:268-276`). Step 6's manual check seeds `<data>` that way. What "end-to-end"
means here is therefore: **a session imported by the CLI, read by the app, rendered on screen** —
not "imported through the UI". Say so in the report; do not quietly redefine the proof.

## Where
- **Rust worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`,
  branch `wave1-l5-tauri`, HEAD = the commit of Task 13 (given in the dispatch message), status
  clean. Verify first; if not, stop and report. Already caught up to idl-rs `main` (`e0440bb`).
  Leave `.cargo/config.toml` alone.
- **App worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`.
  After the rust commit: `git -C rust fetch local-wave1 wave1-l5-tauri && git -C rust checkout
  <new sha>`, then `git add rust`.
- Work ONLY in those two worktrees. Do NOT touch the shared checkouts beyond READING, do NOT
  edit anything under `docs/`, do NOT push.
- **Read first:** `CLAUDE.md` (§8 especially); the L5 plan `### Task 14` (1687–1810) and Global
  Constraints (49–81); C3 §3.5 (spec 565–652, **v2 layout** — read the whole section including
  the worked example) and §4; ledger `runs\2026-09-03\decisions.md` — **R25** (tile layout v2,
  the column time region, tier narrowing), the **`MAX_TIER` tracked note and its same-day
  correction** (quoted below), and the "L3 LANDED" entry; this lane's `questions.md` **Q5** and
  the lead's answer.

## COMPUTE RULES — non-negotiable
One cargo process at a time, foreground, never `-j` (CLAUDE.md §8, R13). Run, in this order:
- `cargo test -p idl-rs-tauri tile` — must report a non-zero `passed` count (Step 4)
- app worktree: `npm test` and `npx tsc --noEmit` (Step 5)
- **the lane merge gate, once, at Step 7**: `cargo test -p idl-rs-tauri` and
  `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`

**The plan's Step 7 says `cargo test --workspace`. Do not run it** — CLAUDE.md §8 and ruling R13
forbid `--workspace`; the two commands above are the sanctioned merge gate and cover the same
ground without rebuilding the Tauri dependency graph twice. No `cargo fmt`, no tarpaulin, no
`cargo doc`, no flakiness reruns; if `watcher::…never_fires_callback` or
`store::atomic::…outlasts_the_retry_window` fails, rerun that test alone by name once and say so.

## Verified facts about the landed code (read, not assumed)
Read at idl-rs `main` = `e0440bb`.

1. **`idl_rs::tile::build_tile_bytes(samples: &[f64], t_us: &[i64], tier: u32, tile_index: u32,
   column_count: u32) -> Vec<u8>`** — `core/src/tile.rs:28-34`. It emits C3 §3.5's **v2** layout
   directly: header (`b"IDLT"`, `version = 2` at `tile.rs:48`, `tier` narrowed to `u16` at `:49`),
   sample region, column region, **column time region** (`:68-71`). Total =
   `32 + sample_count*8 + column_count*12 + column_count*8` (`:40-43`).
   `samples.len() == t_us.len()` is **the caller's invariant** (`:22-23`) — check it.
2. **`sample_count` is always 1024 today**: `decimate_channel` returns `2 * TILE_SIZE_BUCKETS`
   floats (`core/src/chart_decimation.rs:71-88`, `TILE_SIZE_BUCKETS = 1024` at `:10`), so
   `build_tile_bytes` writes `sample_count = 1024` and a 1024-bucket tile is
   `32 + 8192 + column_count*20` bytes.
3. **`MAX_TIER = 10`** — `chart_decimation.rs:19`. The ledger's tracked note (2026-09-04, L3 Task
   10) says, verbatim: *"C3 §3.5 already requires L5 to reject `tier > MAX_TIER` with
   `invalid_argument` before calling in, so there is no contract gap — but that check is
   **load-bearing, not defensive**: without it a bad tier yields a plausible-looking tile rather
   than an error."* The **correction** appended the same day (after the Task 10 review) is
   equally load-bearing to know: `decimate_channel`/`decimate_tile` now early-return the empty
   tile for `tier > MAX_TIER` at every `tile_index` (`chart_decimation.rs:79-81`, commit
   `1f04286`), *"so core does not lean on L5's `invalid_argument` check for this; that check
   stays, now as defence in depth"*. **Implement the check, and write its test.** An all-NaN
   tile is not an acceptable answer to a bad tier.
4. **Session data.** Task 11's `tauri/src/session_source.rs::load_session(data_dir, session_id)`
   (verify the exact name against what Task 11 committed). `Session.channels: Vec<Channel>`
   (`core/src/session/mod.rs:341-362`); `Channel.materialize() -> Vec<f64>` (`:302`),
   `Channel.t_us: Vec<i64>` (`:137`), `Channel.len()` (`:292`).
5. **`app/src/ipc/tiles.ts` decodes layout v1** — it reads the header, sample region and column
   region (lines 26-65) and has **no column time region and no `version` check**. It predates
   R25. Bringing it to v2 is this task's TS work.
6. **The M0 smoke path is already orphaned in the UI.** `app/src/ipc/_m0_smoke.ts` exists;
   `git grep fetchSmokeTile|decodeSmokeTile` over `app/src` finds **no** caller (Task 6's shell
   rewrite dropped the debug affordance). Rust side: `smoke_tile` and `encode_f32_le` in
   `tauri/src/commands/mod.rs`, registered in `handler()` (`tauri/src/lib.rs:23`). Deleting all
   of it is pure subtraction — the plan's expectation of leftover `SettingsPage` usage is stale.
7. **`NotebookPage.tsx`** is a one-line placeholder (`app/src/routes/pages/NotebookPage.tsx`).
   `app/src/ipc/catalog.ts` exports `listSessions()` and `getSession(sessionId)` (Task 8 wired
   the Rust side).
8. **The real `.idl0`** is at `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\d365a19ae7ef2dc2d087a5887371281f.idl0`
   (gitignored; ruling R19 item 1 — no second copy of real session data is ever made).

## The task

### Step 1: `fetch_tile` — the failing test first
New file `rust/tauri/src/commands/tiles.rs`, lane idiom: logic in
`fetch_tile_via(data_dir: &Path, session_id: &str, channel: &str, tier: u32, tile_index: u32,
column_count: u32) -> Result<Vec<u8>, IpcError>`; the `#[tauri::command]` is a one-line wrapper
returning `Result<tauri::ipc::Response, IpcError>`.

Tests (A/A/A, `thing — condition — result`), against a session written to a temp `<data>` with a
channel of known length and known `t_us`:
- `fetch_tile — tier 0 tile 0, 256 columns — header fields and total length match C3 §3.5's v2
  formula` (assert magic `IDLT`, `version == 2`, echoed `tier`/`tile_index`, `sample_count ==
  1024`, `column_count == 256`, and `bytes.len() == 32 + 1024*8 + 256*12 + 256*8`)
- `fetch_tile — the column time region — column 0 carries the first sample's recorded t_us`
  (C3 §3.5 spec 625-632; the sentinel for an empty bucket range is `i64::MIN`)
- `fetch_tile — tier 11 (> MAX_TIER) — invalid_argument before any bytes` (fact 3)
- `fetch_tile — unknown channel — not_found`
- `fetch_tile — unknown session — not_found`
- `fetch_tile — column_count 0 — invalid_argument`

### Step 2: implement
**PROVISIONAL (Q5):** the command takes `column_count: u32` as a fifth argument. Validate
**before** choosing the `Ok(Response)` arm (C3 §1's binary rule, spec 33-39), in this order:
`tier > MAX_TIER` → `invalid_argument` with `detail { "tier": tier, "max_tier": MAX_TIER }`;
`column_count` outside `1..=4096` → `invalid_argument`; unknown session/channel → `not_found`.
Then `build_tile_bytes(&channel.materialize(), &channel.t_us, tier, tile_index, column_count)`
and `tauri::ipc::Response::new(bytes)`.

Do **not** re-implement decimation, column stats or the header — `build_tile_bytes` owns all
three and is already tested in core.

Register in `handler()`. No new `IpcErrorKind` variants (C3 §3.5 raises
`not_found`/`invalid_argument`/`io`/`internal`).

### Step 3: retire the M0 smoke path
Delete `smoke_tile` and `encode_f32_le` from `tauri/src/commands/mod.rs` **and their test**
(`encode_f32_le_four_values_roundtrips_bytes`), remove `commands::smoke_tile` from `handler()`
(`tauri/src/lib.rs:23`), and delete `app/src/ipc/_m0_smoke.ts`. `engine_version` stays exactly
where it is in `commands/mod.rs` — moving it buys nothing and churns a working command (the
plan leaves this to the implementer; this is the call, made once, here).
Check with `git grep -n "smoke_tile\|_m0_smoke\|fetchSmokeTile\|decodeSmokeTile"` in both
worktrees that nothing references them afterwards; paste the (empty) result in the report.

### Step 4: gate
`cargo test -p idl-rs-tauri tile` — non-zero `passed`, `0 failed`.

### Step 5: TS — `tiles.ts` to layout v2, then the render
**PROVISIONAL (Q5)** for the signature.

`app/src/ipc/tiles.ts`:
- Add `version` and `columnTUs: BigInt64Array` to `DecodedTile`. The column time region is `i64`;
  decode with `getBigInt64(offset, true)` into a `BigInt64Array` — **do not** coerce to `number`
  in the decoder (µs since session start exceeds `Number.MAX_SAFE_INTEGER` only after ~285 years,
  so `Number()` is safe *in practice*, but the sentinel `i64::MIN` must survive the round trip
  intact, and it does not survive a lossy conversion cleanly). Callers that need a JS number
  convert at the point of use, checking for the sentinel first.
- Throw on `version !== 2` with a message naming both versions (the decoder is now
  version-aware; C3 §5 makes layout versions explicit).
- Extend the length check to `32 + sampleCount*8 + columnCount*12 + columnCount*8`.
- Add `columnCount` to `fetchTile`'s arguments: `invoke("fetch_tile", { sessionId, channel, tier,
  tileIndex, columnCount })`.
`tiles.test.ts`: update the builder to C3 §3.5's **v2** worked example — tier 3, 512 samples, 256
columns, **9248 bytes** (spec 638-647; the old test's 7200 is the v1 total and is now the offset
of the column time region). Add: `version 1 buffer — throws naming the version`; `column time
region — decodes the i64 values and the i64::MIN sentinel`.

`app/src/routes/pages/NotebookPage.tsx` — the minimal render. **Minimal means:** no Observable
Plot, no axes, no interaction, no state library, ~40 lines. It must nevertheless be *real* — it
picks a real session from the catalog rather than hard-coding a fixture id:
1. On mount, `listSessions()`; take the first entry. If the list is empty, render the text
   `No sessions in <data> — import one with: idl-rs import --data-dir <data> <file>.idl0` and
   stop. (A blank canvas that silently means "no data" is the failure mode this avoids.)
2. `getSession(session_id)`; take the first channel whose `channel_kind === "fixed-rate"` and
   `sample_count > 0`.
3. `fetchTile(sessionId, channelId, 0, 0, 600)`.
4. Draw the sample region's min/max envelope as a `<canvas>` polyline (600×200): scale x by index
   over `sampleMin.length`, y by the min/max across the tile, skipping `NaN` buckets (the tile is
   right-edge-padded with NaN — `chart_decimation.rs:71-74`). Show the channel name and the
   tile's byte length as text beside it, so the screenshot in the report proves *which* bytes
   arrived.
5. Render any thrown error as text, never a blank canvas.
CLAUDE.md §4: UI rendering is not unit-tested — no test file for `NotebookPage.tsx`. The decode
path it depends on is tested in `tiles.test.ts`.

Run `npm test && npx tsc --noEmit`.

### Step 6: manual check — required before this task is done
This is the lane's done-criterion ("a tile fetched and rendered end-to-end"); do not mark the
task done without it, and do not downgrade it (M0 Task 5's precedent: "do not fall back to JSON").
1. Create a scratch data root, e.g. `C:\tmp\idl1-data-l5`.
2. Point the app at it: write `{"data_dir":"C:\\tmp\\idl1-data-l5"}` to
   `app_config_dir()/settings.json` (C4 §1; on Windows
   `%APPDATA%\com.saucyeng.idl1\settings.json` — the identifier is
   `app/src-tauri/tauri.conf.json:5`). `resolve_data_dir` then uses
   `C:\tmp\idl1-data-l5\data` (`tauri/src/paths.rs:25-43`).
3. Import the real file, from the **rust worktree**:
   `cargo run -p idl-rs-cli -- import --data-dir "C:\tmp\idl1-data-l5\data" "C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\d365a19ae7ef2dc2d087a5887371281f.idl0"`
   (the CLI rebuilds the catalog as part of `import` — `cli/src/main.rs:263-267`). Do **not**
   copy the `.idl0` anywhere (R19 item 1).
4. `npm run tauri dev` in the app worktree; the Notebook tab must show a **rendered polyline**
   plus the channel name and byte count — not a blank canvas, not an error, not the "no
   sessions" message.
5. Record in the report: the channel name shown, the byte length shown, and whether it equals
   `32 + 1024*8 + 600*20 = 20224`. If it does not, that is a real finding — report it, do not
   adjust the assertion.
If any step blocks (no adapter, no window, an unexpected error), **stop and report the blocker**
rather than ticking the task.

### Step 7: lane merge gate
Run both gate commands from COMPUTE RULES and paste both result lines with their counts. Every
line must be `0 failed`.

### Step 8: TASKS.md, CHANGELOG, commits
`TASKS.md` (app worktree): tick `- [ ] L5 Tauri scaffold hardening` → `- [x]` (line 26).

`CHANGELOG.md`, `[Unreleased] / ### Added`:
```markdown
- **L5 complete (2026-09-04).** idl-rs-tauri wired to every landed wave-1 lane's C3 command
  group (catalog, workbook, cursor, raster, tile) plus device (L4); <data> resolution,
  workbook watcher, app/src/ipc/ module layer, routing and state skeleton. Tile fetched and
  rendered end-to-end from a real .idl0; M0 smoke path retired. Import commands (C3 §3.3)
  ship with L2, not this lane.
```

```bash
# rust worktree
git add tauri/src/commands/tiles.rs tauri/src/commands/mod.rs tauri/src/lib.rs
git commit -m "tauri: fetch_tile (C3 3.5 v2 layout) over core::tile; retire M0 smoke_tile"
# app worktree, after syncing the submodule pointer
git add rust app/src/ipc/tiles.ts app/src/ipc/tiles.test.ts app/src/routes/pages/NotebookPage.tsx \
        CHANGELOG.md TASKS.md
git rm app/src/ipc/_m0_smoke.ts
git commit -m "app: tile decoder to C3 3.5 v2, end-to-end tile render on NotebookPage; L5 done"
```

## Do not
- Do not run `cargo test --workspace` (the plan's Step 7 is wrong — CLAUDE.md §8, R13).
- Do not let `tier > MAX_TIER` through to the encoder — the check is load-bearing, not defensive
  (fact 3, ledger).
- Do not re-implement decimation, column stats, or the tile header.
- Do not return `Response` before validating arguments (C3 §1).
- Do not hard-code a fixture session id or channel name in `NotebookPage` — read the catalog.
- Do not render a blank canvas on any failure path.
- Do not use Observable Plot, add an npm dependency, or build anything L6 owns.
- Do not copy the real `.idl0` into any worktree.
- Do not tick `TASKS.md` unless Step 6's manual check actually passed.

## Style / hygiene
Doc comment on every public symbol; units on every numeric (`t_us` = microseconds, `column_count`
= pixel columns, `tier` = decimation tier, byte counts = bytes); `// TODO(idl0):` never bare
`// TODO`; typed errors only; A/A/A tests named `thing — condition — result`; match idl-rs's
hand-formatted style (never `cargo fmt`).

## Spec discipline (say it out loud in your report)
"no spec change needed" by this task — C3 §3.5's v2 layout is already signed (ruling R25) and
this task implements it; Q5's `column_count` argument is a lead ruling the lead records in C3.
Do not edit anything under `docs/`. `TASKS.md` and `CHANGELOG.md` are updated (CLAUDE.md §6).

## Report back (concise)
Both commit hashes + `git show --stat`; every gate command with its result line and counts,
including both merge-gate commands; per-step done/deviated; the `git grep` output proving the
smoke path is gone; the exact byte lengths your Rust and TS tests assert and the formulas they
came from; **Step 6's manual check in full** — channel name, byte length, whether the polyline
rendered, and a note if anything about it surprised you; anything ambiguous you resolved (say
how) or that needs a lead ruling — stop and report rather than guess (CLAUDE.md §1).
