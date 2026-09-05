# L7c Task 6 — implementer brief (Controls, How-Tos, About, and this lane's wrap-up)

You are the implementer for L7c Task 6 — the chart-controls reference (
marked provisional per R53 Q2), the how-to articles, the About section, and
this lane's final task: the whole-suite gate, coverage, and `TASKS.md`.
Spec-during on `docs/IDL0_SPEC.md` §27. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`. **HEAD must be Task 5's commit** ("app:
  Settings tab LAN sync section over sync_status/sync_now/pair_peer;
  supersede Drive-sync §27/§28"). Verify with `git log -1` and `git
  status`; if not there, STOP and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §27 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7c-settings/BRIEF.md` in
  full — this is the lane's last task, and its "R53 rulings" and "Parity
  gaps" sections are what `TASKS.md`'s tick must reflect; R53 Q2's exact
  text ("(a) now, with the provisional status visible in the section
  itself... (b) eventually [is] the lead's to bless later"); the plan's
  Task 6 and Parity gaps table
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md`, lines
  347–417); `app/src/ipc/engine.ts`'s `fetchEngineVersion` (real, already
  called once by `App.tsx` on mount — this task's About section reuses the
  value the app shell already fetched rather than calling it a second
  time; check how `App.tsx` stores it — likely `AppState.engineVersion` —
  and read it from there via `useAppState()` rather than re-fetching, to
  avoid a second IPC round trip for the same value); idl0's
  `settings_tab.dart` `_ControlsSection` for the shortcut table's current
  content (this is what gets carried verbatim per R53 Q2(a)).

## The task (plan Task 6, Steps 1–3, plus the lane wrap-up Steps 4+ below)

**Files:**
- Create: `Settings/controls.ts`, `Settings/controls.test.ts`,
  `Settings/ControlsSection.tsx`, `Settings/HowTosSection.tsx`,
  `Settings/howtos/*.tsx`, `Settings/AboutSection.tsx`, `Settings/about.ts`,
  `Settings/about.test.ts`
- Modify: `Settings/index.tsx`, `docs/IDL0_SPEC.md` §27, `CHANGELOG.md`,
  `TASKS.md`

**Interfaces:**
- `controls.ts`: `CONTROL_GROUPS: readonly { title: string; rows: readonly
  [string, string][] }[]` — the mouse-wheel/mouse/keyboard reference,
  carried from idl0 verbatim. **The bindings are L6's, not this lane's** —
  the doc comment must say the table needs to track L6's actual bindings
  once L6 merges, and `ControlsSection.tsx` must render a visible
  "provisional — bindings land with the Notebook lane" label in the UI
  itself (R53 Q2 — not only a code comment).
- `about.ts`: `aboutRows(engineVersion: string | null): { label: string;
  value: string }[]` — app version, engine version (read from
  `AppState.engineVersion`, per the note above), schema, build. Engine
  version `null` (still resolving) reads "…", never "unknown" — "unknown"
  implies the call failed, "…" means it hasn't returned yet.

- [ ] **Step 1: Write the failing tests**

  `controls.test.ts`:
  - `CONTROL_GROUPS — every group — has a title and at least one row`
  - `CONTROL_GROUPS — every row — has a non-empty action and a non-empty keystroke`
  - `CONTROL_GROUPS — the whole table — no keystroke is bound to two different actions within one group`

  `about.test.ts`:
  - `aboutRows — an engine version string — the row shows it verbatim`
  - `aboutRows — engine version null — the row reads "…" while the call is in flight, never "unknown"`
  - `aboutRows — always — includes app version, engine version, schema and build`

- [ ] **Step 2: Implement**

  Four how-to articles carried from idl0, rewritten for idl1 where the flow
  changed: First Setup, WiFi Download, GPS Lap Gate, Math Channels. TSX
  components in `Settings/howtos/`, bundled with the app — **no CDN, ever**
  (CLAUDE.md §3) — so idl0's "Full reference" and "Report issue" buttons
  (both `example.com` placeholders in idl0) are **not** carried across.
  About shows Licenses as bundled text only if it is already available
  somewhere in the repo/build output; omit the control otherwise rather
  than linking out.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §27**

  Write the idl1 section inventory: profile, units, data directory, sync,
  controls, how-tos, about. State Firmware/OTA is deferred (operating brief
  §3) and Drive sync is gone (already superseded in Task 5's §27/§28 edit —
  do not re-litigate that here, just list "sync" in the inventory).

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  Expected: 6 new tests passed, 0 failed.

- [ ] **Step 5: Lane merge gate — whole TS suite, then coverage**

  ```
  cd app && npx tsc --noEmit && npx vitest run
  ```
  A failure outside `Settings/**` may be a merge-order artifact from a
  concurrent lane (L7a/L7b/L6 landing on `main`) — STOP and report rather
  than fixing another lane's file.

  Then, once:
  ```
  cd app && npx vitest run --coverage src/routes/pages/Settings
  ```
  Report per-file percentages for every pure module in `Settings/` (`.tsx`
  excluded by config, CLAUDE.md §4). Every pure module should clear 80%;
  name any gap and whether it's real or cosmetic.

- [ ] **Step 6: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Settings/controls.ts app/src/routes/pages/Settings/controls.test.ts app/src/routes/pages/Settings/ControlsSection.tsx app/src/routes/pages/Settings/HowTosSection.tsx app/src/routes/pages/Settings/AboutSection.tsx app/src/routes/pages/Settings/about.ts app/src/routes/pages/Settings/about.test.ts app/src/routes/pages/Settings/index.tsx docs/IDL0_SPEC.md CHANGELOG.md TASKS.md
  ```
  (Add each file under `Settings/howtos/` you create to this list too.)
  Every count must print `0`.

- [ ] **Step 7: CHANGELOG + TASKS**

  `TASKS.md`'s L7c line is ticked here, and **only** if it names what is
  outstanding: `get_settings`/`set_settings` and `get_data_dir`/
  `set_data_dir` (IPC needs 6, 7) as the write commands still missing, the
  `localStorage`-to-`settings.json` migration nobody has scheduled yet
  (R53 Q1's stated risk), and the Parity gaps table's dispositions — not a
  bare checkmark.

- [ ] **Step 8: Commit**

  ```bash
  git add app/src/routes/pages/Settings/controls.ts app/src/routes/pages/Settings/controls.test.ts app/src/routes/pages/Settings/ControlsSection.tsx app/src/routes/pages/Settings/HowTosSection.tsx app/src/routes/pages/Settings/howtos app/src/routes/pages/Settings/AboutSection.tsx app/src/routes/pages/Settings/about.ts app/src/routes/pages/Settings/about.test.ts app/src/routes/pages/Settings/index.tsx docs/IDL0_SPEC.md CHANGELOG.md TASKS.md
  git commit -m "app: Settings tab Controls/How-Tos/About sections; L7c lane complete pending write commands"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not carry idl0's `example.com` "Full reference"/"Report issue" links.
- Do not add a markdown renderer dependency for the how-tos — TSX only.
- Do not render the controls table without the visible provisional label.
- Do not tick `TASKS.md` without naming what's outstanding.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §27 gains the Controls/How-Tos/About
inventory and content per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test commands and result lines
(targeted and whole-suite, with `passed` counts); the coverage report's
per-module numbers for `Settings/`; the `TASKS.md` line's exact final text;
confirmation the controls table shows the provisional label in the UI, not
only a comment; confirmation no `example.com` link was carried across;
confirmation the NUL-byte check printed `0` for every file; anything
ambiguous you resolved (say how) or that needs a lead ruling — including
whether the whole-suite gate showed anything outside `Settings/**` failing.
