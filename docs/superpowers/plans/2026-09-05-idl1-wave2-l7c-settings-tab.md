# idl1 Wave 2 — L7c: Settings tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port idl0's Settings tab onto idl1's actual shape: rider profile,
unit system, the `<data>` directory override, LAN-sync pairing and status, the
chart controls reference, the how-to articles, and About. idl0's seven sections
become idl1's seven, but not the same seven — Google Drive is gone (idl1 syncs
peer-to-peer over the LAN) and firmware/OTA is deferred.

**Architecture:** One lane, one directory: `app/src/routes/pages/Settings/`.
The tab is a section list plus a detail pane, both driven by one lane-local
`sections.ts`. Everything the tab persists goes through **one typed prefs
module** with a pluggable backend: the model, its defaults, its lenient parse
and its serialiser are pure and tested; the backend is an interface with two
implementations, a `localStorage` one for the running app and an in-memory one
for tests. When the real settings command lands, the swap is one factory line
— nothing in the model, the sections or the tests changes.

**What Settings can actually persist in wave 2, settled:** nothing durable
through the engine. `rust/core/src/store/settings.rs` **already exists** — it
loads and saves `app_config_dir()/settings.json` with `data_dir`, `rider_name`
and `unit_system`, exactly as C4 §1 (post-sign, ruling R15) fixes them — but
**no C3 command exposes it**, and C3 is frozen for UI lanes (operating brief
§3). So wave 2 persists UI preferences per-machine in the WebView's own
`localStorage`, keyed and versioned by this lane, and files `get_settings` /
`set_settings` as IPC need 6. This is stated in the tab itself, not hidden: a
settings screen that silently forgets is worse than one that says where it
keeps things.

**Tech Stack:** React 19 + TypeScript + Vite + vitest at the M0 ecosystem
report's pins. **No new npm dependency.** No markdown renderer: the how-to
articles are authored as TSX in the lane's own directory rather than as
markdown assets (idl0 used `flutter_markdown` over `assets/howtos/*.md`), which
avoids adding a renderer to the bundle for four short documents.

**Spec:**
- `CLAUDE.md` (§1 ambiguity, §2 layers, §3 principles — "offline-first means bundled: no CDN, ever" governs the how-tos and the "full reference" link — §4 testing, §5 typed errors, §7 hygiene, §8 compute).
- `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2, §3, §4 — binding.
- `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §3, §7 (LAN sync, pairing), §10 (L7 row), §12.
- `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §1, §2, §3.1 (`engine_version`), §3.9 (Sync — `sync_status`, `sync_now`, `pair_peer`), §4.
- **`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §1** — the `<data>` root, the `settings.json` bootstrap file, its three keys, and the rule that changing `data_dir` does not move existing files.
- `rust/core/src/store/settings.rs` — the landed `AppSettings { data_dir, rider_name, unit_system }` shape this lane's prefs model must match field for field, so the eventual command needs no translation layer.
- `docs/IDL0_SPEC.md` §27 (Tab — Settings) — the app-side section this lane rewrites.
- Read-only reference: `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\settings\`, `...\lib\data\app_settings.dart`.
- Offline docs: `docs/vendor/react-19/`.

**Spec discipline (CLAUDE.md §6), declared per task:**
- Tasks 1, 3 — **no spec change needed.**
- Task 2 — **spec-during** on **`docs/IDL0_SPEC.md` §27**: the persisted settings set changes (idl0's seven `AppSettings` fields become C4 §1's three plus UI-only prefs), and where they live changes (shared_preferences → `settings.json`, with a `localStorage` interim this task documents).
- Task 4 — **spec-during** on **§27**: the data-directory override is a new section with no idl0 counterpart; C4 §1's semantics (does not move existing files, old tree left in place) are user-visible and belong in §27.
- Task 5 — **spec-during** on **§27**: LAN sync pairing and status replace idl0's §28 Google Drive section entirely; §27's Drive-sync section is deleted here and §28 gets a superseded banner pointing at design §7.
- Task 6 — **spec-during** on **§27**: the Controls / How-Tos / About sections' idl1 content, and the removal of the Firmware section from §27's inventory (deferred, operating brief §3).
- Every task appends a `CHANGELOG.md` bullet; `TASKS.md`'s L7c line is ticked only by Task 6.

## Global Constraints

- **Worktree and branch**, before Task 1:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l7c-settings "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7c-settings" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7c-settings"
  git submodule update --init -- rust
  ```
  `npm ci` once at setup, never inside a task.
