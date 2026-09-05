# L2 Task 1 review — SPEC §15a (Non-device Importers)

**Scope:** commit `b49b9ca` on branch `wave1-l2-importers`, worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l2-importers`
(parent `33c8a6b`). Single file touched: `docs/IDL0_SPEC.md` (229 insertions,
0 deletions). Prose-only task, no cargo gate. Shared checkout
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` confirmed untouched and on
`main` (its `M app/src-tauri/Cargo.toml` and an untracked plan file predate
and are unrelated to this task — ignored).

## Test command and result

None run — Task 1 is prose-only (CLAUDE.md §8 / task brief "COMPUTE RULES:
None"). Confirmed no `.rs` or `Cargo.toml` file appears in the diff.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `docs/IDL0_SPEC.md` §15a.1 (new, the "A future `core::import::importers()` registry table making importers enumerable by id/label/extensions is a separate, later concern" sentence) | Task 1's brief does not authorize any mention of the future importer registry, and the dispatch review checklist item (5) specifically asks that §15a not specify the Rust shape of the R51 Q2 registry. This sentence names the exact future function (`core::import::importers()`) and echoes R51 Q2's exact field set from `runs/2026-09-03/decisions.md` ("core::import::importers() -> &static [ImporterInfo { id, label, extensions }]") almost verbatim, as "id/label/extensions." R51 itself says Task 7's own brief is "to be written after Task 3 lands" — the shape is not final yet. Pinning the function name and field set now, inside signed SPEC prose, preempts that later brief. | Replace with a shape-free pointer, e.g. "a future importer registry making importers enumerable is Task 7's scope (ledger R51 Q2) — not specified here." |
| Minor | `docs/IDL0_SPEC.md` lines 6-47 (Table of Contents, unchanged by this commit) | The new `## 15a.` heading is not added to the TOC table, even though the SPEC's own convention for lettered subsections adds them (`14a Transport Trait Architecture` and `17a Workbook Entity` both already appear in the TOC, and an L4 lane commit's own message records a "SPEC TOC" update accompanying its new section). Neither the task brief nor the plan's Step 1 instructed a TOC edit, and a pre-existing `17b Track Artifact` entry is already missing from the TOC independently of this task, so the convention is already imperfect — this is a completeness gap, not an invented rule. | Add one TOC row under the PART 4 block: `| 15a | Non-device Importers (FIT, GPX, CSV) | Import tasks |`. |

No Critical findings.

## Checks performed (all pass)

- **Diff shape.** `git show --stat b49b9ca`: 229 insertions, 0 deletions,
  one file. `git diff 33c8a6b b49b9ca -- docs/IDL0_SPEC.md | grep '^-'`
  returns only the `--- a/docs/IDL0_SPEC.md` diff header — no existing line
  was touched, moved, or reformatted. No BOM (`head -c 3` shows `# I`, not
  `EF BB BF`); CRLF line endings preserved (`file` reports CRLF, unchanged).
  The new `## 15a.` heading lands immediately before `## 16. Track Entity`;
  no existing section renumbered.
- **Correction 1 (R27, GPS decimal degrees).** §15a.2 states
  `GPS_Latitude`/`GPS_Longitude` are physical decimal degrees, `unit: deg`,
  for every source, citing R27 and the idl-rs `7e10797` landing; explicitly
  states no channel in the section carries `deg_e7`; §15a.3's GPX row keeps
  the "not scaled ×1e7... physical degrees directly" sentence, and both
  §15a.2/§15a.3 state the same rule holds for FIT and GPX. Grep-checked: no
  literal `deg_e7`, `×1e7`, or `1e7` multiply survives anywhere in the 229
  added lines outside the historical-R23 discussion the brief explicitly
  allowed to be described as history.
- **Correction 2 (units table, L2-R1).** Both §15a.2 (FIT) and §15a.3 (GPX)
  carry an explicit units line/column, copied against C1 §4.1's amended
  row: `GPS_Latitude`/`GPS_Longitude` -> `deg`, `GPS_Altitude` -> `m`,
  `GPS_EpochMs` -> `ms_raw`, `HR_BPM` -> `bpm`, `Cadence_RPM` -> `rpm`,
  `Power_W` -> `W`; `GPS_SpeedKmh` -> `km/h` and `GPS_Heading` -> `deg` are
  listed for completeness with a correct note that neither is populated by
  this wave's importers.
