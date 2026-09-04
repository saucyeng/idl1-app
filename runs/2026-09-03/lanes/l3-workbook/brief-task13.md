# L3 Task 13 — implementer brief (`migrate-workbook` CLI subcommand; C2 §6, Stage 1)

You are the implementer for L3 Task 13 of the idl1 rewrite — the thirteenth
task of the core workbook-v3 lane. TDD, one commit, then report.

**Ordering note:** Task 14 (SPEC §17a rewrite, spec-first) is dispatched and lands **before**
this task, specifically so its CLI-invocation text matches L3-R38 below rather than guessing at
it (G14.6). If you are dispatched before Task 14's commit exists, stop and report — do not guess
at the SPEC wording either way.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 12 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  Global Constraints (41–135), `### Task 13` (885–990, **superseded where it conflicts with the
  landed C2 §6/§6.1 below**); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §6/§6.1 (762–860 — this is the **amended, landed** text: the CLI invocation, `_migrate_math`,
  `workbook_id`/`workbook_version` rules, the struck phantom `worksheets[].tables[]` row, the
  migration-report-and-refusal-policy paragraph); `docs/legacy/idl0-workbook_format.md` (ground
  truth for the v2 shape — `charts` is the only flat legacy array, table content lives only at
  `blocks[].content.table`, `id` on a math channel defaults to `name`); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`, Task 13 section (G13.1–G13.13,
  L3-R36–R39) and its Q3 (product default: migrate and report, don't refuse); ledger `R25` in
  `runs\2026-09-03\decisions.md`; landed `workbook/v3/error.rs` (`RESERVED_NAMES: [&str; 15]`,
  line 51); `workbook/v3/cell.rs` (`generate_cell_id()`, currently private, line 88 — L3-R39
  makes it `pub(crate)`); `workbook/v3/mod.rs`'s `parse_workbook` (the v3 one —
  `crate::workbook::v3::parse_workbook`, line 98; **bare `parse_workbook` inside `workbook/`
  resolves to the v2 reader**, `workbook/mod.rs:12`, `pub use read::{parse_workbook, …}` — always
  qualify); `workbook/model.rs` (`SUPPORTED_WORKBOOK_VERSION: u32 = 2`, line 11 — re-exported at
  `workbook::SUPPORTED_WORKBOOK_VERSION` too; use the constant, never a literal `2`); `cli/src/main.rs`
  (module doc, lines 1–12, listing bulk commands `export, math, fit, recover, scan` — this task
  adds `migrate-workbook` to that list; the `Recover` variant, ~line 218 onward, for the
  positional-path + `#[arg(short, long)] output: PathBuf` (required) convention this task
  matches); `cli/src/envelope.rs` (`ErrorKind{Io, InvalidInput, NotFound, Eval, Unsupported,
  Usage, Internal}` line 38; `emit_bulk(command: &str, result: Result<(), CliError>) ->
  ExitCode`, line 281); verified: no `cli/tests/` directory exists (`cli/` holds only
  `Cargo.toml`, `src/`) — inline `#[cfg(test)]` in `cli/src/main.rs` (G13.12).

## COMPUTE RULES — non-negotiable
Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not override). While working:
`cargo test -p idl-rs workbook::migrate`, non-zero `passed`. Then, once, at the end: `cargo test
-p idl-rs-cli`, non-zero `passed`, `0 failed` (this task adds a subcommand — the whole crate is
small, running it whole is cheap and implies `cargo check -p idl-rs-cli --tests`, so no separate
check command). The plan's own `-p idl-rs -p idl-rs-cli migrate` filter is acceptable **only**
if you additionally confirm it reports non-zero `passed` (L3-R8) — prefer the two commands above,
they're unambiguous. No tarpaulin, no `-j`, no `.cargo/` edits, never `cargo fmt`. One cargo
process at a time, foreground.

## The task (plan Task 13, Steps 1–5) with these rulings

