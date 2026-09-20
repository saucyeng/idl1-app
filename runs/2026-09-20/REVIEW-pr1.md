# Review — idl-rs PR #1 and idl1-app PR #1 (first real workbook, P0)

Read-only review, 2026-09-20. Nothing was built, run, checked out, pushed or commented.
Diffs read via `gh pr diff` / `gh api .../pulls/1/files`; surrounding code read from the
main checkout at `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` and its `rust/`
submodule (both at main: app `eef680d`, idl-rs `cd98d05`).

## What each PR does

**saucyeng/idl-rs #1** (`lane/first-workbook-p0`, 4 commits, +391/−48, 6 files). Three
engine fixes from the 2026-09-19 motocross day. **P0-1**: `ImuGridPlan::reconcile` no
longer derives an IMU row's `t` as `t0 + slot × effective_period_us`; a new private
`slot_times_from_corrected` (`core/src/parse/records.rs`) walks the same fill pattern
`rebuild_i16` walks, taking each real slot's burst-seam-corrected stamp verbatim,
linearly interpolating interior gap slots between the bracketing stamps, extrapolating
the leading/trailing pads at the corrected period, and finally clamping any
non-advancing slot to `previous + 1 µs` for C1 §3.5 invariant 1. `ImuGridPlan.t0`
(private) is deleted; `IDL0_IMPORTER_VERSION` goes `0.1.0` → `0.2.0`. **P0-3**:
`elemwise`'s axis/rate/length agreement is factored into a new private
`require_same_shape`, and `where(cond,t,f)` applies it to each *channel* branch (scalars
still broadcast), so a mixed-rate branch is a typed `Runtime` error instead of an
out-of-bounds index. **P2-1**: `cli/src/verbs/session.rs::import` routes `extension ==
"idl0"` to `import_idl0_path` instead of `import_file_path`, matching its own `--dry-run`
and `import_file`'s documented "routing is the caller's job". Plus a test-helper fix in
`core/src/store/catalog_read.rs` (stamp the running `IDL0_IMPORTER_VERSION`, not a
literal `"0.1.0"`). Seven new tests, all AAA-shaped with `thing — condition — result`
names.

