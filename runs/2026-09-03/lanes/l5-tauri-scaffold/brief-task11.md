# L5 Task 11 — implementer brief (workbook commands + full `watch_workbook` wiring, C3 §3.4)

You are the implementer for L5 Task 11 — the workbook command group over L3's
landed v3 parser/evaluator, plus the first real consumer of Task 3's file
watcher. TDD, two commits (rust worktree, then app worktree), then report.

**Task 9 (import commands, L2) is deferred with L2 and does not exist.** Nothing in this task
depends on it: workbooks are plain files under `<data>/workbooks/`, created by this task's own
tests and by hand. Sessions, where a bound session is needed, are produced by the CLI
(`idl-rs import --data-dir <data> <file>.idl0`, `cli/src/main.rs:268-276`) or directly by
`idl_rs::store::import::import_idl0` (`core/src/store/import.rs:177`) — not by an IPC command.

## Where
- **Rust worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`,
  branch `wave1-l5-tauri`, HEAD = the commit of Task 8 (given in the dispatch message), status
  clean. Verify first; if not, stop and report. The branch has already been caught up to idl-rs
  `main` (`e0440bb`, L1+L3 landed) by the lead. Leave `.cargo/config.toml` alone.
- **App worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`.
  After committing in the rust worktree, sync the submodule pointer:
  `git -C rust fetch local-wave1 wave1-l5-tauri && git -C rust checkout <new sha>`, then `git add rust`.
- Work ONLY in those two worktrees. Do NOT touch the shared checkouts beyond READING. Do NOT
  edit anything under `docs/`. Do NOT push.
- **Read first:** `CLAUDE.md`; the L5 plan `docs\superpowers\plans\2026-09-03-idl1-wave1-l5-tauri-scaffold.md`
  — Global Constraints (49–81), `### Task 11` (1550–1625), Open questions 5 (1857–1863);
  C3 §1, §2, §3.4 (spec 456–563), §4; C2 `…-c2-workbook-v3.md` §2 (cells/ids), §3.5 (error
  kinds), §5.1 (host variables); C4 §2 (workbook path), §4 (atomic write + expected-hash
  ordering, spec 197–243); this lane's `questions.md` **Q1, Q2, Q3, Q6** and the lead's answers;
  ledger `runs\2026-09-03\decisions.md` — R21, R22, R30 (migration cut), R37, and the "L3 LANDED"
  entry.

## COMPUTE RULES — non-negotiable
One cargo process at a time, foreground; never pass `-j`; jobs are capped machine-wide
(CLAUDE.md §8, R13). Run **only**:
- `cargo test -p idl-rs-tauri workbook` — must report a non-zero `passed` count
- `cargo check -p idl-rs-cli --tests` — **required**: Step 1 adds `pub` API to `core`
- app worktree: `npm test` and `npx tsc --noEmit` (Step 5 only)

No full suite, no `--workspace`, no `cargo fmt`, no tarpaulin, no `cargo doc`, no flakiness
reruns. If `watcher::…never_fires_callback` or `store::atomic::…outlasts_the_retry_window`
fails, rerun that test alone by name once and say so.

## Verified facts about the landed code (read, not assumed)
Read at idl-rs `main` = `e0440bb`.

1. **`parse_workbook(markdown) -> Result<(WorkbookDoc, Vec<WorkbookError>), Vec<WorkbookError>>`**
   — `core/src/workbook/v3/mod.rs:138`. `Err` **only** for front-matter-fatal problems
   (`MissingFrontMatterId`, which also covers unparseable YAML, and
   `UnsupportedWorkbookVersion` — `mod.rs:112-130` doc comment, `:139-145` body). Every other
   structural problem rides in the `Ok` tuple's `Vec<WorkbookError>`. `WorkbookDoc`'s fields are
   at `mod.rs:80-112` (`id`, `name`, `cells`, `constants`, `defs`, `const_lines`, …).
