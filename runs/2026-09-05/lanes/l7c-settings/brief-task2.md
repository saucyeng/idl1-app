# L7c Task 2 — implementer brief (the prefs model and its store)

You are the implementer for L7c Task 2 — the typed prefs model (`EnginePrefs`
+ `UiPrefs`) and its pluggable-backend store. This is the file every later
task in this lane reads/writes through. This task rewrites part of
`docs/IDL0_SPEC.md` §27 in the same commit (spec-during). TDD, ONE commit,
then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`, HEAD must be Task 1's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY there. Same "Never touch" list as Task 1's brief. Do NOT push.
  Editing `docs/IDL0_SPEC.md` §27 in this worktree is this task's own
  spec-during obligation.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7c-settings/BRIEF.md`
  (R53 Q1 — `localStorage` now, `get_settings`/`set_settings` later with a
  one-time migration; "What Settings can actually persist" section); the
  plan's Task 2 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md`,
  lines 127–204) — your starting point, unchanged; `rust/core/src/store/settings.rs`
  — the landed `AppSettings { data_dir, rider_name, unit_system }` shape
  this task's `EnginePrefs` must match field for field, so the eventual
  `get_settings`/`set_settings` command needs no translation layer;
  `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §1 — the
  `<data>` root, the `settings.json` bootstrap file, its three keys, and the
  "" / null conventions cited in the interface below.

## The task (plan Task 2, Steps 1–3, unchanged)

**Files:**
- Create: `Settings/prefs.ts`, `Settings/prefs.test.ts`,
  `Settings/prefsStore.ts`, `Settings/prefsStore.test.ts`
- Modify: `docs/IDL0_SPEC.md` §27, `CHANGELOG.md`

**Interfaces:**
```ts
/** The engine half — field for field `idl_rs::store::settings::AppSettings`
 *  and C4 §1's `settings.json` keys, so the eventual `get_settings` /
 *  `set_settings` command needs no translation layer. */
export interface EnginePrefs {
  /** C4 §1's `<data>` override. `null` = the platform default. */
  data_dir: string | null;
  /** "" = not set (C4 §1; there is no null representation). */
  rider_name: string;
  unit_system: "imperial" | "metric";
}

/** The UI-only half — never leaves this machine, never reaches the engine. */
export interface UiPrefs {
  /** Which Settings section the tab reopens on. */
  last_section: string;
  /** Wide-layout section-list width, px. */
  section_list_width_px: number;
}

export interface Prefs { engine: EnginePrefs; ui: UiPrefs }

export const DEFAULT_PREFS: Prefs;
/** Lenient: an unreadable or partial document yields defaults for the keys it
 *  cannot supply, and keeps unknown keys so a newer app's settings survive an
 *  older one. Never throws. */
export function parsePrefs(raw: unknown): Prefs;
export function serializePrefs(prefs: Prefs): string;
```
`prefsStore.ts`: `interface PrefsBackend { read(): string | null; write(text:
string): void }`, `localStorageBackend()` (every call wrapped in try/catch),
`memoryBackend(seed?)` for tests, and `createPrefsStore(backend)` exposing
`get()`, `set(patch)` and `subscribe(fn)`. A failed write is reported through
the store's result, not swallowed.

- [ ] **Step 1: Write the failing tests**

`prefs.test.ts`:
- `parsePrefs — a full document — every field typed, values preserved`
- `parsePrefs — an empty object — DEFAULT_PREFS exactly`
- `parsePrefs — unit_system "metric" — kept; "furlongs" — falls back to imperial (C4 §1's default), never throws`
- `parsePrefs — rider_name absent — "" (C4 §1: "" means not set, there is no null)`
- `parsePrefs — data_dir absent — null (C4 §1: absent means the platform default)`
- `parsePrefs — a key from a newer version — preserved through serializePrefs, not dropped`
- `parsePrefs — null, a string, an array — DEFAULT_PREFS each time, never throws`
- `parsePrefs then serializePrefs — a full document — round-trips to the same parsed value`
- `serializePrefs — engine and ui halves — nested so the engine half can be lifted out unchanged for a future set_settings call`

`prefsStore.test.ts`:
- `createPrefsStore — a memory backend with no seed — get returns defaults`
- `createPrefsStore — set then get — the patch applied, untouched fields preserved`
- `createPrefsStore — set — subscribers are notified once with the new value`
- `createPrefsStore — a backend whose read throws — get returns defaults, no throw escapes`
- `createPrefsStore — a backend whose write throws — set reports the failure, and get still shows the in-memory value so the user's typing is not discarded`
- `createPrefsStore — a backend holding corrupt JSON — get returns defaults rather than propagating a parse error`

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result`.

- [ ] **Step 2: Implement.**

  `localStorageBackend()` wraps every `localStorage.getItem`/`.setItem` call
  in try/catch — a WebView can refuse storage (private mode, cleared site
  data, a policy). A read that throws yields defaults; a write that throws
  surfaces as a reported failure, never as a crash and never as a silent
  success.

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §27's persisted-settings
  section.**

  Name the three engine keys and their C4 §1 semantics, the UI-only keys,
  and — plainly — that wave 2 keeps all of them in the WebView's
  `localStorage` on the machine, that they do not sync and do not reach
  `settings.json` yet, and which command (`get_settings`/`set_settings`,
  IPC need 6) closes that gap.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  Expected: 15 new tests passed on top of Task 1's 7 (22 total for this
  directory), 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Settings/prefs.ts app/src/routes/pages/Settings/prefs.test.ts app/src/routes/pages/Settings/prefsStore.ts app/src/routes/pages/Settings/prefsStore.test.ts docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Settings tab prefs model and localStorage-backed store"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not let a `localStorage` exception escape `get()`/`set()`/a backend
  call — every access wrapped, always.
- Do not drop unknown keys on a round trip.
- Do not add a `null` representation for `rider_name` or `data_dir`'s
  "not set" case beyond what's specified above (`""` and `null`
  respectively) — C4 §1 has no other convention.
- Do not build the actual Profile/Units/Data/Sync sections — Tasks 3–5.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol and interface field; units on every
numeric value (`_px`); A/A/A tests named `thing — condition — result`. No AI
attribution trailer. Never `git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §27's persisted-settings section
rewritten per Step 3 above.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count, expect 22 total for the directory); per-step done/deviated;
confirmation every `localStorage` access is wrapped in try/catch;
confirmation a write failure is reported, not swallowed, and does not
discard the in-memory value; anything ambiguous you resolved (say how) or
that needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
