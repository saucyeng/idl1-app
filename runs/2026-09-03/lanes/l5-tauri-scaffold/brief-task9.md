# L5 Task 9 — implementer brief (Import commands, C3 §3.3 — rides with L2)

You are the implementer for L5 Task 9: the `import_file`/`list_importers`
Tauri commands, deferred from L5's own landing (ledger R50: "Task 9 (import
commands) deferred with L2 on Isaac's prioritisation") and now dispatched
once L2's core importer work is far enough along to build on. TDD, ONE
commit, then report.

## GATE — verify before starting

Needs L2 **Tasks 6 and 7** landed as commits: Task 6 ships
`store::import::import_file`/`import_idl0` returning the same
`ImportReport`/`ImportError` pair this task consumes for every source;
Task 7 ships `core::import::importers()`, the registry this task's
`list_importers` wraps and validates `importer_id` against. As of this
brief's writing (2026-09-05), **neither exists** — the worktree's HEAD is
`275267e` (Task 3's own review follow-ups), with Task 5 (CSV) uncommitted
and Tasks 6–7 not started. **Do not dispatch this task until both land** —
verify with:
```bash
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers
git log --oneline -8
git status --short
```
If Tasks 6/7 are not both present as clean commits, STOP and report.

## Where — OPEN QUESTION, flagged not decided

The L5 plan's own Task 9 text gives no worktree (`rust/tauri/src/commands/
import.rs` is a new file; `rust/tauri/src/lib.rs`/`error.rs` are modified —
all three live in the same Cargo workspace as L2's `core` crate). **This
brief recommends running Task 9 in the same worktree as L2**
(`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
branch `wave1-l2-importers`, starting from L2 Task 7's own commit) rather
than opening a fresh `idl-rs-tauri`-scoped worktree, because: (a) this task
needs L2 Tasks 6/7's exact landed signatures to compile against, which a
separate worktree would need merged in first anyway; (b) `idl-rs-tauri` and
`idl-rs` (core) are one Cargo workspace, one repo — there is no
cross-repo boundary to protect by separating worktrees, unlike the
idl1-app/idl-rs split; (c) L5's own prior tasks (1–8, 10–14) all landed
inside this same repo's `main`, and this task is explicitly "rides with
L2," i.e. merges as part of the same branch. **This is a judgment call, not
a ruling — confirm with the lead before dispatch**, or dispatch with this
recommendation and have the implementer stop if the worktree turns out
wrong for a reason not visible from this brief (e.g. a separate L5
worktree the lead already has open with uncommitted L5-only state).

- Work ONLY in the confirmed worktree. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`) beyond READING
  `app/src/ipc/import.ts`/`import.test.ts` and the Data tab call site named
  below. Do NOT edit `docs/`. Do NOT push. Do NOT add
  `@tauri-apps/plugin-dialog` or any `app/src-tauri` capability change —
  ledger ruling R55 already decided the file-picker stays a pasted-path
  seam for wave 2; this command's `path: String` argument is exactly that
  seam's output, nothing more is needed here.

- **Files:**
  - Create: `rust/tauri/src/commands/import.rs`
  - Modify: `rust/tauri/src/commands/mod.rs` (add `pub mod import;`),
    `rust/tauri/src/lib.rs` (register both commands in `handler!`),
    `rust/tauri/src/error.rs` (new `IpcErrorKind` variants + one `From`
    impl — see the Ruling below; **do not** add `impl From<idl_rs::session::
    ParseError> for IpcError` as the L5 plan's own File Structure text
    literally suggests — see "Deviation from the plan" below).

- Read first: `CLAUDE.md`; ledger **R50** ("L5's TASKS.md line is not
  ticked") and **R51** ("L2 briefs refreshed... five questions ruled") in
  `runs/2026-09-03/decisions.md` — R51's Q1 (core `import_file` stays
  extension-keyed, refuses `"idl0"`; this task does the `importer_id` →
  extension mapping and the `.idl0` branch), Q2 (the registry table's
  shape and its deliberate exclusion of `"idl0"`), Q4 (this task calls
  `rebuild_catalog` then reads the row back — see the Ruling below, which
  corrects Q4's own recommended function name); contract C3 §2 (lines
  141–187, the full kind table, plus the "Added post-sign... R7" note
  naming `ImporterError`'s seven `import_*` rows) and **§3.3** exactly
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  441–463 — `import_file`'s signature, its five named error kinds, and
  `ImporterInfo`'s three fields, with its own worked example `id` values
  including `"idl0"`); L2's `BRIEF.md`, `brief-task6.md` and (once it
  exists) `brief-task7.md`'s own report, in
  `runs/2026-09-03/lanes/l2-importers/`, for the exact landed shape of
  `store::import::{import_idl0, import_file, ImportReport, ImportError,
  ImportErrorKind}` and `core::import::{importers, ImporterInfo,
  importer_for_extension}` — **read the actual landed code, not just these
  briefs' descriptions of it**, since Task 6/7 may report a deviation;
  `rust/tauri/src/commands/catalog.rs` in full (the `SessionSummary`
  struct and its `From<catalog_read::SessionSummary>` impl — this task
  **reuses** that same `SessionSummary` type, does not redefine it; the
  `_via`-suffixed-function idiom this file and every other command module
  uses); `rust/tauri/src/commands/device.rs` lines ~82–91 (the `Progress`
  struct — this task **reuses** it too, see the Ruling below);
  `rust/tauri/src/error.rs` in full (the exact pattern for adding
  `IpcErrorKind` variants and a `From<CoreError> for IpcError` impl —
  follow `From<idl_rs::store::catalog::CatalogError>`'s shape most closely,
  since it is the most recent addition and already documents the
  fold/no-fold reasoning this task must repeat for `ImportErrorKind`);
  `rust/tauri/src/lib.rs` in full (the `handler!` registration list —
  eleven lines, alphabetical-ish by command group, add this task's two at
  the end); `app/src/ipc/import.ts` and `import.test.ts` in the shared
  checkout (already landed, already typed to C3 exactly — **must not
  change**; if anything in this brief seems to require changing it, STOP
  and report rather than editing it) and the Data tab's call site
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data\app\src\routes\pages\Data\importDriver.ts`
  (read-only, cross-worktree — confirms `path`/`importerId` are passed
  through verbatim from a queue item, and a thrown `IpcError`-shaped
  rejection is caught generically, not routed on a specific `kind` string
  today — so a new error kind this task adds will not silently break that
  call site, but say so in your report rather than assuming it).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). While working: `cargo test -p idl-rs-tauri import::` (this
crate has no existing `import` module, so this filter should start at
whatever this task adds — a `0 passed` here before you've written any test
is expected transiently, not a violation; after your own tests exist it
must be non-zero, standing rule). `cargo check -p idl-rs-tauri` once, at
the end, to confirm the whole crate still builds (budget several minutes
cold — the L2 four-task gate's own run of this exact check took 16
minutes). Do **not** run `cargo test -p idl-rs -p idl-rs-cli` (L2's own
merge gate, a different lane's task) or `cargo test --workspace`/a bare
`cargo test` (both denied by the §8 hook). Do **not** add a full
`idl-rs-tauri` suite re-run beyond your own targeted filter and the one
crate-wide `check` above — if you judge the existing `idl-rs-tauri` suite
needs re-proving given this change (e.g. `session_source.rs`'s
`synthesize_base_channels` reach, per L2's own Q3 discussion), say so in
your report; that is a merge-gate-level call for the lead, matching how
L2's own Task 6 was told not to add that run unilaterally. No `cargo fmt`,
no `-j`, no `.cargo/` edits. One cargo process at a time, foreground.

## Ruling — `import_file`'s importer resolution (R51 Q1)

Core's `store::import::import_file(data_root, extension, bytes)` refuses
`"idl0"` by design (L2-R13) — this command bridges C3 §3.3's
`importer_id: string | null` to that extension-keyed function **and**
branches to the separate `import_idl0` entry point:

```rust
fn resolve_extension(path: &str, importer_id: Option<&str>) -> Result<String, IpcError> {
    match importer_id {
        Some(id) => {
            // "idl0" plus every id core::import::importers() enumerates
            // (fit/gpx/csv, per L2 Task 7) are the only forceable ids —
            // forcing by id ignores the file's own actual extension
            // entirely (C3 §3.3: "force a specific importer"), which is
            // sound here because every id in this vocabulary is already
            // spelled identically to the extension `import_idl0`/
            // `store::import::import_file` expect ("fit", "gpx", "csv",
            // "idl0" — no id/extension pair in this table diverges).
            if id == "idl0" || idl_rs::import::importers().iter().any(|i| i.id == id) {
                Ok(id.to_string())
            } else {
                Err(IpcError::new(IpcErrorKind::InvalidArgument, format!("unrecognised importer_id '{id}'")))
            }
        }
        None => {
            let ext = std::path::Path::new(path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase());
            ext.ok_or_else(|| IpcError::new(
                IpcErrorKind::InvalidArgument,
                format!("'{path}' has no file extension to auto-detect an importer from"),
            ))
        }
    }
}
```

Then: `if ext == "idl0" { idl_rs::store::import::import_idl0(data_root, &bytes) } else { idl_rs::store::import::import_file(data_root, &ext, &bytes) }` —
both return the identical `Result<idl_rs::store::import::ImportReport,
idl_rs::store::import::ImportError>` type (Task 6 shipped `import_file`
specifically to share `import_idl0`'s tail), so the two branches converge
into one `Result` your `?`/`From` chain handles uniformly from that point
on.

## Ruling — `list_importers` (R51 Q2)

`core::import::importers()` deliberately excludes `"idl0"` (R51 Q1/Q2) —
this command adds that one row itself, matching C3 §3.3's own worked
example verbatim:

```rust
fn list_importers_via() -> Vec<ImporterInfo> {
    let mut out = vec![ImporterInfo {
        id: "idl0".to_string(),
        label: "IDL0 log".to_string(),
        extensions: vec![".idl0".to_string()],
    }];
    out.extend(idl_rs::import::importers().iter().map(ImporterInfo::from));
    out
}
```

**Leading-dot mismatch — resolved, not just noted.** Core's `ImporterInfo.
extensions` (L2 Task 7) is bare (`"gpx"`, no dot — matching
`importer_for_extension`'s own `ext` convention). C3 §3.3's own
`ImporterInfo.extensions` doc comment, and `app/src/ipc/import.ts`'s
identical copy of it, both give the worked example `[".idl0"]` — **with**
the dot. This command's own `From<&idl_rs::import::ImporterInfo> for
ImporterInfo` impl must prepend `.` to each of core's bare extensions when
building the wire type (`extensions: i.extensions.iter().map(|e|
format!(".{e}")).collect()`), matching the idl0 row above, which is
already dot-prefixed by hand. Getting this wrong (shipping `"gpx"` instead
of `".gpx"`) would silently break nothing today (no landed UI code
branches on `ImporterInfo.extensions`'s contents yet, per the Data tab
read above) but would contradict both the TS and Rust doc comments the
moment something does.

## Ruling — reading the file and mapping errors

**Progress.** `crate::commands::device::Progress { done, total, phase }`
already exists, same shape C3 §1 fixes for every streaming command — reuse
it (`use crate::commands::device::Progress;`), do not redefine an
identical struct in `import.rs`. This is a judgment call (nothing forces
reuse over a fresh identical type), made in the direction
`review-STANDING.md`'s own cross-task-consistency principle already argues
for at the `core` layer — say in your report if you diverged and why.
Phases, per C3 §3.3's own worked example: `"reading"` before
`std::fs::read`, `"decoding"` after the bytes are in hand and before the
importer call, `"materializing"` after a successful import and before the
catalog rebuild (matching `store::import`'s own hook-call step being named
"materialization" already, in the hook's own doc comment — this task does
not add a real hook, just a progress label at the analogous point).

**Reading the file.** `std::fs::read(path)` — map
`io::ErrorKind::NotFound` to `IpcErrorKind::NotFound` (C3 §3.3: "`not_found`
(path missing)"), everything else to `IpcErrorKind::Io`. This file lives
outside `<data>` (it is the user's own pasted path, per R55) — do not
resolve it against `data_dir`.

**`SessionSummary` after a successful import (R51 Q4, corrected).** R51's
own ledger text names `catalog_read::get_session` as the function to read
the row back — **this is wrong; do not call it.**
`catalog_read::get_session(data_root, session_id)` returns `SessionDetail`
(C3 §3.2's full per-session shape, sourced from `session.json` plus
`data.parquet`), never `SessionSummary` (the catalog-row shape `import_file`
must return per C3 §3.3). The function that actually returns
`SessionSummary` is `catalog_read::list_sessions(data_root) ->
Vec<SessionSummary>` (also used by `commands::catalog::list_sessions`).
After `catalog_read::rebuild_catalog_report(data_dir)?` (or equivalently
`idl_rs::store::catalog::rebuild_catalog` directly — both exist,
`rebuild_catalog_report` is a one-line pass-through; use whichever reads
more naturally alongside your other `catalog_read::` calls), find the
freshly-imported session in that list by `session_id` (from the
`ImportReport` you already have) and convert it via
`crate::commands::catalog::SessionSummary::from` — **reuse that struct and
its existing `From` impl, do not redefine `SessionSummary` in
`import.rs`**. If the id is somehow absent from the rebuilt list (should
not happen — the import just wrote it), return
`IpcErrorKind::Internal` naming the session id; that is a genuine bug
condition, not a caller error, so it is not `not_found`.

## OPEN QUESTION — flagged, not decided: where do `ImportReport`'s warnings go?

L2 Task 6 adds `pub import_warnings: Vec<String>` to `ImportReport`
(populated on both `import_idl0` and `import_file`) specifically so a
non-fatal recovery (a dropped duplicate GPX timestamp, an `.idl0` buffer
whose `ParseResult.import_warnings` carries a burst-seam correction note)
is never silently discarded (CLAUDE.md §5). `ImportReport` also already
carries `truncation_warning: Option<String>` for a `.idl0` file that ended
mid-record but still parsed something.

**`SessionSummary` (C3 §3.2) has no field for either.** It is a fixed,
already-contracted shape (catalog-row columns only) with nowhere to attach
a per-import advisory message. This means, as currently specified, a
successful `import_file` call that recovered from something worth telling
the user about returns a `SessionSummary` that says nothing about it — the
warning reaches nowhere. This is exactly the condition CLAUDE.md §5 exists
to prevent, and it is a genuine contract gap, not an implementer mistake to
paper over.

**Options, none decided here:**
(a) Amend C3 §3.2 to add an optional field (e.g. `import_warnings:
string[]`, empty for every existing/idl0-only caller) to `SessionSummary`
— small, additive, but a contract change touching every other consumer of
`SessionSummary` (`list_sessions`, `get_session`'s catalog-adjacent
context) for a field only `import_file` ever populates.
(b) Add the field to a narrower type instead — e.g. a wrapper
`ImportResult { summary: SessionSummary, warnings: string[] }` as
`import_file`'s actual return, diverging from C3 §3.3's literal `->
SessionSummary` — a larger contract change (a different return shape, not
just an added field).
(c) Drop the warnings at this boundary for wave 1, with a `// TODO(idl0):`
naming this exact gap and citing this brief, and surface them only via
whatever server-side log this task already has reason to write (if any) —
this technically still "silently drops" from the *user's* perspective,
which is the condition CLAUDE.md §5 is written against, so this option
should be treated as a stopgap only, not a resolution.

**This brief recommends (a)** as the smallest change that actually closes
the gap rather than deferring it again, but **does not decide it** — stop
and get a lead ruling before implementing any of the three. If dispatched
without an answer, implement (c) as the only option that needs no contract
change, with the `TODO(idl0)` exactly as described, and say in your report
that this is a stopgap pending the lead's choice among (a)/(b)/(c).

## Ruling — `ImportErrorKind` → `IpcErrorKind` (deviation from the plan's File Structure)

**Do not write `impl From<idl_rs::session::ParseError> for IpcError`** as
the L5 plan's own File Structure text says ("the first Group B task to
need `ParseError`, so this task adds those three variants"). That text
predates L2-R13: the actual boundary type both `import_idl0` and
`import_file` return is `idl_rs::store::import::ImportError { kind:
ImportErrorKind, message }`, which already wraps `ParseError` internally
(`store/import.rs`'s own `From<ParseError> for ImportError`) and, per L2
Task 6, also wraps `ImporterError`'s seven variants and adds
`UnknownExtension`/`Collision` of its own. Write one
`impl From<idl_rs::store::import::ImportError> for IpcError` instead,
matching every `ImportErrorKind` variant Task 6 actually shipped:

| `ImportErrorKind` (core) | `IpcErrorKind` (new unless noted) |
|---|---|
| `Io` | `Io` (existing cross-cutting) |
| `ParseInvalidMagicBytes` | `ParseInvalidMagicBytes` (new — C3 §2 row already exists) |
| `ParseUnsupportedSchemaVersion` | `ParseUnsupportedSchemaVersion` (new — row exists) |
| `ParseTruncatedRecord` | `ParseTruncatedRecord` (new — row exists; rare in practice, see `ImportReport.truncation_warning`'s own doc comment on when this is a hard error vs. a recovered warning) |
| `ImportFitMalformed` | `ImportFitMalformed` (new — C3 §2 row already exists, R7) |
| `ImportGpxMalformedXml` | `ImportGpxMalformedXml` (new — row exists) |
| `ImportGpxNoTrackpoints` | `ImportGpxNoTrackpoints` (new — row exists) |
| `ImportGpxMissingLatLon` | `ImportGpxMissingLatLon` (new — row exists) |
| `ImportGpxUnparseableLatLon` | `ImportGpxUnparseableLatLon` (new — row exists) |
| `ImportCsvMalformed` | `ImportCsvMalformed` (new — row exists) |
| `ImportNotUtf8` | `ImportNotUtf8` (new — row exists) |
| `UnknownExtension` | `InvalidArgument` (existing cross-cutting — L2's own brief-task6 anticipated exactly this mapping) |
| `Collision` | **see next paragraph — no C3 §2 row exists for this one** |

(Confirm this table against L2 Task 6's actual landed `ImportErrorKind`
variant list before implementing — this brief was written before Task 6
existed; if the real enum differs, follow the real enum and note the
difference in your report.)

**`Collision` has no C3 §2 row — flagged, not decided.** `store/import.rs`'s
own doc comment already admits this ("`Collision` (new — this pipeline's
own re-import refusal, not yet in C3 §2)"), and C3 §3.3's Errors line
(`not_found`, `invalid_argument`, the three `parse_*` kinds, `io`,
`internal`) does not list it either — a real re-import-of-a-different-blob
condition (C4 §3: a truncated download and the full file sharing a
`session_id`) currently has nowhere correct to map. **Options:** (i) a new
C3 §2 row, e.g. `import_collision`, sourced from
`store::import::ImportErrorKind::Collision`, added to §3.3's Errors line
— the naming-rule-consistent choice, matching how the seven `ImporterError`
rows were each added; (ii) fold it into the existing cross-cutting
`conflict` kind (C3 §2, R44) — semantically close ("the state on disk
isn't what the caller assumed") but `conflict`'s own doc comment ties it
specifically to `save_workbook`'s optimistic-concurrency check, and this
condition isn't concurrency-related (it's about a permanent `session_id`
collision from a different blob, not a since-changed file). **This brief
recommends (i)**, but does not decide it. Stop and get a lead ruling before
shipping this mapping; if forced to proceed without one, use (ii)
(`Conflict`, with `detail: { "session_id": ..., "existing_blob_sha256":
... }` pulled from the error message) as the closer-fitting existing kind,
and say in your report that this is a stopgap.

## The task, in order

- [ ] **Step 1: Confirm the gate** (L2 Tasks 6/7 committed — see GATE
      above) and the worktree question (see "Where" above — proceed with
      the recommended worktree unless told otherwise).
- [ ] **Step 2: `error.rs`** — add the ten (or however many Task 6 actually
      shipped) new `IpcErrorKind` variants, the `Collision` mapping per
      whichever option was ruled (or the `Conflict` stopgap), and
      `impl From<idl_rs::store::import::ImportError> for IpcError`. Tests:
      one per variant, same shape as this file's existing
      `catalog_error_*_kind_converts_to_*` tests (message preserved, kind
      correct).
- [ ] **Step 3: Write the failing Rust tests for `import.rs`** — reuse L2's
      own golden fixtures (a small GPX/FIT/CSV byte buffer per format,
      copied or re-derived from L2's own test modules, not invented fresh)
      plus a hand-built minimal `.idl0` buffer (the same construction
      `store::import`'s own tests use — `Header`/`frame`/`session_end`
      helpers from `crate::parse::test_buffers`) for the idl0 branch.
- [ ] **Step 4: Implement `import.rs`** per the rulings above — `Progress`
      reuse, `resolve_extension`, the idl0/non-idl0 branch, the
      catalog-rebuild-then-list-and-find `SessionSummary` lookup,
      `list_importers_via`'s dot-prefixing.
- [ ] **Step 5: Register** — `pub mod import;` in `commands/mod.rs`;
      `commands::import::import_file, commands::import::list_importers,`
      added to `lib.rs`'s `handler!` list.
- [ ] **Step 6: Test** — `cargo test -p idl-rs-tauri import::`, confirm
      non-zero `passed`; `cargo check -p idl-rs-tauri` clean.
- [ ] **Step 7: Commit** — explicit paths (NOT `git add -A`):
      `git add rust/tauri/src/commands/import.rs rust/tauri/src/commands/mod.rs rust/tauri/src/lib.rs rust/tauri/src/error.rs`
      — message
      `tauri: import_file/list_importers (C3 3.3) wired to L2's importers`.
      Single line, no AI attribution trailer.

## Tests to add

- `list_importers_via_includes_idl0_and_every_core_importer_with_dotted_extensions`:
  the returned list has exactly `1 + core::import::importers().len()`
  entries; the `"idl0"` row is present with `extensions == [".idl0"]`;
  every other row's `extensions` are all dot-prefixed (proving the mapping,
  not just its presence).
- `import_file_via_gpx_happy_path_returns_a_session_summary`: a temp
  `<data>` root, a real GPX fixture written to a temp file on disk, `path`
  pointing at it, `importer_id: None` — asserts the returned
  `SessionSummary.source_format == "gpx"` and that
  `catalog_read::list_sessions` on the same root now shows one row.
- `import_file_via_forced_importer_id_ignores_the_actual_extension`: a GPX
  fixture saved with a `.txt` extension, `importer_id: Some("gpx")` —
  succeeds (proves the "force ignores extension" rule).
- `import_file_via_unrecognised_importer_id_is_invalid_argument`:
  `importer_id: Some("xml")` (or any string not in the table) → `IpcError.
  kind == InvalidArgument`, no file ever read (assert via a nonexistent
  `path` that would otherwise raise `NotFound` first if reached — proving
  validation happens before the read).
- `import_file_via_missing_path_is_not_found`: a `path` that doesn't exist,
  `importer_id: None` with an extension the auto-detect can still read from
  the filename (e.g. `"/nonexistent/x.gpx"`) → `IpcErrorKind::NotFound`.
- `import_file_via_malformed_gpx_maps_to_import_gpx_malformed_xml`: bytes
  that are not well-formed XML → the correct mapped `IpcErrorKind`.
- `import_file_via_idl0_source_routes_to_import_idl0_not_import_file`: a
  hand-built minimal `.idl0` buffer, `importer_id: None`, path ending
  `.idl0` — succeeds with `source_format == "idl0"` (proving the branch,
  since core's own `import_file` would reject `"idl0"` if this ever
  accidentally called it instead of `import_idl0`).
- One test per newly-mapped `ImportErrorKind` variant not already covered
  above (at minimum: `ParseInvalidMagicBytes` via a bad-magic-bytes `.idl0`
  buffer, `UnknownExtension` via an unrecognised extension with
  `importer_id: None`, and whatever `Collision`/`Conflict` mapping the lead
  ruled).
- `progress` ordering: assert (via a `Vec<Progress>` captured by the
  `on_progress` closure, not a real `tauri::ipc::Channel`, which cannot be
  constructed outside a running app — same idiom as `device.rs`'s own
  `scan_via` test pattern) that phases arrive in order `"reading"` →
  `"decoding"` → `"materializing"` on a success path, and stop before
  `"materializing"` on a failure.

## Do not

- Do not add `impl From<idl_rs::session::ParseError> for IpcError` — use
  `From<idl_rs::store::import::ImportError>` instead (see Ruling above).
- Do not call `catalog_read::get_session` to build the return value — it
  returns `SessionDetail`, not `SessionSummary`. Use `list_sessions` +
  find-by-id.
- Do not redefine `SessionSummary` or `Progress` in `import.rs` — reuse
  `crate::commands::catalog::SessionSummary` and
  `crate::commands::device::Progress`.
- Do not add `"idl0"` to `core::import::importers()` or otherwise touch L2's
  `core` files — this task is `idl-rs-tauri`-only.
- Do not edit `app/src/ipc/import.ts` — it already matches C3 §3.3 exactly;
  if something about this task seems to require changing it, STOP and
  report.
- Do not add a dialog plugin or touch `app/src-tauri` (ledger R55).
- Do not decide the `ImportReport` warnings gap or the `Collision`/C3 §2
  question yourself beyond the stated stopgaps — both need a lead ruling.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.

## Style / hygiene

Doc comment on every public symbol; units on every numeric value (`Progress.
done`/`total` are dimensionless counts here, not bytes — say so in the
phase-specific doc comment if you add one, matching `Progress`'s own field
doc comment's "meaning is phase-specific" framing); typed errors only; A/A/A
tests named `thing — condition — result`; match this crate's established
`_via`-function idiom exactly (every other command module in
`rust/tauri/src/commands/` uses it). No `cargo fmt`.

## Spec discipline (say it out loud in your report)

**"No spec change needed" for the command wiring itself** — C3 §3.3 already
fixes `import_file`/`list_importers`'s shape and this task implements it as
specified. **A spec change *is* needed** for the two open questions above
(the `SessionSummary` warnings gap, and the `Collision` → C3 §2 kind
mapping) if either is resolved via option (a)/(i) rather than a stopgap —
say explicitly which stopgap you shipped (if any) and which contract
amendment it is standing in for, so the lead can decide whether to land the
amendment now or track it.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri import::`
result line with its `passed` count; `cargo check -p idl-rs-tauri` result;
confirmation `app/src/ipc/import.ts` was not touched; the exact
`ImportErrorKind` variant list Task 6 actually shipped, compared against
this brief's assumed table (say what differed, if anything); which stopgap
you shipped for the two open questions (warnings gap, `Collision` mapping)
and a one-line restatement of what the lead still needs to decide for each;
the worktree-choice confirmation; anything else ambiguous you resolved (say
how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).

## Lead ruling 2026-09-05 (R60) -- return shape, error row, worktree

1. `import_file` resolves with `ImportOutcome { session: SessionSummary, warnings: string[] }` (C3 section 3.3 amended under R60) -- never drop `ImportReport`'s warnings/truncation message. `app/src/ipc/import.ts` is adapted by a lead shell task; do NOT edit it here (STOP and report if the command cannot be built without it).
2. `ImportErrorKind::Collision` maps to the new C3 section 2 kind `import_collision` (not `conflict`).
3. Worktree: the idl-rs L2 worktree/branch `wave1-l2-importers`, as recommended. Gate on L2 Tasks 6 and 7 being committed (`git log`), else STOP.