2. **`eval_cells(doc, structural, lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) ->
   Vec<CellEvalResult>`** — `core/src/workbook/v3/eval.rs:95-101`. `CellEvalResult`
   (`eval.rs:60-85`) = `{ cell_id, kind: CellKindToken, defs: Vec<CellDefResult>, errors:
   Vec<CellError> }`. `CellDefResult` (`eval.rs:26-42`) = `{ name, label: Option<String>, value:
   Option<HostChannel>, error: Option<MathEvalError> }`. `CellError` (`eval.rs:53-58`) is
   `Structural(WorkbookError)` | `Eval(MathEvalError)`.
   **A `table` cell's success value is NOT in `CellEvalResult`** — `eval.rs:70-77` says so
   explicitly: read `CellDoc.table` plus `idl_rs::table::eval::evaluate_table`'s grid. C3 §3.4
   (spec 495–502) requires `{ model, results }` for a table cell's `value`; wiring that is this
   task's job, not core's.
3. **Error enums.** `MathEvalErrorKind` (`core/src/math/error.rs:10-29`) has exactly the nine
   variants C3 §2's `math_*` rows name. `WorkbookErrorKind` (`core/src/workbook/v3/error.rs:15-47`)
   has **eight**: `DuplicateCellId`, `DuplicateDefinition`, `DuplicateConstant`,
   `InvalidIdentifier`, `ReservedName`, `MissingFrontMatterId`, `UnsupportedWorkbookVersion`,
   `InvalidTableJson`. C3 §2 additionally lists `workbook_invalid_front_matter` and
   `workbook_invalid_cell_id` — **those two have no source variant in landed code** (parse folds
   them into `MissingFrontMatterId` and `InvalidIdentifier` respectively). Do not invent them;
   see "The task" below.
4. **`SessionHandle` implements `ChannelLookup`** — `core/src/session/handle.rs:952-1000`. The
   only constructors are `from_bytes` (`:210`), `from_path` (`:237`) and `from_channels`
   (`:243-280`); `from_channels` hard-codes `source_format = Gpx` and blanks `blob_sha256` and
   every channel's `unit`. There is **no** `from_session`. `MathLapContext::empty()` exists at
   `core/src/math/eval.rs:202-209`.
