# L2 Task 1 — implementer brief (SPEC §15a: non-device importers)

You are the implementer for L2 Task 1 of the idl1 rewrite — the first task of
the core importers lane, and the only prose-only one. Spec-first (CLAUDE.md
§6): this section is written before any importer code exists, and every
later task in this lane cites it by number. ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l2-importers`
  (the idl1-app top-level repo, **not** the `idl-rs-worktrees` one — this
  task touches only `docs/IDL0_SPEC.md`, which lives in idl1-app, not the
  `rust` submodule). If it does not already exist, create it:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave1-l2-importers "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l2-importers" main
  ```
  Branch `wave1-l2-importers`, HEAD on `main`, status clean. Verify first; if
  the worktree already exists with a different HEAD, stop and report instead
  of guessing which is authoritative.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`
  (shared checkout — must stay on `main`), the `rust` submodule inside this
  worktree, or any other worktree. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the
  L2 plan's Task 1 section (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`,
  lines 84–274 — the full §15a text you are inserting is drafted there,
  **with the corrections below**); contract C1
  (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`) §3.1, §3.4,
  §4.1 (rows for `GPS_Latitude`/`GPS_Longitude`/`GPS_Altitude`/`GPS_EpochMs`/
  `HR_BPM`/`Cadence_RPM`/`Power_W`, and the "*(FIT/GPX-derived channels)*" row
  — **already amended and signed**, this is your primary source, more
  authoritative than the plan's own prose), §4.2 (the `source_kind`
  enumeration — **already includes `csv`**); the ledger `R23` entry in
  `runs/2026-09-03/decisions.md` (Q1–Q4); the pre-read
  `runs/2026-09-03/lanes/l2-importers/pre-read-tasks1-6.md`'s Task 1 section
  (G1.1–G1.5).

## COMPUTE RULES

None. This task writes Markdown only — no `.rs` file, no `Cargo.toml`, no
cargo command of any kind.

## The task (plan Task 1, Steps 1–3) with these corrections

Insert `## 15a. Non-device Importers (FIT, GPX, CSV)` into
`docs/IDL0_SPEC.md` exactly where plan Step 1 says (immediately before
`## 16. Track Entity` — confirm the line number with
`grep -n "^## 16. Track Entity" docs/IDL0_SPEC.md` first, per plan Step 1).
Use the plan's drafted text (plan:99–261) as your starting point, but it
predates several lead rulings and one already-amended contract — apply every
correction below; do not transcribe the plan's block verbatim.

**1. GPS coordinate scale — Q1, `deg_e7` everywhere (not `deg`).** C1 §4.1
was amended (R23) the same day this plan was drafted: `GPS_Latitude`/
`GPS_Longitude` are `deg_e7` (decimal degrees × 1e7, matching `.idl0`'s own
convention and every landed consumer — `gps.rs`, `laps::*`, `tracks::*`) for
**every** source, FIT and GPX alike. This flips §15a.3's GPX table row,
which currently reads "decimal degrees, direct... **not** scaled ×1e7... C1's
non-device row stores physical degrees directly" — that sentence is now
false; replace it with: GPX's `<trkpt lat lon>` values are parsed as decimal
degrees, then multiplied ×1e7 before being stored, `unit: deg_e7`, matching
FIT's same conversion. State this once, clearly, in a way Tasks 3/4 can cite.

**2. Units table (L2-R1).** Add an explicit `unit` column (or a clearly
labelled units line per row) to both the FIT table (§15a.2) and the GPX
table (§15a.3), copied verbatim from C1 §4.1's now-amended
"*(FIT/GPX-derived channels)*" row: `GPS_Latitude`/`GPS_Longitude` → `deg_e7`,
`GPS_Altitude` → `m`, `GPS_EpochMs` → `ms_raw`, `HR_BPM` → `bpm`,
`Cadence_RPM` → `rpm`, `Power_W` → `W`. (`GPS_SpeedKmh` → `km/h`,
`GPS_Heading` → `deg` belong in this same units list for completeness even
though neither channel is populated by Tasks 3/4 — see point 5 below.)

**3. FIT `GPS_EpochMs` — Q3, strike "no equivalent field".** §15a.2 currently
says "FIT has no equivalent field for [GPS_EpochMs] and so never populates
it" — false; `record.timestamp` is a UTC instant. Strike that clause. State
instead, matching C1 §4.1's now-explicit text: FIT populates `GPS_EpochMs`
from `record.timestamp` on records carrying a position (both `position_lat`
and `position_long` present), formula
`GPS_EpochMs = (fit_timestamp_s + 631_065_600) * 1000` where
`fit_timestamp_s` is the **raw FIT-epoch-relative** wire value (seconds
since 1989-12-31) — flag in a parenthetical that Task 4's own code decodes
this via `fitparser`, whose `Value::Timestamp(..).timestamp()` already
returns Unix-epoch seconds with this same `+631_065_600` folded in by the
crate itself, so Task 4's importer must not add the offset a second time to
that already-converted value; this SPEC section states the wire-level
formula for reference, Task 4's brief states the code-level one. Unit
`ms_raw` (point 2 above).

**4. CSV `source_kind` token (G1.4).** §15a.4 must say explicitly that
`source_kind = "csv"` is a new token under C1 §4.2's forward-compatibility
clause — don't leave it to a reader's inference. C1 §4.2 was amended (R23)
to name `csv` directly in its `source_kind` enumeration and to state CSV is
event-driven (`channel_kind: event`, `nominal_rate_hz: 0.0`) with `unit` the
empty string when the header supplies none — cite that amendment directly
rather than re-deriving it.

**5. `GPS_SpeedKmh`/`GPS_Heading` — correct the "not ported" framing.** §15a.3's
current text says C1 §4.1's column list "does not name either channel" and
flags this as "a likely contract gap." That framing is stale: C1 §4.1 **was**
amended (2026-09-03, ruling R7 — earlier the same day as this plan, a
separate ruling from R23) to add both `GPS_SpeedKmh` and `GPS_Heading` to the
FIT/GPX-derived row, with a dedicated follow-on **Task 8** (FIT
`speed`/`enhanced_speed` ×3.6; GPX `<speed>`/`<course>` or the ported Dart
derive-when-absent fallback) — held per R23 Q4 pending Isaac's real FIT/GPX
archive, not executed in this wave. Rewrite the paragraph: C1 §4.1 **does**
name both channels; Tasks 3/4 in this lane deliberately do not populate
them; that is Task 8's scope, deferred (ledger R7, R23 Q4) — not a contract
gap needing escalation.

**6. `Time`/`Distance` synthesis — G1.3/Q2, state the synthesizer rule, not a
metadata workaround.** §15a currently has no statement about whether an
imported session gets base `Time`/`Distance` channels at all — every L2
channel has `nominal_rate_hz = 0.0`, and `synthesize_base_channels` today
only synthesizes `Time` from a channel with `nominal_rate_hz > 0`. Ledger
R23 (Q2) rules: `synthesize_base_channels` (a landed L1 file, `session/
synthesis.rs`, edited under this ruling by L2 Task 6) falls back, when no
channel has a positive rate, to the channel with the most samples, using
**that channel's own real `t_us`** for `Time` — never a fabricated rate
(the synthesized `Time` channel's `nominal_rate_hz` stays `0.0` in this
fallback, so `channel_kind` honestly reads `event`, not `fixed-rate`, for an
irregular source). Add a short paragraph to §15a.5 ("Common rules") stating
this: every FIT/GPX/CSV session gets a `Time` channel (from its longest
channel's real recorded time, event-driven); `Distance` still requires
`GPS_SpeedKmh` at a positive rate, which none of Tasks 3–5's importers
produce (point 5 above), so `Distance` stays absent for FIT/GPX/CSV sessions
until Task 8 lands.

**7. Leave untouched:** §15a.1 (the `Importer` trait — matches L2-R2's
renames only in *type names*, which is Task 2's code, not this section's
prose — you may mention `ImportOutcome`/`ImportWarning` are renamed to
`ImportedSession`/`ImporterWarning` to avoid the plan's own type-name
collision with landed `store::import`/`session` types, but the *shape*
description is unchanged); §15a.2's FIT field-decode table (name/conversion
columns) beyond adding the units column; §15a.3's GPX element table beyond
the lat/lon and units fixes above; §15a.4's CSV shape (unaffected by any
ruling); §15a.5's "Error kinds"/"Post-import materialisation hook"/"What is
not covered here" paragraphs (unaffected); §15a.6 (Open questions pointer,
unaffected).

