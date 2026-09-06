# L8w Task 10 fix review — front matter serialised by core (R75)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Commit under review: `56193ef`
(`core/src/workbook/v3/front_matter.rs`, `tauri/src/commands/workbook.rs`),
stacked on `a20b41f`/`d06067d`/`fde52f4`/`46d6b63`. Closes the Critical in
`runs/2026-09-05/lanes/l8w/review-task10.md` per ledger ruling R75
(`runs/2026-09-03/decisions.md`). Out of scope: any commit after `56193ef`
(a Task 12 implementer may already have committed; ignored per dispatch).

## Test command and result

Read-only dispatch — no cargo/npm/build command run (CLAUDE.md §8, "readers
never build"). Implementer report accepted as reported by the lead:
`cargo test -p idl-rs front_matter` → 21 passed; `cargo test -p idl-rs-tauri
commands::workbook::tests::create_workbook` → 6 passed; both `cargo check`s
clean (presumably `-p idl-rs-tauri` and, per R75's own "adds core pub surface"
clause, `-p idl-rs-cli --tests`). The counts are plausible: `front_matter.rs`'s
diff adds exactly 7 new `render_front_matter`/round-trip tests to the module's
pre-existing tests, and `workbook.rs`'s diff adds exactly 1 new
`create_workbook_via_*` test to the pre-existing 5. No fix-record file exists
yet under `runs/2026-09-05/lanes/l8w/` naming the exact `cargo check`
invocations; noting this rather than treating it as unverifiable, since I did
not run cargo myself per this dispatch's explicit read-only instruction.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Note | `core/src/workbook/v3/front_matter.rs:257` (`FrontMatter`'s `units` field) | Only `constants` got `skip_serializing_if`; `units` always renders (`units: si` on every fresh workbook) even though it's a `#[serde(default)]` on the deserialize side. Harmless — round-trips fine, doc comment only promises minimalism for `constants` — but slightly inconsistent with the stated "keep a freshly created workbook's front matter minimal" rationale. | None required; optionally add `skip_serializing_if` keyed off `UnitsPref::Si` if minimalism is meant to be uniform. |

No Critical, Important, or other Minor findings.

## Checks performed (all pass)