5. **Stored sessions.** `store::parquet::read_session_parquet(path) -> Result<Session, _>`
   (`parquet.rs:403`) does **not** reconstruct `Time`/`Distance`; its doc comment (`:397-401`)
   says `crate::session::synthesis::synthesize_base_channels` must run after it.
   `session.json` (for lap context) is read by `store::session_json::read_session_json`
   (`session_json.rs:254`); `SessionJson.laps: Vec<LapJson>` (`:68`), with
   `start_time_secs`/`end_time_secs` per lap (C3 §3.2's `LapDetail`).
6. **Atomic writes.** `store::atomic::write_atomic(data_root, target, bytes, based_on_hash:
   Option<&str>) -> Result<String /* new hash, hex */, AtomicWriteError>`
   (`atomic.rs:80`); `sha256_hex(bytes)` at `:54`. `based_on_hash = None` against an **existing**
   target is a `RenameConflict` error, not a skip (`atomic.rs:108-114`) — read that block before
   writing Step 2. `write_atomic_with_retry` (`:147`) adds C4 §4's bounded retry with a
   caller-supplied `rederive`.
7. **The watcher exists and is unwired.** `tauri/src/watcher.rs`: `ExpectedHashSet`
   (`:22-54`, `expect(path, sha256_hex)` at `:32`, `check_and_consume` at `:45` — note it does
   **not** remove on match, only on TTL expiry, and the doc comment at `:36-44` explains why),
   `WorkbookWatcher::new(workbooks_dir, hashes: Arc<ExpectedHashSet>, on_external_change: impl
   Fn(&Path) + Send + Sync + 'static)` (`:77-81`), non-recursive, ~100 ms debounce. Core's
   `write_atomic` knows nothing about `ExpectedHashSet` — **the L5 caller must call
   `hashes.expect(...)` before `write_atomic`**, which is C4 §4 step 3's load-bearing ordering.
8. **Nothing manages an `ExpectedHashSet` today.** `app/src-tauri/src/lib.rs:22` manages only
   `DataDir`. `tauri/src/state.rs` has only `DataDir` (`:8`).
9. **`app/src/ipc/workbook.ts` is stale against the signed C3.** It declares
   `kind: "math" | "table" | "js" | "prose"` (line 35) and a singular `error: IpcError | null`
   (line 39); C3 §3.4 as amended (R21/R22) drops `"prose"`, makes it `errors: IpcError[]`, and
   adds `defs: CellDefResult[]` with `value: HostChannelRef | null`.

## The task

### Step 1: session loading, shared by Tasks 11–14 (TDD)
**PROVISIONAL (Q1b).** Add to core, in `core/src/session/handle.rs`, next to the existing
constructors:
```rust
/// Builds a handle around an already-parsed `Session` — the read-back path
/// (`store::parquet::read_session_parquet`), which `from_channels` cannot
/// serve without losing `source_format`, `blob_sha256` and every channel's
/// `unit`. Runs `synthesize_base_channels` exactly as the other
/// constructors do.
pub fn from_session(session: Session) -> Self
```
If the lead answered Q1b "no", stop and report before writing it.

Then, new file `rust/tauri/src/session_source.rs`:
- `pub fn session_dir(data_dir: &Path, session_id: &str) -> PathBuf` — `<data>/sessions/<id>` (C4 §2).
- `pub fn load_session(data_dir: &Path, session_id: &str) -> Result<idl_rs::session::Session, IpcError>`
  — missing directory or `data.parquet` → `IpcErrorKind::NotFound` with the id in the message;
  a parquet read failure → `Io`; anything else → `Internal`. Calls `synthesize_base_channels`
  before returning (fact 5).
- `pub fn load_session_handle(data_dir: &Path, session_id: &str) -> Result<SessionHandle, IpcError>`
  — `load_session` + `SessionHandle::from_session`.
- `pub fn load_lap_context(data_dir: &Path, session_id: &str) -> MathLapContext` — from
  `session.json`'s `laps[]` (`start_time_secs`/`end_time_secs` → `main_lap_bounds`,
  `main_lap_number`); `MathLapContext::empty()` when `session.json` is absent or unreadable
  (a missing lap table is not an error — C2 §3.5.B's `NoLapContext` is the evaluator's answer).
Add a `// TODO(idl0):` on `load_session`: every call re-reads the whole `data.parquet`; a session
cache is design §4's recorded deferral, not this task's.

Tests: `load_session — unknown id — not_found`; `load_session — seeded session — channels and
units survive the round trip`; `load_lap_context — session.json with two laps — two bounds`;
`load_lap_context — no session.json — empty context`.

### Step 2: `open_workbook` and `save_workbook`
New file `rust/tauri/src/commands/workbook.rs`. Follow `commands/device.rs`'s idiom: a
`_via`-suffixed plain function taking `data_dir: &Path` holds the logic and is what the tests
call; the `#[tauri::command]` is a one-line wrapper taking `tauri::State<'_, DataDir>` last.

**Workbook id → path.** C3 §3.4's argument is `id_or_path`. Resolve in this order, and document
it: (1) if the string is an existing file path, use it; (2) otherwise scan
`<data>/workbooks/*.idl1wb`, parse each file's front matter
(`idl_rs::workbook::v3::front_matter::parse_front_matter`, `front_matter.rs:172`) and match
`id`; (3) otherwise `not_found`. **Do not consult the catalog** — C4 §5: the catalog is an index,
never read for truth. Add a `// TODO(idl0):` that the scan is O(workbooks) per call.

`open_workbook` returns C3's `WorkbookHandle { id, name, path, cell_count }` — `cell_count` is
`doc.cells.len()`. `parse_workbook`'s `Err` arm maps to `workbook_missing_front_matter_id` /
`workbook_unsupported_version` per fact 3; the collected `Ok` errors are **ignored here** (they
are per-cell and surface in `eval_workbook`).

