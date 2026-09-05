# L7c Task 3 — implementer brief (Profile and Units sections)

You are the implementer for L7c Task 3 — the first two real sections,
built over Task 2's prefs store. No spec change needed (Task 2 already
rewrote §27's persisted set). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`, HEAD must be Task 2's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY there. Same "Never touch" list as Task 1/2. Do NOT push.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7c-settings/BRIEF.md`;
  the plan's Task 3
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md`, lines
  208–241) — your starting point, unchanged; Task 2's landed
  `Settings/prefs.ts` / `Settings/prefsStore.ts` (this task reads/writes
  through `createPrefsStore`, does not redefine any of its types); the
  read-only reference `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\data\app_settings.dart`
  for the unit-summary table's full field set (its own doc comment names
  force, power and spring rate even though idl0's UI omitted them — this
  task includes all seven fields, not just the ones idl0 rendered).

## The task (plan Task 3, Steps 1–3, unchanged)

**Files:**
- Create: `Settings/units.ts`, `Settings/units.test.ts`,
  `Settings/ProfileSection.tsx`, `Settings/UnitsSection.tsx`
- Modify: `Settings/index.tsx`

**Interfaces:**
- `units.ts`: `unitSummary(system): { speed, distance, pressure,
  temperature, force, power, springRate }` — idl0's table, with the two
  entries its UI omitted but its `app_settings.dart` doc comment names
  (force, power, spring rate) included since they are the units math
  channels default to. Plus `UNIT_SYSTEMS` for the toggle.

- [ ] **Step 1: Write the failing tests**

`units.test.ts`:
- `unitSummary — imperial — speed mph, distance ft/mi, pressure psi, temperature °F`
- `unitSummary — metric — speed km/h, distance m/km, pressure kPa, temperature °C`
- `unitSummary — either system — every field is non-empty (no half-filled table)`
- `unitSummary — the two systems — differ in every field, so the toggle always visibly does something`

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result`.

- [ ] **Step 2: Implement.**

  The rider-name field writes to prefs **debounced at 500 ms**, idl0's own
  behaviour, so typing does not thrash storage — call
  `store.set({ engine: { ...current.engine, rider_name } })` from a debounced
  handler, not on every keystroke. The units section is a two-way toggle
  plus the read-only summary from `unitSummary`. Both sections carry idl0's
  copy: the rider name is "pre-filled into new sessions", and changing the
  unit system "does not retroactively convert existing channel values".

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  Expected: 4 new tests passed on top of the running total (22 + 4 = 26 for
  this directory), 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

  Spec discipline: **no spec change needed** — Task 2 already rewrote §27's
  persisted set; this task only builds UI over it. Say this out loud in your
  report.

  ```bash
  git add app/src/routes/pages/Settings/units.ts app/src/routes/pages/Settings/units.test.ts app/src/routes/pages/Settings/ProfileSection.tsx app/src/routes/pages/Settings/UnitsSection.tsx app/src/routes/pages/Settings/index.tsx CHANGELOG.md
  git commit -m "app: Settings tab Profile and Units sections"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not write to the prefs store on every keystroke — debounce at 500 ms.
- Do not omit force/power/spring-rate from `unitSummary` — all seven fields,
  every call.
- Do not touch `docs/IDL0_SPEC.md` — this task declares no spec change.
- Do not build the data-directory or sync sections — Tasks 4–5.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units named on every value in the
summary table (they're literally unit strings — still doc-comment the
function's own contract); A/A/A tests named `thing — condition — result`.
No AI attribution trailer. Never `git push`.

## Spec discipline (say it out loud in your report)

**No spec change needed.**

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count, expect 26 total for the directory); per-step done/deviated;
confirmation the rider-name write is debounced at 500 ms, not per keystroke;
confirmation `unitSummary` returns all seven fields for both systems;
anything ambiguous you resolved (say how) or that needs a lead ruling (stop
and report instead of guessing — CLAUDE.md §1).