- **No cargo, ever.** No `npm run tauri`. The §8 hook denies it under `idl1-app-worktrees/wave2-*`.
- **No new npm dependency**, no `npm install` inside a task.
- **Files this lane owns:** `app/src/routes/pages/Settings/**`, its own `*.test.ts`, and additive type fixes only in `app/src/ipc/sync.ts` / `app/src/ipc/engine.ts` where they disagree with C3 as written. **Never** `rust/`, `app/src-tauri/`, or a lead-owned shared file.
- **The app shell does not change.** Task 1 leaves `app/src/routes/pages/SettingsPage.tsx` as a one-line re-export.
- **The prefs model mirrors `store::settings::AppSettings` field for field** — `data_dir: string | null`, `rider_name: string`, `unit_system: "imperial" | "metric"` — plus UI-only keys under a separate `ui` object, so the day `get_settings` lands the engine half maps one-to-one and only the `ui` object stays local.
- **Every `localStorage` access is wrapped.** A WebView can refuse storage (private mode, cleared site data, a policy). A read that throws yields defaults; a write that throws surfaces as "couldn't save this preference", never as a crash and never as a silent success.
- **Gate, every task** (operating brief §4):
  ```
  cd app && npx tsc --noEmit && npx vitest run <the filter this task names>
  ```
  Non-zero `passed` required; `tsc` silent.
- **Testing** (CLAUDE.md §4): Arrange / Act / Assert with blank lines; names `thing — condition — result`; `*.test.ts` beside the module; > 80 % on the pure modules. **No rendering tests.**
- Doc comment on every exported symbol; units on every numeric value; `// TODO(idl0):` never bare.
- **No AI attribution trailers.** **Never `git push`.**

---

### Task 1: `SettingsPage.tsx` → `Settings/`, and the section shell

**Spec discipline:** no spec change needed.

**Files:**
- Create: `app/src/routes/pages/Settings/index.tsx`, `Settings/sections.ts`, `Settings/sections.test.ts`, `Settings/errors.ts`, `Settings/errors.test.ts`, `Settings/ipcStubs.ts`
- Modify: `app/src/routes/pages/SettingsPage.tsx` (→ `export { default } from "./Settings";`)

**Interfaces:**
- `sections.ts`: `SECTIONS: readonly SettingsSection[]` where `SettingsSection = { id, label, description }`, in display order — `profile`, `units`, `data`, `sync`, `controls`, `howTos`, `about` — plus `sectionById(id)` and `defaultSectionId`.
- `errors.ts`: `describeIpcError` for the kinds this tab sees (`sync`, `invalid_argument`, `not_found`, `io`, `internal`) with a default arm.
- `ipcStubs.ts`: `NotImplementedError extends Error { command: string }` and the lane's stubs. **A stub is never an `IpcError` kind** — C3 §2's vocabulary is additive-only, and a placeholder does not belong in a signed contract.

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

- [ ] **Step 2: Implement and move the page**

`index.tsx` renders the section list and a detail pane, each section a
placeholder for now. Layout is idl0's: a two-pane list-plus-detail at wide
widths and one stacked scroll view at narrow ones, decided by a CSS media
query rather than by measuring in JavaScript.

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Expected: 7 new tests passed, 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

---