`save_workbook` — **PROVISIONAL (Q6).** Signature
`save_workbook(id: String, markdown: String, based_on_hash: Option<String>)`. Order of
operations, which is the point of this step:
1. Resolve the target path (a `None` `based_on_hash` means "new workbook"; the target must not
   already exist).
2. Parse `markdown` with `parse_workbook`; an `Err` is `invalid_argument` (C3 §3.4) — nothing is
   written.
3. `let hash = idl_rs::store::atomic::sha256_hex(markdown.as_bytes());`
4. `hashes.expect(target.clone(), hash.clone());` — **before** the write (C4 §4 step 3, fact 7).
5. `write_atomic(data_dir, &target, markdown.as_bytes(), based_on_hash.as_deref())`.
6. Return `SaveResult { hash, saved_utc_ms }` (`saved_utc_ms` = wall clock at return,
   `SystemTime::now()` epoch ms).
Map `AtomicWriteErrorKind::RenameConflict` → `invalid_argument` with
`detail { "expected": <based_on_hash>, "found": <the error's message> }`; I/O variants → `io`.

Tests: `open_workbook — a file with front matter and two cells — handle carries id, name and
cell_count 2`; `open_workbook — id that matches no file — not_found`; `open_workbook — front
matter without an id — workbook_missing_front_matter_id`; `save_workbook — new workbook — file
written and hash matches the bytes`; `save_workbook — based_on_hash matching the file on disk —
succeeds and the expected-hash set holds the new hash before the write`; `save_workbook —
based_on_hash stale — invalid_argument, file on disk unchanged`; `save_workbook — markdown whose
front matter does not parse — invalid_argument, nothing written`.

### Step 3: `eval_workbook`
**PROVISIONAL (Q2, Q3).** Signature `eval_workbook(id: String, session_id: Option<String>)`.
- `session_id = Some(s)`: `load_session_handle` + `load_lap_context` from Step 1. Unknown session
  → `not_found` (a bound session that does not exist is a caller error, not a per-cell one).
- `session_id = None`: an empty `SessionHandle` (`from_channels` with no channels) and
  `MathLapContext::empty()`, so every `[Channel]` reference surfaces per-cell as
  `math_unknown_channel`. Document that this is the "no session bound" case, not an error.
- `parse_workbook` → `Err` arm rejects the command with the matching `workbook_*` kind (C3 §3.4,
  spec 504–515); the `Ok` arm's `Vec<WorkbookError>` is passed to `eval_cells` as `structural`.
- Map each `CellEvalResult` to C3's `CellOutput { cell_id, kind, value, defs, errors }`:
  - `kind`: `"math" | "table" | "js"` — never `"prose"` (R21).
  - `defs`: one entry per `CellDefResult`, `value` = **`HostChannelRef { length, has_t }`**
    (`length = HostChannel.length`, `has_t = !HostChannel.t.is_empty()`), `error` = the
    `math_*`-mapped `IpcError`. **Do not serialize `HostChannel.t`/`.v` as JSON** — C3 §3.4's
    host-channel note and CLAUDE.md §2 both forbid it. Per Q3 the byte path is deferred to
    wave 2; leave a `// TODO(idl0):` on `HostChannelRef` naming it.
  - `errors`: every `CellError` mapped to an `IpcError` (`Structural` → `workbook_*`, `Eval` →
    `math_*`). **Plural, always present, `[]` on success** (R22).
  - `value`: `null` for `math` and `js` cells (their results live in `defs`); for a `table` cell,
    `{ model, results }` per C3 §3.4 (spec 495–502) — `model` from `CellDoc.table`
    (`core/src/workbook/v3/cell.rs:59`, `Option<TableModel>`), `results` from
    `idl_rs::table::eval::evaluate_table(handle: &SessionHandle, table: &TableModel,
    row_windows: &[Option<(f64, f64)>]) -> Vec<Vec<CellResult>>` (`core/src/table/eval.rs:206-213`).
    `row_windows` is `vec![None; table.rows.len()]` in wave 1 — C2 §4's per-row
    `context {sessionId, lapIndex}` binding has no C3 argument to carry it, so a `// TODO(idl0):`
    records that rows are evaluated over the whole session. With no session bound
    (`session_id = None`) a table cell's `value` is `null` and the cell carries no error: there is
    nothing to evaluate against. Never ship `value: null` for a *successfully evaluated* table
    cell — that is the exact gap C3's `{ model, results }` shape closed.
