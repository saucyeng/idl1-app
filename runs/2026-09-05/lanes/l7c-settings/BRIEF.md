# L7c — Settings tab — lane brief

**Plan:** `docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md` (6 tasks).
**Adjudicated:** `runs/2026-09-03/decisions.md` R53, "Settings (L7c)" section (4 questions).
**Operating brief:** `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` — §2 ownership, §3 contract
freeze, §4 gates bind this lane exactly as written there.

## Scope

Port idl0's Settings tab onto idl1's actual shape: rider profile, unit
system, the `<data>` directory override, LAN-sync pairing and status, the
chart controls reference, the how-to articles, and About. idl0's seven
sections become idl1's seven, but not the same seven — Google Drive is gone
(idl1 syncs peer-to-peer over the LAN) and firmware/OTA is deferred. One
lane, one directory: `app/src/routes/pages/Settings/`.

## Branch and worktree

Created by **Task 1's implementer**, before Task 1's first step:

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git worktree add -b wave2-l7c-settings "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7c-settings" main
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7c-settings"
git submodule update --init -- rust
cd app && npm ci
```

`npm ci` runs once, here, before Task 1 — never inside a task. Working
directory for every task in this lane: the worktree above.

## Ownership (operating brief §2, binding)

This lane touches only:
- `app/src/routes/pages/Settings/**` (new directory; `SettingsPage.tsx`
  becomes a one-line re-export shim, per Task 1).
- Additive type fixes only, where the file disagrees with C3 as written, in
  `app/src/ipc/sync.ts` / `app/src/ipc/engine.ts`. **Never a new command.**
- Its own `*.test.ts` files beside its modules.

**Never:** `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`,
`routes/types.ts`, `state/AppState.tsx`, `package.json`/lockfile,
`vite.config.ts`. This lane touches no shared-state slice — the prefs model
(Task 2) lives entirely behind a lane-local `PrefsBackend` over
`localStorage`, not `AppState.tsx`.

## What Settings can actually persist in wave 2 (settled, not this lane's call to revisit)

Nothing durable through the engine. `rust/core/src/store/settings.rs`
already exists and loads/saves `app_config_dir()/settings.json` with
`data_dir`, `rider_name`, `unit_system` (C4 §1), but **no C3 command exposes
it**, and C3 is frozen for UI lanes. Wave 2 persists UI preferences
per-machine in the WebView's own `localStorage`, keyed and versioned by this
lane (Task 2), and files `get_settings`/`set_settings` as IPC need 6. The tab
states this itself — a settings screen that silently forgets is worse than
one that says where it keeps things.

## IPC needs this lane calls or stubs

Per `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` needs 6 and 7 (both filed as
"L7c"): `get_settings`/`set_settings` (need 6, Task 2 — persists to
`localStorage` behind `PrefsBackend` meanwhile), `get_data_dir`/`set_data_dir`
(need 7a/7b, Task 4). Both stubbed in `Settings/ipcStubs.ts` (created by
Task 1), throwing a local `NotImplementedError extends Error { command:
string }`. **Never** an `IpcError`.

`sync_status`, `sync_now`, `pair_peer` (C3 §3.9) are **real, landed
commands** — Task 5 builds against the typed wrappers in
`app/src/ipc/sync.ts` directly. L11 (the Rust sync implementation) has not
landed, so all three reject in practice; the section renders that through
`describeIpcError` and says LAN sync is not running yet. **Do not stub
these three** — they are contract commands, not IPC needs.
`engine_version` (C3 §3.1, `app/src/ipc/engine.ts`) is likewise real and
already called once by the app shell (`App.tsx`); Task 6's About section
reuses it.

## Gates (operating brief §4, never skipped)

Per task, from the worktree:
```
cd app && npx tsc --noEmit && npx vitest run <the filter the task names>
```
`vitest` must report a non-zero `passed` count. `tsc` must print nothing.

Lane merge gate (after Task 6): `npx tsc --noEmit && npx vitest run` over the
whole TS suite, then the lead merges to `main` and eyeballs the tab.

## R53 rulings that apply to this lane

- **Q1 → (a) with (c).** `localStorage` behind the `PrefsBackend` interface,
  now (Task 2, as the plan writes it). `get_settings`/`set_settings` land in
  the Rust write-amendment lane later; the swap task at that point does a
  one-time import of the `localStorage` keys into `settings.json` and then
  deletes them, so no preference already saved in wave 2 is silently lost.
  This lane's job now is only the `PrefsBackend` interface and the
  `localStorage` implementation — not the future migration.
- **Q2 → (a) now, with the provisional status visible in the section
  itself.** Task 6's chart-controls table carries idl0's content verbatim
  and is marked, in the section's own UI copy (not only a code comment), as
  provisional pending L6's actual bindings. (b) — L6 exporting its binding
  table for Settings to import — happens later via a lead shell task after
  L6 merges; this lane does not attempt that cross-lane import itself.
- **Q3 → (a).** Sync status and pairing live in Settings, matching where
  idl0 put Drive. L11 may add its own sync affordance to the Data tab later;
  that is not this lane's concern.
- **Q4 → BOM strip rides with the Rust write lane; "takes effect on
  restart" is stated in the UI.** The tracked `settings.json` UTF-8-BOM bug
  in `rust/tauri/src/paths.rs` (2026-09-05 ledger entry) is fixed by the
  Rust track, not this lane — Task 4's data-directory section states the
  restart requirement in its confirmation copy and does not attempt to work
  around the BOM bug itself.

## Parity gaps carried from the plan

The plan's own "Parity gaps" table
(`docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md`, the
section after Task 6) is unchanged by this brief set — most notably Google
Drive is **dropped permanently** (replaced by the Sync section, not
deferred) and Firmware/OTA is **deferred to wave 3** (operating brief §3).

## Done when

All 6 tasks landed on `wave2-l7c-settings`, each gated and reviewed; the
lane merge gate passes; `TASKS.md`'s L7c line is ticked by Task 6 and names
what's outstanding (the IPC needs, the parity gaps). The lead then merges to
`main`, eyeballs the tab, and runs the shell task that retires the three
`<Tab>Page.tsx` shims.
