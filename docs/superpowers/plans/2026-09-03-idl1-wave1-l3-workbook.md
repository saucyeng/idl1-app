# idl1 Wave 1 — L3 (core workbook v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `.idl1wb` workbook v3 in `idl-rs` core: the Markdown/front-matter
parser and cell-id assignment (C2 §1–2), the math-cell definition grammar,
constants and validator (C2 §3), table-cell wiring (C2 §4), the Rust-side data
for every JS host variable (C2 §5.1), tile/raster/cursor endpoints as plain
Rust functions (C3 §3.5–3.7), and `idl-rs migrate-workbook` Stage 1 (C2 §6).
Resolve the C1 §8 item 5 `t` naming collision concretely. Rewrite
`docs/IDL0_SPEC.md` §17a for v3. Prove it: a migrated idl0 workbook evaluates
byte-for-byte against the existing v2 evaluator, and tile stats verify against
`decimate_channel`.

**Architecture:** All work is in `rust/core/src` (`idl-rs`) plus one
`rust/cli/src/main.rs` subcommand and one `docs/IDL0_SPEC.md` section. Every
function this plan adds is plain, `Tauri`-free Rust — no crate here depends on
`tauri` or `idl-rs-tauri`. The v2 workbook code (`workbook/model.rs`,
`workbook/apply.rs`, `workbook/read.rs`, `math/channel_def.rs`,
`math/resolve.rs`) is untouched and stays in the tree: `migrate-workbook`
reads v2 `.idl0wb` JSON from a dedicated migration-only deserializer (Task
13), not by reusing those types, because the v2 in-memory model already drops
fields (`color`, worksheets, `constants[].id`) the migration needs.