- **Correction 3 (FIT `GPS_EpochMs`).** The false "no equivalent field"
  clause is gone. §15a.2 states FIT populates `GPS_EpochMs` from
  `record.timestamp` on records carrying a position, wire formula
  `GPS_EpochMs = (fit_timestamp_s + 631_065_600) * 1000` (matches C1 §3.1's
  `(fit_timestamp_s + 631065600) * 1000` and C1 §4.1's own restatement,
  cross-checked byte-for-byte apart from cosmetic digit grouping already
  present in C1 itself). The double-offset warning is present in
  substance: Task 4's importer must not add the offset a second time to
  the already-converted value. Verified independently against the vendored
  `fitparser-0.9.0` source
  (`~/.cargo/registry/src/index.crates.io-.../fitparser-0.9.0/src/profile/mod.rs:63-76`
  and `src/lib.rs:240`): `TimestampField::to_date_time` builds
  `ref_date (1989-12-31) + Duration::seconds(raw_value)`, and
  `Value::Timestamp(..).timestamp()` (chrono's `DateTime::timestamp()`)
  returns Unix-epoch seconds regardless of the `DateTime<Local>`
  representation — the crate has already folded in the 631,065,600-second
  FIT-epoch offset by the time `.timestamp()` is called, confirming both
  the SPEC's and the brief's claim.
- **Correction 4 (CSV `source_kind`).** §15a.4 states explicitly that
  `source_kind = "csv"` is a new token under C1 §4.2's forward-compatibility
  clause, cites the R23 amendment by name, and states the event-driven
  (`channel_kind: event`, `nominal_rate_hz: 0.0`) and empty-`unit` details
  as amendment consequences rather than independent choices — matches C1
  §4.2 line 486 in substance.
- **Correction 5 (`GPS_SpeedKmh`/`GPS_Heading` reframing).** §15a.3's
  paragraph is rewritten from "likely contract gap" to "C1 §4.1 does name
  both channels... deferred to Task 8 (ledger R7, R23 Q4) — not a contract
  gap needing escalation," matching the brief's required rewrite and citing
  the correct ruling numbers (R7 for the C1 amendment, R23 Q4 for the
  deferral).
- **Correction 6 (`Time`/`Distance` synthesis).** §15a.5's "Common rules"
  bullet states the R23 Q2 fallback correctly: no positive-rate channel
  falls back to the channel with the most samples, using its own real
  `t_us`, `nominal_rate_hz` staying `0.0` so `channel_kind` reads `event`;
  states `Distance` stays absent for FIT/GPX/CSV until Task 8, for the
  correct reason (`GPS_SpeedKmh` not yet populated). Matches the ruling
  text in `runs/2026-09-03/decisions.md` R23 Q2 in substance.
- **Untouched-per-brief item 7.** §15a.1's `Importer` trait shape (aside
  from the flagged registry sentence), §15a.2/§15a.3's field-decode tables
  (beyond the units/EpochMs corrections), §15a.4's CSV shape, and §15a.5's
  Error-kinds/hook/what's-not-covered paragraphs read as unchanged in
  substance from the plan draft, apart from the authorized
  `ImportedSession`/`ImporterWarning` rename note (present, correctly
  framed as a name-only change, not a shape change).
- **C3 §2 cross-check.** §15a text never asserts a file location for
  `ImporterError`, so it does not contradict C3 §2's statement (line 182)
  that `ImporterError` lives in `rust/core/src/import/error.rs` — no
  conflict found.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer;
  `git show --stat` confirms only `docs/IDL0_SPEC.md` in the commit (no
  stray file from a `git add -A`); working tree of the worktree is clean on
  branch `wave1-l2-importers`, HEAD at `b49b9ca`.

## Verdict rationale

The committed §15a text correctly implements all six of the brief's
corrections, verified line-by-line against C1 §4.1/§4.2, the ledger
rulings (R7, R23, R27, R51), and — for the FIT epoch claim specifically —
the actual `fitparser-0.9.0` crate source rather than taking the brief's
claim on faith. The diff is a clean, pure addition with no collateral
formatting churn, no BOM/CRLF change, and correct placement ahead of §16.
Two gaps keep it short of CLEAN: the §15a.1 registry sentence volunteers a
Rust-shape detail (function name and field set) that belongs to Task 7's
own not-yet-written brief, which the dispatch specifically flagged as a
thing to check for and avoid; and the new lettered section was not added
to the SPEC's Table of Contents, unlike the two prior lettered-subsection
precedents already in that table. Both are small, mechanical,
single-sentence/single-line fixes, not a rework — the approach and every
ruling-driven correction are sound.

VERDICT: NEEDS_FIXES
