# L7c Task 8 — implementer brief (Settings persists to settings.json, not localStorage)

You are the implementer for L7c Task 8, a wave-2 follow-on ruled in **R77
item 4** (`runs/2026-09-03/decisions.md`, at the end of that file). Read R77
first, then **R53 Settings Q1** in the same file — it is the ruling this task
discharges, and it already names the shape: `localStorage` behind
`PrefsBackend` now, `get_settings`/`set_settings` when the Rust lane lands,
"the swap task does a one-time import of the `localStorage` keys into
`settings.json` and then deletes them, so no preference is silently lost."
Also read **R59 Q5** as it is recorded in `app/src/ipc/app.ts`'s doc comments
(`set_settings` ignores `data_dir`; `set_data_dir` is that key's only writer).

The job: `PrefsBackend` gains a `settings.json` implementation over
`get_settings`/`set_settings`; the engine half of the prefs document moves
there; the UI half stays local; a one-time migration lifts whatever is already
in `localStorage` and then clears it. ONE commit, then report.

**Spec discipline: spec-during.** `docs/IDL0_SPEC.md` §27.1's paragraph
**"Where it lives in wave 2 — `localStorage`, not `settings.json`"** describes
exactly the state this commit ends. It is updated here. Do not touch C2 or C3.

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -3
```

Required: branch `main`, tree clean apart from untracked `runs/`. Any modified
tracked file ⇒ **STOP and report** — one checkout, other follow-on tasks may
be running.

Then confirm by reading `app/src/ipc/app.ts` (name these exactly; write no
wrapper of your own):
- `getSettings(): Promise<AppSettings>` — "Never fails — a missing or
  malformed `settings.json` yields defaults (C4 §1)."
- `setSettings(settings: AppSettings): Promise<AppSettings>` — returns the
  state actually on disk after the write, and **ignores `settings.data_dir`**.
- `AppSettings { data_dir: string | null; rider_name: string; unit_system:
  "imperial" | "metric" }`.
- `getDataDir()` / `setDataDir(path)` and `DataDirInfo { resolved_path,
  override_path, restart_required }`.

**If any is missing — STOP and report.** They landed in the post-L8w shell
task (`d83a14d`); this task adds no IPC wrapper.

---

## Where

- Repo `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  single primary checkout.
- Work only under `app/src/routes/pages/Settings/**`, plus
  `docs/IDL0_SPEC.md` §27.1 and `CHANGELOG.md` (repo root).
- **Never run any cargo command.** TypeScript only. No new npm dependency.
- Do not push. Do not amend a reported commit.
- **Ownership STOPs**: `app/src/App.tsx`, `app/src/state/**`,
  `app/src/routes/types.ts`, `app/vite.config.ts`, `app/package.json`,
  `app/src-tauri/**`, `rust/**`, either contract spec, and any other lane's
  page directory — **STOP and report**, do not edit.

---

## What is true today — read all of these first

1. **`Settings/prefs.ts`** in full. `Prefs = { engine: EnginePrefs; ui:
   UiPrefs }`; `EnginePrefs` is `{ data_dir, rider_name, unit_system }`;
   `UiPrefs` is `{ last_section, section_list_width_px }`. `parsePrefs` is
   lenient and **preserves unknown keys** at the top level and inside both
   halves so a newer app's settings survive a round trip; `serializePrefs` is
   `JSON.stringify`. Keep both properties — they are stated in SPEC §27.1 and
   tested in `prefs.test.ts`.
2. **`Settings/prefsStore.ts`** in full. `PrefsBackend` is
   `{ read(): Promise<string | null>; write(text: string): Promise<void> }` —
   **raw text, one document**. `localStorageBackend()` uses the key
   `"idl1.settings.prefs.v1"` and wraps every read in try/catch (a WebView can
   refuse storage). `memoryBackend(seed?)` is the test double.
   `createPrefsStore(backend)` issues exactly one `backend.read()` at
   construction, caches in memory, and `set(patch)` shallow-merges per
   top-level key, updates the cache **first**, then writes, and reports a
   failed write as `{ ok: false, error }` without discarding the user's typing.
   Its own doc comment predicts this task: "the eventual swap is a one-line
   factory change (a new `tauriSettingsBackend()` alongside
   `localStorageBackend()`)".
3. **`Settings/index.tsx`** line 19: `const prefsStore =
   createPrefsStore(localStorageBackend());` — one module-level store shared by
   `ProfileSection`, `UnitsSection`, `DataSection`, `SyncSection`.
4. **`Settings/DataSection.tsx`** — already calls the real `getDataDir` /
   `setDataDir` from `app/src/ipc/app.ts`, and also takes the `store` prop.
   Read it to see which of the two it currently treats as authoritative for
   the data directory.
5. **`docs/IDL0_SPEC.md` §27.1** — the prefs table, the "engine is field-for-
   field `idl_rs::store::settings::AppSettings`" sentence, and the
   `localStorage` paragraph you are rewriting.
6. **`rust/tauri/src/commands/app.rs`** (read-only, never edit) — the
   `AppSettingsDto` / `AppSettingsArg` doc comments confirming `data_dir` is
   on the wire for symmetry and ignored by `set_settings_via`, and
   `rust/core/src/store/settings.rs`'s `AppSettings` struct.
7. **The idl0 reference, read-only:**
   `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\settings\settings_tab.dart`.

### Which prefs move, field by field

Matched against `AppSettings` in `rust/tauri/src/commands/app.rs` /
`rust/core/src/store/settings.rs`:

| Prefs field | Where it lives after this task | Why |
|---|---|---|
| `engine.rider_name` | `settings.json`, via `get_settings`/`set_settings` | Field-for-field `AppSettings.rider_name`. |
| `engine.unit_system` | `settings.json`, via `get_settings`/`set_settings` | Field-for-field `AppSettings.unit_system`. |
| `engine.data_dir` | `settings.json`, **read** via `get_settings`, **written only** by `setDataDir` | `set_settings` ignores this field on its argument (R59 Q5, and `app.ts`'s own doc comment). Writing it through `setSettings` would be a silent no-op, which is worse than not offering it. `DataSection` already owns the write path. |
| `ui.last_section` | `localStorage`, unchanged | UI-only, never reaches the engine (SPEC §27.1). |
| `ui.section_list_width_px` | `localStorage`, unchanged | Same. |
| unknown keys `parsePrefs` preserved | see Interface 1 | Must survive a round trip — SPEC §27.1 and an existing test. |

Nothing else moves. idl0's Drive-sync and firmware fields have no idl1
counterpart at all (SPEC §27.1) and are not to be reintroduced.

---

## Interfaces

### 1. `Settings/settingsBackend.ts` (new) — a composite `PrefsBackend`

`PrefsBackend` is a **whole-document, raw-text** seam, but the document now
lives in two places. Rather than change the interface (every caller and
`createPrefsStore`'s whole tested lifecycle depend on it, and its doc comment
was written for exactly this swap), implement a backend that splits and
recombines:

```ts
/** The IPC this backend needs, injected so the module never imports
 *  `app/src/ipc/app.ts` directly and every test runs without a Tauri host. */
export interface SettingsBackendDeps {
  getSettings: () => Promise<AppSettings>;
  setSettings: (s: AppSettings) => Promise<AppSettings>;
  /** The `ui` half's own store — `localStorageBackend()` in production. */
  local: PrefsBackend;
}

/** A `PrefsBackend` whose `engine` half round-trips through
 *  `get_settings`/`set_settings` (C3 §3.10) and whose `ui` half stays in the
 *  WebView's own storage. `read()` merges the two into the one document
 *  shape `parsePrefs` already understands; `write()` splits it back. */
export function settingsBackend(deps: SettingsBackendDeps): PrefsBackend;
```

`read()`:
- Calls `getSettings()` (never fails, per its contract) and `local.read()`.
- Builds `{ ...unknownKeysFromLocal, engine: <from getSettings, merged over
  any unknown engine keys the local document preserved>, ui: <from local> }`
  and returns `JSON.stringify` of it.
- A `getSettings()` rejection (it should not, but a typed rejection is still
  possible) falls back to whatever the local document holds for `engine`,
  then to `DEFAULT_PREFS.engine` — the same "never reject, degrade to
  defaults" contract `createPrefsStore`'s `readInitial` already relies on.

`write(text)`:
- Parses with `parsePrefs` (never `JSON.parse` alone — leniency is the point).
- Calls `setSettings({ data_dir: <current value, echoed>, rider_name,
  unit_system })`. `data_dir` is ignored server-side; pass what `read()` last
  saw rather than inventing `null`, so a future contract change cannot turn
  this call into a clearing write.
- Writes the **whole** document (both halves plus preserved unknown keys) to
  `local` as well, so the unknown-key preservation SPEC §27.1 promises still
  has somewhere to live and a `get_settings` outage degrades to the last known
  values instead of to defaults.
- A `setSettings` rejection propagates — `createPrefsStore.set()` is the one
  place that catches it and reports `{ ok: false }`, and that behaviour is
  already tested. Do not swallow it here.

**Do not** make this module import `app/src/ipc/app.ts`. `index.tsx` composes
`settingsBackend({ getSettings, setSettings, local: localStorageBackend() })`.

### 2. `Settings/prefsMigration.ts` (new) — the one-time import

R53 Settings Q1: "a one-time import of the `localStorage` keys into
`settings.json` and then deletes them, so no preference is silently lost."
Read that literally and carefully: only the **engine** keys are imported and
cleared. `ui.last_section`/`ui.section_list_width_px` stay in `localStorage` —
deleting them would lose a preference, which is the exact thing the ruling is
guarding against.

```ts
/** Marks the migration done, so it runs at most once per machine. */
export const MIGRATION_FLAG_KEY = "idl1.settings.prefs.migrated.v1";

export type MigrationOutcome =
  | { kind: "already-done" }
  | { kind: "nothing-to-migrate" }
  | { kind: "migrated"; imported: Partial<EnginePrefs> }
  | { kind: "failed"; error: unknown };

/** Lifts the engine half of an existing `localStorage` prefs document into
 *  `settings.json`, once. Pure decision logic with injected IO. */
export function migrationPlan(
  localDocument: string | null, engineOnDisk: AppSettings, alreadyMigrated: boolean,
): { action: "skip" | "import"; settings?: AppSettings; reason: string };

export async function runPrefsMigration(deps, ...): Promise<MigrationOutcome>;
```

Rules the tests must pin:
- Runs at most once — the flag is checked first and set only after
  `setSettings` **resolves**.
- **`settings.json` wins on conflict.** If `rider_name` on disk is already
  non-empty, or `unit_system` on disk differs from the engine default, the
  engine half on disk was set deliberately and is not overwritten by an older
  `localStorage` copy. Import only the fields still at their defaults on disk.
  This is the one judgement the ruling does not make for you; it is called out
  as Open Question 1 — the recommendation is what is written here.
- Never touches `data_dir` (it is `setDataDir`'s key).
- A malformed or absent `localStorage` document is `nothing-to-migrate`, not a
  failure.
- A `setSettings` rejection is `failed`, the flag is **not** set, and the next
  launch retries.
- After a successful import, the **engine** half is removed from the
  `localStorage` document; the `ui` half and any preserved unknown keys stay.

### 3. `Settings/index.tsx`

The one-line factory change its doc comment predicted, plus firing the
migration once. The migration is IPC started from an effect, so it obeys the
wave-2 operating brief §4 rule: the decision (`migrationPlan`) is pure and
tested, the effect's dependency array is `[]`, it cancels nothing in its
cleanup, and a result arriving after unmount is dropped by a generation guard
inside the driver — not by the cleanup.

Surface a failed migration where the user can see it (a `role="status"` line
in the section, not a console log). Do not block the tab on it.

---

## Steps

- [ ] **Step 1.** Read everything in "What is true today", including the two
      Rust files (read-only) and idl0's `settings_tab.dart`.
- [ ] **Step 2.** `Settings/settingsBackend.ts` + `settingsBackend.test.ts`,
      TDD, with injected fakes and `memoryBackend()` for the local half.
      Arrange/Act/Assert with blank lines; names
      `thing — condition — result`. Cases at minimum: `read()` merges engine
      from `getSettings` over `ui` from local; `read()` preserves unknown keys
      from the local document; `read()` with no local document yields defaults
      for `ui`; `getSettings` rejecting degrades to the local/default engine
      half; `write()` sends exactly `rider_name`/`unit_system` (plus the
      echoed `data_dir`) to `setSettings`; `write()` also persists the whole
      document locally; a `setSettings` rejection propagates out of `write()`;
      a full `createPrefsStore(settingsBackend(...))` round trip
      (`set({engine})` → `get()`) returns the value `setSettings` **returned**,
      not the one it was sent.
- [ ] **Step 3.** `Settings/prefsMigration.ts` + `prefsMigration.test.ts`
      (cases in Interface 2, including the conflict rule and the retry after a
      failure).
- [ ] **Step 4.** `Settings/index.tsx` — the factory swap and the migration
      effect. No unit test (rendering).
- [ ] **Step 5.** Check `DataSection.tsx`, `ProfileSection.tsx`,
      `UnitsSection.tsx`, `SyncSection.tsx`: none should need a change, since
      they all go through `PrefsStore`. If one does, say exactly why in the
      report — that would mean a section was reading `localStorage` directly,
      which is a finding worth recording.
- [ ] **Step 6. SPEC (spec-during).** In `docs/IDL0_SPEC.md` §27.1, replace the
      paragraph **"Where it lives in wave 2 — `localStorage`, not
      `settings.json`"** with what is now true: the engine half round-trips
      through `get_settings`/`set_settings`, `data_dir` is written only by
      `set_data_dir` (R59 Q5), the `ui` half stays in `localStorage`, and the
      one-time import ran. Update the table's Notes column for `engine.data_dir`
      accordingly. Change nothing else in §27, and no other section.
- [ ] **Step 7. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: nothing printed, `exit=1`.
- [ ] **Step 8. Gate.**
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Settings
      npx vitest run
      ```
      The lane filter must report a **non-zero** `passed` and 0 failed (a
      filter matching nothing is a failed gate). Then the whole TS suite,
      once, before reporting. Report both real numbers — do not quote a
      baseline from the ledger.
- [ ] **Step 9. CHANGELOG** — one bullet at the top of `### Added`:
      ```
      - **Settings persist to `settings.json`, not `localStorage` (L7c Task 8, R77.4, R53 Settings Q1).** New `Settings/settingsBackend.ts` implements the existing `PrefsBackend` seam over `get_settings`/`set_settings`: the engine half (`rider_name`, `unit_system`) round-trips through the command and the UI half (`last_section`, `section_list_width_px`) stays in the WebView's own storage, recombined into the one document shape `parsePrefs` already understands, so no section and no `createPrefsStore` behaviour changed. `engine.data_dir` is read from `get_settings` but written only by `set_data_dir` — `set_settings` ignores that field (R59 Q5) and a write through it would have been a silent no-op. New `Settings/prefsMigration.ts` runs a one-time import of an existing `localStorage` engine half into `settings.json` and then clears just that half, keeping the UI keys and any unknown keys a newer app version wrote; `settings.json` wins on conflict, a failed import is shown to the user and retried next launch rather than marked done.
      ```
- [ ] **Step 10. Commit.** Explicit paths (never `git add -A`; an untracked
      `runs/` tree is present and is not yours):
      ```bash
      git add app/src/routes/pages/Settings CHANGELOG.md docs/IDL0_SPEC.md
      ```
      Single-line message, no AI attribution trailer:
      ```
      app/Settings: persist prefs to settings.json behind PrefsBackend (R77.4)
      ```

---

## Do not

- Do not change `PrefsBackend`'s two-method signature, and do not change
  `createPrefsStore`'s behaviour. Its existing tests must pass unmodified; if
  one needs a change, that is a finding to report, not a fix to make quietly.
- Do not write `data_dir` through `setSettings`.
- Do not delete the `ui` keys from `localStorage`.
- Do not drop unknown keys anywhere in the round trip.
- Do not import `app/src/ipc/app.ts` from `settingsBackend.ts` or
  `prefsMigration.ts` — inject.
- Do not make the migration run more than once, and do not mark it done on a
  failed write.
- Do not add a Firmware/OTA or Drive-sync preference. Both are out (SPEC
  §27.1, operating brief §3).
- Do not list a function in an effect's dependency array; do not cancel
  in-flight work from a cleanup.
- Do not run cargo, edit a contract, push, or amend.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value (`px` on
`section_list_width_px`); `// TODO(idl0):` never bare. Typed errors only.

---

## Open questions for the lead (proceed on the recommendation unless told otherwise; none blocks Steps 2–3)

1. **Who wins when `localStorage` and `settings.json` both hold a value?**
   R53 Settings Q1 says the swap imports the `localStorage` keys "so no
   preference is silently lost", but does not say what happens when
   `settings.json` already holds a different, deliberately-set value — which
   is reachable today, because `rider_name` and `unit_system` can be written
   by any other `set_settings` caller and `settings.json` may predate this app
   build. Options: (a) `localStorage` wins (a literal reading of "import");
   (b) `settings.json` wins, and only fields still at their engine default on
   disk are imported; (c) prompt the user. **Recommendation: (b)** — the
   engine file is the durable, cross-app store and overwriting a deliberate
   value with a stale browser copy is exactly the silent loss the ruling is
   trying to prevent; (c) is a dialog nobody can answer sensibly. **Cost if
   wrong:** one branch in `migrationPlan` and its tests.

2. **Should the `ui` half stay in `localStorage` at all?** SPEC §27.1 says it
   "never leaves the machine", which `localStorage` satisfies, but that storage
   can be cleared by the WebView without warning (private mode, cleared site
   data, a policy — `prefsStore.ts` already guards for it). Options: (a) keep
   it in `localStorage`; (b) add a `ui` blob to `settings.json` — a C3/C4
   change, so a lead action, not this task's. **Recommendation: (a)** —
   losing "which section was open" is a non-event, and (b) puts UI state in the
   engine's file for no benefit. **Cost if wrong:** nothing lost that matters.

3. **Where does a failed migration or a failed settings write get shown?**
   Nothing in SPEC §27 names a surface, and `createPrefsStore.set()` already
   returns `{ ok: false, error }` that no section currently renders — a
   pre-existing gap this task makes more visible (a rejected `set_settings` is
   a real, reachable failure in a way a `localStorage` write mostly was not).
   Options: (a) a `role="status"` line in the affected section; (b) one shared
   banner at the top of the Settings tab; (c) leave it, as today.
   **Recommendation: (a)** for the migration and (a) for `set()` failures in
   the two sections that write engine fields — the user needs to know their
   rider name did not reach disk. **Cost if wrong:** two strings and a
   conditional.

---

## Report back (concise)

Commit hash and `git show --stat`. The exact gate commands and their real
result lines (lane filter and whole suite, both non-zero `passed`, 0 failed).
The GATE findings on `ipc/app.ts` — each named export confirmed or not.
Confirmation that `prefsStore.test.ts` and `prefs.test.ts` pass **unmodified**
(and, if either changed, exactly why). The exact test case names added to
`settingsBackend.test.ts` and `prefsMigration.test.ts`. Whether any of the four
`*Section.tsx` files needed a change and why. Which resolution you used for
each of Q1–Q3. Confirmation in one line each that: `data_dir` is never sent
through `setSettings` as a value this app chose; the `ui` keys are never
deleted from `localStorage`; unknown keys survive a full read/write round trip
(name the test that proves it). Per-step done/deviated. Anything ambiguous you
resolved and how, or that needs a ruling — stop and report rather than guessing
(CLAUDE.md §1).

## Questions template (use verbatim if you must stop)

```
QUESTION <n>
Context: <the file/line and what you were doing>
The gap: <what no source states — cite the sources you checked by path/section>
Options: (a) … (b) … (c) …
My recommendation: <one option, one sentence why>
Cost if wrong: <what has to be undone>
Blocking: yes/no — <what you can finish without the answer>
```