**Tech Stack:** Rust 2021, existing `idl-rs` deps only (`serde`, `serde_json`)
plus two new ones this plan adds: `pulldown-cmark` (Markdown/fence parsing)
and `serde_yaml` or equivalent YAML front-matter parsing (Task 1 pins the
exact crate/version — none is in the repo's `Cargo.lock` yet; do not guess,
confirm what's available before pinning).

**Spec:** `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` (C2,
primary contract), `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`
(C1, time model — §8 item 5 is this lane's to resolve),
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.5–3.7 (C3, tiles/
rasters/cursor byte layouts — exact), `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
§6 (Notebook) and §10 (L3 row), `docs/legacy/idl0-workbook_format.md` (v2
grammar this lane migrates from), `CLAUDE.md`.

---

## Global Constraints

- **Branch:** `wave1-l3-workbook`, in its own worktree (never the shared
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` checkout — see L4's Task 1 correction
  in `runs/2026-09-03/decisions.md` for why). Setup, before any Rust-touching task:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave1-l3-workbook "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l3-workbook" main
  ```
  If executing as an L1↔L3 agent team sharing L1's worktree (below), skip this and use L1's
  worktree/branch (`wave1-l1-store`) directly instead — do not create a second worktree in that
  case; the two lanes' work lands in one combined branch. If running L3 standalone after L1 has
  already merged to `main`, use the command above instead, branching from the post-merge `main`.
  The SPEC task also needs the idl1-app top-level repo, wired the same way as L1's plan (Task 1
  Steps 2):
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave1-l3-workbook "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l3-workbook" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l3-workbook"
  git submodule update --init -- rust
  # ^ may print "fatal: remote error: upload-pack: not our ref …" — expected and harmless
  # (origin/GitHub doesn't have this run's unpushed local commits); the next three lines
  # redirect to the actual local worktree and complete the setup correctly regardless
  # (ruling R11, runs/2026-09-03/decisions.md). Do not treat this message as a blocker.
  git -C rust remote add local-wave1 "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l3-workbook"
  git -C rust fetch local-wave1 wave1-l3-workbook
  git -C rust checkout -B wave1-l3-workbook FETCH_HEAD
  ```
  Working directory for all Rust work:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook` (or L1's worktree
  path if team-sharing). Working directory for the SPEC task:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l3-workbook`.
- **Dependency gate (L1 → L3).** Task 5 (time model / `ChannelLookup`) needs
  L1's landed `Channel` type (C1 §2: `t_us: Vec<i64>`, `nominal_rate_hz: f64`,
  `source_kind: String`, on `rust/core/src/session/mod.rs`). **Intended
  execution mode:** L1 and L3 run as a live agent team sharing one worktree
  (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in this environment; design
  doc §12 and the wave-1 decisions ledger (`runs/2026-09-03/decisions.md`,
  ruling R3) both name L1↔L3 as a pair that may coordinate live rather than
  strictly wait on L1's separate merge) — Task 5 is written to be worked out
  in direct conversation with L1's implementer about the exact
  `Channel`/`SessionHandle` shape as it lands, not against a frozen guess.
  **Fallback gate**, if a team is not available when Task 5 starts: run (Git
  Bash, repo root) `grep -n "pub t_us: Vec<i64>" rust/core/src/session/mod.rs`.
  A match means L1 has landed and Task 5 proceeds against the real type; no
  match means block Task 5 (and every later task that touches
  `ChannelLookup`/`LookupChannel`) and re-check, or escalate to the lead —
  never guess at L1's field names/types instead of checking.
- **Boundary with L5 (IPC).** Every function this plan produces for tiles,
  rasters and cursor readouts is a plain Rust function with no `tauri`
  dependency — it returns `Vec<u8>` (tiles/rasters, already laid out exactly
  per C3 §3.5/§3.6) or a plain struct (cursor). The `#[tauri::command]`
  wrapper functions in `rust/tauri/src/commands.rs` that call these and
  translate errors to `IpcError` are **L5's job**, not this plan's. This plan
  never creates or edits anything under `rust/tauri/`.
- **Boundary with L6 (host variables).** C2 §5.1's host variables
  (`channel()`, one binding per math definition, `laps`, `session`,
  `constants`) are data L3 computes in Rust (Task 8). The
  `postMessage`/Runtime wiring that gets that data into the sandboxed iframe
  is L6's job (wave 2, not this plan). This plan stops at producing the Rust
  struct in the `{length, t, v}`-equivalent shape C2 §5.1 describes.
- **Boundary with L11 (merge).** C2 §7's per-cell merge semantics consume
  this lane's cell-id model (Task 1) but the merge algorithm itself is L11's
  (wave 2). This plan does not implement `merge(local, peer, base)`.
- **v2 code is untouched.** `workbook/model.rs`, `workbook/apply.rs`,
  `workbook/read.rs`, `math/channel_def.rs`, `math/resolve.rs` keep working
  exactly as today; nothing in this plan deletes or repurposes them. New v3
  code lives beside them.
- **idl-rs is not rustfmt-formatted.** Never run `cargo fmt`; match
  surrounding style by hand.
- **No AI attribution trailers** in any commit. **Never `git push`** —
  commits stop locally; Isaac pushes.
- **Every public symbol gets a doc comment; every numeric value's unit is
  stated in that comment** (seconds vs. µs vs. samples is exactly the class
  of bug this lane's time-model work must not introduce). **No `Err(String)`
  anywhere** — structural workbook errors use the new `WorkbookErrorKind`
  (Task 2, reusing `MathEvalErrorKind`'s pattern), evaluation errors reuse
  `MathEvalErrorKind` verbatim (C2 §3.5.B) so C3's `math_*` IPC kind prefixes
  need no translation layer.
- **TDD, Arrange/Act/Assert with blank lines between arrange/act/assert.**
  Test names `thing — condition — result`. Every new module gets inline
  `#[cfg(test)]` tests; no test fixture files (no such convention exists yet
  in `idl-rs` — see `runs/2026-09-03/decisions.md` R2 — so migration/golden
  tests build synthetic JSON/session data inline, as `math/resolve.rs`'s own
  tests already do).
- **Spec discipline.** Every task below states spec-first / spec-during / no
  spec change needed. Task 14 (SPEC §17a rewrite) is spec-first and is done
  before Task 13 (`migrate-workbook`) starts writing code against it, per
  CLAUDE.md §6.
- **Every task touching shipped behaviour** ends with a `CHANGELOG.md`/
  `TASKS.md` line (Task 16 sweeps any missed at the end; individual tasks
  should not need it if they keep to their own step).
- Use absolute paths in every command; never rely on a `cd` persisting across
  tool calls.

---

## File Structure

**Create** (all under `rust/core/src/` unless noted):
- `workbook/v3/mod.rs` — `WorkbookDoc`, `CellDoc`, `parse_workbook()`.
- `workbook/v3/front_matter.rs` — front-matter struct, YAML parse, constant
  unit-suffix regex (C2 §1, §3.1's "unit-suffix syntax for front-matter
  constants").
- `workbook/v3/cell.rs` — fence scanning, `id=hex8` assignment/generation,
  `DuplicateCellId`, prose-span attachment (C2 §2.2–§2.4).
- `workbook/v3/error.rs` — `WorkbookError`, `WorkbookErrorKind` (C2 §3.5.A's
  seven structural kinds).
- `workbook/v3/math_cell.rs` — `const_line`/`def_line` grammar, `identifier`
  validation, `# label:` display-name annotation (C2 §3.1).
- `workbook/v3/constants.rs` — flat constants table (front matter + `const`
  lines), universal-constant collision, `parse_with_constants` wiring into
  `math::parse` (C2 §3.1's constants rules, §3.2's constants-as-identifiers).
- `workbook/v3/table_cell.rs` — table-cell fence body → `TableModel` (C2 §4;
  thin wrapper, the model itself is untouched `table::model`).
- `workbook/v3/js_cell.rs` — JS fence body storage, `${…}` inline-expression
  span extraction (parsing/storage only — no JS execution here, C2 §5.2).
- `workbook/v3/resolve.rs` — v3 flat cross-cell dependency resolver (C2
  §2.4's "whole document shares one flat namespace").
- `workbook/v3/host.rs` — host-variable data functions: `to_host_channel`,
  `channel()`, `host_laps`, `host_session`, `host_constants` (C2 §5.1).
- `workbook/v3/eval.rs` — per-cell evaluation orchestrator (C2 §3.5.B; shape
  matches C3 §3.4's `CellOutput`, Tauri-free).
- `workbook/migrate.rs` — Stage 1 v2→v3 migration (C2 §6, §6.1).
- `tile.rs` — C3 §3.5 binary tile encoder.
- `histogram2d.rs` — 2-D histogram binning (new; no prior implementation).
- `colormap.rs` — value→RGBA8 colour lookup for rasters.
- `raster.rs` — C3 §3.6 binary raster encoder (spectrogram + histogram2d).
- `cursor.rs` — C3 §3.7 cursor readout.

**Modify:**
- `lib.rs` — add `pub mod tile; pub mod histogram2d; pub mod colormap; pub mod raster; pub mod cursor;`; `workbook/mod.rs` add `pub mod v3; pub mod migrate;`.
- `chart_decimation.rs` — add `column_stats()`.
- `math/eval.rs` — `LookupChannel`, `EvalOutput` gain `t_us`; `ChannelLookup`
  trait doc comment updated to state the new contract.
- `math/value.rs` — `ChannelValue` gains `t_us`; elementwise/binary op
  propagation rule.
- `math/parse.rs` — add `parse_with_constants(expr, constants) -> Result<Ast, MathEvalError>`.
- `core/Cargo.toml` — add `pulldown-cmark`, the YAML crate (Task 1 pins
  exact versions).
- `cli/src/main.rs`, `cli/Cargo.toml` — add `MigrateWorkbook` subcommand.
- `docs/IDL0_SPEC.md` (idl1-app repo, not the submodule) — rewrite §17a.
- `CHANGELOG.md`, `TASKS.md` (idl1-app repo).

---

### Task 1: Front matter, cell scanning, cell-id assignment

**Spec:** spec-during (this task's doc comments are the spec for the module;
C2 §1–§2 is already signed).

**Files:** Create `workbook/v3/mod.rs`, `workbook/v3/front_matter.rs`,
`workbook/v3/cell.rs`, `workbook/v3/error.rs`. Modify `lib.rs`, `workbook/mod.rs`,
`core/Cargo.toml`.

**Interfaces:**
- Produces: `WorkbookDoc { id: String, name: String, constants_raw: HashMap<String, ConstantValue>, units_pref: UnitsPref, version: u32, cells: Vec<CellDoc>, trailing_prose: Option<String> }`;
  `CellDoc { id: String, kind_token: CellKindToken /* Math|Table|Js */, prose_before: Option<String>, raw_fence_body: String }`;
  `parse_workbook(markdown: &str) -> Result<(WorkbookDoc, Vec<WorkbookError>), Vec<WorkbookError>>` — `Err` only for front-matter-fatal problems (`MissingFrontMatterId`, `UnsupportedWorkbookVersion`, YAML that doesn't parse at all); every other structural problem (Task 2) is collected into the `Ok` tuple's `Vec<WorkbookError>` alongside a best-effort `WorkbookDoc`, so an editor can still show every other cell. This is a deliberate design choice beyond what C2 states verbatim (C2 fixes the error *kinds*, not whether parsing is all-or-nothing) — stated here so Task 2 and Task 9 build on one consistent rule: **front-matter identity/version is fatal; everything else is collected.**

- [ ] **Step 1: Pin and add the two new deps**

  Check what's already resolvable: `cd rust && cargo search pulldown-cmark 2>&1 | head -5` (or check crates.io directly if `cargo search` is disabled — report which). Add to `core/Cargo.toml`: `pulldown-cmark = "<latest stable 0.x>"` and a YAML crate — confirm `serde_yaml` is still maintained (it is archived upstream as of some point; if so, use `serde_yaml_ng` or `saphyr`/`yaml-rust2` instead, whichever the workspace's other members already imply no conflict with). **Do not guess a version — check crates.io and record what you pinned in the task's commit message.** This is the one place in this plan where a version is not pre-supplied (M0's ecosystem report did not cover Markdown/YAML crates), so confirm before writing code that depends on it.

- [ ] **Step 2: Front-matter struct and parse (failing test first)**

  `front_matter.rs`: `FrontMatter { id: String, name: String, constants: HashMap<String, ConstantRaw>, units: UnitsPref, version: u32 }` where `ConstantRaw` is either `Number(f64)` or `WithUnit { value: f64, unit_display: String }` (C2 §1's `"<number> <unit>"` regex, §3.1). `version` defaults to `3` when the YAML key is absent (not merely "assume 3" — write the `#[serde(default = "...")]` or manual default so an explicit `version: 2` is preserved through to the `UnsupportedWorkbookVersion` check, not silently coerced).

  Tests: `front_matter — version key absent — defaults to 3`; `front_matter — version 2 explicit — is not silently upgraded`; `front_matter — missing id — MissingFrontMatterId`; `front_matter — id not a UUIDv4 — MissingFrontMatterId`; `constant unit suffix — "82 kg" — parses to (82.0, Some("kg"))`; `constant bare number — 9.80665 — parses to (9.80665, None)`.

- [ ] **Step 3: Fence scanning and cell-id assignment**

  `cell.rs`: use `pulldown-cmark`'s event stream (`Parser::new_ext`) to walk the document; a `CodeBlockKind::Fenced(info_string)` event whose info string starts with `math `/`table `/`js ` (or is exactly one of those three with no attrs) becomes a `CellDoc`; any other fence (including a bare ` ``` `) is inert and produces no cell (C2 §1). Parse the fence info string against C2 §2.2's `fence_open` grammar by hand (regex or manual scan — `pulldown-cmark` gives you the raw info string, not sub-parsed attrs): `cell_kind (" " "id=" hex8)?`. When `id=` is absent, generate 4 random bytes (use the workspace's existing RNG dependency if one exists in `core/Cargo.toml`; if none does, add `rand` — check first) and lower-hex-encode them; this is "assignment on first save" (C2 §2.2) — `parse_workbook` always returns a doc where every cell has an id, generating on the fly for a freshly-authored fence, and the caller (a future save path, not this task) is responsible for writing the generated id back into the file text if it wants persistence. Track seen ids in a `HashSet`; a repeat is `WorkbookErrorKind::DuplicateCellId` (collected, not fatal — C2 §3.5.A gives that kind's exact message shape `"Cell id '<id>' used by more than one cell"`).

  Prose-span attachment (C2 §2.4): every non-fence Markdown event between the end of front matter (or the previous fence-close) and the next fence-open becomes that next cell's `prose_before` (raw Markdown text, not rendered — this lane does not render prose); trailing prose after the last cell becomes `WorkbookDoc`'s own field on the last `CellDoc` (`prose_after: Option<String>` — add this field, it was omitted from the draft type above; only the final `CellDoc` in `cells` ever has it `Some`). Zero fenced cells → `cells` empty, `trailing_prose` holds the whole body.

  Tests: `two cells same id= — DuplicateCellId collected, both cells still returned`; `fence with no id= — id assigned, 8 lowercase hex chars`; `unrecognised fence language — produces no cell, round-trips as inert`; `prose before first math cell — becomes that cell's prose_before`; `trailing prose after last cell — becomes prose_after on the last cell`; `zero fenced cells — cells empty, trailing_prose is Some`.

- [ ] **Step 4: Wire `parse_workbook` and the C2 §2.5 worked example**

  `mod.rs`: `parse_workbook` composing Steps 2–3. Test: feed C2 §2.5's exact worked example text (the "restated literally" block — copy verbatim, it is already the contract's own checked example) and assert: `id` parses as the given UUIDv4, `version` defaults to 3, two cells with the given ids, first cell's `kind_token == Math` with two `def_line`s inside, second cell's `kind_token == Js`.

- [ ] **Step 5: Test and commit**

  Run: `cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l3-workbook" && cargo test -p idl-rs workbook::v3 2>&1 | grep -E "^test |^test result"`. Expected: every test `ok`, `0 failed`.

  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l3-workbook" && git add -A && git commit -m "workbook: v3 front matter, fence scanning, cell-id assignment (C2 §1-2)"
  ```

---

### Task 2: Structural validation errors

**Spec:** no spec change needed (C2 §3.5.A already fixes every kind/message).

**Files:** Modify `workbook/v3/error.rs`, `workbook/v3/mod.rs`.

**Interfaces:** `WorkbookErrorKind::{DuplicateCellId, DuplicateDefinition, DuplicateConstant, InvalidIdentifier, ReservedName, MissingFrontMatterId, UnsupportedWorkbookVersion}`, each carrying the exact message shape from C2 §3.5.A's table. `WorkbookError { cell_id: String /* or "front-matter" */, kind: WorkbookErrorKind, message: String }`.

- [ ] **Step 1: `WorkbookErrorKind` and message builders**

  One constructor function per kind, each producing the exact message string template from C2 §3.5.A (e.g. `fn duplicate_cell_id(id: &str) -> WorkbookError` → `"Cell id '<id>' used by more than one cell"`). Tests assert the literal string for every one of the seven kinds against the table's exact wording — this is a pure transcription check, not a design decision, and should be tested that way (`duplicate_cell_id_message_matches_c2_exactly`, etc., one test per kind).

- [ ] **Step 2: Wire `DuplicateCellId`/`MissingFrontMatterId`/`UnsupportedWorkbookVersion` (already partly done Task 1) plus `InvalidIdentifier`/`ReservedName` stubs**

  `InvalidIdentifier`/`ReservedName`/`DuplicateDefinition`/`DuplicateConstant` are raised by Task 3/4 (they need the math-cell and constants parsers to exist first); this step only confirms `WorkbookErrorKind` compiles and every constructor is reachable from `mod.rs`'s error-collection path, with a placeholder test proving `WorkbookError` is `Clone + Debug + PartialEq` (needed so tests can assert on collected error lists by equality).

- [ ] **Step 3: Test and commit**

  Run: `cargo test -p idl-rs workbook::v3::error 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 structural error kinds and exact C2 §3.5.A messages"
  ```

---

### Task 3: Math-cell definition grammar

**Spec:** no spec change needed (C2 §3.1 is exact).

**Files:** Create `workbook/v3/math_cell.rs`. Modify `workbook/v3/mod.rs`, `workbook/v3/error.rs` usage.

**Interfaces:** `MathCellLine::{Blank, Comment, Const { name: String, value: f64, unit_display: Option<String> }, Def { name: String, expr_text: String, label: Option<String> }}`; `parse_math_cell_body(body: &str) -> (Vec<MathCellLine>, Vec<WorkbookError>)` (line-level errors — bad identifier, reserved name — collected per line, never fatal to sibling lines, matching CLAUDE.md §5's "don't block other channels" extended to structural parsing).

- [ ] **Step 1: Line splitter and `identifier` validation**

  Split `body` on `\n`; classify each line by C2 §3.1's `math_line` grammar (`blank_line | comment_line | const_line | def_line`) — a line matching none of the four is `WorkbookErrorKind::InvalidIdentifier`-shaped only if it looks like an attempted definition with a bad name (heuristic: has a bare `=` before any `#`); otherwise treat as a `Parse`-kind problem folded into the existing `MathEvalErrorKind::Parse` path at eval time (structural math-cell-body-line parsing is not itself one of C2 §3.5.A's seven kinds — a completely malformed line, e.g. no `=` at all, is not enumerated by the contract, so this task's own reasonable choice is: skip it as a `Comment`-like no-op is wrong (would silently eat a typo); instead surface it as `WorkbookErrorKind::InvalidIdentifier` with a message noting the line couldn't be parsed as `const NAME = value` or `NAME = expr`, closest to the contract's spirit and its **existing** message template's phrasing). **Log this as Open Question 1** below — not blocking, since either resolution is a diagnostics-quality choice, not a correctness one; a reasonable default is coded and tested now, changeable without touching any other module if the lead picks differently later.

  `identifier` regex: `^[A-Za-z_][A-Za-z0-9_]*$`. `const`, `pi`, `tau`, `e`, `g` are always `ReservedName` regardless of position (definition name or constant name) — test both. Host-var names reserved per C2 §3.5.A's `ReservedName` row: `Plot`, `d3`, `Inputs`, `html`, `laps`, `session`, `constants`, `channel` — hard-code this exact list (it must stay byte-identical to C2 §5.1's host variable table; a comment in the code points back at C2 §5.1 so a future host-variable addition is remembered here too).

  Tests: `def_line "roll_deg = [Roll]" — Def with name roll_deg`; `def_line "x = 1 # label: My Label" — label captured`; `def_line trailing plain comment without label: — label is None`; `const_line "const k = 9.81" — Const`; `identifier starting with digit — InvalidIdentifier`; `name "const" — ReservedName`; `name "pi" — ReservedName`; `name "channel" — ReservedName` (host-var collision); `blank line and comment-only line — no error, produce Blank/Comment`.

- [ ] **Step 2: Whole-document flat namespace + `DuplicateDefinition`**

  In `mod.rs`, after Task 1's cell scan, run `parse_math_cell_body` over every `math` cell's `raw_fence_body`, flatten every `Def`/`Const` across the whole document (C2 §2.4: "the whole document shares one flat namespace"), and raise `DuplicateDefinition` for a repeated `Def` name and `DuplicateConstant` for a repeated `Const`/front-matter-constant name (this task raises the `Const`-vs-`Const` and `Const`-vs-front-matter case; Task 4 finishes constants merge).

  Test: `same identifier defined in two different math cells — DuplicateDefinition, both cells still parse`.

- [ ] **Step 3: Test and commit**

  Run: `cargo test -p idl-rs workbook::v3::math_cell 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 math-cell definition/const-line grammar (C2 §3.1)"
  ```

---

### Task 4: Constants — flat table, universal-constant guard, parser wiring

**Spec:** no spec change needed (C2 §3.1, §3.2 are exact).

**Files:** Create `workbook/v3/constants.rs`. Modify `math/parse.rs`.

**Interfaces:** `merge_constants(front_matter: &HashMap<String, ConstantRaw>, const_lines: &[(String, f64, Option<String>)]) -> (HashMap<String, f64>, Vec<WorkbookError>)`; `math::parse::parse_with_constants(expr: &str, constants: &HashMap<String, f64>) -> Result<Ast, MathEvalError>` (new function in `math/parse.rs`, additive — the existing `parse()` is untouched and still used by every v2 caller and by v3's table-cell path where no workbook constants table is in scope by default — see Task 7).

- [ ] **Step 1: Failing test on `math::parse`**

  `math/parse.rs` test: `parse_with_constants("k * 2", &[("k", 9.81)].into()) — evaluates the bare identifier "k" as a literal 9.81` (assert on the produced `Ast`, mirroring how the existing `constant_value` universal-four test already asserts). `parse_with_constants("pi * 2", &[("pi", 1.0)].into()) — ReservedName is a workbook-layer check, not this function's job: parse_with_constants trusts its caller already excluded the universal four from the table, so this call succeeds using the parser's own built-in pi` (document this precondition in the doc comment — `merge_constants` in Step 2 is the actual enforcement point, this function has no opinion). `parse_with_constants("nope * 2", &empty) — Parse error "unexpected identifier 'nope'"`, matching the existing bare-identifier error wording.

- [ ] **Step 2: Implement `parse_with_constants`**

  Thread the constants table through the existing recursive-descent parser's `primary()` rule: where today an unrecognised bare identifier falls through to `constant_value` (universal four) then errors, add one more fallback — a table lookup — before erroring. Keep `parse()` as a zero-constants call to the same underlying function (`parse(expr) == parse_with_constants(expr, &HashMap::new())`) so no existing caller's behavior changes; add exactly that equivalence as a test.

- [ ] **Step 3: `merge_constants` and universal-constant/`ReservedName` enforcement**

  Build the flat table: front-matter constants first, then `const` lines (order doesn't matter for the final map, but duplicate-detection must see both sources) — a name appearing in both, or twice within `const` lines, is `DuplicateConstant`; a name equal to `pi`/`tau`/`e`/`g` from *either* source is `ReservedName`, not silently shadowed and not merged into the returned table (so `parse_with_constants` never even sees a caller attempt to override a universal constant).

  Tests: `same name in front matter and a const line — DuplicateConstant`; `two const lines named "k" — DuplicateConstant, second occurrence reported`; `front-matter constant named "g" — ReservedName, not merged into the table`; `constant name with a space (front matter only) — allowed, present in the table` (C2 §3.1: front-matter constant names are unrestricted, only `const`-line names are `identifier`-restricted).

- [ ] **Step 4: Test and commit**

  Run: `cargo test -p idl-rs "constants|parse_with_constants" 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 constants merge, universal-constant guard, math::parse::parse_with_constants (C2 §3.1-3.2)"
  ```

---

### Task 5: Time model — resolve the C1 §8 item 5 collision

**Spec: spec-during.** This task's own doc comments on `LookupChannel`/
`EvalOutput`/`ChannelValue` **are** the resolution C1 §8 item 5 assigns to
L3/C2; write them as the authoritative statement, not an afterthought.

**Dependency gate:** see Global Constraints. Do not start this task until
L1's `Channel.t_us: Vec<i64>` exists on disk (team coordination or the grep
fallback).

**Files:** Modify `math/eval.rs`, `math/value.rs`. (`session/handle.rs`'s
`SessionHandle: ChannelLookup` impl is **L1's** file — this task defines the
trait-level contract `LookupChannel` must satisfy; populating it from
`Channel.t_us` inside `SessionHandle` is L1's corresponding change, made
together if pairing as a team, or picked up by L1 against this task's landed
trait signature otherwise.)

**Interfaces:**
```
pub struct LookupChannel {
    pub samples: Arc<[f64]>,
    pub sample_rate_hz: f64,
    /// Per-sample time, µs since the session's t=0 (C1 §3.1), one entry per
    /// `samples` entry. NEVER derived from `sample_rate_hz` — traces back to
    /// a recorded/burst-corrected device timestamp (C1 §3.5 invariant 4),
    /// or, for a channel with no session backing (a test double, a table
    /// cell's scalar), a caller-supplied synthetic axis. Strictly increasing
    /// (mirrors C1 §3.5 invariant 1) wherever the source data is a real
    /// session channel.
    pub t_us: Arc<[i64]>,
}
pub struct EvalOutput { pub samples: Vec<f64>, pub sample_rate_hz: f64, pub t_us: Vec<i64> }
```
`ChannelValue` (`math/value.rs`) gains the same `t_us: Arc<[i64]>` field.

**The resolution, stated concretely (write this verbatim, or near it, as the
doc comment on `LookupChannel::t_us`):** C1's `t` column is `Int64`
microseconds — the Parquet storage axis. The math language's own `t` is never
a bare expression identifier (C2 §2.5 confirms the design doc's
`deriv(fork_travel, t)` was shorthand; the real grammar has no bare `t`
primary — see `math::parse`'s grammar, C2 §3.2). The collision is entirely at
the **JS host-variable boundary** (C2 §5.1): the `{length, t, v}` object's `t`
field is **seconds**, `f64`. The single conversion point is
`workbook::v3::host::to_host_channel` (Task 8):
`t_seconds[i] = t_us[i] as f64 / 1_000_000.0`. No other function in this
plan, or in `math/eval.rs`, ever divides by `1_000_000.0` or otherwise
touches the seconds conversion — an implementer wiring a JS host variable
directly off `LookupChannel.t_us` (skipping `to_host_channel`) is exactly the
mistake C1 §8 item 5 warns against, and this doc comment plus Task 8's single
conversion site is how the plan prevents it.

- [ ] **Step 1: Extend `LookupChannel`/`EvalOutput`, failing compile first**

  Add the `t_us` field to both structs. This breaks every existing
  constructor call site in `math/eval.rs`/`math/value.rs`/their tests —
  expected; fix them by threading through whatever real or synthetic `t_us`
  each site already has available (a test double with no natural time axis
  gets a `0, 1, 2, …` placeholder in raw sample-index space **relabeled as
  µs is wrong** — use an explicit synthetic rate, e.g.
  `(0..len).map(|i| (i as f64 * 1_000_000.0 / synthetic_rate_hz) as i64)`,
  matching whatever `sample_rate_hz` that test double already declares, so
  the two fields stay mutually consistent even in test doubles).

- [ ] **Step 2: Elementwise/binary op propagation rule**

  Locate the existing binary-op dispatch (`apply_binary`/`elemwise` per C2
  §3.2's citation) and its current length/rate-mismatch handling. Add: two
  `Value::Channel` operands must carry **identical `t_us`** (not just equal
  length) to combine elementwise; a mismatch is
  `MathEvalErrorKind::Runtime` with a message naming both channels (mirrors
  the existing rate-mismatch error's shape — match its wording style, don't
  invent a new one). A `Value::Channel` combined with a `Value::Scalar`
  keeps the channel operand's `t_us` unchanged (scalars have no time axis to
  conflict with). Every unary/aggregate function that returns a channel
  (`butter`, `declip`, `integrate`, `differentiate`, `detrend`, rolling
  `rms`/`mean`/`std`, `abs`/`sqrt`/… elementwise, `clamp`, trig) passes its
  input's `t_us` through unchanged — **only** `resample` (already
  `NotImplemented`, C2 §3.3) would ever need to synthesize a new axis, and it
  stays `NotImplemented` in this plan, so no function this plan ships needs
  to invent a `t_us`.

  This step touches many call sites across `math/eval.rs`'s ~2200 lines;
  work function-group by function-group (elementwise arithmetic first, then
  filters/reconstruction, then aggregates/scalars — a scalar result's
  `t_us` is irrelevant and can be `Arc::from([])`, matching how
  `EvalOutput`'s existing scalar convention already uses a one-sample
  buffer with `sample_rate_hz: 0.0`) rather than attempting one pass; commit
  after each group compiles and its group's existing tests still pass, so a
  reviewer can see the propagation rule applied consistently rather than
  reviewing one 2000-line diff.

  Tests (add alongside the existing ones for each touched function, do not
  replace them): `add — two channels with identical t_us — result carries the same t_us`; `add — two channels with different t_us — Runtime error naming both`; `differentiate — output t_us equals input t_us` (differentiate changes *values*, never the time axis — C2 §3.3's units table confirms `[ch]/s`, not a resampled axis); `scalar aggregate (rms with no window) — t_us is empty`.

- [ ] **Step 3: `evaluate()` return wiring**

  `evaluate()` (top-level entry) now returns `EvalOutput.t_us` from the
  final `Value::Channel`'s `t_us` (or empty for a `Value::Scalar`, per Step
  2's convention). Test: `evaluate("[X] * 2", …) — t_us matches [X]'s t_us exactly`.

- [ ] **Step 4: Full workspace test and commit**

  Run: `cd rust && cargo test --workspace 2>&1 | grep -E "^test result|FAILED"`. Expected: every `test result:` shows `0 failed` (this is the one step in this plan that must be workspace-wide, not `-p idl-rs`, since `math/eval.rs` is exercised by `table/eval.rs` and CLI code too).

  ```bash
  git add -A && git commit -m "math: mandatory per-sample t_us on LookupChannel/EvalOutput/ChannelValue (C1 §8 item 5 resolution)"
  ```

---

### Task 6: Cross-cell resolver (`math::resolve` for v3)

**Spec:** no spec change needed (C2 §2.4, design §4's "reactive DAG").

**Files:** Create `workbook/v3/resolve.rs`.

**Interfaces:** `resolve_workbook_defs(defs: &HashMap<String, MathCellDef>, lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> HashMap<String, Result<EvalOutput, MathEvalError>>` — evaluates every flat-namespace definition (Task 3's flattened `Def` entries, each carrying its `expr_text` and, via Task 4, the workbook's merged constants table for `parse_with_constants`) deps-first, memoizing results so a definition referenced by two others is computed once.

This is a **new function**, not a v3-mode branch inside `math::resolve::resolve_dependencies` — that existing function's contract ("best-effort... swallowed", cycle-guarded by silent skip) is exactly right for v2's use (a math expression's own dependency needs, resolved transparently) but wrong for v3's need (every definition, referenced or not, gets its own `CellOutput` — including one nobody currently charts — and a failure must be *visible* per-definition, C2 §3.5.B / CLAUDE.md §5, not swallowed). Reuse `resolve.rs`'s `channel_refs()` helper (already `pub(crate)`, promote to `pub(crate)` visibility from `workbook::v3` too, or duplicate the four-line regex-free scanner — prefer reuse, it is already tested) rather than re-deriving the bracket-scanning logic.

- [ ] **Step 1: Topological order + cycle detection**

  Build a dependency graph over `defs` (edges from `channel_refs(expr_text)` filtered to names present in `defs`); Kahn's-algorithm or DFS topological sort. A cycle is **not** one of C2 §3.5.A's seven structural kinds (confirmed absent from that table) and C2 does not define a dedicated cycle error — per this plan's own design note in the C2 read above, a cyclic member simply never gets a resolved value, so `resolve_workbook_defs` returns `Err(MathEvalErrorKind::UnknownChannel, "…")` for every member of a cycle (each references another that never became available — this falls out of the existing per-name evaluation naturally, no special-cased cycle detection is even required for correctness) rather than inventing a new error kind not in the contract. Implement the simplest thing that produces this outcome (e.g. a fixed-point iteration: evaluate every def whose deps are already resolved, repeat until no progress, mark everything left over `UnknownChannel`) rather than a full topological sort if that's less code — either is correct; prefer whichever is easier to test.

  Tests: `A depends on B, B depends on A — both report UnknownChannel, no panic, no infinite loop`; `A depends on B depends on C (no cycle) — resolves in one pass, C before B before A`.

- [ ] **Step 2: Memoized deps-first evaluation**

  For each definition (any document order — Step 1 already ordered them),
  evaluate `expr_text` via `math::parse::parse_with_constants` +
  `math::eval::eval` against a lookup that layers `defs`' own already-resolved
  results *over* `lookup` (a definition's `[Name]` may reference another
  definition or a base/session channel — same rule as the existing resolver,
  reused). Store every definition's result (`Ok` or `Err`) in the returned
  map regardless of whether anything else references it — this is the
  behavioral difference from the v2 resolver that justifies Task 6 being a
  new function (v2 only stores channels something else's expression actually
  needs; v3 needs one `CellOutput`-worthy result per definition, always).

  Tests: `three independent definitions, none referencing each other — all three resolve`; `one definition's expression has a Parse error — its own entry is Err(Parse), sibling definitions still resolve` (CLAUDE.md §5 / C2 §3.5.B, directly tested here since this is the function that must not let one failure block another); `definition referencing a base session channel not in defs — falls through to lookup as today's v2 resolver does`.

- [ ] **Step 3: Test and commit**

  Run: `cargo test -p idl-rs workbook::v3::resolve 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 flat-namespace resolver, deps-first, per-definition results never swallowed (C2 §2.4)"
  ```

---

### Task 7: Table cells

**Spec:** no spec change needed (C2 §4 is the existing `table::model`
verbatim).

**Files:** Create `workbook/v3/table_cell.rs`.

**Interfaces:** `parse_table_cell(fence_body: &str) -> Result<TableModel, WorkbookError>` — `serde_json::from_str::<TableModel>` with the JSON error wrapped into a `WorkbookError` (kind: reuse `InvalidIdentifier`'s slot is wrong; C2 §3.5.A has no "malformed table JSON" kind either — this is the same class of contract gap as Task 3 Step 1's stray-math-line case. Resolution: since a table cell's fence body is JSON, not the math grammar, a parse failure here is naturally a `serde_json::Error` — surface it as `WorkbookErrorKind::InvalidIdentifier` is semantically wrong; **add an eighth, table-specific message under the existing `Parse`-adjacent convention instead**: reuse `MathEvalErrorKind::Parse`'s *style* but keep it a `WorkbookError` (cell-scoped, structural) with `kind` set to a new, plan-local constant string embedded in the message rather than a new enum variant, since C2 owns the enum and this plan cannot add to a signed contract's vocabulary unilaterally — flag this as **Open Question 2** below, assigned to the lead, and code the pragmatic default (message-only, no new kind) now so Task 9's per-cell error surfacing has something concrete to return).

- [ ] **Step 1: Round-trip an existing `TableModel` example through a fence body**

  Test: take C2 §4's own worked JSON example (`{"columns":[...],"rows":[...],"cells":[...]}`), parse it via `parse_table_cell`, assert the resulting `TableModel` deep-equals `serde_json::from_str::<TableModel>` on the same text directly (this is intentionally a thin-wrapper test — the model itself already has its own tests in `table/model.rs`, untouched by this plan).

- [ ] **Step 2: Malformed JSON**

  Test: `fence body is not valid JSON — parse_table_cell returns Err, message includes the serde_json error text`.

- [ ] **Step 3: Wire into `WorkbookDoc`**

  `mod.rs`: for a `CellDoc` whose `kind_token == Table`, eagerly parse via
  `parse_table_cell` (unlike math cells, which stay lazy text until Task 9's
  eval pass — a table's JSON either parses or it doesn't, there is no
  per-line partial result to preserve) and store the `TableModel` on the
  `CellDoc` (or the parse error, collected).

- [ ] **Step 4: Test and commit**

  Run: `cargo test -p idl-rs workbook::v3::table_cell 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 table-cell fence body wired to table::model::TableModel (C2 §4)"
  ```

---

### Task 8: JS cells, prose `${…}` spans, and host-variable data

**Spec: spec-during.** The `{length, t, v}` shape's Rust-side production is
this task's contribution to C2 §5.1 (C2 §8 item 3 already flags the shape
itself as provisional pending L6's Plot verification — this task implements
exactly the shape C2 §5.1 currently states, so if L6 later needs a different
shape, only `to_host_channel`'s return type and its one caller in Task 9
change, per C2 §8 item 3's own scoping of that risk).

**Files:** Create `workbook/v3/js_cell.rs`, `workbook/v3/host.rs`.

**Interfaces:**
```
pub struct HostChannel { pub length: usize, pub t: Vec<f64>, pub v: Vec<f64> }
pub fn to_host_channel(t_us: &[i64], v: &[f64]) -> HostChannel;
pub fn channel(lookup: &dyn ChannelLookup, name: &str, lap: Option<u32>, session: Option<&str>) -> Result<HostChannel, WorkbookError>;
pub struct HostLap { pub number: u32, pub start_t: f64, pub end_t: f64 }
pub fn host_laps(lap_ctx: &MathLapContext) -> Vec<HostLap>;
pub struct HostSession { pub id: String, pub name: Option<String>, pub timestamp_utc_ms: i64 }
pub fn host_session(session: &Session /* C1 */) -> HostSession;
pub fn host_constants(doc: &WorkbookDoc) -> HashMap<String, f64>; // Task 4's merged table, already on WorkbookDoc
```
`js_cell.rs`: `pub struct InlineExpr { pub start: usize, pub end: usize, pub js_expr: String }`; `pub fn find_inline_exprs(prose: &str) -> Vec<InlineExpr>` (C2 §5.2's `${…}` span grammar — brace-balanced scan, not a naive regex, since `js_expr` can itself contain `}` inside a nested object literal; a first correct implementation may use a simple depth counter over `{`/`}` starting after `${`).

- [ ] **Step 1: `to_host_channel` — the one conversion site**

  Implement exactly the formula in Task 5's doc comment. Test:
  `t_us = [0, 1_000_000, 2_500_000] — to_host_channel — t = [0.0, 1.0, 2.5]`;
  `length always equals both t.len() and v.len()`; `empty input — HostChannel with length 0`.

- [ ] **Step 2: `channel()` general lookup**

  Wraps `ChannelLookup::lookup` (base/session/synthesized) and, when `name`
  matches a resolved math definition (Task 6's result map, threaded in by
  Task 9's caller — `channel()` itself takes a plain `ChannelLookup` and does
  not know about definitions directly, per C2 §5.1's own note that
  "definitions already bound as bare identifiers are also reachable this
  way" — implement this by having Task 9's orchestrator register every
  resolved definition *into* the same `ChannelLookup` it hands to `channel()`,
  e.g. by wrapping `lookup` with an overlay map, mirroring how
  `resolve_workbook_defs`'s own internal lookup layering already works
  (Task 6 Step 2) — reuse that pattern rather than inventing a second one).
  `lap`/`session` narrow the returned window — for `lap`, filter `t_us`/`v`
  to the given lap's `[start_t_us, end_t_us]` (from `MathLapContext`,
  converted back to µs — another explicit, tested conversion site, this one
  seconds→µs since `MathLapContext` bounds are already seconds per its own
  doc comment); cross-session `session` scoping needs a second
  `ChannelLookup` (design's "overlay" pattern, `MathOverlay` already exists)
  — accept an optional second lookup parameter for this, `None` meaning
  "same session only" is an error if a `session` id is requested (`not_found`-shaped `WorkbookError`).

  Tests: `channel("X") with no lap/session — same as ChannelLookup::lookup("X") converted`; `channel("X", lap: Some(2)) — t/v windowed to lap 2's bounds`; `channel("nonexistent") — Err, not_found-shaped`.

- [ ] **Step 3: `host_laps`/`host_session`/`host_constants`**

  Thin, direct mappings — each gets one test asserting field-for-field
  correctness against a synthetic `MathLapContext`/`Session`/`WorkbookDoc`.

- [ ] **Step 4: `find_inline_exprs`**

  Tests: `"Bottom-outs: ${count(x)}" — one InlineExpr, js_expr == "count(x)"`; `"${a} and ${b}" — two InlineExprs in order`; `"${ {a: 1} }" — brace-balanced, js_expr == " {a: 1} "` (the nested-braces case that motivates the depth-counter over a naive regex); `no ${...} present — empty Vec`.

- [ ] **Step 5: Test and commit**

  Run: `cargo test -p idl-rs "workbook::v3::(host|js_cell)" 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 host-variable data (channel/laps/session/constants) and \${...} span extraction (C2 §5)"
  ```

---

### Task 9: Cell evaluation orchestrator

**Spec:** no spec change needed (shape matches C3 §3.4's `CellOutput`, but
this plan produces the Tauri-free Rust equivalent; L5 maps it 1:1 to JSON).

**Files:** Create `workbook/v3/eval.rs`.

**Interfaces:**
```
pub struct CellEvalResult {
    pub cell_id: String,
    pub kind: CellKindToken,
    pub host_value: Option<HostChannel>,   // math cells only, for now
    pub error: Option<MathEvalError>,      // math cells only
}
pub fn eval_cells(doc: &WorkbookDoc, lookup: &dyn ChannelLookup, lap_ctx: &MathLapContext) -> Vec<CellEvalResult>;
```
This is the function L5's `eval_workbook` Tauri command (C3 §3.4) will call
per open workbook, converting each `CellEvalResult` into C3's `CellOutput`
JSON shape (`value`/`error` fields) and mapping `MathEvalErrorKind` through
C3 §2's `math_*` prefix — that mapping is L5's, not built here.

- [ ] **Step 1: Wire Task 6's resolver output through `to_host_channel`**

  For every `math` cell, split its resolved definitions (Task 6) back out
  by which cell originally declared each identifier (Task 3's per-cell
  parse already knows this), and for each declared identifier build one
  `CellEvalResult` — `host_value: Some(to_host_channel(...))` on success,
  `error: Some(...)` on failure. A math cell declaring *multiple*
  definitions produces multiple `CellEvalResult`s sharing that cell's
  `cell_id` (C3 §3.4 doesn't explicitly disambiguate this — **Open Question
  3** below, stated default: one `CellEvalResult` per *definition*, not per
  cell, since C2 §5.1 binds one host variable per definition and L6 needs to
  address each individually; `cell_id` alone is therefore not unique across
  the returned `Vec` for a multi-definition math cell — document this loudly
  on the struct).

- [ ] **Step 2: Table and JS cells pass through**

  Table cells: `host_value`/`error` stay `None` in this struct (a table's
  per-cell grid values are a different shape entirely, matching C3 §3.4's
  own `value: unknown | null` — "shape depends on kind" — this plan leaves
  table-cell evaluation values as `TableModel` + `table::eval`'s existing
  per-cell `CellResult`, unchanged, reachable from `CellDoc` directly; L5
  reads `CellDoc.table` for a table cell rather than this struct's
  `host_value`). JS/prose cells produce one `CellEvalResult` each with both
  fields `None` (nothing to precompute Rust-side; the cell's code runs in
  L6's sandbox).

- [ ] **Step 3: Ordering**

  Return `Vec<CellEvalResult>` in document order (C3 §3.4: "one entry per
  cell, in document order") with multi-definition math cells' extra entries
  immediately following their cell's position, in `def_line` source order
  within that cell (deterministic, tested).

- [ ] **Step 4: Test and commit**

  Test: `workbook with two math cells (one two-definition, one single), a table cell, a js cell — eval_cells returns entries in document order with the two-definition cell contributing two consecutive entries`; `one definition errors, its cell's other definition still returns a value` (re-confirms CLAUDE.md §5 at this integration layer, not just Task 6's unit level).

  Run: `cargo test -p idl-rs workbook::v3::eval 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "workbook: v3 per-cell evaluation orchestrator (Tauri-free; shape matches C3 §3.4)"
  ```

---

### Task 10: Tile endpoint (C3 §3.5)

**Spec:** no spec change needed (C3 §3.5's byte layout is exact).

**Files:** Modify `chart_decimation.rs` (add `column_stats`). Create `tile.rs`.
Modify `lib.rs`.

**Interfaces:**
```
// chart_decimation.rs
pub fn column_stats(samples: &[f64], tier: u32, tile_index: u32, column_count: u32) -> Vec<(f32, f32, f32)>; // (min, max, mean) per column

// tile.rs
pub fn build_tile_bytes(samples: &[f64], tier: u32, tile_index: u32, column_count: u32) -> Vec<u8>;
```

**Open Question 4 (stated default, non-blocking):** C3 §3.5 does not say
what raw-sample span the `column_count` pixel columns cover. Default adopted
here: the **same raw-sample span the tile's bucket region covers** —
`tile_index * TILE_SIZE_BUCKETS * bucket_size(tier) .. + TILE_SIZE_BUCKETS * bucket_size(tier)`
— subdivided into `column_count` equal-width slices, independent of the
1024-bucket grid (exactly as C3 §3.5 says: "`column_count` is chosen by the
caller… not tied to the bucket grid" — it is tied to the tile's *sample
range*, just not its *bucket count*). This matches "hover reads the
per-pixel-column stats shipped with each tile" (design §6): the columns are
this tile's own pixels. Confirm with the lead before this ships; coded and
tested now so Task 10 is not blocked.

- [ ] **Step 1: `column_stats`, failing tests first**

  Same NaN handling as `decimate_tile_pure` (all-NaN column → `(NaN, NaN, NaN)`; mixed → stats over finite samples only; past-end column → `(NaN, NaN, NaN)`). Reuse `decimate_tile_pure`'s bucket-loop *shape* but add a running mean (`sum / count` over finite samples in that column).

  Tests mirror `chart_decimation.rs`'s existing table exactly, one column-stats analogue per existing bucket test (`column_stats — all-finite column — returns (min, max, mean)`; `— mixed NaN column — mean over finite only`; `— all-NaN column — (NaN, NaN, NaN)`; `— past-end column — (NaN, NaN, NaN)`; `— single spike — min/max/mean all correct` — verifies mean isn't accidentally computed as `(min+max)/2`).

- [ ] **Step 2: `build_tile_bytes` — header**

  Write the 32-byte header exactly per C3 §3.5's table: `magic = b"IDLT"`, `version: u16 = 1`, `tier: u16`, `tile_index: u32`, `sample_count: u32 = TILE_SIZE_BUCKETS`, `column_count: u32` (caller's arg), `flags: u32 = 0`, `reserved: [u8; 8] = [0; 8]`. All little-endian (`to_le_bytes()` throughout — Rust's default on every Tauri target per C3 §3.5's own note, but write explicit `_le` calls, not `to_ne_bytes`, so the byte order is correct on any build host regardless of target).

  Test: `build_tile_bytes header — first 32 bytes match the C3 §3.5 field table exactly for a known (tier, tile_index, column_count)` (assert each field by byte-slicing, not just total length).

- [ ] **Step 3: Sample region and column region**

  Sample region: `decimate_channel(samples, tier, tile_index)` (existing,
  returns `Vec<f64>` interleaved min/max) cast each value to `f32` and
  little-endian-encode — length `sample_count * 8` bytes exactly (2 × f32 ×
  4 bytes × `TILE_SIZE_BUCKETS`). Column region: `column_stats(...)` (Step
  1), cast to `f32`, encode `min, max, mean` per column — `column_count * 12`
  bytes.

  Test: **the worked example from C3 §3.5 verbatim** — tier 3, 512 samples
  worth of tile (i.e. construct a `samples` array long enough that
  `sample_count` still comes out `TILE_SIZE_BUCKETS = 1024` per today's
  `decimate_channel` convention — re-read C3's worked example carefully: it
  says "512 samples" meaning 512 *bucket pairs*, i.e. `sample_count = 512`,
  which only happens if a future tile-size configuration differs from
  today's fixed `TILE_SIZE_BUCKETS = 1024` — **this is a real inconsistency
  between C3 §3.5's worked example and the current fixed-1024
  `decimate_channel`; do not silently paper over it**: `decimate_channel`
  today always fills exactly 1024 bucket pairs (right-edge NaN-padded), so
  `sample_count` is always 1024 for any tile this plan actually builds via
  `decimate_channel`. Resolve by testing the byte-offset **arithmetic**
  against C3's worked numbers directly (a unit test of the offset formula
  alone, parameterized on a hypothetical `sample_count = 512` without
  calling `build_tile_bytes` for it — i.e. test `header_len + sample_count*8`
  and `+column_count*12` as pure arithmetic) *and* separately test
  `build_tile_bytes`'s real output length against `32 + 1024*8 + column_count*12`
  for an actual call. Log this discrepancy as **Open Question 5**, assigned
  to the lead: is `sample_count` meant to become caller-configurable in a
  later contract revision (matching C3's own framing, "a shorter final tile
  or a future tile-size change never requires a layout bump"), or was 512
  simply an illustrative round number in the worked example independent of
  `TILE_SIZE_BUCKETS`'s real value? Non-blocking either way — the format is
  self-describing (`sample_count` is read from the header, never assumed by
  a consumer), so this plan's fixed-1024 behavior is contract-compliant
  regardless of the answer.

- [ ] **Step 4: Total-length and round-trip decode test**

  Test: `build_tile_bytes total length == 32 + sample_count*8 + column_count*12`
  for several `(tier, tile_index, column_count)` combinations. Decode test:
  write a tiny in-test decoder (mirrors what L5/TS will do) that reads the
  header then both regions back out and asserts every value matches what
  `decimate_channel`/`column_stats` independently computed — this is the
  "tile stats verified against decimation" M0-row done-criterion, satisfied
  here at the unit level (Task 15 repeats it at the integration level with a
  real evaluated math-cell channel).

- [ ] **Step 5: Test and commit**

  Run: `cargo test -p idl-rs "tile|column_stats" 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "tile: C3 §3.5 binary encoder (header + sample region + column stats)"
  ```

---

### Task 11: Raster endpoint — 2-D histogram, colormap, spectrogram encoding (C3 §3.6)

**Spec:** no spec change needed for the byte layout (C3 §3.6 exact); the
2-D histogram *algorithm* itself is new engine surface with no prior spec
section — this task's doc comments are its spec (spec-during, mirroring how
`histogram.rs`'s 1-D version documents itself with no separate SPEC entry).

**Files:** Create `histogram2d.rs`, `colormap.rs`, `raster.rs`. Modify `lib.rs`.

**Interfaces:**
```
// histogram2d.rs
pub struct Histogram2dResult { pub counts: Vec<u32>, pub nx: u32, pub ny: u32, pub bin_edges_x: Vec<f64>, pub bin_edges_y: Vec<f64> }
pub fn histogram2d(xs: &[f64], ys: &[f64], nx: usize, ny: usize, range_x: Option<(f64,f64)>, range_y: Option<(f64,f64)>) -> Histogram2dResult;

// colormap.rs
pub fn turbo_rgba8(t: f64) -> [u8; 4]; // t in [0,1]; NaN or an empty-data sentinel -> [0,0,0,0] (transparent)
pub fn normalize_to_colormap(values: &[f64]) -> Vec<[u8; 4]>; // linear min-max normalize, then turbo_rgba8

// raster.rs
pub const RASTER_MAGIC: [u8; 4] = *b"IDLR";
pub fn build_spectrogram_raster_bytes(samples: &[f64], sample_rate_hz: f64, width: u16, height: u16, window: FftWindow, nperseg: usize, noverlap: usize) -> Vec<u8>;
pub fn build_histogram2d_raster_bytes(xs: &[f64], ys: &[f64], width: u16, height: u16) -> Vec<u8>;
```

- [ ] **Step 1: `histogram2d`, mirroring `histogram.rs`'s existing conventions**

  Equal-width binning in both dimensions, `Option<(f64,f64)>` explicit range
  or auto-range from finite data (same pattern as `histogram()`); non-finite
  `(x,y)` pairs skipped from both binning and any implicit total; degenerate
  input (`nx==0 || ny==0`, no finite pairs, zero-width range in either axis)
  → `Histogram2dResult` with empty vectors (mirrors `HistogramResult::empty()`).
  `counts` row-major `ny × nx` (row = y bin, matching `SpectrogramResult`'s
  existing row-major convention in this same crate, for consistency across
  the two raster sources).

  Tests, mirroring `histogram.rs`'s existing test shapes one-for-one:
  `histogram2d — all-finite uniform grid — counts sum to total pairs`; `— nx or ny zero — empty result`; `— non-finite pairs skipped`; `— explicit range narrower than data — out-of-range pairs skipped`; `— degenerate zero-width x range — empty result`.

- [ ] **Step 2: Colormap**

  Pick one fixed, documented LUT (Turbo is a reasonable, widely-recognised
  default for a density heatmap and needs no external asset — a compact
  hand-coded polynomial approximation is standard and avoids embedding a
  256-entry table; if a workspace dependency already provides one, prefer
  it — check `core/Cargo.toml` first rather than hand-rolling if e.g.
  `colorous` or similar is already pulled in transitively; if not, hand-roll
  the well-known Turbo polynomial fit, it's ~10 lines). `normalize_to_colormap`
  min-max normalizes (matching `histogram`'s own no-manual-range default
  pattern) and maps every value through `turbo_rgba8`; an entirely-empty or
  all-equal input maps every value to the LUT's zero point (documented, not
  a special case needing its own branch beyond "0/0 → 0.0" guarded division).

  Tests: `turbo_rgba8(0.0)` and `turbo_rgba8(1.0)` return the LUT's documented
  endpoint colours (pin the literal values once computed, so a future LUT
  change is a visible test diff); `normalize_to_colormap — all-equal input —
  every pixel gets the same colour, no division by zero panic`.

- [ ] **Step 3: Raster header + pixel encoding, both kinds**

  16-byte header exactly per C3 §3.6: `magic = b"IDLR"`, `version: u16 = 1`, `width: u16`, `height: u16`, `format: u16 = 0`, `reserved: [u8;4] = [0;4]`. Pixel data: row 0 first (top), left-to-right, `width*height*4` bytes RGBA8, no row padding.

  `build_spectrogram_raster_bytes`: call `spectrogram::spectrogram(...)`
  (existing, unmodified), resample/rebin its `power` matrix (`n_times ×
  n_freqs`, row-major) onto the requested `(width, height)` pixel grid —
  nearest-cell mapping is sufficient for a first version (document this as
  the resampling method; do not silently pick a smoother/lossier method
  without saying so), normalize through `colormap::normalize_to_colormap`,
  write header + pixels.

  `build_histogram2d_raster_bytes`: call `histogram2d::histogram2d(...)`
  sized directly to `(width as usize, height as usize)` (no separate
  resampling step needed — bin count *is* pixel count), normalize `counts`
  (cast to `f64` first) through the same colormap function, write header +
  pixels.

  Tests: **the worked example from C3 §3.6 verbatim** — 64×32, format 0 →
  pixel region `[16, 8208)`, total length 8208 bytes; assert
  `build_histogram2d_raster_bytes(..., 64, 32).len() == 8208` and the same
  for the spectrogram builder; `header bytes match the C3 §3.6 field table
  exactly` (byte-sliced assertions, same style as Task 10 Step 2); `an
  empty/degenerate input — still produces a well-formed header + a
  transparent (all-zero-alpha, per Step 2's zero-data convention) pixel
  region of the requested size, never a truncated or panicking response`.

- [ ] **Step 4: Test and commit**

  Run: `cargo test -p idl-rs "histogram2d|colormap|raster" 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "raster: 2-D histogram, colormap, C3 §3.6 binary encoder (spectrogram + histogram2d)"
  ```

---

### Task 12: Cursor readout (C3 §3.7)

**Spec:** no spec change needed (C3 §3.7's request/response shape is exact;
this task's own choice is the interpolation method, flagged below).

**Files:** Create `cursor.rs`. Modify `lib.rs`.

**Interfaces:**
```
/// Reads `channels`' values nearest a point on the session's t axis.
/// `channels` is `(channel_id, t_us_axis, values)` triples — the caller
/// (L5) supplies each channel's compact (t_us, v) pair, typically read
/// straight off `data.parquet` per C1 §4.5's read rule.
pub fn cursor_readout(channels: &[(&str, &[i64], &[f64])], t_us: i64) -> Vec<(String, Option<f64>)>;
```

**Open Question 6 (stated default, non-blocking):** C3 §3.7 says
"interpolated/nearest value" without picking one. Default adopted here:
**nearest-sample** (binary search on each channel's own `t_us`, which C1
guarantees sorted-ascending per-channel — C1 §3.5 invariant 1 — so
`t_us.partition_point` / a manual binary search is correct and O(log n)),
returning `None` only when the channel has zero samples. Reasoning: linear
interpolation would need a documented policy for a channel with large gaps
(a burst-corrected IMU stream, an event-driven GPS fix) that this contract
does not specify, whereas "nearest recorded sample" matches how the design
doc's hover-interaction description already reads ("Hover reads the
per-pixel-column stats shipped with each tile" — nearest/coarsest, not
smoothed) and needs no gap policy at all. Confirm with the lead; coded and
tested now so Task 12 is not blocked.

- [ ] **Step 1: Nearest-sample lookup, failing tests first**

  Tests: `t_us exactly matches a recorded sample — returns that sample's value`; `t_us between two samples — returns the closer one (tie goes to the earlier sample, documented and tested explicitly)`; `t_us before the channel's first sample — returns the first sample (clamped, not None — "nearest" always has an answer unless the channel is empty)`; `t_us after the last sample — returns the last sample`; `empty channel — returns None`; `multiple channels, one empty — the empty one is None, others populated in the same call`.

- [ ] **Step 2: Test and commit**

  Run: `cargo test -p idl-rs cursor 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "cursor: nearest-sample readout (C3 §3.7)"
  ```

---

### Task 13: `migrate-workbook` CLI subcommand (C2 §6, Stage 1)

**Spec:** no spec change needed (C2 §6/§6.1 are exact and already give the
worked identifier-derivation table).

**Files:** Create `workbook/migrate.rs`. Modify `workbook/mod.rs`, `cli/src/main.rs`, `cli/Cargo.toml` (if a new dep is needed for the CLI's own arg handling — unlikely, `clap` is already a dep).

**Interfaces:**
```
/// Raw v2 `.idl0wb` shape sufficient for migration — deliberately NOT
/// `workbook::model::Workbook` (that type drops `color`/worksheet/chart
/// fields the migration needs to carry forward or convert).
pub struct V2WorkbookRaw { /* workbook_id, name, workbook_version, math_channels[]
    (name, expression, color: Option<String>), constants[] (name, value),
    worksheets[].blocks[]/charts[] (table blocks verbatim as serde_json::Value,
    chart slots verbatim as serde_json::Value for _migrate_charts passthrough) */ }

pub fn derive_identifier(original: &str, existing: &HashSet<String>) -> String; // C2 §6.1 algorithm exactly
pub struct MigrationReport { pub renamed: Vec<(String, String)> } // "<old>" -> "<new>" lines
pub fn migrate_workbook_text(v2_json: &str) -> Result<(String, MigrationReport), MigrateError>; // returns the v3 Markdown text
```

- [ ] **Step 1: `derive_identifier` — the C2 §6.1 algorithm, its own worked examples as tests**

  Implement the five numbered steps exactly (lowercase; collapse non-`[a-z0-9]`
  runs to one `_`; trim leading/trailing `_`; digit-prefix guard; collision
  suffix `_2`, `_3`, … in source order).

  Tests (transcribe C2 §6.1's own worked table verbatim — this is a
  correctness-critical transcription, test it as literally as Task 2 Step 1
  tested the error messages): `"Roll (deg)" — derive_identifier — "roll_deg"`;
  `"Fork travel [mm]" — derive_identifier — "fork_travel_mm"`; `"Roll (deg)"
  then "Roll [deg]" in the same document — second gets "roll_deg_2"`; `name
  already a valid identifier — returned unchanged, not run through the
  algorithm at all` (confirm the caller only invokes this for names that
  fail the `identifier` regex, per C2 §6's table — test the *caller*
  decision, not just this function, in Step 3).

- [ ] **Step 2: `V2WorkbookRaw` deserialization**

  Test: deserialize a synthetic v2 JSON document (inline string, built to
  exercise every row of C2 §6's mapping table: two `math_channels` — one
  needing sanitisation, one not — a `color`, front-matter-bound `constants`,
  one table block, one chart block with `channelColors`/`yScaleMode` — and
  assert every field lands where the struct expects it (a pure
  deserialization test, no migration logic yet).

- [ ] **Step 3: `migrate_workbook_text` — the C2 §6 table, row by row**

  Implement each row of C2 §6's mapping table in order: `workbook_id → id`
  verbatim; `name` verbatim; `workbook_version` → `version: 3` (refuse `> 2`
  with a typed `MigrateError`, not a guess); drop `created_at_ms`/`updated_at_ms`;
  collapse all `math_channels[]` into one `math` cell (identifier
  sanitisation via Step 1, `# label:` comment when sanitised, reference
  rewriting for every `[OldName]` elsewhere in the migrated expression set —
  including inside chart cells staged for Stage 2, per C2 §6's closing note);
  `constants[]` → front-matter map (drop `id`, refuse a name colliding with
  `pi`/`tau`/`e`/`g` rather than silently shadow — reuses Task 4's
  `ReservedName` check conceptually, though this is a migration-time refusal
  via `MigrateError`, not a `WorkbookError`, since there is no cell yet to
  scope it to); table blocks → one `table` cell per `TableModel`, copied
  verbatim; chart slots/legacy `charts[]` → the transient front-matter key
  `_migrate_charts` (flattened across worksheets, worksheet name/order
  dropped, per C2 §6's own explicit rule); `overlay_layouts[]` → dropped
  entirely (D9); every fenced cell gets a freshly generated `id=` (Task 1's
  generator, reused).

  Tests, one per C2 §6 table row minimum: `math_channels collapse into one
  cell — two definitions, correct order`; `sanitised name gets a # label:
  comment with the original text`; `reference to a sanitised name elsewhere
  in the expression set is rewritten`; `color carried into
  _migrate_charts-adjacent fallback, not dropped` (per C2 §6's "dropped at
  this stage… carried forward as a fallback" — confirm the raw color string
  survives into the emitted front matter or cell metadata wherever this
  plan chooses to stage it for Stage 2 to read); `constants map correct,
  ids dropped`; `constant named "g" — MigrateError, not silently renamed`;
  `table block → table cell, JSON copied verbatim`; `chart slot →
  _migrate_charts entry, worksheet name not present anywhere in the
  output`; `workbook_version 3 in the source — MigrateError (unsupported,
  not a v2 file at all)`; `overlay_layouts present — absent from output,
  no trace`.

- [ ] **Step 4: CLI wiring**

  `cli/src/main.rs`: add `MigrateWorkbook { input: PathBuf, output: PathBuf }`
  to `enum Command` (matching the existing variants' doc-comment style), a
  match arm reading `input`, calling `migrate_workbook_text`, writing
  `output`, and printing `MigrationReport`'s renamed lines (one per line,
  `"<old>" → "<new>"`, per C2 §6's exact requirement) plus a final summary
  count.

  Test: a `#[test]` in `cli` (or an integration test under `cli/tests/` if
  that directory already exists — check first) round-tripping a small file
  through the actual binary invocation isn't required; a direct call to
  `migrate_workbook_text` plus a thin CLI-arg-parsing smoke test is enough —
  the heavy logic is already covered by Step 3.

  Run: `cargo build -p idl-rs-cli 2>&1 | tail -5; cargo run -p idl-rs-cli -- migrate-workbook --help 2>&1 | head -10`. Expected: builds clean, help text lists `--input`/`--output` (or positional args, matching the existing subcommands' convention — check one, e.g. `Fit`, for the argument style to match).

- [ ] **Step 5: Test and commit**

  Run: `cargo test -p idl-rs -p idl-rs-cli migrate 2>&1 | grep -E "^test result"`. Expected `0 failed`.

  ```bash
  git add -A && git commit -m "cli: idl-rs migrate-workbook Stage 1 (v2 JSON -> v3 Markdown, C2 §6)"
  ```

---

### Task 14: SPEC §17a rewrite

**Spec: spec-first.** This task's output *is* the spec; do it before Task
13's CLI text-emission code is written against assumptions about what the
SPEC says, even though C2 is the real grammar authority — §17a is the
reader-facing summary every other SPEC section's cross-references point at.

**Files:** Modify `docs/IDL0_SPEC.md` (idl1-app repo root, not the submodule).

**Decision: rewrite §17a in place, same section number** (not a new section
with §17a marked superseded). Reasoning: CLAUDE.md's own framing —
"the app-side parts describe idl0 and are rewritten lane by lane — a lane's
SPEC section, once written, wins" — reads as literal in-place replacement,
not addition; §17a is *entirely* app-side content (D8 replaces the v2
workbook wholesale, there is no wire/device-protocol residue in this section
worth preserving separately, unlike e.g. a section mixing device and app
concerns); keeping the section number stable preserves every existing
cross-reference and grep hit (`grep -rn "§17a"` across the docs corpus keeps
working, matching the `// TODO(idl0):` grep-continuity principle CLAUDE.md
§5 already establishes for code comments); and it avoids leaving an orphaned,
easily-mistaken-for-current stale section sitting in the file next to its
replacement. The full v2 grammar is not lost — `docs/legacy/idl0-workbook_format.md`
already carries it, unchanged by this task, exactly as C2 §6's migration
table cites it as ground truth.

- [ ] **Step 1: Write the replacement text**

  Replace the current §17a (`docs/IDL0_SPEC.md` lines ~1412–1479, "17a.
  Workbook Entity" through the line before "17b. Track Artifact") with:

  ```markdown
  ## 17a. Workbook Entity (`.idl1wb`)

  A Workbook is a portable, session-agnostic analysis document: prose, math
  cells, table cells and JS chart cells, as Observable Framework-compatible
  Markdown. Charts reference channels and math definitions by name, never by
  session id, and render against whatever session the app binds at runtime.
  Full grammar, cell-id scheme, math-cell language, table-cell schema, JS
  host variables and migration rules: **`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`
  (contract C2)** — that document is authoritative; this section is a
  summary for readers navigating the SPEC, not a second source of truth.

  ### 17a.1 Storage

  - File: `<workbookId>.idl1wb`, UTF-8, LF line endings, at
    `<data>/workbooks/<name>.idl1wb` (path root: contract C4).
  - The workbook **is** the file — no database mirror, no Drive sync layer
    (D7's LAN sync replaces the old Drive-based sync entirely; see §17a.4).
  - Conflict policy: per-cell merge (C2 §7), not last-write-wins on the
    whole file.

  ### 17a.2 Schema (`version: 3`)

  YAML front matter (`id` UUIDv4, `name`, `constants`, `units`, `version`)
  followed by CommonMark prose interleaved with fenced ` ```math `,
  ` ```table ` and ` ```js ` cells (C2 §1–§2). Every fenced cell carries a
  stable `id=<8 hex>` in its fence info string, assigned on first save and
  never changed — the unit of diff and sync merge (C2 §2.2, §7).

  **Math cells** (C2 §3) hold one or more `name = expression` lines in a
  flat, whole-document namespace; `name` is a JS-identifier (unlike v2's
  free-text `MathChannel.name` — see §17a.5); a `# label: <text>` trailing
  comment carries a free-text display name. The expression grammar is the
  engine's existing evaluator (`idl-rs::math::{token,parse,eval}`), unchanged,
  with a 69-function builtin catalog (C2 §3.3) and a unit table (C2 §3.4)
  consulted only by the editor UI, never by evaluation. `const NAME = value`
  lines and front-matter `constants` share one flat, workbook-scoped
  namespace.

  **Table cells** (C2 §4) carry the existing `TableModel` JSON verbatim,
  unchanged from v2.

  **JS cells** (C2 §5) are standard Observable Runtime cells, executed in an
  origin-isolated sandboxed iframe (design doc §6), never crossing Tauri IPC
  directly. The host binds one JS variable per math definition (a
  `{length, t, v}` column-oriented table — `t` in **seconds**, distinct from
  the Parquet storage axis `t` in the session schema, which is microseconds;
  see contract C1 §3.1 and C2 §5.1) plus `channel()`, `laps`, `session`,
  `constants`, `Plot`, `d3`, `Inputs`, `html`. A Properties form generates
  and parses back a fixed subset of `Plot.plot(...)` code (C2 §5.3,
  `plotForm`); code outside that subset is "custom" and edited as text only.

  Newer-than-supported `version` refuses the file
  (`UnsupportedWorkbookVersion`, C2 §3.5.A); an absent `version` key defaults
  to `3`.

  ### 17a.3 Session binding (view context)

  Unchanged from v2: workbooks are session-agnostic; a view context binds a
  primary session and an optional overlay session at render time, never
  serialized into the file.

  ### 17a.4 Sync

  LAN sync (design doc §7, contract to follow in L11's wave-2 work) replaces
  Drive sync entirely: pull-based manifest/blob sync between paired peers on
  the local network, with workbook merge **per cell** (C2 §7) rather than
  whole-file last-write-wins — a cell changed on only one side takes that
  side; a same-cell conflict appends the peer's version as a marked conflict
  cell (`<!-- conflict from <peer> -->`) directly below, so the file always
  stays valid Markdown. No cloud relay in v1 (design doc §15).

  ### 17a.5 Migration from v2 (`workbook_version` 1 or 2)

  `idl-rs migrate-workbook <input.idl0wb> <output.idl1wb>` converts a v2
  file's `math_channels[]` into one `math` cell (identifier-sanitising any
  name that isn't already a valid JS identifier — every idl0 AHRS built-in
  needs this — while preserving the original as a `# label:` comment; C2
  §6.1's exact algorithm), `constants[]` into front-matter `constants`,
  table blocks into `table` cells verbatim, and stages chart slots in a
  transient `_migrate_charts` front-matter key the app converts to `js`
  cells on first open (Properties-form code generation; not a CLI concern —
  C2 §6). `overlay_layouts[]` is dropped (D9). `worksheets[].xAxisMode` and
  the three non-timeSeries chart types with no v3 analogue
  (`gpsMap`/`lapTable`/`lapProgression`) have no migration path and are
  dropped with a logged warning, not silently discarded without a trace.
  ```

- [ ] **Step 2: Verify no other SPEC section's cross-reference breaks**

  Run (Git Bash, repo root): `grep -rn "§17a\|17a\." docs/IDL0_SPEC.md | grep -v "^1412:\|^1481:"` (adjust line numbers to wherever the rewritten section actually lands) to confirm nothing else in the SPEC references a sub-heading (`§17a.2`'s old field table, e.g.) this rewrite removed. If a reference to a dropped field (`overlay_layouts`, `workbook_version = 2`'s exact table) exists elsewhere, update that reference too, in the same commit.

- [ ] **Step 3: Commit**

  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && git add docs/IDL0_SPEC.md && git commit -m "docs: SPEC §17a rewritten for workbook v3 (C2)"
  ```

---

### Task 15: Done-when proofs — byte-for-byte migration and tile-stats verification

**Spec:** no spec change needed (this task only tests prior work).

**Files:** Add tests to `workbook/migrate.rs` (or a new `workbook/v3/tests_migration_parity.rs`, matching the existing `math/tests_parity.rs` naming convention already in the tree) and `tile.rs`.

- [ ] **Step 1: Byte-for-byte migration parity test**

  Build, inline, a synthetic v2 workbook JSON with several `math_channels`
  (including at least one AHRS built-in-shaped name needing sanitisation, one
  referencing another by `[Name]`, one using a front-matter constant) and a
  synthetic session (via `SessionHandle::from_channels`, the existing test
  pattern from `math/resolve.rs`). Evaluate every migrated definition two
  ways:
  1. **v2 path:** `math::evaluate(&def.expression, &session_handle, &lap_ctx)`
     per `MathChannelDef`, using the *original* (unsanitised) expression
     text and the v2 flat-file constants.
  2. **v3 path:** `migrate_workbook_text` → `parse_workbook` → Task 9's
     `eval_cells` → unwrap each `CellEvalResult.host_value`.

  Assert, per definition (matched by original name → migrated identifier via
  the `MigrationReport`): `v2_result.samples == v3_result.v` **exactly**
  (`f64` equality, not epsilon-approximate — same evaluator, same inputs,
  bit-for-bit is the correct bar per the done-criterion's own wording) and
  `v3_result.t.len() == v2_result.samples.len()`. This is the plan's
  concrete satisfaction of "Evaluates a migrated idl0 workbook byte-for-byte
  on math outputs."

  Test name: `migrated_workbook_evaluates_byte_for_byte_against_v2_evaluator`.

- [ ] **Step 2: Tile-stats-vs-decimation integration test**

  Take a real evaluated v3 math-cell result (from Step 1's synthetic
  session, not a hand-built array — this is the "integration level" pass
  Task 10 Step 4 promised), run it through `build_tile_bytes`, decode the
  sample region back out, and assert it equals
  `decimate_channel(&v.samples_as_f64, tier, tile_index)` cast to `f32`
  element-for-element — the plan's concrete satisfaction of "tile stats
  verified against decimation."

  Test name: `tile_built_from_an_evaluated_math_cell_matches_decimate_channel_directly`.

- [ ] **Step 3: Full workspace test, one more time**

  Run: `cd rust && cargo test --workspace 2>&1 | grep -E "^test result|FAILED"`. Expected: every line `0 failed`.

  ```bash
  git add -A && git commit -m "test: migration byte-for-byte parity and tile-vs-decimation verification (M0 L3 done-criteria)"
  ```

---

### Task 16: CHANGELOG, TASKS, lane brief

**Spec:** no spec change needed.

**Files:** Modify `CHANGELOG.md`, `TASKS.md` (idl1-app repo root). Create `runs/2026-09-03/lanes/l3-workbook/BRIEF.md`.

- [ ] **Step 1: `CHANGELOG.md`**

  Under `## [Unreleased]` → `### Added`:
  ```markdown
  - **Workbook v3 (`.idl1wb`) lands in idl-rs core (L3).** Markdown/front-matter
    parsing, cell-id assignment, the math-cell definition grammar with flat
    cross-cell constants and a 69-function builtin catalog, table-cell wiring,
    Rust-side host-variable data for JS cells, tile/raster/cursor endpoints
    (C3 §3.5-3.7), and `idl-rs migrate-workbook` (C2 §6 Stage 1). Resolves the
    C1 §8 item 5 `t` (µs storage vs. seconds host-variable) naming collision.
    SPEC §17a rewritten for v3.
  ```

- [ ] **Step 2: `TASKS.md`**

  Under `## Wave 1 (after M0)`, tick `- [ ] L3 core workbook v3` to `- [x]`.

- [ ] **Step 3: Write the lane brief**

  Create `runs/2026-09-03/lanes/l3-workbook/BRIEF.md` per the format other
  wave-1 lane briefs use (scope, plan path, dependency gate, branch, done
  criteria, SPEC sections touched, the tile/raster/cursor function list for
  L5).

- [ ] **Step 4: Commit**

  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && git add CHANGELOG.md TASKS.md runs/2026-09-03/lanes/l3-workbook/BRIEF.md && git commit -m "docs: L3 workbook v3 complete — CHANGELOG, TASKS, lane brief"
  ```

---

## Open questions

Every item has a stated default already adopted in the task text above
(nothing here blocks the plan's execution) and is logged here per CLAUDE.md
§1 rather than silently assumed.

1. **Stray math-cell-body line with no recognisable form** (Task 3 Step 1) —
   not one of C2 §3.5.A's seven structural kinds. Default: surfaced as
   `InvalidIdentifier` with a message describing the closest expected shape.
   **Assigned: lead**, confirm or supply a real "malformed line" kind in a
   future C2 revision.
2. **Malformed table-cell JSON has no C2 §3.5.A kind either** (Task 7). Default:
   a `WorkbookError` with a message carrying the `serde_json` error text,
   using an existing kind's slot rather than inventing a new enum variant
   this plan can't add to a signed contract unilaterally. **Assigned: lead.**
3. **One `CellOutput`-equivalent per math *definition*, not per math *cell*,
   for a multi-definition cell** (Task 9 Step 1) — C3 §3.4 doesn't disambiguate
   this. Default: per-definition, sharing the cell's `cell_id` (not unique
   across the returned list for such a cell). **Assigned: lead / L5**,
   confirm before L5 finalises the `eval_workbook` JSON mapping.
4. **Tile column-stats sample-range mapping** (Task 10) — C3 §3.5 doesn't
   state what span `column_count` pixel columns cover. Default: the same
   raw-sample span the tile's own bucket region covers. **Assigned: lead.**
5. **C3 §3.5's worked example's `sample_count = 512` vs. `decimate_channel`'s
   fixed `TILE_SIZE_BUCKETS = 1024`** (Task 10 Step 3) — a real inconsistency
   between the contract's illustrative numbers and the current engine
   constant; the format is self-describing so this doesn't block anything,
   but the discrepancy itself should be looked at. **Assigned: lead.**
6. **Cursor readout interpolation method** (Task 12) — C3 §3.7 says
   "interpolated/nearest" without choosing. Default: nearest-sample,
   clamped at both ends, never `None` for a non-empty channel. **Assigned:
   lead.**
7. **`fetch_raster`'s single `channel` argument vs. `histogram2d` needing
   two channels (x and y)** — this is **C3's own** open question 6.4, not a
   new one this plan raises; flagged here only so L5 sees it early: this
   plan's `build_histogram2d_raster_bytes(xs, ys, ...)` already takes two
   sample slices, so whatever second-channel argument shape C3's eventual
   revision picks for `fetch_raster`, L5's wrapper has a function to call
   that already accepts two channels — no L3-side blocker. **Assigned:
   whoever resolves C3 open question 6.4 (not L3).**
8. **Front-matter YAML crate and `pulldown-cmark` version** (Task 1 Step 1) —
   not covered by the M0 ecosystem report (which only priced
   Tauri/BLE/Arrow/Observable-stack crates). **Assigned: L3's implementer**,
   at Task 1 execution time — check crates.io directly, do not guess.

None of the eight blocks any task above from proceeding with its stated
default; each is a confirm-or-revise item for the lead, not a stop.

---

## Self-review

**Spec coverage (C2 sections → tasks):** §1 (container) → Task 1; §2 (cells,
ids, ordering) → Task 1; §3.1 (definition syntax, constants) → Tasks 3–4;
§3.2 (expression grammar, unmodified) → Task 4's `parse_with_constants`
addition, explicitly additive; §3.3 (builtin catalog) → consumed as-is by
Task 5/6/9 (already implemented in `math/eval.rs`, no v3 work needed beyond
threading `t_us` through it); §3.4 (unit table) → not engine work (C2 §1:
"not evaluated by the engine" — no task needed, noted so its absence from
the task list isn't a gap); §3.5 (validation errors) → Task 2 (structural),
Tasks 3–4 (raising them), Task 6/9 (evaluation errors, reusing
`MathEvalErrorKind` verbatim per the existing error.rs, untouched); §4
(table cells) → Task 7; §5.1 (host variables) → Tasks 5 (time model) + 8
(data functions); §5.2 (`${…}`) → Task 8 Step 4; §5.3 (`plotForm`) → not this
lane (L6, explicitly out of scope per Global Constraints); §6 (migration) →
Tasks 13–14; §7 (merge) → not this lane (L11, explicitly out of scope).

**C1 §8 item 5:** resolved concretely in Task 5's doc-comment resolution
text and Task 8 Step 1's single `to_host_channel` conversion site — the two
together are the "how" the brief asked for, not just a restatement of the
problem.

**C3 coverage:** §3.5 → Task 10; §3.6 → Task 11; §3.7 → Task 12. All three
produce plain Rust functions; none creates a `#[tauri::command]` (Global
Constraints' boundary rule, checked against every task's Files list — none
lists anything under `rust/tauri/`).

**Done-when criteria, both proven by name:** "Evaluates a migrated idl0
workbook byte-for-byte on math outputs" → Task 15 Step 1,
`migrated_workbook_evaluates_byte_for_byte_against_v2_evaluator`. "Tile
stats verified against decimation" → Task 10 Step 4 (unit level) and Task 15
Step 2, `tile_built_from_an_evaluated_math_cell_matches_decimate_channel_directly`
(integration level).

**Placeholder scan:** no `TBD`/`TODO`/`decide later` in any task body; every
`<…>` token is a real placeholder resolved by that step's own text (`<pin>`-
style tokens do not appear here since, unlike M0, this plan has only one
un-pinned dependency pair, handled explicitly in Task 1 Step 1 and Open
Question 8 rather than left as a silent token).

**Type consistency:** `LookupChannel.t_us`/`EvalOutput.t_us` (Task 5) is the
one new field every later task's host-variable and tile/cursor work reads
from — Task 8's `to_host_channel` and Task 12's `cursor_readout` both take
`t_us: &[i64]`/`Arc<[i64]>` consistently; `HostChannel` (Task 8) is the one
struct Task 9 wraps as `CellEvalResult.host_value`; `WorkbookErrorKind`
(Task 2) is the one error vocabulary Tasks 1/3/4/7 all raise into, never a
per-task ad hoc string.

**Lane boundary check:** every Files list in every task is under
`rust/core/src/`, `rust/cli/src/`, `rust/*/Cargo.toml`, or
`docs/IDL0_SPEC.md`/`CHANGELOG.md`/`TASKS.md`/`runs/**` in the idl1-app repo
root — nothing under `rust/tauri/`, `rust/transport/`, `app/`, matching
CLAUDE.md §7's "lanes touch only their own crate/directory."
