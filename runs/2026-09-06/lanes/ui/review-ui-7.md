# Review — UI-7 Settings restyle + theme/output-register prefs

Commit: `20447e5` on branch `ui-7`
(`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\ui-7`).

Files touched (26): `CHANGELOG.md`; `app/src/routes/pages/Settings/{AboutSection,ControlsSection,DataSection,FirmwareSection*,HowTosSection,ProfileSection,SyncSection,ThemeSection*,UnitsSection,index}.tsx`;
`Settings/howtos/{FirstSetup,GpsLapGate,MathChannels,WifiDownload}.tsx`,
`Settings/howtos/proseClasses.ts*`; `Settings/{prefs,prefs.test,prefsMigration.test,sections,sections.test,settingsBackend.test,theme*,theme.test*}.ts`;
`Settings/settings.css` (deleted); `app/src/styles/tokenSheet.test.ts`.
(`*` = new file.)

## Gate

```
cd app && npx tsc --noEmit && npx vitest run
```
Result: `tsc --noEmit` clean (no output); full vitest suite —
**Test Files 109 passed (109), Tests 1009 passed (1009)**. Ran the whole
suite once, per the lead's dispatch (not just the Settings filter the
implementer used).

## Findings

| Severity | file:line | Finding | Fix |
| --- | --- | --- | --- |
| Minor | `app/src/routes/pages/Settings/sections.ts:1-12` | Section count went from 7 to 9, but UI-DIRECTION's Settings paragraph lists 8 (profile, units, sync, firmware, controls, theme, how-tos, about) — no `data`. `data` (data-directory override) is a pre-existing section this task didn't add or remove, and CHANGELOG explicitly names and justifies keeping it (C4 §1, R53 Settings Q4 never retired it). Defensible, and disclosed, not silent. | None required; the brief itself invited a Note here. Worth folding into the digest's Settings line so the count is unambiguous going forward. |
| Note | `app/src/routes/pages/Settings/SyncSection.tsx:11-19` | `announceSyncFinished`'s tone-to-toast-fn ternary (`toast.success`/`toast.info`/`toast.error`) is dead-branch code since `toastFor({kind:"syncFinished"})` only ever returns `tone: "good"`. Harmless, mirrors a pattern that will matter once other toast kinds share this helper. | No action needed. |

No Critical or Important findings.

## Verification detail

- **Behaviour frozen.** `prefs.ts`: diff is purely additive (`theme`,
  `output_register` fields, their `parseUi` branches); the `...record`
  unknown-key-preserving spread and every pre-existing `parseEngine`/
  `parsePrefs`/`serializePrefs` line is untouched. `prefsStore.ts` and
  `settingsBackend.ts` are not in the diff at all.
  `prefsMigration.test.ts`/`settingsBackend.test.ts` changes are exactly the
  two new default fields appended to existing `ui` object-equality
  assertions — same behaviour asserted, updated shape. Unknown-key
  round-trip coverage (R82) is untouched (`prefs.test.ts`'s existing
  "unknown top-level key" test, not touched by this diff, still exercises
  the same `...record` spread path).
- **New prefs.** `UiPrefs.theme: ThemeChoice` (`"dark"|"system"`, default
  `"dark"`) and `UiPrefs.output_register: OutputRegister | null` (default
  `null`) — both `ui`-half (localStorage) keys per R78 L7c Task 8, as
  required. `theme.ts`'s `themeAttribute`/`resolveRegister` match the brief's
  signatures and doc comments verbatim; `resolveRegister`'s breakpoint is
  1200 px (paper `< 1200`, studio `>= 1200`), matching R93. New
  `prefs.test.ts` cases cover round-trip and unknown-value fallback for both
  fields exactly as the brief's step 2 asked.
- **`settings.css` deletion.** File confirmed deleted; `index.tsx`'s
  `import "./settings.css"` line removed, no dangling reference anywhere
  under `app/src` (only comments in `proseClasses.ts`/`index.tsx`/
  `tokenSheet.test.ts` mention the filename). `tokenSheet.test.ts`'s
  `KNOWN_EXCEPTIONS` is now `[]`; its selection tint is re-expressed as
  `bg-control-active` in `index.tsx`.
- **Token/style discipline.** No hex/`rgb()`/`rgba()`/`hsl()`/`hsla()`
  literal in any touched `Settings/**` file (grepped). No `box-shadow` or
  `shadow-` class anywhere in `Settings/**`. `lucide-react` is the only icon
  import (`FirmwareSection.tsx`, `HowTosSection.tsx`), consistent with R93.
- **`role="status"` migration/failure lines.** Present, unchanged text, in
  `ProfileSection.tsx` and `UnitsSection.tsx` (restyled classes only, same
  `role="status"` attribute and copy).
- **Sync toast.** One call site, `SyncSection.tsx`'s `announceSyncFinished`,
  fired from the existing `syncNow(...).then(...)` success path via
  `toastFor({kind:"syncFinished", changed: blobs_transferred +
  workbooks_merged})`, using UI-3's closed `CoreToastEvent` union
  (`components/toasts/events.ts`, unmodified by this commit). `syncNow`,
  `syncStatus`, `pairPeer` were already imported before this diff (only
  `type SyncResult` is newly added to that import); `app/src/ipc/sync.ts`
  already exists on `main` as a typed stub calling `invoke("sync_now", …)`
  with no backing Rust command yet (explicit comment: "L11 (LAN sync) is
  wave 2 — no Rust command backs this module yet"). This is pre-existing,
  not something UI-7 introduced, and it compiles clean against what's on
  `main` today — confirmed by the passing `tsc --noEmit`. Not a finding.
- **Section content.** Units → `ToggleGroup` + seven `SpecRow` readouts
  (replacing a `role="radiogroup"`/`<table>`), matches brief. Sync →
  `StatusDot` + `Button` for peers, `Input`/`Button` for pairing. Controls,
  About, How-tos restyled only, content unchanged (spot-checked `HowTosSection.tsx`/`AboutSection.tsx`/`ControlsSection.tsx` diffs — class/markup changes only). Firmware is a collapsed, honest "arrives in a later version" sentence with no command, stub, or IPC call, per Open question 3's accepted recommendation.
- **Scope.** `App.tsx`, `App.css`, `state/**`, `package.json` do not appear
  in the commit's file list. No IPC command added; `ipc/sync.ts` and
  `ipc/app.ts` are read-only imports, unmodified.
- **CHANGELOG.md.** Entry accurately describes the section count, the two
  new prefs and their defaults, the toast call site, and labels itself
  spec-during — matches what's in the diff.
- **NUL-byte check.** Ran across every file in the commit; none found.

## Verdict rationale

The commit does exactly what the brief specifies: `prefs.ts`/`prefsStore.ts`/
`settingsBackend.ts`/`prefsMigration.ts` logic is untouched except for
additive fields verified line-by-line, the two new pure functions match
their contracted signatures and defaults (including R93's 1200 px
breakpoint), `settings.css` is gone with its `KNOWN_EXCEPTIONS` entry
removed and no dangling import, the `role="status"` lines survive verbatim,
the one sync toast call site is wired against code that already exists on
`main`, and no lead-owned file or out-of-scope page is touched. The only
notable judgment call — 9 sections instead of the direction paragraph's 8 —
is pre-existing (the `data` section predates this task) and is disclosed in
CHANGELOG rather than hidden. Full `tsc`+vitest gate passed clean at 1009/1009.

VERDICT: CLEAN
