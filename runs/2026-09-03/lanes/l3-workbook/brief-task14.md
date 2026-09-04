# L3 Task 14 — implementer brief (SPEC §17a rewrite; spec-first)

You are the implementer for L3 Task 14 of the idl1 rewrite — a docs-only
task in the idl1-app top-level repo, not the idl-rs submodule. No cargo, no
Rust changes. One commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`. Verify `git branch --show-current` says
  `wave1-l3-workbook` and `git status` is clean before starting; if not, stop and report.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` (the shared
  checkout), the `rust` submodule inside this worktree, or any other worktree. The only file
  this task edits is `docs\IDL0_SPEC.md`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  Global Constraints (41–135), `### Task 14` (994–1121, **its Step 1 draft text is corrected
  below — read it for the parts that carry over unchanged, but do not paste it verbatim**); the
  pre-read `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`, Task 14 section
  (G14.1–G14.7, L3-R40); this worktree's own `docs/IDL0_SPEC.md`, verified just now at lines
  1544 (`## 17a. Workbook Entity`) through 1612 (the line before `## 17b. Track Artifact`) — the
  plan's "~1412–1479" is wrong by ~130 lines (G14.1); do not blind-edit at 1412.

## The task, corrected per L3-R40

**Ruling — L3-R40.** Locate the range **by heading text**, never by line number (`## 17a.`
through the line before `## 17b.`) — confirm it is still 1544–1612 when you start; if the range
has moved (another task landed first), re-locate by heading and proceed. The plan's migration
section becomes **§17a.6**, not §17a.5 — **§17a.5 keeps Import policy**, edited only for the
`.idl1wb` extension and to state that an id collision on import is still Replace /
Import-as-copy — the one sanctioned way a workbook gets a new `id`, since C2 §1 makes `id`
immutable everywhere else. Step 2's sweep grep becomes `grep -n "17a\|idl0wb\|workbook_version\|Drive
sync" docs/IDL0_SPEC.md`; the five sites at (current) lines 32, 1793, 2270, 2883, 2889 are fixed
in this commit, or each named in the commit message as a deliberate deferral. G14.5 (the stale
`idl-rs overlay --workbook` claim inside old §17a.2) is **recorded, not fixed** — it predates
this task and is not L3's to fix; do not let it become a blocker or get silently corrected as a
drive-by.