**Interfaces (plan's, largely unchanged — corrections noted inline):**
```
/// Raw v2 `.idl0wb` shape sufficient for migration — deliberately NOT
/// `workbook::model::Workbook` (that type drops color/worksheet/chart fields
/// the migration needs to carry forward or convert).
pub struct V2WorkbookRaw { /* workbook_id, name, workbook_version, math_channels[]
    (id: Option<String> defaulting to name, name, expression, color: Option<String>),
    constants[] (name, value), worksheets[].blocks[]/charts[] (table blocks verbatim as
    serde_json::Value, chart slots verbatim as serde_json::Value for _migrate_charts
    passthrough, block metadata id/placement/overlayTargetId/overlayOpacity/rowSource) */ }

pub fn derive_identifier(original: &str, existing: &HashSet<String>) -> String; // C2 §6.1 algorithm exactly
pub struct MigrationReport {
    pub renamed: Vec<(String, String)>,             // "<old>" -> "<new>" sanitised-identifier lines
    pub identifier_by_v2_id: BTreeMap<String, String>, // v2 math_channel id (or name) -> migrated v3 identifier, EVERY definition, not just renamed ones
    pub dropped: Vec<String>,                        // one line per dropped field/behaviour (block metadata, rowSource, overlay_layouts, unresolved mathChannelIds)
}
pub fn migrate_workbook_text(v2_json: &str) -> Result<(String, MigrationReport), MigrateError>;
```

**Ruling — L3-R36 (structural, now landed in C2 §6 D5 — code it, do not re-derive it).** The
migration carries an identity map, not just a rename list — `identifier_by_v2_id` above closes
G13.1/G13.3/G15.3 in one field: every `math_channels[]` definition gets an entry, keyed by its v2
`id` (defaulting to `name` when absent, the legacy format's own convention), whether or not it
was renamed. The emitted front matter gains the transient key `_migrate_math: { "<v2 id>": {
"identifier": "<v3 identifier>", "color": "<v2 color, or null>" } }`, one entry per definition —
deleted by the app in the same Stage-2 pass that deletes `_migrate_charts` (C2 §6's idempotence
rule, unchanged). This is what lets a `ChartSlot.mathChannelIds` entry in `_migrate_charts`
resolve to a real v3 identifier in Stage 2, and what carries `.color` forward as the fallback
stroke source C2 §6's `math_channels[].color` row already names.

**Ruling — L3-R37.** One derivation pass, **source order**, over `math_channels[]`. `existing`
starts **empty** — every assigned identifier (valid-as-is names included) is inserted as it's
assigned, so step 5's `_2` suffix fires correctly in either direction (a channel already named
`roll_deg` and a later one deriving to `roll_deg` collide; G13.4). After deriving-or-accepting,
check the result against `RESERVED_NAMES` (`v3/error.rs:51`) and, if it collides, run it through
the **same** `_2`/`_3` suffix path as a sanitisation collision — with the original name preserved
as a `# label:` comment exactly as a sanitised name is, even though a reserved-but-otherwise-valid
name (`Time`, `Session`) was never run through `derive_identifier`'s five steps (G13.3).
`derive_identifier`'s own signature/algorithm is unchanged; the reserved check lives in the
**caller** (`migrate_workbook_text`), with its own tests: `v2 channel named "Session" — migrates
to session_2 and the output parses`; `v2 channel named "Time" — valid identifier but reserved,
migrates to Time_2`. Constants keep C2 §6's harder rule unchanged: a constant colliding with
`pi`/`tau`/`e`/`g` is a `MigrateError` refusal, never silently suffixed — a constant's collision
is the author asserting a value, a definition's is an accident of sanitisation.

**Ruling — L3-R38.** CLI shape, now pinned in C2 §6 D2 (landed) — code exactly this, do not
invent flags: `idl-rs migrate-workbook <INPUT> --output <OUTPUT>` — positional input (the
`Recover` pattern), `-o`/`--output` **required** (not `Option<PathBuf>` — unlike `export`/`math`,
stdout is not a legal sink here; a `.idl1wb` document there would interleave with the migration
report). Wire through `emit_bulk("migrate-workbook", …)`. `MigrateError` → `ErrorKind` mapping:
`Io → ErrorKind::Io`; an unsupported/absent-but-out-of-range `workbook_version`, undeserialisable
JSON, or the reserved-constant refusal → `ErrorKind::InvalidInput` with `details` naming the
offender (the version value, the JSON parse error, or the constant name). The rename/report
lines go to **stdout** (one `"<old>" → "<new>"` per renamed definition, then every
`identifier_by_v2_id`/`dropped` line per Q3 below, then a final summary count); the error
envelope goes to **stderr** on failure, matching every other bulk command. Add
`migrate-workbook` to the module doc's bulk-command list (`cli/src/main.rs:1-12`) in the same
edit.

**Ruling — L3-R39.** Corrections to C2 §6 this task implements (all already landed in the
contract text — this restates what to code, not a new proposal): `workbook_version` accepted
range is `1..=workbook::SUPPORTED_WORKBOOK_VERSION` (the constant — `model.rs:11` — never a
literal `2`), absent defaults to `1`; a value outside the range is the version `MigrateError`
above. `workbook_id` is copied verbatim **only when it parses as a UUID** (any version — use the
`uuid` crate's parser, already a dependency via C2 §1's own `id` validation); otherwise mint a
fresh `Uuid::new_v4()` and record the substitution in the report (`dropped` or a dedicated field
— your choice, document it either way, G13.13). Table blocks (`blocks[].content.kind ==
"table"`) are read and re-emitted as `serde_json::Value` — "verbatim" means **semantically
identical JSON**, not identical bytes (`serde_json::Map` is a `BTreeMap` unless `preserve_order`
is on, and it is not, `core/Cargo.toml` — G13.8; do not write a byte-equality test, write a
value-equality one). The only legacy flat array is `worksheets[].charts[]` — **there is no
`worksheets[].tables[]`**; do not hunt for it (G13.6). Block metadata (`id`, `placement`,
`overlayTargetId`, `overlayOpacity`) and a table block's `rowSource` are **dropped with a report
line each**, never silently — a `rowSource == "lapSelection"` table additionally gets an explicit
warning line that its live N-lap-comparison behaviour is not carried into v3 (G13.7). `overlay_layouts[]`
is dropped entirely, no trace, no report line needed beyond confirming absence (D9,
already-settled). `generate_cell_id` (`v3/cell.rs:88`) becomes `pub(crate)`, reused here for
every fenced cell this migration emits. Every test in Step 1/3 below that calls the v3 parser
must write `use crate::workbook::v3::parse_workbook` explicitly — bare `parse_workbook` resolves
to the v2 reader (`workbook/mod.rs:12`) and would silently test the wrong function (G13.9).

**Q3 (defaulted, ledger R25) — migration report and refusal policy.** Beyond the
one-line-per-rename warning, the report additionally lists: every `mathChannelIds` entry across
`_migrate_charts` with **no** matching key in `identifier_by_v2_id`/`_migrate_math` (an unresolved
chart reference — migration does **not** refuse for this, it tells the truth about what it could
not carry); every dropped block-metadata field; every `rowSource == "lapSelection"` table
(explicit warning, migrated anyway). **None of these three ever refuses the migration** —
refusal is reserved for exactly two rules: an unrecognised `workbook_version`, and a migrated
constant colliding with `pi`/`tau`/`e`/`g`. Every other irregularity is reported and migrated
through.

- [ ] **Step 1: `derive_identifier` — C2 §6.1's algorithm, its own worked examples as tests.**
  Five numbered steps exactly (lowercase; collapse non-`[a-z0-9]` runs to one `_`; trim
  leading/trailing `_`; digit-prefix guard; collision suffix `_2`, `_3`, … in source order).
  Tests (transcribe C2 §6.1's worked table verbatim — correctness-critical transcription):
  `"Roll (deg)" → "roll_deg"`; `"Fork travel [mm]" → "fork_travel_mm"`; `"Roll (deg)" then "Roll
  [deg]" in the same document — second gets "roll_deg_2"`; `name already a valid identifier —
  returned unchanged, not run through the algorithm at all` (the caller-decision test belongs in
  Step 3, where the reserved-name interaction from L3-R37 also lives — do not test it here in
  isolation from that interaction).

- [ ] **Step 2: `V2WorkbookRaw` deserialization.** Test: deserialize a synthetic v2 JSON document
  exercising every row of C2 §6's table — two `math_channels` (one needing sanitisation, one
  not, each with an `id` and a `color`), front-matter `constants`, one table block, one chart
  block with `channelColors`/`yScaleMode`, one block carrying `overlayTargetId`/`placement`, one
  table block with `rowSource: "lapSelection"` — assert every field lands where the struct
  expects it. Pure deserialization, no migration logic yet.

- [ ] **Step 3: `migrate_workbook_text` — the C2 §6 table, row by row, per L3-R36–R39 above.**
  Implement every row in order, including the reserved-name interaction (L3-R37) and the
  `_migrate_math` key (L3-R36). Tests, one per C2 §6 table row minimum, per L3-R36–R39: `math_channels
  collapse into one cell — two definitions, correct order`; `sanitised name gets a # label:
  comment with the original text`; `reference to a sanitised name elsewhere in the expression set
  is rewritten, including inside a staged chart-slot expression string`; `v2 channel named
  "Session" — migrates to session_2` (L3-R37); `v2 channel named "Time" — reserved, migrates to
  Time_2` (L3-R37); `_migrate_math has one entry per math_channels definition, keyed by v2 id
  defaulting to name, carrying identifier and color` (L3-R36); `constants map correct, ids
  dropped`; `constant named "g" — MigrateError, not silently renamed`; `table block → table cell,
  JSON semantically identical (value equality, not byte equality — G13.8)`; `chart slot →
  _migrate_charts entry, worksheet name not present anywhere in the output`; `workbook_version
  out of range (> SUPPORTED_WORKBOOK_VERSION) — MigrateError`; `workbook_version absent —
  defaults to 1, migration proceeds`; `workbook_id not a valid UUID — a fresh UUID is minted and
  recorded`; `workbook_id already a valid UUID — copied verbatim`; `overlay_layouts present —
  absent from output, no trace`; `block with overlayTargetId/placement — dropped, reported`;
  `table block with rowSource: "lapSelection" — migrated as an ordinary table, explicit warning
  in the report`; `chart's mathChannelIds entry with no matching _migrate_math key — migration
  succeeds, the unresolved reference is listed in the report` (Q3).

- [ ] **Step 4: CLI wiring.** `cli/src/main.rs`: add `MigrateWorkbook { input: PathBuf, #[arg(short,
  long)] output: PathBuf }` to `enum Command` (doc-comment style matching existing variants), a
  match arm reading `input`, calling `migrate_workbook_text`, writing `output`, printing the
  report to stdout per L3-R38, wired through `emit_bulk`. Add `migrate-workbook` to the module
  doc's bulk-command list. Test: a direct call to `migrate_workbook_text` plus a thin
  CLI-arg-parsing smoke test, inline `#[cfg(test)]` in `cli/src/main.rs` (G13.12 — no
  `cli/tests/` directory exists; do not create one). Run: `cargo build -p idl-rs-cli 2>&1 | tail
  -5; cargo run -p idl-rs-cli -- migrate-workbook --help 2>&1 | head -10`. Expected: builds
  clean, help text shows the positional input and `-o, --output <OUTPUT>` (required — clap
  renders it without brackets).

- [ ] **Step 5: Test and commit.** Run both commands (COMPUTE RULES), each non-zero `passed`, `0
  failed`. Commit with explicit paths (NOT `git add -A`): `git add core/src/workbook/migrate.rs
  core/src/workbook/mod.rs core/src/workbook/v3/cell.rs cli/src/main.rs` (plus any other file
  actually touched, e.g. `Cargo.toml` only if a new dep was genuinely needed — unlikely) —
  message `cli: idl-rs migrate-workbook Stage 1 (v2 JSON -> v3 Markdown, C2 §6, _migrate_math)`.
  Single line, no AI attribution trailer.

## Do not
- Do not use `workbook::model::Workbook` for migration — it drops `color`/worksheet/chart fields
  this task needs; `V2WorkbookRaw` is a deliberate, separate deserialization target.
- Do not implement `MigrationReport` as just `renamed: Vec<(String, String)>` (the plan's
  original shape) — `identifier_by_v2_id` and `dropped` are required (L3-R36), and Task 15 reads
  `identifier_by_v2_id` to match definitions.
- Do not hunt for `worksheets[].tables[]` — it does not exist; the only legacy flat array is
  `charts` (G13.6, C2 §6 D6, already struck).
- Do not write a byte-equality test for "verbatim" table-block JSON — `serde_json::Map` is a
  `BTreeMap`, key order is not preserved; test value equality (G13.8).
- Do not leave `workbook_version`'s accepted range as a literal `1..=2` — use
  `workbook::SUPPORTED_WORKBOOK_VERSION`, so this stays correct if the constant ever changes.
- Do not copy a non-UUID `workbook_id` verbatim — mint a fresh one and record the substitution
  (G13.13); a verbatim non-UUID copy produces a v3 file the engine's own parser rejects.
- Do not silently drop block metadata or `rowSource` with no report line — every one is a
  reported irregularity, and `rowSource == "lapSelection"` needs its own explicit warning
  (G13.7).
- Do not refuse the migration for an unresolved `mathChannelIds` reference or a dropped-metadata
  field — only an out-of-range `workbook_version` or a reserved-constant collision refuses (Q3).
- Do not write `parse_workbook` bare in any test that means the v3 reader — it resolves to v2
  (G13.9); always `crate::workbook::v3::parse_workbook`.
- Do not create a `cli/tests/` directory — it does not exist; inline `#[cfg(test)]` (G13.12).
- Do not run `cargo test -p idl-rs -p idl-rs-cli migrate` without confirming a non-zero `passed`
  count if you use it — prefer the two commands named in COMPUTE RULES.

## Style / hygiene
Doc comment on every public symbol; units where numeric (none new here beyond what's already
typed); typed errors only (`MigrateError`, mapped to `ErrorKind` per L3-R38 — never
`Err(String)`); A/A/A tests named `thing — condition — result`; match surrounding hand-formatted
style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C2 §6/§6.1 are exact and already landed (contract batch 3, ledger R25),
including the worked identifier-derivation table and the CLI invocation shape. Task 14's SPEC
§17a rewrite (dispatched first, per the ordering note above) is the reader-facing summary; it
does not change what this task codes.

## Report back (concise)
Commit hash + `git show --stat`; both test commands and result lines (`passed`/`failed` counts);
per-step done/deviated; confirmation `identifier_by_v2_id` has one entry per `math_channels[]`
definition (not just renamed ones) and `_migrate_math` is emitted with `identifier`/`color`;
confirmation the reserved-name-after-derivation interaction (L3-R37) is tested with both named
examples; confirmation `workbook_id`/`workbook_version` rules match L3-R39 exactly; confirmation
the CLI shape is `<INPUT> --output <OUTPUT>` with output required, and `--help` output pasted;
confirmation the migration-report categories (Q3) are all present with the refusal-vs-report
distinction correct; confirmation Task 14's commit existed before you started (name its hash);
anything ambiguous you resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