- A per-cell failure never rejects the command (C3 §3.4). Get this distinction right; it is the
  one place C3 gives CLAUDE.md §5's "don't block other channels" rule command-level shape.

`error.rs` gains: the nine `math_*` variants (one per `MathEvalErrorKind`), the eight
`workbook_*` variants that `WorkbookErrorKind` actually has (fact 3), `impl
From<MathEvalError> for IpcError` and `impl From<&WorkbookError> for IpcError`. **Do not add
`workbook_invalid_front_matter` or `workbook_invalid_cell_id`** — no landed variant produces
them; report the C3-§2-vs-code discrepancy in your report instead.

Tests: `eval_workbook — a math cell over a bound session — def value is a HostChannelRef with the
channel's length`; `eval_workbook — a math cell referencing an unknown channel — command
succeeds, that def carries math_unknown_channel`; `eval_workbook — duplicate definitions — both
cells returned, the offending cell carries workbook_duplicate_definition in errors`;
`eval_workbook — no session bound — every channel ref is math_unknown_channel, command still
succeeds`; `eval_workbook — front matter version 2 — command rejects with
workbook_unsupported_version`; `eval_workbook — a table cell — value carries model and results`.

### Step 4: `watch_workbook`
`state.rs` gains two managed types, both registered in `app/src-tauri/src/lib.rs`'s `.setup()`
beside the existing `DataDir` (`lib.rs:22`):
```rust
pub struct Hashes(pub Arc<crate::watcher::ExpectedHashSet>);
/// Live `watch_workbook` subscriptions, keyed by workbook id. Dropping the
/// entry stops the watcher.
pub struct Watchers(pub Mutex<HashMap<String, crate::watcher::WorkbookWatcher>>);
```
Step 2's `save_workbook` takes `hashes: tauri::State<'_, Hashes>` so self-writes are suppressed.

`watch_workbook(id: String, channel: tauri::ipc::Channel<WorkbookEvent>)`:
resolve `id` to a path (Step 2's resolver; `not_found` if absent), keep the parse of the current
content as the baseline, start a `WorkbookWatcher` on `<data>/workbooks`, and in the callback:
ignore paths other than this workbook's; re-read and re-`parse_workbook` the file; diff cell ids
against the baseline; `channel.send(WorkbookEvent { kind: "changed", cell_ids })`. Update the
baseline after each event.

**Cell diff — decided here, since L3 shipped no diff function** (grep `core/src/workbook/v3`
for `diff`: no hits): `cell_ids` = every id whose `CellDoc.raw_fence_body` changed, plus every id
present in exactly one of the two parses (added or removed). Ids are stable across an edit
because C2 §2.2 puts them in the fence string. Document this rule on the function.

**Watcher lifetime — decided here** (plan Open question 5 assigns it to this implementer): the
`WorkbookWatcher` is parked in `Watchers` keyed by workbook id, for the app's lifetime.
Re-subscribing to the same id **replaces** the previous entry (dropping it stops that watcher),
so a frontend remount cannot leak watchers. Tauri v2 gives no channel-close signal this task can
observe, so there is no unsubscribe command in wave 1 — state that in a `// TODO(idl0):` and in
the CHANGELOG entry, rather than pretending C3's "unsubscribe is closing the channel" is
implemented.

Tests (call the `_via` helper with a plain `Fn(WorkbookEvent)` callback instead of a
`tauri::ipc::Channel`, which cannot be constructed in a unit test): `watch_workbook — external
edit to a watched workbook — event names only the changed cell`; `watch_workbook — the app's own
save (hash pre-registered) — no event`; `watch_workbook — unknown id — not_found`. These are
timing tests on a real filesystem watcher — use the same `recv_timeout` shape as
`watcher.rs`'s existing tests, and if one proves flaky on Windows say so in the report rather
than loosening the assertion.

