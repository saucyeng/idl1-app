# L2 — Importers — Brief

**Plan:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`
**Branch:** `wave1-l2-importers`

## Scope

FIT (`fitparser` 0.11.0), GPX (port of `gpx_parser.dart`), CSV (trivial,
D4 — low priority) importers behind a shared `Importer` trait producing
contract C1 §2's canonical `Session`/`Channel` model; a post-import
materialisation hook shape (design doc §5's extension point). New module
`rust/core/src/import/` (`mod.rs`, `gpx.rs`, `fit.rs`, `csv.rs`, `hook.rs`).
Spec-first: `docs/IDL0_SPEC.md` §15a (Task 1), written before any code.

## Dependency gate

L2 needs L1's landed `Session`/`Channel` shape (C1 §2) to compile against.
Verify before opening a worktree (Task 2 onward — Task 1, the SPEC section,
is prose-only and has no gate):
```bash
grep -c "pub t_us: Vec<i64>" rust/core/src/session/mod.rs
grep -c "pub source_format: SourceFormat" rust/core/src/session/mod.rs
```
Both must return `>= 1`. Checked 2026-09-03: both return `0` — gate is not
yet open.

## Done when

- Isaac's FIT/GPX archive imports (partial: this plan proves the importers
  via golden tests against hand-built fixtures; the end-to-end CLI path
  needs L1's `idl-rs import` wiring, out of this lane's directory).
- Golden tests per format — Tasks 3 (GPX), 4 (FIT), 5 (CSV), each with a
  hand-built fixture constructed in the task itself (no real device archive
  location confirmed yet — Open Question 7, non-blocking, same treatment as
  C1 §8 item 8).
- `cargo test -p idl-rs import::` and `cargo test --workspace` both green.

## SPEC section(s) touched

`docs/IDL0_SPEC.md` §15a "Non-device Importers (FIT, GPX, CSV)" — new,
inserted between existing §15 (Session & File Model, L1's territory,
untouched) and §16 (Track Entity). Written spec-first in Task 1.

## Open questions logged (10, all assigned, none blocking)

1. `GPS_SpeedKmh`/`GPS_Heading` missing from C1 §4.1's FIT/GPX row — lead.
2. GPX files with no/partial `<time>` — C1 §3.4 doesn't cover it — lead.
3. C3 §2 kind vocabulary needs new `parse_fit_*`/`parse_gpx_*`/`parse_csv_*`
   rows before IPC wiring — lead.
4. `quick-xml` 0.41.0 pin sourced from this workspace's own `Cargo.lock`,
   not the M0 ecosystem report — lead.
5. CSV input shape is this plan's own invention (no contract defines one;
   D4 says trivial) — lead.
6. `PostImportHook`'s real signature is provisional — L1/L3.
7. Isaac's real FIT/GPX archive location — Isaac.
8. `fitparser` 0.11.0's exact field-decoding behaviour verified only
   against the locally-cached 0.9.0 source — compile-and-fix step in
   Task 4 — L2 implementer.
9. `.idl0`'s own `Importer` implementation is out of this plan's scope — L1.
10. `session_id` collision extension (C4 §3) not implemented here (needs
    catalog state) — L1.
