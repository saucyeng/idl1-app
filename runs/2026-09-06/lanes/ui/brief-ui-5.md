# UI-5 — Device tab restyle (touch-first)

Device is the daily driver and the launch tab (decision 8), and it is used
trackside with gloves on (decision 15). Port idl0's layout onto UI-2/UI-3's
primitives, at 44 px minimum hit targets. Behaviour does not change: no new
IPC, no new effect, no change to the poll or the config model. ONE commit.

Worktree: `…/idl1-app-worktrees/ui-5`. **Depends on UI-4 on `main`.**
Runs concurrently with UI-6 and UI-7 — they touch disjoint directories.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-5"
git merge-base --is-ancestor <UI-4 merge hash on main> HEAD && echo GATE-OK
grep -c "composeVisibility" app/src/routes/pages/Device/index.tsx
```
Must print `GATE-OK` and `>= 1` — UI-4's visibility composition must already be
in the file. Otherwise merge `main` (R19 pattern); conflicts outside
`CHANGELOG.md` are STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 8, 15, 35 and the "Device"
paragraph of "Per-tab layout direction"; `FLUTTER-UI-SURVEY.md` §6 (Device) and
§7; `runs/2026-09-06/RULINGS-DIGEST.md` (the Device line: 1 Hz poll,
`visibilitychange` pause, link-lost after 3 failures, explicit profile save with
a dirty marker — R77.4/R78); `app/src/components/brand/**` and
`app/src/components/ui/**`; every file under `app/src/routes/pages/Device/`
(start with `index.tsx`, `HeroCard.tsx`, `DeviceControls.tsx`,
`ChannelsTable.tsx`, `ProfileBar.tsx`, `DeviceFiles.tsx`, `PushConfigBar.tsx`,
`forms/*`).

## Where

- **Files:** `app/src/routes/pages/Device/**` only — the `.tsx` components, plus
  one new pure module and its test. `CHANGELOG.md`.
- **Do not touch** any other directory, `package.json`, or the shell.
- The `ConfigCard` the direction names is this tree's `ChannelsTable` +
  `ProfileBar` + `PushConfigBar`; there is no `ConfigCard.tsx`. Either compose
  one or keep the existing three — say which in the report.

## What to build

- **`HeroCard`** — the three-state machine, full width, ≥ 56 px tall:
  no device ⇒ Connect CTA in `--info`; connected idle ⇒ Start recording in
  `--good`; recording ⇒ Stop in `--hivis` with a live timer and the `PulsingDot`
  RX/TX light. Emphasis comes from `emphasisClasses` (UI-2), never a local colour.
- **Status strip** — `StatusIcon`/`StatusDot` for SD / GPS / IMU / HR, colour
  owned by the call site.
- **Mode line**, **Push / Pull `Button` pair**, **Files row** with a `Badge`
  count.
- **Channels table** — dense parent row per source, expandable, per-source
  editing in a `Dialog` (the `forms/*` components move inside it unchanged).
- **Profile bar** — profile `Select`, dirty marker, explicit save.
- **Calibration** — a collapsed `Collapsible`.
- **Touch:** every interactive element ≥ 44 px (`--hit-target`); single column
  at every width; on wide the tab docks at 480 px and the remaining width stays
  empty in this pass.
- **Toasts (decision 21):** wire exactly two call sites — config pushed
  (`toastFor({kind:"configPushed"})`) and transfer complete
  (`{kind:"transferComplete"}`) — from the existing success paths. Errors keep
  reporting in place as `--accent` mono text / `NoteBlock`, never as a toast.

## Pure module

```ts
// app/src/routes/pages/Device/hero.ts
/** The hero card's three states as one decision (FLUTTER-UI-SURVEY §6,
 *  UI-DIRECTION Device): which label, which emphasis, and whether the live
 *  timer and pulsing dot are shown. Pure so the state machine is tested
 *  without rendering (CLAUDE.md §4). */
export type HeroState = "disconnected" | "idle" | "recording";
export interface HeroView { label: string; emphasis: Emphasis; showTimer: boolean; pulsing: boolean; }
export function heroView(state: HeroState): HeroView;
/** Derives `HeroState` from the connection + status the page already holds —
 *  no new source of truth, no new IPC. */
export function heroStateFrom(connected: boolean, recording: boolean): HeroState;
```

Tests: `heroView — disconnected — Connect in info emphasis, no timer`;
`— idle — Start recording in good`; `— recording — Stop in hivis with timer and
pulse`; `heroStateFrom — connected and recording — recording`.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Device
```
Non-zero `passed`, and every pre-existing Device test passes unchanged. If a
restyle forces a change to a tested pure module, that is a signal you are
changing behaviour — STOP and report instead.

## Steps

- [ ] 1. Entry gate. 2. `hero.ts` + tests. 3. `HeroCard` onto the primitives.
      4. Status strip, mode line, Push/Pull, Files row. 5. Channels table +
      per-source dialog. 6. Profile bar, calibration collapsible. 7. 44 px
      sweep. 8. The two toast call sites. 9. Gate. 10. `tokenSheet.test.ts`
      still green (no hex in `Device/**`). 11. NUL check. 12. CHANGELOG.
      13. Commit `app: Device tab on the brand primitives, touch-first (UI-5)`.

## Do not

- Do not change the status poll, its interval, the link-lost rule, or UI-4's
  visibility composition in `index.tsx`.
- Do not add an IPC command, a stub, or a new effect that starts IPC.
- Do not act on decision 35's Device refinements — they are deferred, and this
  task's report is where the list starts (see Report back).
- Do not touch `app/src/shell/`, other pages, or `package.json`.

## Spec discipline

**No spec change needed** — behaviour is unchanged; this is presentation over
landed L7b work.

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
confirmation the pre-existing count is unchanged; whether a `ConfigCard`
wrapper was created or the three existing bars kept; the two toast call sites
by file and line; anything that could not reach 44 px and why; **the Device
refinement list** — every idl0 behaviour or affordance you noticed missing,
for `TASKS.md` per decision 35; parity gaps; anything needing a ruling.

## Open questions

1. **Wide layout with 480 px of Device and empty space.** *Recommendation:*
   leave it empty in this pass; UI-4 reserved the column model and decision 8
   says the layout budget goes to the Notebook.
2. **Does the recording timer belong in a pure module?** *Recommendation:* the
   formatter yes (reuse `Data/format.ts` if it already has one — check before
   writing a second), the interval no; a `setInterval` that only advances local
   display state is not an IPC effect and the effects rule does not reach it.
3. **`forms/*` inside a Dialog vs. a Sheet on narrow.** *Recommendation:*
   `Sheet` via `sheetSideFor` (UI-3) so a phone gets a bottom sheet and a
   desktop a right panel — one component, both behaviours.