### Task 2: The prefs model and its store

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §27 — the persisted set and where it lives).

**Files:**
- Create: `Settings/prefs.ts`, `Settings/prefs.test.ts`, `Settings/prefsStore.ts`, `Settings/prefsStore.test.ts`
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
`prefsStore.ts`: `interface PrefsBackend { read(): string | null; write(text: string): void }`, `localStorageBackend()` (every call wrapped in try/catch), `memoryBackend(seed?)` for tests, and `createPrefsStore(backend)` exposing `get()`, `set(patch)` and `subscribe(fn)`. A failed write is reported through the store's result, not swallowed.

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

- [ ] **Step 2: Implement**

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §27's persisted-settings section**

Name the three engine keys and their C4 §1 semantics, the UI-only keys, and —
plainly — that wave 2 keeps all of them in the WebView's `localStorage` on the
machine, that they do not sync and do not reach `settings.json` yet, and which
command closes that gap.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Expected: 15 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 3: Profile and Units sections

**Spec discipline:** no spec change needed (Task 2 already rewrote §27's persisted set).

**Files:**
- Create: `Settings/units.ts`, `Settings/units.test.ts`, `Settings/ProfileSection.tsx`, `Settings/UnitsSection.tsx`
- Modify: `Settings/index.tsx`

**Interfaces:**
- `units.ts`: `unitSummary(system): { speed, distance, pressure, temperature, force, power, springRate }` — idl0's table, with the two entries its UI omitted but its `app_settings.dart` doc comment names (force, power, spring rate) included since they are the units math channels default to. Plus `UNIT_SYSTEMS` for the toggle.

- [ ] **Step 1: Write the failing tests**

- `unitSummary — imperial — speed mph, distance ft/mi, pressure psi, temperature °F`
- `unitSummary — metric — speed km/h, distance m/km, pressure kPa, temperature °C`
- `unitSummary — either system — every field is non-empty (no half-filled table)`
- `unitSummary — the two systems — differ in every field, so the toggle always visibly does something`

- [ ] **Step 2: Implement**

The rider-name field writes to prefs **debounced at 500 ms**, idl0's own
behaviour, so typing does not thrash storage. The units section is a two-way
toggle plus the read-only summary. Both sections carry idl0's copy: the rider
name is "pre-filled into new sessions", and changing the unit system "does not
retroactively convert existing channel values".

- [ ] **Step 3: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Expected: 4 new tests passed, 0 failed.

- [ ] **Step 4: CHANGELOG + commit**

---

### Task 4: The data-directory section

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §27 — a new section with no idl0 counterpart).

**Files:**
- Create: `Settings/dataDir.ts`, `Settings/dataDir.test.ts`, `Settings/DataSection.tsx`
- Modify: `Settings/index.tsx`, `Settings/ipcStubs.ts`, `docs/IDL0_SPEC.md` §27

**Interfaces:**
- `dataDir.ts`: `validateDataDir(path: string): ValidationIssue[]` — non-empty, absolute-looking (a drive letter or a leading separator), no trailing whitespace — and `describeOverrideChange(oldPath, newPath): string`, the exact sentence C4 §1 requires the user to see: the app opens or creates a tree at the new path, existing files are **not moved**, and the old tree is left at its path.
- Stubs: `getDataDir()` and `setDataDir(path)` — IPC needs 7a/7b.

- [ ] **Step 1: Write the failing tests**

- `validateDataDir — an empty string — one issue: a path is required`
- `validateDataDir — a relative path — one issue naming the requirement that it be absolute`
- `validateDataDir — a Windows path with a drive letter — no issues`
- `validateDataDir — a POSIX path starting with "/" — no issues`
- `validateDataDir — a path with trailing whitespace — one issue: it would create a differently-named directory`
- `describeOverrideChange — an old and a new path — the sentence names both and says the old data stays put (C4 §1)`
- `describeOverrideChange — no previous override — the sentence names the platform default as what is being left behind`