### Step 5: TS side — `app/src/ipc/workbook.ts`
Bring it to the signed C3 §3.4 (fact 9): drop `"prose"` from `CellOutput.kind`; replace
`error: IpcError | null` with `errors: IpcError[]`; add `defs: CellDefResult[]` and the
`CellDefResult`/`HostChannelRef` interfaces; add `sessionId` to `evalWorkbook`; add
`basedOnHash` to `saveWorkbook`. Update `workbook.test.ts` to the new shapes and add one test
per changed signature proving the `invoke()` argument object. Then `npm test && npx tsc --noEmit`.

### Step 6: CHANGELOG and commits
`CHANGELOG.md` (app worktree), `[Unreleased] / ### Added`:
`- **Workbook commands (C3 §3.4) over L3's v3 parser/evaluator.** open_workbook, eval_workbook (per-cell CellOutput, host channels as HostChannelRef markers only — the byte path is deferred to wave 2 with L6), save_workbook (C4 §4 expected-hash ordering + optimistic based_on_hash), watch_workbook (Task 3's watcher + a cell-body diff). No unsubscribe in wave 1.`

Commits, explicit paths, no AI attribution trailer:
```bash
# rust worktree
git add core/src/session/handle.rs tauri/src/session_source.rs tauri/src/commands/workbook.rs \
        tauri/src/commands/mod.rs tauri/src/state.rs tauri/src/error.rs tauri/src/lib.rs
git commit -m "tauri: workbook commands (C3 3.4) and watch_workbook wiring over L3's v3 pipeline"
# app worktree, after syncing the submodule pointer
git add rust app/src/ipc/workbook.ts app/src/ipc/workbook.test.ts app/src-tauri/src/lib.rs CHANGELOG.md
git commit -m "app: workbook IPC module updated to signed C3 3.4; manage watcher state"
```

## Do not
- Do not serialize `HostChannel.t`/`.v` into `CellOutput` JSON (C3 §3.4, CLAUDE.md §2).
- Do not design the host-channel binary layout this wave (Q3 — deferred, with a TODO).
- Do not let a per-cell `math_*`/`workbook_*` error reject `eval_workbook` (C3 §3.4).
- Do not call `write_atomic` before `hashes.expect(...)` — the ordering is load-bearing (C4 §4 step 3).
- Do not pass `based_on_hash = None` for an existing workbook: `atomic.rs:108-114` errors, and
  ledger R16 already ruled on this bug class.
- Do not read the catalog to resolve a workbook id (C4 §5).
- Do not add `workbook_invalid_front_matter`/`workbook_invalid_cell_id` kinds (fact 3).
- Do not implement `migrate_workbook` or anything from C2 §6 — cut by ruling R30.
- Do not run the full suite, `--workspace`, or `cargo fmt`.

## Style / hygiene
Doc comment on every public symbol; units on every numeric (`_us` µs, `_ms` ms, `t` in
`HostChannel` is seconds); `// TODO(idl0):` never bare `// TODO`; typed errors only; A/A/A tests
named `thing — condition — result`; match idl-rs's hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" **by this task** — the two signature changes it implements
(`eval_workbook`'s `session_id`, `save_workbook`'s `based_on_hash`) are lead rulings on Q2/Q6,
and the lead lands the C3 §3.4 text. Do not edit any file under `docs/`.

## Report back (concise)
Both commit hashes + `git show --stat`; every gate command with its result line and `passed`
count; per-step done/deviated; the exact `CellOutput` JSON your `eval_workbook` test asserts;
confirmation no `HostChannel` array crosses as JSON; the watcher-lifetime decision as
implemented; the C3 §2 vs `WorkbookErrorKind` discrepancy (two kinds with no source); any
flakiness observed in the Step 4 timing tests; anything ambiguous you resolved (say how) or that
needs a lead ruling — stop and report rather than guess (CLAUDE.md §1).
