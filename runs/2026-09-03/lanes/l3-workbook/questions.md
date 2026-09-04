# L3 workbook lane — open questions for the lead

Appended by adjudicators/brief writers. One block per question, newest last.

---

### Q5 — With migration cut (R30), what proves the lane's Done-when (1), and does the criterion's text change?

- **Where:** `runs/2026-09-03/lanes/l3-workbook/BRIEF.md:25-29` ("Done when: (1) a
  migrated idl0 workbook evaluates byte-for-byte against the existing v2
  evaluator on every math output (Task 15 Step 1)"); plan Task 15 Step 1
  (`docs/superpowers/plans/2026-09-03-idl1-wave1-l3-workbook.md:1130-1152`).
- **Context:** R30 cut Task 13 (`migrate-workbook`), so `migrate_workbook_text`
  and `MigrationReport` will never exist in wave 1. Task 15 Step 1 as planned —
  and L3-R41's corrected version of it — are both built entirely on them, and on
  `MigrationReport.identifier_by_v2_id` (L3-R36) for matching definitions. Done-when
  (1) is therefore unprovable as written. The lane still needs *a* numerical
  proof that the v3 cell pipeline produces the engine's numbers and not new ones;
  the question is whether that substitute proof is accepted as satisfying
  Done-when (1), and who rewrites the criterion.
- **Blast radius:** structural
- **Recommended answer:** Done-when (1) becomes *"every v3 math-cell value equals
  a direct `math::evaluate` on the same expression against the same session,
  bit-for-bit"* — a v3-internal parity gate (v3 pipeline vs. the bare evaluator),
  not a v2-vs-v3 gate. Task 15 Step 1 implements exactly that; Task 16 rewrites
  the BRIEF.md line in its appended "Delivered" section rather than editing the
  header (L3-R42's append-only rule).
- **Proceeded on:** the recommended answer. `brief-task15.md` Step 1 is written
  as the v3-vs-direct-evaluator parity test with the migration arm removed;
  `brief-task16.md` records the criterion's restatement and the migration cut.
- **Affected outputs:** `runs/2026-09-03/lanes/l3-workbook/brief-task15.md`
  (Step 1 — marked PROVISIONAL); `runs/2026-09-03/lanes/l3-workbook/brief-task16.md`
  (Step 3's "Delivered" text — marked PROVISIONAL).
- **Your answer:** ACCEPTED as recommended (ledger R36, 2026-09-04). The
  substitute proof is sufficient because Done-when (1) conflated two
  guarantees: (i) the evaluator produces idl0's numbers, and (ii) the v3 cell
  pipeline routes to it without altering them. (i) is already landed and
  proven independently of migration by `core/src/math/tests_parity.rs`, which
  pins the exact output vectors ported from the Dart suite
  (`app/test/data/math_channel_evaluator_test.dart`). Only (ii) was ever
  Task 15's to prove, and the v3-vs-direct-`math::evaluate` parity test proves
  exactly that. Nothing is lost with migration cut. Both PROVISIONAL markers
  are cleared — the dispatching lead will say so.