- [ ] **Step 2: Implement**

The section shows the resolved `<data>` path (through the `getDataDir` stub,
so it reads "unavailable" until the command lands), the override field, and —
before any change is committed — `describeOverrideChange`'s sentence in a
confirmation step. Changing where a user's whole data store lives is not a
field that saves on blur.

- [ ] **Step 3: Add the data-directory section to `docs/IDL0_SPEC.md` §27**

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 5: LAN sync — status, pairing, manual sync

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §27 replaces the Drive-sync section; §28 gets a superseded banner).

**Files:**
- Create: `Settings/pairCode.ts`, `Settings/pairCode.test.ts`, `Settings/syncState.ts`, `Settings/syncState.test.ts`, `Settings/SyncSection.tsx`
- Modify: `Settings/index.tsx`, `docs/IDL0_SPEC.md` §27 and §28

**Interfaces:**
- `pairCode.ts`: `normalizePairCode(raw): string` (strip spaces and separators) and `validatePairCode(code): ValidationIssue[]` — design §7's six-digit code, which C3 §3.9 backs with `invalid_argument` for "wrong length/non-digit". Validating locally means a typo never becomes a round trip.
- `syncState.ts`: a pure reducer over `{ status: SyncStatus | null, peers: PeerRow[], running: { peerId, done, total, phase } | null, lastError: string | null }` with actions for a `sync_status` poll result, a `sync_now` `Progress` (C3 §3.9's mixed blobs+cells unit, disambiguated by `phase`), a `SyncResult`, a `pair_peer` success, and failures. Plus `describeSyncResult(result)` — "12 blobs, 3 workbooks merged, 1 conflict cell" — where a non-zero conflict count reads as something to go and resolve, not as a failure.

- [ ] **Step 1: Write the failing tests**

`pairCode.test.ts`:
- `normalizePairCode — "12 34 56" — "123456"`
- `normalizePairCode — "12-34-56" — "123456"`
- `validatePairCode — six digits — no issues`
- `validatePairCode — five digits — one issue naming the required length`
- `validatePairCode — six characters with a letter — one issue naming digits only`
- `validatePairCode — an empty string — one issue, and not the same one as a wrong-length code`

`syncState.test.ts`:
- `syncStateReducer — a sync_status result — peers listed, online flags kept`
- `syncStateReducer — a status poll while a sync is running — the running progress is not clobbered`
- `syncStateReducer — PROGRESS with phase "blobs" — the phase is shown, since done/total mix units (C3 §3.9)`
- `syncStateReducer — PROGRESS with total null — a count without a percentage`
- `syncStateReducer — a SyncResult with conflicts 0 — the summary says merged cleanly`
- `syncStateReducer — a SyncResult with conflicts 2 — the summary names the conflict cells as something to resolve, not as an error`
- `syncStateReducer — a failure with kind sync — lastError set, peers retained`
- `syncStateReducer — pair success — the new peer appears once, even if the poll also returns it`

- [ ] **Step 2: Implement**

The section polls `syncStatus()` on a timer (C3 §4 lists it as a periodic
poll, never per-frame), lists paired peers with their online flags, offers
`pairPeer(code)` behind local validation, and runs `syncNow(peerId, onProgress)`
manually. **L11 has not landed**, so all three commands reject; the section
renders that through `describeIpcError` and says LAN sync is not running yet.
These are real C3 §3.9 commands, not stubs — do not add stubs for them.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §27 and §28**

Delete §27's Drive-sync section and put LAN sync in its place. Add a one-line
superseded banner at the top of §28 (Google Drive Sync) pointing at design §7
— the idl1 line does not use Drive, and a spec section describing it as
current is the kind of stale claim that cost time in L5 (R50).

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Expected: 14 new tests passed, 0 failed.

- [ ] **Step 5: CHANGELOG + commit**

---

### Task 6: Controls, How-Tos, About, and the lane's wrap-up

**Spec discipline:** **spec-during** (`docs/IDL0_SPEC.md` §27 — these three sections' idl1 content, and the removal of Firmware from §27's inventory).

**Files:**
- Create: `Settings/controls.ts`, `Settings/controls.test.ts`, `Settings/ControlsSection.tsx`, `Settings/HowTosSection.tsx`, `Settings/howtos/*.tsx`, `Settings/AboutSection.tsx`, `Settings/about.ts`, `Settings/about.test.ts`
- Modify: `Settings/index.tsx`, `docs/IDL0_SPEC.md` §27, `CHANGELOG.md`, `TASKS.md`

**Interfaces:**
- `controls.ts`: `CONTROL_GROUPS: readonly { title: string; rows: readonly [string, string][] }[]` — the mouse-wheel, mouse and keyboard reference. **The bindings are L6's**, not this lane's: the notebook owns the chart interaction, so this table is marked in its doc comment as needing to track L6's actual bindings, and Open question 2 asks how that stays honest.
- `about.ts`: `aboutRows(engineVersion: string | null): { label: string; value: string }[]` — app version, engine version (C3 §3.1 `engine_version`, the same call the shell already makes), schema, build.

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
changed: First Setup, WiFi Download, GPS Lap Gate, Math Channels. They are TSX
components in `Settings/howtos/`, bundled with the app — **no CDN, ever**
(CLAUDE.md §3), which also means idl0's "Full reference" and "Report issue"
buttons, both pointing at `example.com` placeholders, are **not** carried
across: a button that opens a placeholder URL is worse than no button.
About shows Licenses as bundled text if it is already available, and omits the
control otherwise rather than linking out.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §27**

Write the idl1 section inventory: profile, units, data directory, sync,
controls, how-tos, about. State that Firmware/OTA is deferred (operating brief
§3) and that Drive sync is gone.

- [ ] **Step 4: Gate**

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Expected: 6 new tests passed, 0 failed. Then the lane merge gate:
`npx tsc --noEmit && npx vitest run` over the whole TS suite.

- [ ] **Step 5: CHANGELOG + TASKS**

The `TASKS.md` line is ticked only if it names what is outstanding (R50): the
IPC needs, and the parity gaps below.

- [ ] **Step 6: Commit**

---

## Parity gaps

| idl0 feature | Source | Disposition | Reason |
|---|---|---|---|
| Durable settings persistence | `settings_provider.dart` (shared_preferences) | **Local-only for wave 2** | `store::settings` exists in core and C4 §1 fixes the file, but no C3 command exposes it and C3 is frozen for UI lanes. IPC need 6. Prefs live in the WebView's `localStorage`, per machine, and the tab says so. |
| Google Drive sign-in, account display, sign-out | `settings_tab.dart` `_DriveSyncSection`, `drive_sync_provider.dart` | **Dropped, permanently** | idl1 replaces Drive with LAN sync (design §7, D7). Replaced by the Sync section, not deferred. |
| Auto-sync after download / sync on WiFi only / auto-sync on connect | `app_settings.dart` | **Dropped with Drive** | All three are Drive-upload policies. LAN sync's trigger model is different (design §7: automatic when a paired peer appears, plus a manual button); its own settings are L11's to propose. |
| Firmware channel, auto-check firmware, OTA update card and commit flow | `firmware_update_section.dart` (787 lines), `firmware_update_provider.dart` | **Deferred to wave 3** | Operating brief §3 defers it explicitly: `push_ota` exists on the transport trait, no C3 command. The two `AppSettings` fields that configure it (`firmwareChannel`, `autoCheckFirmware`) are not carried into the prefs model, because a preference for a feature that does not exist is a field nobody can act on. |
| Chart controls reference | `settings_tab.dart` `_ControlsSection` | Carried, marked provisional | The bindings belong to L6's notebook, which is being built concurrently. The table is idl0's until L6 says otherwise. See Open question 2. |
| How-to articles as markdown assets | `assets/howtos/*.md` + `flutter_markdown` | Carried as TSX | Four short documents do not justify a markdown renderer in the bundle. Content is carried and updated where the flow changed. |
| "Full reference" and "Report issue" links | `settings_tab.dart` | **Dropped** | Both point at `example.com` placeholders in idl0 (its own `TODO(idl0)` comments say so). Carrying a placeholder button across a rewrite ships a dead control. |
| Licenses page | `showLicensePage` | **Partial** | Flutter generated it from the package graph. idl1 has no equivalent generator wired up; the control appears only if bundled licence text is already available, and is omitted otherwise. A licence page assembled from an npm/cargo graph is a build-tooling task, not a Settings task. |
| App version / schema / build values | `_AboutSection` | Carried, with real values where they exist | Engine version is real (C3 §3.1). App version and build are the app's own metadata; idl0 hardcoded `0.1.0` and `dev` and said so in a comment. |

## Open questions (need a lead ruling before dispatch)

1. **Is `localStorage` the right wave-2 backing store for prefs?** The alternative within this lane's ownership is "no persistence at all until the command lands" — settings reset every launch. Options: **(a)** `localStorage` behind the backend interface, as this plan writes it; **(b)** no persistence, and the tab says settings are session-only; **(c)** the lead adds `get_settings` / `set_settings` to the C3 amendment batch early enough that L7c can use the real command in Task 2 rather than a backend swap later. **Recommendation: (a)**, with (c) as the follow-up — the backend interface makes the swap one line, and (b) makes the tab useless to test against by hand. Worth naming the one real risk in (a): a preference set in wave 2 lands in `localStorage`, and the migration to `settings.json` is a small piece of work nobody has scheduled.
2. **Who owns the chart controls reference?** The bindings are L6's, the reference lives in Settings, and the two lanes run concurrently. Options: **(a)** L7c carries idl0's table verbatim and L6 corrects it when its bindings settle; **(b)** L6 exports the binding table from its own directory and Settings imports it — which crosses the lane-ownership line (operating brief §2) and needs the lead's blessing; **(c)** drop the section for wave 2. **Recommendation: (b) eventually, (a) now** — a settings screen listing shortcuts that do not work is exactly the kind of confidently-wrong documentation R50 was about, so the table's provisional status must be visible in the section itself, not only in a code comment.
3. **Does the LAN-sync section belong in Settings at all?** design §7 describes pairing (a 6-digit code or QR) and "a manual button and a status line" without saying which screen hosts them, and C3 §3.9's commands are unassigned to a tab. Options: **(a)** Settings, as this plan assumes, matching where idl0 put Drive; **(b)** the Data tab, next to the sessions the sync moves; **(c)** its own surface, built by L11. **Recommendation: (a) for the status and pairing, with L11 free to add a sync affordance to the Data tab too** — pairing is configuration; a sync trigger is an action on data.
4. **Does the app read `settings.json` for `data_dir` today, and will the Settings override actually take effect?** C4 §1 says the override is read at startup by `paths::resolve_data_dir`, which reads only `data_dir` and **never writes the file**. So even once `set_data_dir` lands, a change needs an app restart to take effect, and the L5 landing notes a real trap: a `settings.json` written with a UTF-8 BOM parses as absent and silently falls back to the platform default (2026-09-05 ledger entry; the BOM strip is tracked but not done). Options: **(a)** the section states "takes effect on restart" and the BOM fix rides with the Rust command; **(b)** the Rust write lane fixes the BOM strip first, since a settings screen that appears to do nothing is worse than no settings screen. **Recommendation: (b) for the BOM strip — it is one line and a test, already tracked — and (a) for the restart requirement**, which is inherent to caching `<data>` for the process lifetime.
</content>
