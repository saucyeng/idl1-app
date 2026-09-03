# L10 (docs) — lane brief

**Scope:** design §10 L10 row — idl1-app SPEC (copy Parts 1–2/3–10, done in M0; rewrite app
parts happens per lane, L10 verifies coverage); CLAUDE.md layer rules (confirm, not rewrite);
README discipline; CHANGELOG/TASKS discipline; fix idl0-app CLAUDE.md §2 staleness. L10 is
cross-cutting — it verifies every other wave-1 lane followed spec discipline (design §12), it
does not implement L1–L5's own SPEC sections.

**Plan file:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l10-docs.md`

**Dependency gate:**
- Group A (Tasks 1–5): none. May run any time, even before L1–L5 start or finish.
- Group B (Task 6, last task): all of L1, L2, L3, L4, L5 landed (merged, reviewer verdict
  clean, tests green — design §12's per-lane gate). Not yet satisfied as of this brief.

**Branches:**
- `idl1-app`: `wave1-l10-docs` (Tasks 2, 5, 6).
- `rust` submodule (`idl-rs`): `wave1-l10-docs`, a second/independent branch in the same
  checkout (Task 3).
- `idl0-app`: no branch — direct commit on `main`, a separate repo, separate history (Task 4).

**Done-when:**
- Group A: `tools/README.md` no longer documents uncarried `idl0_dump.dart`; `app/README.md`
  is project-specific, not the Tauri scaffolder's template; `transport/src/error.rs`'s two test
  names follow the codebase's `thing_condition_result` convention (logic unchanged); idl0-app
  `CLAUDE.md` §2 states the 2026-09-02 feature freeze instead of narrating an ongoing
  Dart→Rust migration; CHANGELOG.md carries a wave-1-started entry and the per-lane completion
  line templates Task 6 will instantiate.
- Group B: a status table for L1–L5 (BRIEF found / SPEC section(s) claimed / present in
  `docs/IDL0_SPEC.md` / content check / verdict), each `clean` lane ticked in TASKS.md with a
  CHANGELOG completion line, each non-clean lane reported (not silently fixed — CLAUDE.md §7);
  §11 App Architecture polished for consistency with CLAUDE.md §2 and the other landed
  sections; L10's own TASKS.md box ticked last.

**SPEC section(s) touched/verified:**
- Touched (Task 6, wording-level polish only): §11 App Architecture.
- Verified, not touched: §15, §16.3, §18 (L1); a new importers section (L2); §17a Workbook
  Entity (L3); confirmed L4 needs none (§6–8 stay current, no rewrite).
- No change: Parts 1–2 / §3–10 (device/wire, current).

**Open questions logged (4):** lane BRIEF directory slug convention; L2's importers section
number/placement; other lanes' BRIEF field name for SPEC sections touched; L4's "no spec
change needed" claim — all assigned to the lead in the plan's Open questions section.
