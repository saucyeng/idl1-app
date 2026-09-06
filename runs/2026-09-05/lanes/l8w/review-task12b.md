# L8w Task 12b review — `list_math_builtins` (R64.2)

**Scope:** idl-rs commit `7e189a8` (`core+tauri: list_math_builtins, catalog
transcribed from C2 3.3 (spec-during)`) on branch `wave2-l8w-write-amendment`
in `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`
— files: `core/src/math/catalog.rs` (new), `core/src/math/mod.rs`,
`tauri/src/commands/workbook.rs`, `tauri/src/lib.rs`. Plus C3 §3.4 addition
`0bd3a83` (`docs: C3 3.4 adds list_math_builtins (lead-added L8w Task 12b,
R64.2, unit_rule dropped)`) in
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`
— `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` only. Both
worktrees are clean (`git status --short` empty) beyond these two commits;
no Task 12 fix commit is present after `7e189a8` on this branch at review
time, so there was nothing to ignore. `eval.rs` and `Cargo.lock` confirmed
untouched by the commit (`git show --stat` / `git diff` empty for both).

## Test command and result

Not re-run (reviewer is read-only per CLAUDE.md §8; harness denies cargo
invocations here). Implementer-reported commands and the lane's own fourth
four-task gate (`runs/2026-09-03/decisions.md`, "L8w fourth four-task gate
(after Task 12b): PASS") are both consistent with the diff:

- `cargo test -p idl-rs math::catalog::tests` → reported 6 passed. The
  diff's `core/src/math/catalog.rs` test module contains exactly 6 `#[test]`
  functions (`math_builtin_catalog_len_is_69_matching_c2_3_3s_stated_total`,
  `implemented_and_not_implemented_counts_split_63_and_6`,
  `multi_arity_entries_have_more_than_one_valid_arity`,
  `butter_has_a_single_fixed_arity_of_four`,
  `no_duplicate_names_in_the_catalog`,
  `every_catalog_name_dispatches_in_call_functions_real_match`) — count
  matches.
- `cargo test -p idl-rs-tauri commands::workbook::list_math_builtins` →
  reported 1 passed. The diff adds exactly one new test,
  `list_math_builtins_returns_the_same_count_and_names_as_the_core_catalog`
  — matches.
- Lane gate from `7e189a8` (dated 2026-09-06 in decisions.md): `cargo test
  -p idl-rs-tauri` → 188 passed/0 failed; `cargo test -p idl-rs -p idl-rs-cli
  -- --test-threads=4` → idl-rs 936 passed/1 ignored, integration 1, cli 51.
  Numbers are internally consistent with the two targeted filters above
  being a subset of these totals.

## Findings

No Critical, Important, or Minor findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings | — |

## Checks performed (all pass)

- **R64.2 wire shape.** `MathBuiltinDto` (`tauri/src/commands/workbook.rs`)
  is exactly `{ name: String, arity: Vec<u32>, status: String }`, no
  `unit_rule` field anywhere in the diff. `status` renders as the literal
  strings `"implemented"` / `"not_implemented"` via the `From<&MathBuiltin>`
  impl's `match` — byte-for-byte the two values R64.2 and the C3 entry
  specify.
- **Row-for-row catalog check against C2 §3.3.** All 69 entries'
  `name`/`arity`/`status` transcribed by hand and checked against every row
  of C2 §3.3's table (expanding multi-name rows `floor`/`ceil`/`round`,
  `vx`/`vy`/`vz` etc.): every arity set matches the Signature column exactly,
  including multi-arity forms (`rms`/`mean`/`std`/`detrend`/`min`/`max` →
  `[1, 2]`) and high-arity forms (`rotate_mat` → `[10]` = 1 vector + 9 matrix
  scalars, `rotate_axis` → `[5]`, `rotate_euler` → `[4]`). `status` splits
  63 implemented / 6 not-implemented (`sosfilt`, `spectrogram`, `hilbert`,
  `correlate`, `convolve`, `resample`) matching C2 §3.3's own stated split
  and Status column exactly. No mismatched row found.
- **Count = 69.** Manually recounted the `math_builtin_catalog()` array
  entry by entry: 69, matching C2 §3.3's stated total and the module's own
  test assertion.
- **Exclusions justified.** `main(col[])` (table-cell only, C2 §4) and
  `and`/`or`/`not` (grammar operators, never reach `call_function`) are
  excluded, matching C2 §3.3's own text and L6's `functionCatalog.ts`'s
  established exclusion set — confirmed by reading both C2 §3.3's prose and
  the TS file's doc comment.
- **Cross-check against L6's `functionCatalog.ts`.** Read the landed
  `app/src/routes/pages/Notebook/model/functionCatalog.ts` on idl1-app
  `main`: same 69 names, same order, same implemented/not-implemented split.
  No name or status disagreement between the two catalogs. (The TS file's
  own `status` values use `"notImplemented"` camelCase while the new DTO
  uses `"not_implemented"` snake_case — a real string-format difference, but
  reconciling the two representations is explicitly the lead's separate UI
  shell task per both the brief and the C3 entry's own text, not this task's
  scope; not counted as a finding here.)