## Do not

- Do not touch any file under `rust/` (this task is docs-only).
- Do not renumber any existing SPEC section — §15a is inserted, nothing
  shifts.
- Do not resolve or re-litigate any open question beyond what's stated above
  — §15a.6 continues to point at the plan's own Open Questions section.
- Do not write CHANGELOG.md or TASKS.md — that's Task 7 (out of this lane's
  Task 1–6 dispatch), done once at the end of the lane, not per task.

## Style / hygiene

Markdown only, matching the SPEC's existing section style (see §14/§16 for
tone/formatting precedent). Commit with an explicit path (NOT `git add -A`):
`git add docs/IDL0_SPEC.md` — message
`docs: IDL0_SPEC §15a — non-device importers (FIT, GPX, CSV)`. Single line,
no AI attribution trailer.

## Spec discipline (say it out loud in your report)

"spec-first" — this task **is** the spec. Confirm in your report that every
correction above (1–6) is reflected in the inserted text, not just the
plan's original draft.

## Report back (concise)

Commit hash + `git show --stat`; confirm the `## 15a.` heading lands
immediately before `## 16.` with the exact line numbers from your
`grep -n` check; confirm each of corrections 1–6 above is present in the
committed text (quote the one or two sentences that changed for each, so a
reviewer doesn't have to diff the whole section); anything in C1/the ledger
you found ambiguous or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
