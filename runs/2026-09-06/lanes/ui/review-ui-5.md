# Review — UI-5 Device tab restyle

Commit `1be44e0` on branch `ui-5`, worktree `idl1-app-worktrees/ui-5`, parent
`d43fddb` (UI-4 on `main`). Files touched: `CHANGELOG.md`,
`app/src/routes/pages/Device/{ChannelsTable,DeviceControls,DeviceFiles,
HeroCard,ProfileBar,PushConfigBar,index}.tsx`, new `hero.ts` + `hero.test.ts`.
No file outside `Device/**`/`CHANGELOG.md` touched; `statusPoll.ts` diff is
empty (0 lines).

## Gate

```
cd app && npx tsc --noEmit          → clean, no errors
npx vitest run src/routes/pages/Device
  → Test Files 15 passed (15); Tests 173 passed (173)
```
Diff of `*.test.ts` files under `Device/**` shows exactly one file changed:
`hero.test.ts` (new, 77 lines, 6 `it`s). No existing test file's expectations
were touched — the pre-existing 167 are unchanged and the 173 total matches
167 + 6.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | none | — |

## Verdict rationale

`hero.ts`/`hero.test.ts` match the brief's signatures and test names exactly
(`heroView`/`heroStateFrom`, the three states, the four named tests plus two
extra `heroStateFrom` cases). `HeroCard`'s CTA uses `emphasisClasses` via
`Button`'s `emphasis` prop only — no local colour — with `--info`/`--good`/
`--hivis` per state, `PulsingDot` gated on `view.pulsing`, and the elapsed
timer gated on `view.showTimer`; the timer's `Date.now()` bookkeeping and
1 Hz `setInterval` live in `index.tsx` as local display state, no IPC, so
the effects rule (operating brief §4 + tightening) does not reach either of
the two new effects — both key on data only (`logging`, `recordingStartedAtMs`),
neither cancels in-flight work. `statusPoll.ts` and UI-4's `composeVisibility`
wiring are untouched (grepped, present at index.tsx:60). Every interactive
element sampled (hero CTA `h-14`=56px, discovered-device rows, profile-bar
buttons/select/input, channels-table expand/gear buttons, add-channel,
push/pull, WiFi toggles, download rows) carries `h-11` (44px) or the 56px
hero exception the brief itself calls for; Tailwind class order puts
`className`'s explicit height last through `cn`'s `tailwind-merge`, so it
wins over each primitive's default size variant. The per-source form opens
in a `Sheet` via `sheetSideFor` per the brief's own Open-question-3
recommendation, with `forms/*` unmodified (confirmed 0 diff) and still
pointer-first inside it. Both toast call sites (`PushConfigBar.tsx` push
success, `DeviceFiles.tsx` per-file download success) fire only from
existing `.then()` success branches, using UI-3's closed `CoreToastEvent`
union (`configPushed`/`transferComplete`) with no new failure-path toasts.
No hex outside `tokens.css` (grepped clean), no `box-shadow`, `lucide-react`
only for icons, no NUL bytes in any touched file. `ConfigCard` was kept as
the three existing components (`ProfileBar`+`ChannelsTable`+`PushConfigBar`)
under one `SectionHead`, as the brief allowed and the CHANGELOG states
truthfully. `ColorGridPicker`/`GroupedChannelList`/`ModeAwareCheckbox` are
not touched by this commit; they were already logged as parity gaps in
UI-2/UI-3's CHANGELOG entries (not Device-specific, not this task's job) —
no dishonest deferral found in the diff itself, though I could not verify
the implementer's prose "report back" message (not present as a file) so
cannot confirm the promised Device-refinement list reached the lead in the
required form; that is a process gap, not a code defect, and not one this
review's file-based evidence can resolve. CHANGELOG's UI-5 bullet matches
the diff line-for-line (WiFi-only `DeviceControls`, `Sheet`+`sheetSideFor`,
Calibration `Collapsible` placeholder, both toast sites, `fileCount: 1`
reasoning, `ConfigCard` naming). No spec change needed, correctly declared.

VERDICT: CLEAN
