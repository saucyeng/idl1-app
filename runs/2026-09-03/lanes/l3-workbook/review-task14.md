# L3 Task 14 review — SPEC §17a rewrite (workbook v3)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `f29bf74` ("docs: SPEC 17a
rewritten for workbook v3 (C2); import policy kept as 17a.5, migration
moved to 17a.6 (specified, not implemented per R30)"). Scope: `docs/IDL0_SPEC.md`
only (167 lines changed, 109 insertions / 58 deletions) — matches `git show --stat`.
No other uncommitted changes present in this worktree (`git status` clean at HEAD).
Docs-only task; no cargo run, per dispatch instructions.

## Test command and result

None run — dispatch explicitly said "Run no cargo at all," and this is a
docs-only diff with no Rust surface. Verification instead consisted of
reading the diff and cross-checking its factual claims against the landed
`idl-rs` code at `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`
(HEAD `f1f5ce7`).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical/Important/Minor findings. | — |

## Checks performed (all pass)

- **(a) Factual accuracy against landed code.**
  - `RESERVED_NAMES` (`core/src/workbook/v3/error.rs:58-61`) is a 15-entry
    set that includes `pi`, `tau`, `e`, `g` — matches the inserted sentence
    "the four universal constants (`pi`/`tau`/`e`/`g`) are reserved and
    cannot be redeclared (C2 §3.5.A)"; the sentence correctly states a
    subset, doesn't overclaim the full 15.
  - `channel()`'s exclusive cross-session lookup (`core/src/workbook/v3/host.rs:72,106-113`)
    and the lap-count-naming error message (`host.rs:123-130`, tests at
    `host.rs:335-366` producing exactly `"channel(\"X\", lap: 7): no lap 7
    in this session's lap table (3 laps recorded)"`) match the inserted
    §17a.2 sentence describing both behaviours.
  - `UnsupportedWorkbookVersion` (`error.rs:39`) matches the SPEC's error
    kind name exactly.
  - Fence-cell id scheme `id=<8 hex>` matches actual fixtures/tests in
    `core/src/workbook/v3/mod.rs` (`id=a1b2c3d4`, `id=aaaaaaaa`).
  - `HostChannel { length, t, v }` with `t` in seconds
    (`core/src/workbook/v3/host.rs:20-40`) matches §17a.2's JS-cell host
    variable description verbatim (G14.7's "not a gap" was correctly left
    alone).
  - `idl-rs migrate-workbook <input.idl0wb> --output <output.idl1wb>` in
    §17a.6 matches L3-R38's pinned CLI shape (positional input,
    `--output` required) exactly.
- **(b) §17a.6 Migration.** Every behavioural sentence is conditional
  ("would convert", "would carry", "would be dropped", "would never
  refuse", "would be reported") and the section opens with an explicit,
  unambiguous statement: "Specified but not implemented in wave 1 …
  no `migrate_workbook_text` function, `MigrationReport` type, or
  `_migrate_charts`/`_migrate_math` front-matter key exists in `idl-rs`
  yet." A reader cannot come away thinking migration ships in wave 1.
- **(c) The two implementer-added sentences.** Both checked against code in
  (a) above and confirmed accurate, not overstated.
- **(d) CLAUDE.md §6 (CHANGELOG/TASKS).** Not touched by this commit, and
  correctly so — the lane's `pre-read-tasks10-16.md` (Task 16 section,
  lines 418-438) assigns CHANGELOG.md/TASKS.md updates to **Task 16**
  (mirroring L1's pattern, where `f6f84f6` bundled `CHANGELOG.md`/`TASKS.md`
  with the SPEC rewrite at the lane's own dedicated task, not at every
  docs-touching task). No finding.
- **(e) Five sweep sites**, confirmed all fixed (none deferred, matching the
  commit message's own account) via `git show f29bf74:docs/IDL0_SPEC.md`:
  - Line 32 (TOC): "Analyze tab, Drive sync" → "Analyze tab, LAN sync".
  - Line 1793→1844 (Maths tab constants note): re-scoped to "legacy idl0
    app, v2 workbooks", the "no symbolic constant syntax" claim preserved
    verbatim (Task 15's G15.1 fixture dependency intact) with a new
    cross-reference to v3's real symbolic constant syntax.
  - Line 2270→2321 (channel id/name identity): original v2 text preserved,
    new parenthetical cross-references §17a.2/C2 §2.4's flat namespace.
  - Lines 2883/2889→2934/2940 (storage tree + sync sentence): extension
    updated to `.idl1wb`; the LWW sync sentence replaced with a
    cross-reference to §17a.4 rather than restating (now correct) sync
    mechanics in two places.
- **G14.2/L3-R40 compliance.** §17a.5 remains Import policy (not
  repurposed for Migration); §17a.6 is a new section for Migration — not
  reversed, not merged. Import policy correctly adds the id-immutability
  cross-reference to §17a.4/§17a.6 and the `.idl1wb` extension, matching
  the ruling.
- **G14.5.** The stale `idl-rs overlay --workbook` claim is absent from the
  new §17a.2 (superseded by the wholesale rewrite) — not separately
  "fixed," consistent with the brief's explicit instruction not to treat
  it as in scope.
- **Range location.** `## 17a.` through the line before `## 17b.` was
  confirmed at 1544-1612 pre-edit (matches L3-R40's stated range); the
  replacement text lands there correctly bounded — no bleed into §17a.5's
  neighbours or into §17b.
- **Hygiene.** Single commit, no AI attribution trailer; subject +
  descriptive body is consistent with existing precedent in this file's
  history (e.g. `0bd3532`'s SPEC §14a commit uses the same subject+body
  shape) — the STANDING brief's "single line" requirement is about the
  no-attribution-trailer rule, not a ban on commit bodies, given that
  precedent. `git add` staged only `docs/IDL0_SPEC.md`, matching `git show
  --stat`; nothing under `rust/` touched or staged; shared checkout and
  other worktrees untouched.
- **Style.** Heading levels, table style and prose voice match the
  surrounding SPEC (§15/§16.3/§18/§14a's register); no reformatting of
  untouched lines detected in the diff (all removed/added hunks are
  scoped to the sections named in the brief).

## Verdict rationale

The rewritten §17a is accurate against the landed `idl-rs` code everywhere
checked — reserved constants, cross-session lookup exclusivity, the
lap-count error message, the fence-cell id scheme, the host-channel shape,
and the CLI invocation for migration all match the actual implementation
or its pinned ruling exactly. §17a.6 (Migration) is written entirely in
conditional mood with an explicit "specified but not implemented" opener,
so R30's cut is unmistakable to a reader. All five sweep sites are fixed
correctly, matching both the brief's instructions and the commit message's
own account, with none silently left alone. §17a.5 (Import) and §17a.6
(Migration) land in the right slots, not reversed or merged. CHANGELOG/TASKS
were correctly left untouched, per the lane's own Task 16 ownership. No
deviations, no overclaims, no defects found.

VERDICT: CLEAN