- [ ] **Step 1: Replace `## 17a. Workbook Entity` (line 1544) through the line before `## 17b.`
  (currently ending 1612) with the text below.** This corrects the plan's draft: §17a.5 is
  Import policy (not deleted), migration moves to §17a.6, and the CLI invocation text matches
  L3-R38 exactly (`idl-rs migrate-workbook <INPUT> --output <OUTPUT>`, not the plan's stale
  two-positional guess) — confirm Task 13's brief (`lanes/l3-workbook/brief-task13.md`) still
  states this same shape before you paste it; if Task 13 has landed with a different shape, use
  what actually shipped and say so in your report (G14.6).

  ```markdown
  ## 17a. Workbook Entity (`.idl1wb`)

  A Workbook is a portable, session-agnostic analysis document: prose, math
  cells, table cells and JS chart cells, as Observable Framework-compatible
  Markdown. Charts reference channels and math definitions by name, never by
  session id, and render against whatever session the app binds at runtime.
  Full grammar, cell-id scheme, math-cell language, table-cell schema, JS
  host variables and migration rules: **`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`
  (contract C2)** — that document is authoritative; this section is a
  summary for readers navigating the SPEC, not a second source of truth.

  ### 17a.1 Storage

  - File: `<workbookId>.idl1wb`, UTF-8, LF line endings, at
    `<data>/workbooks/<name>.idl1wb` (path root: contract C4).
  - The workbook **is** the file — no database mirror, no Drive sync layer
    (D7's LAN sync replaces the old Drive-based sync entirely; see §17a.4).
  - Conflict policy: per-cell merge (C2 §7), not last-write-wins on the
    whole file.

  ### 17a.2 Schema (`version: 3`)

  YAML front matter (`id` UUIDv4, `name`, `constants`, `units`, `version`)
  followed by CommonMark prose interleaved with fenced ` ```math `,
  ` ```table ` and ` ```js ` cells (C2 §1–§2). Every fenced cell carries a
  stable `id=<8 hex>` in its fence info string, assigned on first save and
  never changed — the unit of diff and sync merge (C2 §2.2, §7).

  **Math cells** (C2 §3) hold one or more `name = expression` lines in a
  flat, whole-document namespace; `name` is a JS-identifier (unlike v2's
  free-text `MathChannel.name` — see §17a.5); a `# label: <text>` trailing
  comment carries a free-text display name. The expression grammar is the
  engine's existing evaluator (`idl-rs::math::{token,parse,eval}`), unchanged,
  with a 69-function builtin catalog (C2 §3.3) and a unit table (C2 §3.4)
  consulted only by the editor UI, never by evaluation. `const NAME = value`
  lines and front-matter `constants` share one flat, workbook-scoped
  namespace.

  **Table cells** (C2 §4) carry the existing `TableModel` JSON verbatim,
  unchanged from v2.

  **JS cells** (C2 §5) are standard Observable Runtime cells, executed in an
  origin-isolated sandboxed iframe (design doc §6), never crossing Tauri IPC
  directly. The host binds one JS variable per math definition (a
  `{length, t, v}` column-oriented table — `t` in **seconds**, distinct from
  the Parquet storage axis `t` in the session schema, which is microseconds;
  see contract C1 §3.1 and C2 §5.1) plus `channel()`, `laps`, `session`,
  `constants`, `Plot`, `d3`, `Inputs`, `html`. A Properties form generates
  and parses back a fixed subset of `Plot.plot(...)` code (C2 §5.3,
  `plotForm`); code outside that subset is "custom" and edited as text only.

  Newer-than-supported `version` refuses the file
  (`UnsupportedWorkbookVersion`, C2 §3.5.A); an absent `version` key defaults
  to `3`.

  ### 17a.3 Session binding (view context)

  Unchanged from v2: workbooks are session-agnostic; a view context binds a
  primary session and an optional overlay session at render time, never
  serialized into the file.

  ### 17a.4 Sync

  LAN sync (design doc §7, contract to follow in L11's wave-2 work) replaces
  Drive sync entirely: pull-based manifest/blob sync between paired peers on
  the local network, with workbook merge **per cell** (C2 §7) rather than
  whole-file last-write-wins — a cell changed on only one side takes that
  side; a same-cell conflict appends the peer's version as a marked conflict
  cell (`<!-- conflict from <peer> -->`) directly below, so the file always
  stays valid Markdown. No cloud relay in v1 (design doc §15).

  ### 17a.5 Import policy

  When importing a `.idl1wb` file:

  - No local match (`id` not in the local index) → import as-is, preserving `id`.
  - Local `id` match → user picks **Replace** (overwrite local) or **Import
    as copy** (fresh `id` — `Uuid::new_v4()`, `"(Copy)"` suffix on `name`).
    Import-as-copy is the one sanctioned way a workbook's `id` ever changes:
    C2 §1 makes `id` immutable everywhere else, including sync (§17a.4) and
    migration (§17a.6).

  ### 17a.6 Migration from v2 (`workbook_version` 1 or 2)

  `idl-rs migrate-workbook <input.idl0wb> --output <output.idl1wb>` converts
  a v2 file's `math_channels[]` into one `math` cell (identifier-sanitising
  any name that isn't already a valid JS identifier — every idl0 AHRS
  built-in needs this — while preserving the original as a `# label:`
  comment; C2 §6.1's exact algorithm), `constants[]` into front-matter
  `constants`, table blocks into `table` cells verbatim, and stages chart
  slots in a transient `_migrate_charts` front-matter key the app converts
  to `js` cells on first open (Properties-form code generation; not a CLI
  concern — C2 §6). A second transient key, `_migrate_math`, carries each
  migrated definition's original v2 `id` and colour forward as a Stage-2
  fallback (C2 §6); both transient keys are deleted by the app once Stage 2
  runs. `overlay_layouts[]` is dropped (D9). `worksheets[].xAxisMode` and the
  three non-timeSeries chart types with no v3 analogue
  (`gpsMap`/`lapTable`/`lapProgression`) have no migration path and are
  dropped with a logged warning, not silently discarded without a trace. The
  migration never refuses except for an unrecognised `workbook_version` or a
  migrated constant colliding with a universal constant (`pi`/`tau`/`e`/`g`)
  — every other irregularity (an unresolved chart reference, dropped block
  metadata, a live-lap `rowSource`) is reported and migrated through, never
  silently dropped and never a refusal.
  ```

- [ ] **Step 2: Fix or defer the five other contradiction sites, per the corrected sweep.** Run
  `grep -n "17a\|idl0wb\|workbook_version\|Drive sync" docs/IDL0_SPEC.md` and address each of
  these five (confirm the line numbers first — the file may have shifted since verification):
  - **Line 32 (TOC row):** `| 17a | Workbook Entity | Analyze tab, Drive sync |` — drop "Drive
    sync" (D7 removes it; §17a.4 above is LAN sync now). Replace with a phrase that stays true,
    e.g. "Analyze tab" alone, or "Analyze tab, LAN sync."
  - **Line 1793 (§25 Tab — Maths, "User-defined constants"):** "There is no symbolic constant
    reference syntax for user constants" is true of the **old idl0 app's Maths tab UI**
    (client-side literal insertion) and is exactly the fact Task 15's v2-evaluator fixture relies
    on (G15.1) — do not delete it. Scope it explicitly to the legacy engine/UI and cross-reference
    that v3 (§17a.2 above, C2 §3.1/§3.2) now has a real symbolic constant syntax
    (`const NAME = value`, front-matter `constants`), so an unqualified reader does not take this
    as still true.
  - **Line 2270 (§25 Tab — Maths, channel identity):** "A channel's identity is its stable `id`
    (charts reference channels by `id`) … expressions reference channels by `name`" describes v2's
    dual `id`/`name` addressing. Add a note (or a cross-reference to §17a.2) that v3 replaces this
    with **one flat identifier namespace** (C2 §2.4) — no separate `id` for expression/chart
    reference.
  - **Lines 2883/2889 (storage tree diagram and Drive sync sentence):** the tree entry
    `<workbookId>.idl0wb (one Workbook per file, see §17a)` and the sentence "Workbooks
    (`.idl0wb`) are synced under `IDL0/workbooks/…` with last-write-wins by `updated_at_ms`" both
    contradict C4 (path layout) and §17a.4 above (per-cell merge, not LWW). Update the extension
    to `.idl1wb` and replace the sync sentence with a cross-reference to §17a.4 rather than
    restating sync mechanics in two places.

  If any of the five turns out to need more than a two-line edit to fix correctly (a real
  structural rewrite of its surrounding section, out of scope for this task), name it in the
  commit message as a deliberate deferral instead of forcing a fix — per L3-R40, either is
  acceptable, silence is not.

- [ ] **Step 3: Commit.** From the worktree root:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l3-workbook"
  git add docs/IDL0_SPEC.md
  git commit -m "docs: SPEC §17a rewritten for workbook v3 (C2); import policy kept as §17a.5, migration moved to §17a.6"
  ```
  Stage **only** `docs/IDL0_SPEC.md`. Never stage anything under `rust/` (the submodule) from
  this worktree, even if `git status` shows it as modified for unrelated reasons.

## Do not
- Do not blind-edit at "~1412–1479" — that range is stale by ~130 lines (G14.1); locate by
  heading text and confirm before replacing.
- Do not delete or repurpose §17a.5 for Migration — Import policy stays at §17a.5, edited only
  for the new extension and the id-immutability note; Migration is §17a.6, a new section.
- Do not fix G14.5 (the stale `idl-rs overlay --workbook` claim in the *old* §17a.2, which this
  rewrite replaces wholesale anyway) as if it were in scope here — it is superseded by this
  rewrite regardless, so there is nothing to separately fix; just don't treat encountering it as
  a blocker.
- Do not silently leave lines 32/1793/2270/2883/2889 as they stand with no mention — fix each, or
  name it as a deliberate deferral in the commit message. Silence is the one disallowed outcome.
- Do not invent a different CLI invocation for §17a.6 — it must match whatever Task 13 actually
  shipped (L3-R38's `<INPUT> --output <OUTPUT>` shape, confirmed against Task 13's brief or its
  landed commit if it exists yet).
- Do not stage or touch `rust/` from this worktree.
- Do not run any `cargo` command — this task has no Rust surface.

## Style / hygiene
Markdown only, matching the surrounding SPEC's heading levels, table style and prose voice
(the same register as the L1/L4 SPEC rewrites already landed in this file — §15/§16.3/§18,
§14a). No AI attribution trailer in the commit.

## Spec discipline (say it out loud in your report)
"spec-first" — **this task's output is the spec.** It lands before Task 13's CLI-emission code is
written against assumptions about SPEC wording, even though C2 is the real grammar authority;
§17a is the reader-facing summary every other SPEC cross-reference points at.

## Report back (concise)
Commit hash + `git show --stat`; confirmation the replacement text landed at the located
`## 17a.` heading through the line before `## 17b.`, with §17a.5 = Import policy and §17a.6 =
Migration (not reversed, not merged); confirmation the CLI invocation text in §17a.6 matches
Task 13's actual shape (name which — the brief's proposal, or a landed deviation); per-site
outcome for all five sweep sites (fixed, with the one-line description of the fix, or named as a
deferral) — none silently left alone; confirmation nothing under `rust/` was staged; anything
ambiguous you resolved (say how) or that needs a lead ruling (stop and report instead of guessing
— CLAUDE.md §1).
