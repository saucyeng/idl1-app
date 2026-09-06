# UI-6 — Data tab restyle (McMaster-style faceted browser)

The library. Filter rail, dense results with date·venue groups and lap
sub-rows, a detail pane, and idl0's XOR session/lap selection kept **exactly**
(decision 33). Presentation only: no new IPC, no change to any filter, facet,
sort or import module. ONE commit.

Worktree: `…/idl1-app-worktrees/ui-6`. **Depends on UI-4 on `main`.**
Concurrent with UI-5 and UI-7.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-6"
git merge-base --is-ancestor <UI-4 merge hash on main> HEAD && echo GATE-OK
test -f app/src/components/brand/emphasis.ts && echo BRAND-OK
```
Both must print, else merge `main` (R19 pattern); conflicts outside
`CHANGELOG.md` are STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 33, 36 and the "Data"
paragraph of "Per-tab layout direction"; `FLUTTER-UI-SURVEY.md` §6 (Data), §7
(`DenseRow`/`TableHeader`, the reserved 3 px selection bar), §8 (selection is a
gutter checkbox with an XOR mode; empty states are one dim mono sentence);
`runs/2026-09-06/RULINGS-DIGEST.md` (the Data/track/quarantine lines, R86);
`app/src/components/**`; every `.tsx` under `app/src/routes/pages/Data/` plus
the pure modules they call (`filters.ts`, `facets.ts`, `sort.ts`,
`sessionRow.ts`, `format.ts`, `importQueue.ts`, `importDriver.ts`).

## Where

- **Files:** `app/src/routes/pages/Data/**` only, plus one new pure module and
  its test. `CHANGELOG.md`.
- The direction's `FilterRail`, `DetailPane`, `LapTable`, `TrackDetailPane`,
  `MaintenancePanel`, `ActiveChips`, `ImportPanel`, `MetadataForm`,
  `TrackResults` all exist by those names — restyle in place, do not rename.

## What to build

- **Wide (≥ 1200 px):** 280 px `FilterRail` of facet `Collapsible` groups with
  `(N)` counts | results | 320 px `DetailPane`. Vertical hairlines between.
- **Medium:** rail and detail become docked panels or sheets (`sheetSideFor`).
- **Narrow (< 600 px):** a filter bar opens the rail as a bottom `Sheet`;
  detail is a full-height `Sheet`. `ActiveChips` renders active filters as
  removable `Badge`s in both layouts.
- **Results:** pinned `TableHeader` over collapsible date·venue groups of
  `DenseRow`s; expanding a session reveals its laps as recessed sub-rows on the
  same column grid (`--surface-2` fill). 6 px rhythm.
- **Selection:** unchanged model, `--surface-2` fill plus a 3 px `--good` inset
  bar whose width is **always reserved** so selection never shifts layout. The
  muted-but-live checkbox behaviour is exactly idl0's — a muted checkbox still
  responds and flips mode. Do not alter `sessionRow.ts`/`selection` logic.
- **Import:** a top-right `Button` plus a drag-and-drop target over the results
  panel. Drop handling reuses the existing `FilePicker`/`importQueue`/
  `importDriver` path — **do not write a second queue**, and do not add an
  effect (operating brief §4: the import driver is exactly the code that was
  fixed for self-cancelling).
- **Toast (decision 21):** one call site — import failed
  (`toastFor({kind:"importFailed", …})`) on the existing failure path. Per-item
  errors keep showing in place as well.
- **Maps** keep idl0's behaviour exactly (decision 36): live OSM standard /
  Esri satellite / Esri hybrid tiles, GPS trace over whatever loads, no tile
  cache. Tiles are network *data*, not bundled code — the no-CDN rule is not
  touched. Do not add a basemap library.
- **Empty and error states:** one dim mono sentence naming the next action;
  errors `--accent` mono in place, `NoteBlock` when an explanation is needed.

## Pure module

```ts
// app/src/routes/pages/Data/layout.ts
/** How the Data tab arranges itself at a given width (UI-DIRECTION "Data").
 *  The rail is a docked column on wide, a docked panel on medium and a bottom
 *  sheet on narrow; the detail pane follows the same ladder. Pure so the
 *  breakpoints are tested without a DOM, and so the rail and the detail pane
 *  cannot drift apart. */
export type PaneMode = "docked" | "panel" | "sheet";
export interface DataLayout { rail: PaneMode; detail: PaneMode; railWidthPx: number | null; detailWidthPx: number | null; }
export function dataLayout(widthPx: number): DataLayout;
```

Tests: `dataLayout — 1400 px — both docked at 280 and 320`;
`dataLayout — 800 px — panels, no fixed widths`; `dataLayout — 400 px — both
sheets`; `dataLayout — exactly 600 and exactly 1200 px — the wider side of each
boundary` (lock the boundary, it is the thing that silently drifts).

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```
Non-zero `passed`, pre-existing Data tests unchanged. A restyle that forces an
edit to a tested pure module means behaviour is changing — STOP and report.

## Steps

- [ ] 1. Entry gate. 2. `layout.ts` + tests. 3. `FilterRail` on `Collapsible` +
      `Badge` chips. 4. Results: `TableHeader`, groups, `DenseRow`, lap
      sub-rows, reserved selection bar. 5. `DetailPane` / `TrackDetailPane` /
      `MaintenancePanel` on `SpecRow` + `Input`. 6. Narrow sheets + filter bar.
      7. Import button and drop target over the existing driver. 8. The one
      toast call site. 9. Empty/error states. 10. Gate. 11. `tokenSheet.test.ts`
      green. 12. NUL check. 13. CHANGELOG. 14. Commit `app: Data tab on the
      brand primitives, faceted browser layout (UI-6)`.

## Do not

- Do not change the selection model, the facet counts, the sort, or any
  `*.ts` pure module's behaviour.
- Do not add an IPC command or a stub; the quarantine and track write commands
  landed (R86) and the page already calls them.
- Do not add an effect that starts IPC, and do not restructure `importDriver`.
- Do not build the track-editor map UI (R54 says there is none).
- Do not touch other pages, the shell, or `package.json`.

## Spec discipline

**No spec change needed** — presentation over landed L7a/L8x behaviour.

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
that the pre-existing count is unchanged; the import toast call site by file
and line; how drag-and-drop reaches the existing queue (one line); whether the
selection bar is reserved in every row type including lap sub-rows; parity gaps
(name each idl0 Data affordance deferred, with a reason); anything needing a ruling.

## Open questions

1. **Facet group counts on a large library.** Recomputing `(N)` per keystroke
   is pure and already tested. *Recommendation:* leave it; if it ever bites,
   the fix is memoisation, not a new IPC round trip.
2. **Where the map lives on narrow.** *Recommendation:* inside the detail
   `Sheet`, sized to the sheet, not a separate destination — idl0 puts it in
   the detail pane and decision 36 says keep the behaviour.
3. **Does the results panel need virtualisation?** *Recommendation:* not in
   this pass; no session count is known to hurt, and a virtual list would
   fight the pinned header and group collapse. Flag it if a real library lags.
