# L8w Task 1 review — `paths::resolve_data_dir` UTF-8 BOM strip

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Commit under review: `20d10fe44c236510f31993baf855e1bb10d11fe6`
("tauri: strip UTF-8 BOM before parsing settings.json in resolve_data_dir (R53 Settings Q4)"),
parent `idl-rs` `main` `7317992`. In scope: `tauri/src/paths.rs` only (confirmed via
`git show --stat` — one file, +25/-1). Out of scope: any commit landed after this one by a
Task 2 implementer in the same worktree (none observed at review time).

## Test command and result

Not re-run (reviewers do not build/test — CLAUDE.md §8, review-STANDING.md "COMPUTE RULES").
Implementer-reported command and result, verified statically instead:

```
cargo test -p idl-rs-tauri paths::
test result: ok. 4 passed; 0 failed; ...
```

Static verification: the file's `#[cfg(test)] mod tests` contains exactly four `#[test]`
functions after this commit (`no_settings_file_present_resolves_to_app_data_dir_slash_data`,
`settings_json_data_dir_override_is_honoured`, `corrupt_settings_json_falls_back_to_platform_default`,
`settings_json_data_dir_override_with_a_leading_bom_is_still_honoured`), all under the
`paths::` module path the filter selects, all with no `#[ignore]`. A `passed` count of 4
against a filter targeting exactly these four tests is plausible and non-zero, satisfying
review-STANDING.md's "targeted filter matching nothing is a failed gate" check in the negative
(it is not empty). This matches the implementer's reported count.

Red/green check by reading the diff (no revert performed, per the "read-only" rule — see
`git show 20d10fe` above): before this commit the `Ok(text)` arm called
`serde_json::from_str(&text)` directly with no strip. `\u{feff}` prepended to a JSON object
opening brace is not valid JSON to `serde_json` (a BOM is not accepted before the value), so
pre-fix, `from_str` on the BOM-prefixed fixture would return `Err`, `unwrap_or_default()` would
produce `Settings { data_dir: None }`, and `resolve_data_dir` would return
`app_data_dir.join("data")` — not `override_root.path().join("data")`, which is what the new
test's `assert_eq!` requires. The new test would fail against the pre-fix code and passes only
because of the fix, confirming a genuine red→green TDD cycle as claimed.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `tauri/src/paths.rs:29` (added test) | No test covers a BOM-prefixed *invalid* JSON fixture (e.g. `"\u{feff}{ not json"`) falling back to the platform default, alongside the existing BOM+valid and no-BOM+invalid cases. The Task 1 brief's own "Test to add" section only specifies the BOM+valid case, so this isn't a brief violation, but the combination is untested and is the one path where BOM-stripping and lenient-fallback interact. | Add a fifth test asserting `resolve_data_dir` on a BOM-prefixed malformed-JSON fixture still resolves to `app_data_dir.join("data")`. |

No Critical or Important findings.

## Checks performed (all pass)

- Strip is applied only in the `Ok(text) => { ... }` arm, before `serde_json::from_str`; the
  `Err(_)` arm (absent/unreadable file) is byte-for-byte unchanged from the parent commit —
  confirmed via the diff hunk (only one `+`/`-` pair touches the `Ok` arm; the `Err(_)` line is
  untouched context).
- `str::trim_start_matches('\u{feff}')` is a no-op when no BOM is present, so the two existing
  passing-scenario tests (no file, clean override, corrupt non-BOM JSON) are unaffected by
  construction — read the pre- and post-commit bodies of those three tests: byte-identical,
  none removed or weakened.
- The new test's fixture (`format!("\u{feff}{json}")` written via `std::fs::write`) contains
  the actual BOM code point `U+FEFF`, encoded as UTF-8 by Rust's string formatting/`fs::write`
  (`EF BB BF` on disk) — not a placeholder or escaped literal that would fail to reproduce the
  real PowerShell `Out-File` failure mode the decisions-log note describes.
- Signature of `resolve_data_dir` unchanged (`&Path, &Path) -> Result<PathBuf, IpcError>`,
  matching the brief's "pub-change check: none" — no `cargo check -p idl-rs-cli --tests` was
  required or run, consistent with the task brief.
- Test names and structure: `settings_json_data_dir_override_with_a_leading_bom_is_still_honoured`
  reads as `thing — condition — result`; Arrange/Act/Assert sections present with blank lines
  between them, matching the file's three pre-existing tests' style exactly.
- Doc comment: `resolve_data_dir`'s existing doc comment ("Idempotent — safe to call on every
  launch.") is unchanged and does not mention BOM handling. The Task 1 brief explicitly rules
  on this ("Doc comment already exists on `resolve_data_dir`; no new `pub` symbol needs one")
  — since the brief's own text addresses and dismisses this, per CLAUDE.md §1 the brief's
  ruling wins over the dispatch's more general "doc comment updated to state the BOM handling"
  checklist item. Treated as satisfied, not a finding.
- `str::trim_start_matches(char)` strips *all* leading repeats of the pattern char, not
  strictly "exactly one" — a file with two concatenated BOMs would have both stripped. This is
  the exact code the Task 1 brief specified verbatim (not an implementer deviation), and no
  real BOM-writing tool emits more than one, so this is not raised as a finding; noted here
  only because the dispatch asked the question directly.
- Commit hygiene: single-line commit message, no AI attribution trailer; `git show --stat`
  confirms only `tauri/src/paths.rs` touched (the brief's "Files: modify `tauri/src/paths.rs`
  only" is satisfied); nothing under `docs/` touched, consistent with the lane's "no spec
  change needed" discipline stated in the brief; `settings.rs`/`commands/app.rs` untouched,
  consistent with the brief's explicit instruction not to duplicate the fix there.
- No reformatting: diff is a clean +25/-1 insertion at the two intended locations (the `Ok` arm
  and the end of the test module) with no whitespace/import churn elsewhere in the file.

## Verdict rationale

The fix is exactly the one-line change the brief specified, scoped correctly to the `Ok(text)`
arm only, leaving the `Err(_)` fallback and the three pre-existing tests untouched. The new
test's fixture genuinely contains BOM bytes and genuinely fails against the pre-fix code
(verified by reading the diff and reasoning through `serde_json`'s behaviour on a
BOM-prefixed string, not by reverting). Hygiene, naming, and scope all match the brief and the
standing review brief's generic checks. The single gap is a missing test for the
BOM-plus-invalid-JSON combination the dispatch specifically flagged as worth checking; it's a
one-test, mechanical addition and does not affect correctness of the shipped fix.

VERDICT: NEEDS_FIXES