- **⊆ probe test.** `every_catalog_name_dispatches_in_call_functions_real_match`
  calls the public `crate::math::evaluate` with `"{name}()"` for every
  catalog entry and asserts the resulting error kind is never
  `UnknownFunction`. This does go through the public API, not a private
  path. Spot-checked five `call_function` arms in `core/src/math/eval.rs`
  including index-heavy ones (`rotate_mat`, `rotate_axis`, `vec`, `fft`,
  `current_lap`): every arm calls `require_arg_count(name, &args, N)?`
  before any `args[i]` indexing, so a zero-arg probe call always short-
  circuits on `ArgCount` (or a similarly typed error) before any index
  operation — no arm can panic on a zero-arg probe. This one-directional
  check (name ⊆ dispatch, not the converse) is explicitly accepted by the
  lead's own fourth four-task gate note in `runs/2026-09-03/decisions.md`
  ("the converse would need a second name list beside the match — the very
  copy R64.2 forbids — so it is not required").
- **`status` serialization strings.** Verified `MathBuiltinDto`'s `From`
  impl match arms produce exactly `"implemented"` and `"not_implemented"`,
  matching R64.2 and the C3 entry's TS union type literally.
- **DTO field naming.** `name`, `arity`, `status` — all single-word, already
  camelCase-trivial, no `serde(rename)` needed; matches C3's TS interface
  field-for-field.
- **No state, no `Result`.** `list_math_builtins()` takes no Tauri `State`
  argument and returns a bare `Vec<MathBuiltinDto>`, not `Result<_, _>`.
  Confirmed this matches `engine_version()`'s precedent
  (`rust/tauri/src/commands/mod.rs:14`, also a bare-return command with no
  `Result`). The C3 §3.4 entry's own text states "Never fails... matching
  `engine_version`'s 'no `Result`' pattern (§3.1)" — same claim, consistent.
- **C3 entry matches Rust shape exactly.** The new `## list_math_builtins()`
  block in `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
  gives the identical `{ name: string, arity: number[], status:
  "implemented" | "not_implemented" }` shape, states "Errors: none", and
  carries a dated revision note (`2026-09-06`) both in the document's
  revision-note preamble and inline before the new section — satisfies C3
  §5's dated-note requirement.
- **Tests A/A/A, named `thing — condition — result`.** All 7 new tests
  (6 core + 1 tauri) follow the repo's established snake_case rendering of
  that convention (e.g. `butter_has_a_single_fixed_arity_of_four`,
  `list_math_builtins_returns_the_same_count_and_names_as_the_core_catalog`)
  with Arrange/Act/Assert comments and blank-line separation, matching
  sibling tests already in `workbook.rs`.
- **Doc comments.** Every public symbol (`MathBuiltinStatus` and its two
  variants, `MathBuiltin` and its three fields, `math_builtin_catalog`,
  `MathBuiltinDto` and its three fields, the `From` impl is unexported so no
  doc needed, `list_math_builtins`) carries a doc comment. The module-level
  doc on `catalog.rs` explains provenance, the R64.2 ruling, and the
  one-directional ⊆-check rationale in detail.
- **No `unwrap()`/`.expect()` on production-path data.** Only test code uses
  `.unwrap()` (on `catalog.iter().find(...)` against a hardcoded literal
  static list — not runtime/user data). Production code (`catalog.rs`'s
  `math_builtin_catalog`, `workbook.rs`'s `list_math_builtins` and its
  `From` impl) has none.
- **Hygiene.** Both commits are single-line, no AI-attribution trailer.
  `git show --stat` for each matches the brief's named file list exactly —
  no stray files. `docs/` untouched in the rust worktree; the C3 edit is the
  one sanctioned exception (this task is spec-during, per the brief).
  Neither worktree shows uncommitted changes. No `cargo fmt` churn visible
  (diff is purely additive to the four/one files named).
- **Cross-task consistency.** `MathBuiltinDto`'s `From<&idl_rs::math::
  MathBuiltin>` impl follows the lane's established `From<core::X>` mapping
  idiom used elsewhere in `commands/*.rs`, rather than hand-copying fields
  inline.

## Verdict rationale

The implementation matches R64.2's ruling exactly: `unit_rule` is dropped,
the wire shape is `{ name, arity: number[], status: "implemented" |
"not_implemented" }`, and the catalog's 69 entries — checked row by row
against C2 §3.3's Builtin catalog table — are transcribed correctly in name,
arity, and status, with the accepted-as-sufficient one-directional ⊆ probe
proving every catalog name really dispatches through `math::evaluate`
without touching `eval.rs`. The C3 §3.4 addition mirrors the Rust shape
field-for-field, carries a dated note, and correctly documents the dropped
`unit_rule` field's rationale. Tests are correctly named, A/A/A-shaped, and
verified as non-panicking by inspection of the arms they probe. No scope
violations, no stray files, no reformatting, clean hygiene. This is a clean
pass with nothing to fix.

VERDICT: CLEAN
