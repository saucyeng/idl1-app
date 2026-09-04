# Review: Task 2 — SPEC §15/§16.3/§18 rewrite (wave1-l1-store)

Commit reviewed: `8f9c958` on branch `wave1-l1-store`
(worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l1-store`).
File touched: `docs/IDL0_SPEC.md` only (168 insertions, 89 deletions, 1 file) — matches the plan's
declared scope for Task 2.

**Test command:** none — this is a docs-only task (plan explicitly: "No code in this task").
No build/test artifacts to run; verification was by textual diff against the plan's literal
draft text and against the current C1/C4 contract text (read directly from
`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` and
`…-c4-data-directory.md` on `main`, post all R5–R8 amendments).

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Important | `docs/IDL0_SPEC.md:2193` | Line cites `(§15.1)` as the home of the on-device SD-card `YYYY-MM-DD_HH-MM-SS.idl0` filename convention. The rewritten §15.1 dropped the sentence that used to state this ("The on-device SD card uses the same `YYYY-MM-DD_HH-MM-SS.idl0` scheme in UTC (§10)") — §15.1 now only describes the app-side `sessions/<session_id>/` directory layout, which explicitly supersedes the old filename-stem convention. The citation is now orphaned: it points readers to a section that no longer documents what it's cited for. (The actual convention still lives, correctly, at §10, which Task 2 didn't touch.) | Either restore a one-line pointer in §15.1 ("device SD card still uses `YYYY-MM-DD_HH-MM-SS.idl0`, §10") or repoint line 2193's citation from `§15.1` to `§10`. |
| Minor | `docs/IDL0_SPEC.md:1387` (§16.1 "Purpose") | Untouched §16.1 still says "Tracks live in Drive (`IDL0/tracks/<uuid>.idl0t`) with a local SQLite cache," directly contradicting the rewritten §16.3 ("there is no cloud store in idl1 … LAN sync only, no SaaS/Drive"). This is pre-existing SPEC debt (§16.1/§16.2/§16.4 were correctly out of Task 2's declared scope — the plan only assigns §16.3), not something Task 2 introduced, but it is now a visible internal contradiction within the same numbered section family. | Flag for whichever later task owns §16.1/§16.2/§16.4's idl1 rewrite; no action needed from Task 2 itself. |

## Verification detail (no finding — confirms compliance)

- **§15.2 `Channel` struct vs C1 §2 (post-R5):** the executed diff adds `t_recorded_us:
  Option<Vec<i64>>` and `unit: String` to the `Channel` struct plus an explanatory paragraph,
  which is *not* in the plan's Step 1 literal draft text. Cross-checked against
  `2026-09-03-idl1-c1-session-schema.md` §2 (current, post-sign): both fields are present there
  verbatim, explicitly marked "Added post-sign (2026-09-03, lead ruling R5, wave-1 L1)" with the
  same rationale (`t_recorded_us` optional/`None` in the non-diverged case; `unit` sourced from
  the channel registry's `units` field). The plan's own Open Questions items 1–2 flag this
  exact addition as "Assigned: lead," and C1 §2 shows the lead has since ruled on it. The
  deviation is correct and required to keep the SPEC in sync with the signed contract — not a
  spec-compliance problem.
- **§18.2 profile path vs C4 §2/§6 (post-R6):** the plan's literal draft text says "not yet a
  C4-fixed path — see this plan's Open questions." The executed text instead says "fixed by C4
  §2, added post-sign as lead ruling R6." Cross-checked against
  `2026-09-03-idl1-c4-data-directory.md` §2 line 91 (`profiles/<profile_id>.idl0p`, "Added
  post-sign (2026-09-03, lead ruling R6, wave-1 L1)") and §6 (sync scope explicitly lists
  `profiles/<id>.idl0p`, "added post-sign, ruling R6"). The deviation correctly reflects the
  contract's current state rather than the plan's stale draft language — this is the right call,
  not a silent deviation (the SPEC text openly cites "lead ruling R6").
- **§15.3/§15.4 terminology-only pass:** diffed old vs. new text line-by-line. Only substitutions
  found: `Dart→Rust for charting` → `over IPC for charting`; `Dart holds no copy` → `The frontend
  holds no copy`; four `crosses FFI` → `crosses IPC`. No other characters changed — substance
  (tile decimation, byte-budgeted residency policy, video-link fields) is untouched, matching the
  plan's explicit scope note ("this task only removes stale FRB-era vocabulary"). §15.4 had no
  FFI/Dart/flutter_rust_bridge occurrences to begin with, so it is byte-identical — correctly
  left alone.
- **§18.1/§18.3 untouched:** byte-for-byte diff against pre-commit text — identical. Matches the
  plan's explicit instruction to leave these two subsections alone.
- **§16.3 rewrite vs plan draft and C4:** byte-for-byte match to the plan's Step 3 draft text.
  `catalog.sqlite` path and the six-table list (`sessions`, `blobs`, `workbooks`, `tracks`,
  `laps`, `lap_summary`) both check out against C4 §5's DDL section.
- **C1 §6 (`session.json`) / R8 decimal-degrees ruling:** not restated or contradicted anywhere
  in the Task 2 diff — §15.1's session.json pointer stays at the field-list level (rider, bike,
  venue, …, lap gates) without asserting units, so there is nothing here that conflicts with C1
  §6's decimal-degrees ruling. (Separately, §17b's *Track Artifact* JSON, out of Task 2's scope,
  still documents `×1e7` gate coordinates for a different file — that's a distinct, portable
  export format the R8 ruling doesn't govern, not a Task 2 inconsistency.)
- **Commit message:** `docs: rewrite SPEC 15, 16.3, 18 storage parts for C1/C4` — no
  Co-Authored-By or other AI attribution trailer.
- **Scope:** `git show --stat` confirms exactly one file changed (`docs/IDL0_SPEC.md`); no
  `CHANGELOG.md`/`TASKS.md`/code touched by this commit (those are separate later-task/commit
  concerns per the plan's File Structure section).

## Verdict

CLEAN, with one Important documentation-hygiene finding (stale §15.1 cross-reference at line
2193) that should be fixed before or shortly after merge, and one pre-existing Minor
inconsistency in out-of-scope §16.1 noted for a future task. Neither affects spec-first
discipline for Task 3 onward: nothing in Task 2's own new §15/§16.3/§18 text is internally wrong,
and both are surface citation issues, not contract-content errors.
