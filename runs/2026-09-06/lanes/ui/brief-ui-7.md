# UI-7 — Settings restyle + theme and output-register controls

Seven sections on `SectionHead` + `SpecRow`, `settings.css` deleted, and the
two new user-facing preferences the direction introduces: theme (dark /
follow-OS) and the notebook output register. ONE commit.

Worktree: `…/idl1-app-worktrees/ui-7`. **Depends on UI-4 on `main`.**
Concurrent with UI-5 and UI-6.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-7"
git merge-base --is-ancestor <UI-4 merge hash on main> HEAD && echo GATE-OK
test -f app/src/routes/pages/Settings/settings.css && echo CSS-PRESENT
```
Both must print (the second confirms you are the task that deletes it), else
merge `main` (R19 pattern); conflicts outside `CHANGELOG.md` are STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 5, 31, 37 and the
"Settings" paragraph; `FLUTTER-UI-SURVEY.md` §6 (Settings), §7;
`runs/2026-09-06/RULINGS-DIGEST.md` (the Settings line: `settings.json` wins
over `localStorage`, only engine-default fields are imported, `ui` keys stay in
`localStorage`, failures surface in a `role="status"` line — R78 L7c Task 8);
`app/src/routes/pages/Settings/**` in full, especially `prefs.ts` (the `UiPrefs`
block), `prefsStore.ts` (`PrefsBackend`), `prefsMigration.ts`, `sections.ts`,
`settings.css`; `app/src/routes/pages/Notebook/model/notebookPrefs.ts` (its
`TODO(idl0)` names this consolidation).

## Where

- **Files:** `app/src/routes/pages/Settings/**`, including **deleting**
  `settings.css` and its import. `CHANGELOG.md`.
- Do not touch other pages, the shell, or `package.json`.

## What to build

- Seven sections as `SectionHead` + content: profile, units, sync, firmware,
  controls, theme, how-tos, about (firmware and how-tos in `Collapsible`s).
  Narrow: one scroll. Wide: list + detail, detail column 720 px — the existing
  `idl1-settings__list` / `__detail` split, restyled, not rebuilt.
- Units: `ToggleGroup` (BrandSegmented) + `SpecRow` readouts.
- Sync: `StatusDot` + `Button`; **one toast call site** — sync finished
  (`toastFor({kind:"syncFinished", …})`) on the existing success path.
- Controls: `SpecRow` key bindings (read-only in this pass unless the existing
  module already writes them).
- About / how-tos: bundled Markdown, unchanged content.
- The `role="status"` migration/failure line stays exactly as R78 left it —
  restyle it, do not remove it.
- Delete `settings.css` and re-express every rule it carries with tokens. Its
  hardcoded `rgba(0,0,0,0.08)` selection tint is the `KNOWN_EXCEPTIONS` entry
  UI-1 left in `tokenSheet.test.ts`: replace it with `--control-active` and
  **remove that exception from the test** in this commit.

## New preferences (pure, tested)

```ts
// app/src/routes/pages/Settings/theme.ts
/** This machine's appearance preferences. Both are `ui` keys: they live in
 *  `localStorage` through `prefsStore.ts`'s `PrefsBackend`, never in
 *  `settings.json` (R78 L7c Task 8 — `ui` keys stay local). */
export type ThemeChoice = "dark" | "system";
export type OutputRegister = "paper" | "studio";
/** The `data-theme` attribute value for a choice, or null when nothing should
 *  be stamped. Dark is authored and is the default; a light variant is a later
 *  pass (decision 5), so "system" stamps nothing and the dark `:root` values
 *  stand until light tokens exist. */
export function themeAttribute(choice: ThemeChoice, prefersLight: boolean): string | null;
/** R92: paper on narrow, studio on wide, both switchable here and in the
 *  worksheet bar. Returns the default when the user has made no choice. */
export function resolveRegister(stored: OutputRegister | null, widthPx: number): OutputRegister;
```

Tests: `themeAttribute — dark — "dark"`; `— system with prefersLight true — null
until light tokens exist`; `resolveRegister — no stored choice at 400 px —
paper`; `— no stored choice at 1600 px — studio`; `— a stored choice at any
width — the stored value`. Extend `prefs.test.ts` for the two new `ui` fields
round-tripping and for an unknown stored value falling back to the default.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```
Non-zero `passed`; pre-existing Settings tests unchanged except where the two
new `ui` fields are added.

## Steps

- [ ] 1. Entry gate. 2. `theme.ts` + tests; the two `ui` fields in `prefs.ts`
      with migration-safe defaults. 3. Sections onto `SectionHead`/`SpecRow`/
      `ToggleGroup`/`Collapsible`. 4. Theme + register controls wired to
      `PrefsBackend`. 5. Sync toast call site. 6. Delete `settings.css`, port
      its rules, drop the `KNOWN_EXCEPTIONS` entry. 7. Gate. 8.
      `tokenSheet.test.ts` green **with** the exception removed. 9. NUL check.
      10. CHANGELOG. 11. Commit `app: Settings on the brand primitives; theme
      and output-register prefs (UI-7)`.

## Do not

- Do not write light-theme token values (decision 5, non-goal). The control
  exists; "system" is honest about doing nothing until light lands.
- Do not move `notebookPrefs.ts` into `UiPrefs` — its `TODO(idl0)` is a
  cross-lane consolidation and UI-10 reads that key. Leave both, and say in the
  report whether the register belongs in one or the other.
- Do not add an IPC command, a stub, or a firmware-update path (deferred to
  wave 3, operating brief §3).
- Do not change what `settings.json` carries or the migration rules.

## Spec discipline

**Spec-during** — two new `ui` preference keys. Note them in `CHANGELOG.md` and
name them in the report so the lead can add them to the digest's Settings line.

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
that pre-existing tests are unchanged; the exact new `UiPrefs` field names and
their defaults; confirmation `settings.css` is deleted and the
`KNOWN_EXCEPTIONS` entry removed; the sync toast call site; whether the output
register ended up in `UiPrefs` or `notebookPrefs`; parity gaps (name each idl0
Settings affordance deferred); anything needing a ruling.

## Open questions

1. **Who owns the output register — Settings or the Notebook?** UI-10 needs to
   read it. *Recommendation:* `UiPrefs` here (it is an app-wide appearance
   preference and the direction lists it under Settings), and UI-10 reads it
   through `prefsStore.ts`'s `PrefsBackend` rather than a third storage key.
   If that cross-page import is unwelcome, the lead rules before UI-10 starts.
2. **Does "follow-OS" need a `prefers-color-scheme` listener now?**
   *Recommendation:* write the listener but have it stamp nothing while only
   dark tokens exist; that way the light pass is one `tokens.css` block and no
   TypeScript change.
3. **Firmware section with no command behind it.** *Recommendation:* keep the
   collapsed section with a dim mono sentence saying updates arrive in a later
   version — an empty affordance that lies is worse than one that says so.
