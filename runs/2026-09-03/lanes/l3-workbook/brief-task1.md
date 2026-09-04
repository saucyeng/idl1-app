# L3 Task 1 — implementer brief (front matter, fence scanning, cell-id assignment; C2 §1–§2)

You are the implementer for L3 Task 1 of the idl1 rewrite — the first task of the
core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be `76b640a` ("merge: L1 core store/ (wave 1)"),
  status clean. Verify first; if not, stop and report. The worktree inherits
  `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (lines 41–135), File Structure (138–185), `### Task 1` (187–231);
  contract C2 `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §1, §2 (incl. §2.2 `fence_open` grammar, §2.4 prose spans, §2.5 worked example), §3.1
  (constant unit-suffix syntax), §3.5.A (structural error kinds and exact messages); the
  "L3 Task 1 dispatched" entry in `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-03\decisions.md`;
  `core/Cargo.toml`; skim `core/src/workbook/mod.rs` and `core/src/math/eval.rs` for the
  crate's error-type and module style (`MathEvalErrorKind` is the pattern `WorkbookErrorKind`
  mirrors).

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). The
ONLY cargo build/test command you run, as few times as TDD needs:
`cargo test -p idl-rs workbook::v3`. The first run compiles your two new dependencies —
expected; everything else is already built in the shared target dir. `cargo search <crate>`
is allowed (network lookup, no compile). No full suite, no tarpaulin, no `-j`, no separate
`cargo build`/`cargo check`, no `.cargo/` edits, never `cargo fmt`. One cargo process at a
time, foreground.

## The task (plan Task 1, Steps 1–5) with these rulings
1. **Deps (Step 1).** Pin `pulldown-cmark` (latest stable 0.x) and a *maintained* YAML crate
   for front matter — check crates.io / `cargo search` (`serde_yaml` is archived upstream;
   prefer `serde_yaml_ng` or `serde_yml`/`saphyr` — whichever is maintained and has a plain
   serde `from_str`). Do not guess versions. Record both pins in the commit message.
   **Ruling (lead):** for the 4 random cell-id bytes use the crate's EXISTING `uuid`
   dependency (`Uuid::new_v4().as_bytes()[..4]`, lower-hex) — do NOT add `rand`.
2. **Front matter (Step 2)** — `FrontMatter { id, name, constants: HashMap<String, ConstantRaw>,
   units: UnitsPref, version: u32 }`, `ConstantRaw::{Number(f64), WithUnit{value, unit_display}}`
   per C2 §1/§3.1's `"<number> <unit>"` regex; `version` defaults to 3 only when the key is
   ABSENT (an explicit `version: 2` must survive to the `UnsupportedWorkbookVersion` check).
   `id` must be a UUIDv4 string else `MissingFrontMatterId`. The plan's six tests.
3. **Fence scanning + ids (Step 3)** — `pulldown-cmark` event stream; only fences whose info
   string parses under C2 §2.2's `fence_open` grammar (`math`/`table`/`js`, optional
   ` id=hex8`) become `CellDoc`s; every other fence is inert. Missing `id=` → generate (ruling
   above). Duplicate id → `WorkbookErrorKind::DuplicateCellId` with C2 §3.5.A's exact message,
   collected not fatal. Prose spans per C2 §2.4: `prose_before` on each cell, `prose_after`
   only on the last cell (add that field), `trailing_prose` on the doc when there are zero
   cells. The plan's six tests.
4. **`parse_workbook` (Step 4)** — `Result<(WorkbookDoc, Vec<WorkbookError>), Vec<WorkbookError>>`:
   `Err` ONLY for front-matter-fatal problems (`MissingFrontMatterId`,
   `UnsupportedWorkbookVersion`, unparsable YAML); everything else collected in the `Ok` tuple
   beside a best-effort doc. State this rule in the doc comment — Tasks 2 and 9 build on it.
   Test with C2 §2.5's worked example verbatim, asserting the plan's listed facts.
5. **Wire-in + commit (Step 5).** `workbook/mod.rs` gets `pub mod v3;`; the four new files
   under `workbook/v3/`. `core/Cargo.toml` gains exactly the two deps. Test:
   `cargo test -p idl-rs workbook::v3` → all `ok`. Commit with explicit paths (NOT `git add -A`):
   `git add core/Cargo.toml Cargo.lock core/src/workbook/mod.rs core/src/workbook/v3` —
   message `workbook: v3 front matter, fence scanning, cell-id assignment (C2 §1-2); pins
   pulldown-cmark <ver>, <yaml crate> <ver>`. Single line, no AI attribution trailer.

## Style / hygiene
Doc comment on every public symbol (they ARE this module's spec — spec-during); units where
numeric; typed errors only (no `Err(String)`, no `unwrap()` on document content); A/A/A tests
named `thing — condition — result`; match surrounding hand-formatted style;
`WorkbookError`/`WorkbookErrorKind` in `error.rs` mirror `MathEvalError`'s shape (Task 2 fills
in the remaining kinds — define only what this task needs plus the enum so Task 2 extends it).

## Spec discipline (say it out loud in your report)
"spec-during" — C2 §1–§2 is signed; this module's doc comments are the implementation spec;
no contract text changes.

## Report back (concise)
Commit hash + `git show --stat`; the two pinned crate versions and how you confirmed them; the
exact test command and result line; per-step done/deviated; anything ambiguous in C2 §1–2 that
you resolved (say how) or that would need a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).
