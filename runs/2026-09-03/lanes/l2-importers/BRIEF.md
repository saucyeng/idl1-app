# L2 — Importers — Brief

**Plan:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`
**Branch:** `wave1-l2-importers`

## Scope

FIT (`fitparser` 0.9 — ruling L2-R9), GPX (port of `gpx_parser.dart`),
CSV (trivial, D4 — low priority) importers behind a shared `Importer`
trait producing
contract C1 §2's canonical `Session`/`Channel` model; a post-import
materialisation hook shape (design doc §5's extension point). New module
`rust/core/src/import/` (`mod.rs`, `gpx.rs`, `fit.rs`, `csv.rs`, `hook.rs`).
Spec-first: `docs/IDL0_SPEC.md` §15a (Task 1), written before any code.

GPS coordinates are **physical decimal degrees** (`unit: deg`) for every
source — ruling R27, which superseded R23's `deg_e7` and landed at idl-rs
`7e10797` before this lane starts. `GPS_Altitude` is metres, `GPS_Heading`
degrees. Every brief in this directory is written against R27; where the
plan or the pre-read still argues `deg_e7`, that text is history.

## Dependency gate

L2 needs L1's landed `Session`/`Channel` shape (C1 §2) to compile against.
Verify before opening a worktree (Task 2 onward — Task 1, the SPEC section,
is prose-only and has no gate):
```bash
grep -c "pub t_us: Vec<i64>" rust/core/src/session/mod.rs
grep -c "pub source_format: SourceFormat" rust/core/src/session/mod.rs
```
Both must return `>= 1`. Re-checked 2026-09-05 against `main` (idl-rs
`75589bc`, post-L5 merge): both return `1` — the gate is open.

## Done when

- Isaac's FIT/GPX archive imports (partial: this plan proves the importers
  via golden tests against hand-built fixtures; the end-to-end CLI path
  needs L1's `idl-rs import` wiring, out of this lane's directory).
- Golden tests per format — Tasks 3 (GPX), 4 (FIT), 5 (CSV), each with a
  hand-built fixture constructed in the task itself (no real device archive
  location confirmed yet — Open Question 7, non-blocking, same treatment as
  C1 §8 item 8).
- `cargo test -p idl-rs import::` green while the lane runs, and the §8
  merge gate `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` green
  once at the end (Task 6). Never `cargo test --workspace` and never a bare
  `cargo test` — both are workspace-wide here and both are denied by the §8
  hook.

## SPEC section(s) touched

`docs/IDL0_SPEC.md` §15a "Non-device Importers (FIT, GPX, CSV)" — new,
inserted between existing §15 (Session & File Model, L1's territory,
untouched) and §16 (Track Entity). Written spec-first in Task 1.

## Open questions logged (10, all assigned, none blocking; 1, 3, 4 since closed)

1. `GPS_SpeedKmh`/`GPS_Heading` missing from C1 §4.1's FIT/GPX row —
   **closed (R7)**: C1 §4.1 names both; populating them is Task 8, held
   past this wave for Isaac's real archive (R23 Q4).
2. GPX files with no/partial `<time>` — C1 §3.4 doesn't cover it — lead.
3. C3 §2 kind vocabulary needs new rows before IPC wiring — **closed**:
   C3 §2 carries the seven `import_*` rows (`import_fit_malformed`,
   `import_gpx_malformed_xml`, `import_gpx_no_trackpoints`,
   `import_gpx_missing_lat_lon`, `import_gpx_unparseable_lat_lon`,
   `import_csv_malformed`, `import_not_utf8`) that Task 6's new
   `ImportErrorKind` variants mirror.
4. `quick-xml` 0.41.0 pin sourced from this workspace's own `Cargo.lock`,
   not the M0 ecosystem report — **closed**: re-confirmed 2026-09-05 in
   `rust/Cargo.lock` (`quick-xml` 0.41.0, already vendored).
5. CSV input shape is this plan's own invention (no contract defines one;
   D4 says trivial) — lead.
6. `PostImportHook`'s real signature is provisional — L1/L3.
7. Isaac's real FIT/GPX archive location — Isaac. A FIT sample exists as
   of the L5 merge (2026-09-05); Tasks 1–6 still land on synthetic
   fixtures (R23 Q4).
8. `fitparser` 0.11.0's exact field-decoding behaviour verified only
   against the locally-cached 0.9.0 source — compile-and-fix step in
   Task 4 — L2 implementer.
9. `.idl0`'s own `Importer` implementation is out of this plan's scope — L1.
10. `session_id` collision extension (C4 §3) not implemented here (needs
    catalog state) — L1.
