# L8w Task 1 — implementer brief (`paths::resolve_data_dir` BOM strip, R53 Settings Q4)

You are the implementer for L8w Task 1: strip a leading UTF-8 BOM before
parsing `settings.json` in `paths::resolve_data_dir`, so a `settings.json`
written by Windows tooling (PowerShell `Out-File`'s default encoding) no
longer silently falls back to the platform default `<data>` root. TDD, ONE
commit, then report.

## GATE — verify before opening the worktree

This lane opens only after **L2 Task 8** (importers wrap-up) and **L5 Task 9**
(`import_file`/`list_importers` commands) have merged into `idl-rs` `main`.
Verify from the shared checkout root (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`):
```bash
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. **As of this brief's writing (2026-09-05), the
shared checkout's `rust` submodule is pinned at `75589bc`, which pre-dates
both merges** — `rust/tauri/src/commands/import.rs` does not exist yet on
`main` (confirmed: the grep above fails with "no such file"). **Do not open
the worktree below until both greps pass.** If dispatched before they do,
stop and report to the lead rather than starting against the stale tip.

## Where

- Worktree (once the gate passes): a fresh `idl-rs` worktree off `idl-rs`
  `main`, post-merge:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave2-l8w-write-amendment "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave2-l8w-write-amendment" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave2-l8w-write-amendment"
  ```
  Branch: `wave2-l8w-write-amendment`. This is Task 1 of the lane — if a
  later task's dispatch says the worktree already exists with Task 1's
  commit on it, use that worktree instead of creating a second one.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`) beyond reading files
  named below. Do NOT edit `docs/` (this lane's spec discipline is "no spec
  change needed" throughout). Do NOT push.
- **Files:** modify `tauri/src/paths.rs` only.

- Read first: `CLAUDE.md` (§2, §4, §5, §8); the plan's Task 1 section
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`,
  "## Task 1"); `runs/2026-09-05/lanes/l8w/BRIEF.md` and
  `review-STANDING.md`; the decisions-log note this task closes —
  `runs/2026-09-03/decisions.md`, "2026-09-05 — L5 Step 6 render confirmed;
  settings.json BOM trap" (search for "BOM trap") and R53's Settings Q4
  ("BOM strip in `paths::resolve_data_dir` goes in the Rust write lane");
  the landed `tauri/src/paths.rs` in full (you are editing this file's
  `resolve_data_dir` — read its existing three tests, you add a fourth in
  the same style, temp dirs via `tempfile::tempdir()`, not real-data paths).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never
override with `-j`). While working: `cargo test -p idl-rs-tauri paths::`,
foreground, must report a non-zero `passed` count. Do **not** run
`cargo test -p idl-rs -p idl-rs-cli` (that is Task 14's lane-gate run, or
the every-four-tasks checkpoint if this task lands as part of a batch —
this task alone does not trigger it). Do **not** run
`cargo test --workspace` or a bare `cargo test` (both hook-denied). No
`cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo process at a
time.

**`pub`-change check:** none. `resolve_data_dir`'s signature is unchanged —
the BOM strip is inside its body, on a private local variable
(`text: String`), not a new `pub` symbol. No `cargo check -p idl-rs-cli
--tests` needed for this task alone (nothing in `core` changes and no
`idl-rs-tauri` command signature changes).

## The fix

In `resolve_data_dir`'s `Ok(text) => { ... }` arm (currently `let settings:
Settings = serde_json::from_str(&text).unwrap_or_default();`), strip a
leading UTF-8 BOM (`'\u{feff}'`) from `text` before parsing:

```rust
Ok(text) => {
    let text = text.trim_start_matches('\u{feff}');
    let settings: Settings = serde_json::from_str(text).unwrap_or_default();
    ...
}
```

`str::trim_start_matches` on a `char` is a no-op when the BOM isn't
present, so every existing behaviour (no file, malformed JSON, a clean
file with no BOM) is unaffected — this is additive, not a rewrite of the
function's fallback logic. Do not touch the `Err(_)` arm (absent/unreadable
file) — the BOM only ever appears inside a file that was actually written,
never in the "no file" case.

## Test to add

`settings_json_data_dir_override_with_leading_bom_is_still_honoured` (name
it to read as `thing — condition — result`; match the existing three tests'
naming style exactly, e.g.
`settings_json_data_dir_override_with_a_leading_bom_is_still_honoured`),
alongside the existing `settings_json_data_dir_override_is_honoured` test:

```rust
#[test]
fn settings_json_data_dir_override_with_a_leading_bom_is_still_honoured() {
    // Arrange
    let app_data = tempfile::tempdir().unwrap();
    let app_config = tempfile::tempdir().unwrap();
    let override_root = tempfile::tempdir().unwrap();
    let json = format!(
        r#"{{"data_dir":"{}"}}"#,
        override_root.path().display().to_string().replace('\\', "\\\\"),
    );
    // '\u{feff}' prepended, matching a UTF-8 BOM as PowerShell's `Out-File`
    // default encoding writes it — the exact real-world failure mode this
    // task fixes (runs/2026-09-03/decisions.md, "settings.json BOM trap").
    let with_bom = format!("\u{feff}{json}");
    std::fs::write(app_config.path().join("settings.json"), with_bom).unwrap();

    // Act
    let data = resolve_data_dir(app_data.path(), app_config.path()).unwrap();

    // Assert
    assert_eq!(data, override_root.path().join("data"));
}
```

Assert against `override_root`, not `app_data` — the whole point is that a
BOM must not cause a silent fallback to the platform default. Do not
remove or weaken any of the three existing tests.

## The task, in order

- [ ] **Step 1: Confirm the gate** (both greps `>= 1` on `main`) and open
      the worktree.
- [ ] **Step 2: Write the failing test** above.
- [ ] **Step 3: Apply the one-line fix** in `resolve_data_dir`.
- [ ] **Step 4: Test** — `cargo test -p idl-rs-tauri paths::`, confirm
      non-zero `passed`, all four tests green.
- [ ] **Step 5: Commit** — explicit path (not `git add -A`):
      `git add tauri/src/paths.rs` — message
      `tauri: strip UTF-8 BOM before parsing settings.json in resolve_data_dir (R53 Settings Q4)`.
      Single line, no AI attribution trailer.

## Do not

- Do not touch any file other than `tauri/src/paths.rs`.
- Do not change `resolve_data_dir`'s signature or its `Err(_)` fallback arm.
- Do not add a BOM-stripping helper elsewhere in the crate "for reuse" —
  this is the one call site that reads `settings.json` as text before
  `serde_json::from_str`; scope the fix to it (`commands/app.rs`'s Task 2
  `load`/`save` calls go through `idl_rs::store::settings::load`, a
  separate, already-landed function this task does not touch or need to
  touch — it deserialises via `serde_json::from_slice` on raw bytes, not
  `from_str` on text, so it does not carry this BOM failure mode. If Task 2
  or its review finds otherwise, flag it — don't silently duplicate this
  fix into `settings.rs`).
- Do not run `cargo test --workspace`, `cargo fmt`, or `cargo tarpaulin`.

## Style / hygiene

Doc comment already exists on `resolve_data_dir`; no new `pub` symbol needs
one. A/A/A test with blank lines between Arrange/Act/Assert. Match this
file's existing hand-formatted style exactly (2-space indent, no `cargo
fmt`).

## Spec discipline (say it out loud in your report)

"No spec change needed" — `docs/IDL0_SPEC.md` and C4 §1 already describe
`settings.json`'s contract; this task fixes a parsing bug, it does not
change the file's schema or `resolve_data_dir`'s documented behaviour.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri paths::`
result line with its `passed` count (expect 4); confirmation the three
existing tests are unchanged and still pass; confirmation this task did not
touch `settings.rs`/`commands/app.rs`; anything ambiguous you resolved (say
how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).