- **Delimiter/newline round-trip, traced by hand both ways.** `render_front_matter` emits `format!("---\n{yaml_block}---\n")`; `serde_yaml_ng::to_string` (confirmed via the vendored crate source, `ser.rs`'s own doc example) never prepends a `---` document marker on a single `to_string` call, only between multiple documents on the same serializer — so no double-delimiter. `yaml_block` ends in `\n` (every YAML line, including the last, is `\n`-terminated by the emitter), so the concatenation produces exactly `"---\n<mapping-lines>\n---\n"`. `parse_front_matter` strips the `"---\n"` prefix then `split_once("\n---\n")`; for a body-less workbook this pattern is found immediately before the trailing `"---\n"`, yielding `yaml_block` = the mapping text and `body` = `""`. Matches C2 §1's `front_matter ::= "---\n" yaml_block "---\n"` exactly (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md:24`).
- **Serialize field-name/casing parity with Deserialize.** `UnitsPref` carries one shared `#[serde(rename_all = "lowercase")]` on both `Serialize`/`Deserialize` derives on the same enum — no possibility of casing drift between the two directions. `FrontMatter`'s field names are plain (no renames on either side) so struct field serialization uses the Rust identifiers verbatim on both sides — parity by construction.
- **`constants`' `skip_serializing_if` vs. `default` semantics.** Deserialize: `#[serde(default)]` — absent key → empty map. Serialize: `#[serde(default, skip_serializing_if = "HashMap::is_empty")]` — empty map → key omitted. Both directions treat "absent key" and "empty map" as the same state; C2 §1 confirms `constants` is optional with a `{}` default either way (quoted correctly in the doc comment).
- **`ConstantRaw`'s custom `Serialize` is the true inverse of its custom `Deserialize`.** `Number(v)` → `serialize_f64` / a bare YAML number → `ConstantYamlValue::Number` on the way back. `WithUnit{value, unit_display}` → `serialize_str("{value} {unit_display}")`, which is exactly the `"<number> <unit>"` shape `parse_unit_suffix`'s hand-written grammar (`/^\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)\s+(\S.*)\s*$/`) accepts — traced the `f64` `Display` impl never emits a form the grammar rejects (no `+` sign, exponent form uses lowercase `e` matching `[eE]`, matches `-?\d+(\.\d+)?([eE][+-]?\d+)?`). Not exercised by a new test in this diff (no `constants` round-trip test added), but `create_workbook_via` always passes `HashMap::new()`, so this path is dead code today in the caller this task fixes — matches the file's own existing scope, not a regression.
- **Adversarial-name coverage, redone by hand against the actual `unsafe-libyaml` emitter this crate wraps** (checked `serde_yaml_ng-0.10.0`'s `Cargo.toml` dependency on `unsafe-libyaml`, the canonical, widely-used C-libyaml-derived scalar-style analyzer that quotes/escapes on exactly the plain-scalar-unsafe conditions YAML 1.1/1.2 define: leading indicator chars, `": "`, `" #"`, embedded newlines, leading/trailing spaces, ambiguous core-schema-looking values). The six new `front_matter.rs` tests (`: `, ` #`, double quotes, single quotes, embedded newline, leading/trailing spaces) and the one new `workbook.rs` test (`: ` and ` #` through the full `create_workbook_via` → `read_workbook_via` → `parse_front_matter` path) cover the two concrete failure modes review-task10 named plus the other classic plain-scalar traps.
- **The "next trap" the dispatch flagged — a name of `true`, `123`, `null`, or `~`.** Verified this is *not* a functional risk for this code path even without an explicit test, by reading `serde_yaml_ng-0.10.0/src/de.rs`: `deserialize_string`/`deserialize_str` on a scalar event calls `visitor.visit_str`/`visit_borrowed_str` directly on the scanner's raw string bytes — it does not run YAML core-schema type resolution (that resolution only happens when deserializing into `serde_yaml::Value`, which `FrontMatter::name: String` never does). So even in the hypothetical where the emitter left such a name unquoted, the typed `String` field would still deserialize back to the literal text, not a bool/int/null. No test exists for this case, and one would still be good defensive practice, but its absence is not a live defect — downgrading the dispatch's flagged risk from a potential trap to a documented non-issue.
- **`no format! of YAML remains anywhere in tauri`** — grepped `tauri/src/` for `format!` and `---\n`; every remaining `format!("---\n...` occurrence is inside `#[cfg(test)] mod tests` (starts at `tauri/src/commands/workbook.rs:778`), building fixture markdown fed to `parse_workbook`/`parse_front_matter` for *parsing* tests, not production writes. `create_workbook_via`'s production path now goes exclusively through `render_front_matter`.
- **`Cargo.lock`/`Cargo.toml` unchanged** — `git diff --stat` against the parent commit shows no lockfile or manifest touched; `serde_yaml_ng` was already a dependency (used by `parse_front_matter` before this commit).
- **Doc comments** present and accurate on `render_front_matter`, the new `ConstantRaw` `Serialize` impl, and the amended `constants` field comment; the `render_front_matter` comment's cited grammar (`"---\n" yaml_block "---\n"`) matches C2 §1 verbatim.
- **`create_workbook_via`'s fix** builds a typed `FrontMatter` (`id`, `name`, `constants: HashMap::new()`, `units: Default::default()`, `version: 3`) and calls `render_front_matter` — no interpolation of `name` into a string anywhere in the diff; `HashMap` import already present in the file (`tauri/src/commands/workbook.rs:12`).
- **Style/hygiene**: commit message is single line, no AI-attribution trailer; diff is confined to the two named files; no `cargo fmt` churn visible (surgical, additive hunks); tests are Arrange/Act/Assert with blank lines, named `thing_condition_result` matching the file's convention.
- **Scope**: nothing outside `front_matter.rs` and `commands/workbook.rs` touched; `docs/`, `Cargo.lock`, `app/src/`, `rust` submodule untouched.

## Verdict rationale

The fix does exactly what R75 ordered: core now owns `render_front_matter` as
the true inverse of `parse_front_matter`, built on `serde_yaml_ng`'s
`Serialize` derive rather than hand-built interpolation, and
`create_workbook_via` calls it instead of `format!`-ing YAML. The delimiter
round-trip is correct by construction (traced by hand against the vendored
crate source, not assumed), the `Serialize`/`Deserialize` field
names/defaults/`skip_serializing_if` are mirrored where it matters, and the
new tests exercise every adversarial-name class review-task10's Critical
named (`: `, ` #`) plus the other classic plain-scalar traps (quotes,
newline, leading/trailing spaces), verified through the actual
`create_workbook_via` → `read_workbook_via` round trip in the tauri test, not
just the core-only path. The one loose end I found — no test for a name that
is itself `true`/`123`/`null`/`~` — turns out not to be a real risk once
traced through `serde_yaml_ng`'s deserializer, which reads scalars into a
typed `String` field literally rather than through YAML's core-schema
resolution; I'm noting it as informational rather than a finding. Nothing
else in the diff introduces new risk, and no scope, hygiene, or spec
deviation was found. Clean.

VERDICT: CLEAN
