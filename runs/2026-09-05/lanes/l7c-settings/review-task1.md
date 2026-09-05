# L7c Task 1 review — Settings tab directory + section shell

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
branch `wave2-l7c-settings`, commit under review `4c2c1d345fc3fe14d99532767688792fba9c3130`
(parent `b6426c1`). In scope: `app/src/routes/pages/Settings/{index.tsx,sections.ts,
sections.test.ts,errors.ts,errors.test.ts,ipcStubs.ts,settings.css}`,
`app/src/routes/pages/SettingsPage.tsx` (shim), `CHANGELOG.md`. Nothing else touched.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```

Output: `tsc --noEmit` printed nothing. Vitest: `Test Files 2 passed (2)`,
`Tests 7 passed (7)`. This reproduces the implementer's reported 7 passed / 0
failed exactly.

## Findings

No Critical, Important, or Minor findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical/Important/Minor findings | — |

## Checks performed (all pass)

- **Ownership boundary** (`git show --name-only 4c2c1d3`): every path is
  under `app/src/routes/pages/Settings/**`, the `SettingsPage.tsx` shim, or
  `CHANGELOG.md`. No touch to `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`, or `app/src/ipc/*`.
- **`SettingsPage.tsx` shim** is exactly the brief's text: a doc comment
  plus `export { default } from "./Settings";`, nothing else.
- **`settings.css` beyond the brief's file list**: it lives under this
  lane's own directory (`Settings/`), so it's inside the ownership boundary
  (operating brief §2 grants the whole `<Tab>/**` subtree, not just the
  named files). All selectors are scoped under the `.idl1-settings` /
  `.idl1-settings__*` prefix (BEM-style); no bare element selectors, no
  `:root`, no global class names that could bleed into other tabs. Not a
  finding.
- **`SECTIONS`** has exactly the seven ids in the brief's order —
  `profile`, `units`, `data`, `sync`, `controls`, `howTos`, `about` — no
  `firmware`, no `drive`/`driveSync` entry (R53 Settings; operating brief
  §3 deferral). Verified against `sections.ts` directly, not just the test
  assertions.
- **`ipcStubs.ts`** has exactly the four named stubs (`getSettings`,
  `setSettings`, `getDataDir`, `setDataDir`), each an `async` function that
  unconditionally `throw`s `new NotImplementedError("<command>")` with the
  real command name (`get_settings`, `set_settings`, `get_data_dir`,
  `set_data_dir`) matching IPC-NEEDS.md needs 6–7. `NotImplementedError`
  carries a `command: string` field, extends `Error`, never fabricates an
  `IpcError` shape (no `kind`/`message` fields). No stub wraps
  `sync_status`/`sync_now`/`pair_peer` — those aren't referenced at all in
  this commit, correctly left for Task 5.
- **`AppSettings` field parity**: `data_dir: string | null`,
  `rider_name: string` (`""` = not set, documented), `unit_system:
  "imperial" | "metric"` — matches C4 §1 / IPC-NEEDS.md need 6's shape
  exactly as the brief requires (no translation layer). `DataDirInfo`
  matches need 7's shape (`resolved_path`, `override_path`,
  `restart_required`) with units/semantics documented in each field's doc
  comment.
- **Tests**: A/A/A with blank lines between arrange/act/assert in both
  `sections.test.ts` and `errors.test.ts`; every test name is literally
  `thing — condition — result` with an em dash, matching the brief's exact
  wording (including `sectionById — a known id — returns that section; an
  unknown id — returns undefined, never throws` as one combined test name
  per the brief). No rendering tests — `index.tsx` itself is untested,
  consistent with "Task 1 builds the shell only" and CLAUDE.md §4's "UI
  rendering is not unit-tested."
- **Doc comments**: every exported symbol in `sections.ts`, `errors.ts`,
  and `ipcStubs.ts` has a doc comment; units/semantics stated for
  nullable/sentinel fields (`""` = not set, `null` = platform default,
  etc.).
- **Errors routed on `kind`, not `.message`**: `describeIpcError` switches
  on `error.kind` only; the `default` arm returns generic text without
  throwing, matching the "never throws" test.
- **No `Err(String)`-equivalent** and no crash on bad input: `sectionById`
  and `describeIpcError` both handle unknown input by returning a safe
  default rather than throwing.
- **No cargo** in the diff or in any command run during this review.
- **No new npm dependency**: `package.json`/lockfile untouched.
- **Repo hygiene**: single-line commit message (`app: Settings tab
  directory + section shell`), no AI attribution trailer, `git show
  --stat` confirms only the named files were added/modified.
- **CHANGELOG.md** entry accurately names the directory move, the seven
  sections (correctly noting Google Drive dropped, Firmware/OTA deferred),
  and the two IPC needs stubbed (6 and 7) with the four real command names
  they name — matches the diff.
- **Spec discipline**: brief and CHANGELOG both state "no spec change
  needed"; no `docs/IDL0_SPEC.md` edit present, consistent (Task 1 is not
  one of the spec-during tasks 2/4/5/6).

## Verdict rationale

The commit does exactly what the Task 1 brief specifies and nothing more:
a clean directory move with a one-line re-export shim, a seven-section
list with no dropped/deferred entries reintroduced, four correctly-shaped
`NotImplementedError` stubs matching the IPC-needs list with no fabricated
`IpcError` kind and no premature real-command call, and a scoped stylesheet
that stays inside the lane's own subtree without leaking selectors. Tests
are correctly named, A/A/A, and cover only pure logic (no rendering
tests). The gate reproduces the implementer's reported 7 passed / 0 failed
with a silent `tsc`. No ownership, contract, or CLAUDE.md violation found.

VERDICT: CLEAN
