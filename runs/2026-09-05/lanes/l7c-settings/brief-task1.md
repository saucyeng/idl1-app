# L7c Task 1 — implementer brief (`SettingsPage.tsx` → `Settings/`, section shell)

You are the implementer for L7c Task 1 of the idl1 rewrite — the first task
of the Settings-tab lane. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`. **You create it** — it does not exist yet:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l7c-settings "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7c-settings" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7c-settings"
  git submodule update --init -- rust
  cd app && npm ci
  ```
  HEAD on `main`, status clean. Verify first; if not, stop and report.
- Work ONLY there. Do NOT touch the shared checkout beyond READING files
  named below, and do NOT touch any other worktree. Do NOT edit `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`. Do NOT push.
- **No cargo, ever** — a hook denies any cargo invocation whose cwd is under
  `idl1-app-worktrees/wave2-*`. You never need it.
- Read first: `CLAUDE.md`; `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2,
  §3, §4; `runs/2026-09-05/lanes/l7c-settings/BRIEF.md` (this lane's brief —
  R53 rulings, ownership, IPC needs, what Settings can actually persist);
  the plan's Global Constraints and Task 1
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md`, lines
  56–124) — your starting point, unchanged for this task; C3 §2 (the
  `IpcError` shape); the current `app/src/routes/pages/SettingsPage.tsx`
  (today a one-line placeholder, not yet a re-export) — read it before
  writing anything.

## The task (plan Task 1, Steps 1–4, unchanged)

**Files:**
- Create: `app/src/routes/pages/Settings/index.tsx`, `Settings/sections.ts`,
  `Settings/sections.test.ts`, `Settings/errors.ts`, `Settings/errors.test.ts`,
  `Settings/ipcStubs.ts`
- Modify: `app/src/routes/pages/SettingsPage.tsx` (becomes
  `export { default } from "./Settings";`)

**Interfaces:**
- `sections.ts`: `SECTIONS: readonly SettingsSection[]` where
  `SettingsSection = { id, label, description }`, in display order —
  `profile`, `units`, `data`, `sync`, `controls`, `howTos`, `about` — plus
  `sectionById(id)` and `defaultSectionId`.
- `errors.ts`: `describeIpcError` for the kinds this tab sees (`sync`,
  `invalid_argument`, `not_found`, `io`, `internal`) with a default arm.
- `ipcStubs.ts`: `export class NotImplementedError extends Error { command:
  string; constructor(command: string) { ...; this.command = command; } }`
  plus the lane's stub functions this task can already name from
  `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` needs 6–7: `getSettings`,
  `setSettings`, `getDataDir`, `setDataDir` — all rejecting with
  `NotImplementedError` naming the real command (`get_settings`,
  `set_settings`, `get_data_dir`, `set_data_dir`). This task creates the
  file and these four stubs; Tasks 2 and 4 wire callers to them, not
  redefine them. **A stub is never an `IpcError` kind.**

- [ ] **Step 1: Write the failing tests**

`sections.test.ts`:
- `SECTIONS — the list — holds exactly the seven idl1 sections, with no firmware or drive-sync entry`
- `SECTIONS — every entry — has a unique id`
- `sectionById — a known id — returns that section; an unknown id — returns undefined, never throws`
- `defaultSectionId — is profile, matching the section list's first entry`

`errors.test.ts`:
- `describeIpcError — kind sync — text says LAN sync, not "error 3"`
- `describeIpcError — kind invalid_argument from pair_peer — text points at the pairing code`
- `describeIpcError — an unknown kind — generic text, never throws`

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result` (an em dash).

- [ ] **Step 2: Implement and move the page.**

  `index.tsx` renders the section list and a detail pane, each section a
  placeholder for now. Layout is idl0's: a two-pane list-plus-detail at wide
  widths and one stacked scroll view at narrow ones, decided by a CSS media
  query rather than by measuring in JavaScript.

  `app/src/routes/pages/SettingsPage.tsx` becomes exactly:
  ```tsx
  /** Kept so the app shell's import path is unchanged while L7c owns
   *  `routes/pages/Settings/`. Retiring this shim is a lead shell task. */
  export { default } from "./Settings";
  ```
  Do not touch `App.tsx`.

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  Expected: 7 new tests passed, 0 failed; `tsc` silent.

- [ ] **Step 4: CHANGELOG + commit**

  CHANGELOG bullet naming the Settings tab directory move and the seven
  idl1 sections.

  Spec discipline: **no spec change needed.** Say this out loud in your report.

  ```bash
  git add app/src/routes/pages/Settings/index.tsx app/src/routes/pages/Settings/sections.ts app/src/routes/pages/Settings/sections.test.ts app/src/routes/pages/Settings/errors.ts app/src/routes/pages/Settings/errors.test.ts app/src/routes/pages/Settings/ipcStubs.ts app/src/routes/pages/SettingsPage.tsx CHANGELOG.md
  git commit -m "app: Settings tab directory + section shell"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not touch `App.tsx` — the shim keeps its import path valid.
- Do not include a firmware or drive-sync section in `SECTIONS` — both are
  gone from idl1's inventory (deferred / dropped, see the plan's Parity
  gaps).
- Do not build the prefs model, units, data-dir, sync, controls, or about
  content — Tasks 2–6.
- Do not give a stub an `IpcError`-shaped rejection — always
  `NotImplementedError`.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count); confirmation `tsc --noEmit` printed nothing; confirmation
`SettingsPage.tsx` is exactly the one-line re-export; confirmation
`SECTIONS` has exactly the seven ids listed (no firmware, no drive-sync);
confirmation `ipcStubs.ts` has the four named stubs, each a
`NotImplementedError`; per-step done/deviated; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