**saucyeng/idl1-app #1** (`lane/first-workbook-p0`, 2 commits, +275/−3, 6 files). The
paperwork half: the spec-first draft
`docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md` (214 lines,
P0–P3 with open questions left open), the `rust` submodule bump, three `[docs]`-tagged
CHANGELOG entries under Unreleased → Fixed, a new TASKS.md section, and the regenerated
`docs/CLI-REFERENCE.md` + `app/src/shell/cliTable.json` (one line each, both only the
`session import` row's `core_fn`). No TypeScript module, no `app/src-tauri`, no
`rust/tauri` change.

## Verdicts

- **saucyeng/idl-rs #1 — merge after fixes.** The code is right, well tested and honestly
  reported; the PR body flags most of what is left. What needs a decision before it lands
  is not a bug in the diff but two consequences of it (findings 1 and 2) plus the fact
  that the lane never ran the two crates CI will run post-merge (finding 6). If the lead
  rules "accepted, follow-up lane", this merges as-is.
- **saucyeng/idl1-app #1 — merge after fixes.** Paperwork only, correct and current, but
  its submodule pointer must be re-cut after the engine PR lands (see Merge order), and
  three small documentation defects (findings 7–9) should be fixed in the same push since
  they are one-line edits.

Nothing in either diff is a wrong-maths, panic, `Err(String)`, layer-violation,
IPC-shape, import-cycle or `cargo fmt` defect. I checked for all of those specifically
and found none: `slot_times_from_corrected` is arithmetically sound (see "Verified
correct" at the end), no `unwrap` on parsed data was added, no `pub` signature changed,
no Tauri/async/network entered `core`, no JS number moved, no IPC surface moved, and the
diffs are surgical with no reformatting. Commit messages are clean — no
`Co-Authored-By`, no AI attribution trailers, in either PR.

---

## Findings, most severe first

### 1. HIGH — the union axis and the catalog's `duration_ms` still run ~52 s past the true end of the session

**Repo/where:** idl-rs, `core/src/parse/records.rs` — `slot_times_from_corrected`'s tail
loop (the new function; in the diff it is the `if out.len() < target_len { … }` block)
combined with the unchanged `ImuGridPlan::build_from_corrected` at
`core/src/parse/records.rs:581` (`target_len = occupied.iter().copied().max()`).

**Defect:** every IMU is still padded to the single session-wide `target_len`, and the
tail pad now extrapolates forward from *that IMU's own last stamp* at its own period, so
an IMU that stopped early gets a synthetic tail running far past the end of the recording
— the PR measures +17 s (IMU1) and +52 s (IMU2) on the real session.

**Failure scenario:** `duration_ms` is `max` over channels of `Channel::duration_ms`
(`core/src/store/catalog.rs:584` → `read_data_parquet_duration_ms`, and
`core/src/session/handle.rs:441/445`), i.e. the widest `t` span in the file. A 49-minute
session is catalogued and shown in the library as ~50 minutes; the union `t` axis
(`core/src/store/parquet.rs:76 union_t_axis`) carries 52 s of rows that exist only as
pad; every plot's default x-range, every "session length" number and every map/lap window
derived from the axis end includes dead time. The pads are inside a `GapSpan`, so a
consumer that honours gaps renders nothing there — but nothing that derives a *span* from
`first..last` consults gaps.

**Severity note:** pre-existing, not introduced here (the old grid was worse: +62 s), and
the PR states it plainly as "the pre-existing grid shape, not a time error". I rank it
first because the PR's own headline acceptance check ("last real IMU `t` within 1 s of
the last GPS fix") is measured over *real* slots only, and the number a user actually sees
is the padded one.

**Suggested fix:** a ruling, then a follow-up lane — either drop the shared `target_len`
so each IMU's grid ends at its own last real sample (C1 §3.3's shared-grid premise is now
mostly vestigial, since the three IMUs no longer share slot times anyway), or truncate
each IMU's trailing pad at the union of the real spans. Do not fix it in this PR.

### 2. HIGH — `t_recorded_us` is now bit-identical to `t_us` for every IMU channel, so C1 §3.2's two time columns are duplicates

**Repo/where:** idl-rs, `core/src/parse/records.rs::ImuGridPlan::reconcile` — `t_us`
comes from `slot_times_from_corrected(&self.corrected[i], …)` and `t_recorded_us` from
`rebuild_i64_grid_or_real(&self.corrected[i], …, &t_us)`, both fed from the same
`self.corrected[i]`.

**Defect:** at a real slot both arrays hold `corrected[k]`; at a gap slot
`rebuild_i64_grid_or_real` copies the value straight out of `slot_t_us` (the diff's rename
of `grid_t_us`). The only slots where they can differ are ones the `previous + 1 µs`
monotonicity clamp touched, which the PR itself says never fire on real data. So for
every IMU channel of every re-imported session, `imuN_t_recorded_us` is now an exact copy
of the rows' `t`.

**Failure scenario:** `data.parquet` stores a redundant dense `i64` column per IMU source
(three per session) carrying no information, on top of the ~3× row growth. More
importantly the *contract* collapses: C1 §3.2's distinction between the row time and the
recorded time no longer distinguishes anything, and `Channel`'s doc
(`core/src/session/mod.rs:324`, "`t_recorded_us` when correction actually diverged it,
else `t_us`") is now vacuously true for every IMU. Note that `t_recorded_us` already held
the *seam-corrected* stamps rather than the raw device stamps before this PR
(`core/src/parse/v3.rs:170` stores `seam.corrected_us` into the plan), so after this
change no column anywhere retains a pre-correction stamp — the raw stamps survive only in
the immutable blob.

Collateral worth checking, though I could not substantiate a behaviour change from it:
`fetch_seams_via` (`rust/tauri/src/commands/seams.rs:53-58`) calls
`seam_spans(recorded_us = ch.t_recorded_us, corrected_us = ch.t_us, …)`. Its burst
detection input is unchanged by this PR (it was already the corrected array on real
sessions), but the span endpoints it returns move from grid times to recorded times. Its
own tests hand-build a `Channel` whose `t_recorded_us` is the *raw* stamps, so they will
keep passing regardless — the tests do not exercise the shape a real import produces.

**Suggested fix:** this is exactly the PR's own open question P0-1 (b). Rule on it: either
drop `t_recorded_us` for `.idl0` IMU channels (and say so in C1 §3.2), or make it the
*raw* pre-correction stamp so the two columns mean different things again and
`fetch_seams` has real input. Either way it is a contract change, not this PR's work.

### 3. MEDIUM — the new `where()` error tells the author to use `resample()`, which is `NotImplemented`

**Repo/where:** idl-rs, `core/src/math/eval.rs` — new `require_same_shape` emits
`"Cannot \"{op_name}\" channels with different sample rates (… Hz vs … Hz). Use
resample() to match rates first."`, and `core/src/math/eval.rs:1633` still answers
`resample` with `MathEvalErrorKind::NotImplemented`.

**Defect:** the fix correctly replaces a wrong answer (an out-of-bounds index into the
shorter branch) with a typed error, but the remedy it names does not exist, and the
documented idiom it blocks is in the shipped reference:
`docs/reference-src/20-windows-and-laps.md:48` says `current_lap()` and
`sector_number()` "are per-sample channels, so both are usable as a `where(...)`
condition", and `sector_number()` is produced at the session's base rate
(`resolve_time_base`, `core/src/math/eval.rs:1640`) — i.e. the IMU rate, not the GPS
rate.

**Failure scenario:** the exact expression that motivated P0-3,
`where(sector_number() == 3, [GPS_SpeedKmh], 0)`, goes from "wrong answer / index panic"
to "typed error with no working workaround". The author cannot mask a 1 Hz GPS channel by
sector at all until P1-1 lands.

**Suggested fix:** nothing in this PR — but the lead should know the P0-3 fix does not
unblock the workbook, only stops it lying. Either prioritise P1-1 `resample`, or rule a
broadcast rule for `where` (a condition at rate A over a branch at rate B resolves the
condition onto the branch's axis), which is the smaller change and is what the author
actually wanted.

### 4. MEDIUM — ~3× row growth in every `data.parquet`, and a whole-library rebuild, on a memory-bound host

**Repo/where:** consequence of finding 2's change, via
`core/src/store/parquet.rs:76 union_t_axis` (sorted dedup of every channel's `t_us`).

**Defect:** the three IMUs previously collapsed onto shared slot times and now each
carries its own; the PR measures 3.83 M rows where there were ~1.27 M on one session.
Per-channel decoded arrays do **not** grow (`read_channel` reconstructs each channel's own
`t_us`, per the round-trip test at `core/src/store/parquet.rs:2117`), so the cost is the
file and the union `t` column, not every column — but `parquet.rs:1221` already documents
a 516 MB file whose read decompresses the union `t` plus the `imu0` columns, and R211.1
records a multi-gigabyte-allocation incident on exactly this path.

**Failure scenario:** `idl-rs library rebuild` (required by the `0.2.0` bump) rewrites
every session on a 16 GB swap-bound machine, and the resulting files are ~3× larger; the
app's first open of a rebuilt large session decompresses a 3× union axis.

**Suggested fix:** before running the library rebuild, re-import *one* large session and
measure file size and `fetch_tile` wall time / peak commit on it. The PR flags the row
growth but reports no read-path measurement. Sequence the rebuild for a time the app is
closed (the CLI cannot rebuild while the app holds `catalog.sqlite` — spec P2-2).

### 5. MEDIUM — expressions combining two IMUs that used to evaluate now fail with "different per-sample time axes"

**Repo/where:** idl-rs, `core/src/math/eval.rs:630-653 combine_t_us` (unchanged) meeting
the new per-IMU `t_us`.

**Defect:** `combine_t_us` passes only when the two `Arc<[i64]>` axes are equal (or one is
empty). Before this PR, two IMUs that shared an effective period shared an identical
`t_us` (both `t0 + slot × period`, from the same `t0`), so `[IMU1_AccelZ] - [IMU2_AccelZ]`
evaluated. Now each IMU anchors on its own first corrected stamp, so the arrays differ and
the same expression is a typed error.

**Failure scenario:** a workbook that differenced or summed two IMUs and survived the
previous build stops evaluating after the library rebuild, with `resample()`
unimplemented (finding 3) leaving no workaround.

**Severity note:** narrow — it only ever worked when the two IMUs' effective periods
rounded to the same integer µs, and `nominal_rate_hz` (`core/src/parse/v3.rs:291`, `1e6 /
effective_period_us[i]`) already differed in the general case. It is also arguably the
*correct* new behaviour: the two streams genuinely are not sample-aligned. Worth an
explicit ruling rather than a silent regression, and worth a line in CHANGELOG.

**Suggested fix:** one sentence in the CHANGELOG P0-1 entry saying cross-IMU element-wise
expressions now require a resample, so the behaviour change is recorded rather than
discovered.

### 6. MEDIUM (CI) — neither PR has a green pre-merge gate, and the crates CI will run post-merge were never run

**Repo/where:** both.

**Facts, verified:**
- idl-rs's own `rust` workflow has failed on **every** main push since at least
  2026-09-13 (runs 34767007998 … 34894374805). The failure is infrastructural, not this
  PR: `error: failed to join paths from $LD_LIBRARY_PATH together … "/home/runner/work/
  idl-rs/idl-rs/C:/Users/isaac/Documents/Saucy/saucyeng/.cargo-shared-target/debug/deps"`
  — the committed `rust/.cargo/config.toml` pins a Windows `target-dir`. The app repo's
  `ci.yml` works around it (`CARGO_TARGET_DIR: ${{ github.workspace }}/rust/target`,
  `.github/workflows/ci.yml:17-20`); idl-rs's own workflow does not. So idl-rs #1's two
  red `test` checks are pre-existing and tell you nothing about this diff.
- The `cla` check is red because the action cannot find branch `cla-signatures`, not
  because of the committer — every commit in both PRs is `isaacallen73
  <isaacallen73@gmail.com>`, which is on the action's allowlist. Also pre-existing.
- idl1-app #1 has **zero** checks: `.github/workflows/ci.yml` triggers on `push` to `main`
  and `workflow_dispatch` only, never on `pull_request`.
- The app's post-merge CI additionally runs `cargo test -p idl-rs-tauri`, `cargo test -p
  idl-transport`, the three generated-artefact diff gates, `cargo check -p app`, `tsc`,
  `madge --circular` and `vitest`. The lane ran only `cargo test -p idl-rs -p idl-rs-cli`
  (correct per CLAUDE.md §8's lane gate, but not what CI runs).

**Failure scenario:** the first real gate on this work is a red main. The specific risk is
`-p idl-rs-tauri`: 20-odd tauri tests build fixtures through `write_session_parquet(root,
&session, "0.1.0")`. I checked each consumer — none of them asserts importer-version
staleness (tauri's staleness tests are about the *track* hash,
`tauri/src/commands/catalog.rs:680`, and `library.rs:397` compares against the constant,
not a literal), so the version bump should be safe. The residual risk is any tauri test
that asserts IMU `t` values from a parsed `.idl0` fixture; fixtures build their own stamp
sequences and uniformly-spaced ones are unaffected, but I could not enumerate every one
without building.

**Suggested fix:** before pushing main, run `cargo test -p idl-rs-tauri --
--test-threads=4` and `cargo test -p idl-transport -- --test-threads=4` once (two cargo
processes max, ≥ 6 GB commit free — tauri builds the heavy tree). Separately, worth a
ruling: idl-rs's own workflow should set `CARGO_TARGET_DIR` the way the app's does, so
that repo's CI stops being permanently red and PR checks there mean something again.

### 7. LOW — `core_fn` is now a prose sentence rather than a symbol path

**Repo/where:** idl-rs `core/src/commands/table.rs:496`; generated into idl1-app
`docs/CLI-REFERENCE.md:127` and `app/src/shell/cliTable.json:330`.

**Defect:** the field becomes `"store::import::import_idl0_path (.idl0) or
import_file_path (.fit/.gpx/.csv)"`, which the markdown generator renders inside
backticks as ``Calls `store::import::import_idl0_path (.idl0) or import_file_path
(.fit/.gpx/.csv)`;`` — a code span that is not code. The TS mirror
(`app/src/shell/cliTable.ts:65`) types it as a bare `string` and nothing parses it, and
the only assertion is `!row.core_fn.is_empty()` (`table.rs:1142`), so **this does not
break CI**; both generated artefacts are regenerated in the same commit and will match.

**Failure scenario:** cosmetic today; it matters the first time anything tries to resolve
`core_fn` to a symbol (a docs linter, a "jump to implementation" affordance).

**Suggested fix:** keep `core_fn: "store::import::import_idl0_path"` and put the routing
note in the row's `help` or the arg help, then regenerate both artefacts again.

### 8. LOW — the spec says "Nothing here is implemented" in the PR that implements three of its items

**Repo/where:** idl1-app,
`docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md:3` — "**Status:**
draft for the lead to rule on. Nothing here is implemented."

**Defect:** P0-1, P0-3 and P2-1 are implemented by the paired engine PR and marked `[x]`
in the same commit's `TASKS.md:58-62`. The PR body says "most of it is unimplemented on
purpose", which is the accurate statement.

**Suggested fix:** one line — "**Status:** draft for the lead to rule on. P0-1, P0-3 and
P2-1 are implemented (see …/idl-rs#1); everything else is unimplemented on purpose."

### 9. LOW — two CHANGELOG entries carry `[docs]` but changed no user-facing documentation

**Repo/where:** idl1-app, `CHANGELOG.md` — the P0-1 entry (line 9 of the diff hunk) and
the P0-3 entry both open with `[docs]`.

**Defect:** R222 item 5 makes the first tag say whether the entry changed user-facing
documentation. Only P2-1 did (it regenerated `docs/CLI-REFERENCE.md`). No doc file changed
for P0-1 or P0-3.

**Suggested fix:** retag both `[no-docs]`. Alternatively, if the lead takes finding 3,
P0-3 *should* touch `docs/reference-src/20-windows-and-laps.md:48`, in which case `[docs]`
becomes true — but then the doc edit has to be in the commit.

---

## Merge order and CI risk

1. **idl-rs #1 first.** Its base (`cd98d05`) is exactly current idl-rs main, and GitHub
   reports `MERGEABLE`; there are no conflicts and no staleness. Its two red checks are
   pre-existing infrastructure failures (finding 6), not signal.
2. **Re-cut the submodule pointer before merging idl1-app #1.** The app PR pins
   `rust` at `68002db` — byte-for-byte the idl-rs PR head, which is correct *today*. But
   if idl-rs #1 lands as a merge commit, main's tip becomes a new SHA and the app would
   pin a commit that is an ancestor of main rather than main itself, which breaks the
   "submodule first, then bump" convention the next lane relies on. Either merge idl-rs #1
   fast-forward (the branch is directly ahead of main, so this is available), or amend the
   app branch's submodule pointer to idl-rs main's new head and force-push the lane branch
   before merging.
3. **idl1-app #1 second.** Its base (`eef680d`) is exactly current app main,
   `mergeStateStatus: CLEAN`.
4. **After both land:** `idl-rs library stale` then `idl-rs library rebuild`, with the app
   closed, after the one-session size/read measurement in finding 4.

**Generated-artefact gates:** clean. `docs/CLI-REFERENCE.md` and
`app/src/shell/cliTable.json` are regenerated in the same commit and their single changed
line matches `table.rs`'s change exactly. `docs/WORKBOOK-REFERENCE.md` needs no
regeneration — no builtin catalog entry changed (the `where(cond, t, f)` entry at
`docs/WORKBOOK-REFERENCE.md:1035` describes only the per-sample choice, not rate rules).
`app/src/ipc/golden/*` needs none — no wire encoder changed. No new CLI verb, so
`VERBS_RULED` needs no new R-number (this is an existing row's `core_fn`, not a new verb).
No TypeScript module changed, so no madge/vitest exposure. No new crate dependency. No
workbook-save-hash test touched.

**Residual CI risk on merge, ranked:** (a) `cargo test -p idl-rs-tauri` was never run by
the lane and CI runs it; (b) `cargo test -p idl-transport` likewise (no plausible
coupling, but unrun); (c) nothing else.

## Verified correct (checked, no finding)

- `slot_times_from_corrected`'s length arithmetic: it emits `leading + corrected.len() +
  Σmissing` slots = `occupied[i]`, then pads to `target_len`; since `target_len =
  max(occupied)` (`records.rs:581`) it can never overrun, and the result always matches
  `rebuild_i16`'s length and `rebuild_i64_grid_or_real`'s length.
- Its gap walk matches `rebuild_i16`'s (`records.rs:435-455`) and `build_spans`'s
  (`records.rs:469-490`) slot convention exactly — `gaps_received[gi].0 == k` means
  `missing` fills immediately *before* received sample `k`, and the new function consumes
  the ascending list with the same single cursor.
- Interior interpolation is `t0 + (t1−t0)·j/(missing+1)` rounded to µs, strictly between
  its neighbours; the final pass enforces C1 §3.5 invariant 1 and the `+1 µs` reading of
  "clamp" is the only reading consistent with *strictly* increasing.
- The P0-3 refactor is behaviour-preserving for `elemwise`: `require_same_shape` is the
  three removed checks, in the same order (axis before rate, so a `[lap]` × `[t]` pair
  still gets the axis error rather than the misleading "0 Hz vs 100 Hz"), with the same
  message strings.
- `where`'s new check skips scalar branches, so `where(cond, [ch], 0)` at a single rate is
  unaffected.
- P2-1's routing is right: `import_file`'s own doc (`core/src/store/import.rs:332-336`)
  says `.idl0` "stays `import_idl0`'s own entry point, called separately by whoever routes
  `.idl0` files", and the verb has no `--importer` override that the `extension == "idl0"`
  branch could shadow (`cli/src/verbs/session.rs:177-198`).
- The `catalog_read` test-helper fix is correct and necessary: `list_stale_sessions`
  (`core/src/store/catalog_read.rs:316-341`) compares the stored string to
  `current_importer_version`, so the literal `"0.1.0"` would have made
  `list_stale_sessions_a_row_stamped_with_the_running_version_is_not_listed`
  (`catalog_read.rs:693`) fail on the bump for the wrong reason.
- Tests: all seven new ones are Arrange/Act/Assert with blank lines and
  `thing — condition — result` names; the existing-behaviour regression
  (`imu_slot_time_gap_free_constant_rate_stream_is_the_uniform_grid`) and the unchanged
  `plan_reconciles_single_imu_axis_onto_grid` together pin the no-drift case.
- Doc comments: both new private functions carry full doc comments with units (`µs`) and
  contract citations; `IDL0_IMPORTER_VERSION`'s doc records the bump and its consequence.
- Repo hygiene: no `cargo fmt` churn (the diffs are surgical and match surrounding style),
  no AI attribution trailers in any of the six commit messages, lane touched only `core`,
  `cli` and the app's paperwork.
