# UI-3 — overlays: dialog, sheet, menus, popover, toasts

The floating layer. Zero elevation everywhere: depth is a `--surface-2` fill
plus a 1 px `--rule` hairline, never a shadow. Plus the toast primitive and the
four core-workflow events that may use it. TDD for the pure modules; ONE commit.

Worktree: `…/idl1-app-worktrees/ui-3`. **Depends on UI-2 on `main`.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-3"
git merge-base --is-ancestor <UI-2 merge hash on main> HEAD && echo GATE-OK
test -d app/src/components/brand && echo BRAND-OK
```
Both must print, else merge `main` (R19 pattern); any conflict outside
`CHANGELOG.md` is STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decisions 21, 23, "Component
approach"; `FLUTTER-UI-SURVEY.md` §7 (`BrandSheet`), §8 (dialogs outnumber
sheets 5:1; `SnackBar` at 97 sites — that is the volume we are deliberately
*not* porting); `app/src/components/brand/**` from UI-2;
`docs/vendor/shadcn/` pages for `dialog`, `sheet`, `dropdown-menu`,
`context-menu`, `popover`, `sonner`.

## Where

- **New:** `app/src/components/ui/{dialog,sheet,dropdown-menu,context-menu,popover,sonner}.tsx`
  (generated + restyled), `app/src/components/Toaster.tsx`,
  `app/src/components/toasts/events.ts` + `events.test.ts`,
  `app/src/components/overlays/sheetSide.ts` + `sheetSide.test.ts`.
- **Lead-owned, allowed here:** `app/package.json` + lockfile — the Radix
  packages plus `sonner`, exact pins.
- **Also:** `CHANGELOG.md`.

## Restyle rules

- Dialog, sheet, menu, popover, tooltip content: `--surface-2` fill, 1 px
  `--rule` border, `--radius-card` (0), **no `box-shadow`** — strip shadcn's.
- Overlay/backdrop: a flat scrim, no blur.
- `BrandSheet` parity (`FLUTTER-UI-SURVEY.md` §7): title row + `×` + rule +
  scrollable body + an optional pinned footer CTA. Build it as a thin wrapper
  over the shadcn `sheet` in `components/brand/`, not by editing the primitive.
- Focus ring `--focus` on every trigger and close control. Radix supplies focus
  trapping, Escape, roving tabindex and typeahead — do not re-implement any of
  them (decision 17: no screen-reader work beyond what the library gives).

## Pure modules

```ts
// app/src/components/overlays/sheetSide.ts
/** Sheets are a bottom sheet on narrow and a right-docked panel on wide
 *  (UI-DIRECTION "App shell and navigation"). One function so every caller
 *  agrees on the breakpoint, and so the rule is testable without a DOM. */
export type SheetSide = "bottom" | "right";
export function sheetSideFor(widthPx: number): SheetSide; // < 600 ⇒ bottom

// app/src/components/toasts/events.ts
/** The only four events allowed to raise a toast (decision 21): transfer
 *  complete, config pushed, sync finished, import failed. Everything else
 *  reports in place — a toast is not an error channel. */
export type CoreToastEvent =
  | { kind: "transferComplete"; fileCount: number }
  | { kind: "configPushed"; profileName: string }
  | { kind: "syncFinished"; changed: number }
  | { kind: "importFailed"; fileName: string; message: string };
export interface ToastDescriptor { tone: "good" | "info" | "accent"; title: string; detail?: string; }
export function toastFor(event: CoreToastEvent): ToastDescriptor;
```

Tests: `sheetSideFor — 599 px — bottom`; `sheetSideFor — 600 px — right`;
`toastFor — each of the four events — its tone and title`;
`toastFor — importFailed — accent tone and the file name in the detail`.
The union is closed on purpose: adding a fifth toast is a design decision, and
a `default:` arm would hide it. Make the switch exhaustive with a `never` check.

## Wiring

`Toaster.tsx` renders `sonner`'s toaster themed onto tokens (mono, tabular,
`--surface-2`, hairline, no shadow, bottom-centre on narrow / bottom-right on
wide via `sheetSideFor`). UI-4 mounts it in the shell — **this task does not
edit `App.tsx`**. Do not call `toastFor` from any page yet; the four call sites
land in UI-5 (config pushed, transfer complete) and UI-6 (import failed) and
UI-7 (sync finished), each named in those briefs.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/components
```
Non-zero `passed` required (UI-2's tests plus the new ones).

## Steps

- [ ] 1. Entry gate. 2. Generate the six components at the pinned CLI version,
      committed unmodified in one step. 3. Restyle: strip shadows, radius 0,
      `--surface-2` + hairline, focus ring. 4. `BrandSheet` wrapper.
      5. Pure modules + tests. 6. `Toaster.tsx`. 7. Gate. 8. `tokenSheet.test.ts`
      still green. 9. NUL check. 10. CHANGELOG. 11. Commit
      `app: overlay primitives and the core-workflow toast set (UI-3)`.

## Do not

- Do not mount the toaster or touch `App.tsx`/`main.tsx` — UI-4.
- Do not raise a toast from any page in this task.
- Do not add a shadow, a blur, or an entrance animation beyond a plain
  opacity/transform Radix needs to not break.
- Do not port idl0's 97 `SnackBar` call sites (decision 21 is explicit).

## Spec discipline

**No spec change needed.**

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count;
the six generated components and any that needed structural edits; the exact
pinned versions added to `package.json`; how the shadow strip was done
(class removal vs. override) so UI-2's approach and this one match; parity
gaps (`ColorGridPicker`, cascading menus deferred to UI-11); anything needing
a ruling.

## Open questions

1. **`sonner` vs. a hand-rolled toast.** *Recommendation:* keep `sonner` — it
   ships with shadcn, decision 21 names it, and the alternative is queueing and
   timer logic we would have to test ourselves.
2. **Tooltip on touch.** Radix tooltips need hover. *Recommendation:* on the
   touch-first surfaces (Device, notebook output) never make a tooltip the only
   carrier of information; UI-5 uses a visible label instead. No JS touch shim.
3. **Does `context-menu` belong here or in UI-11?** *Recommendation:* generate
   the primitive here so the theme is done once; UI-11 builds the chart action
   set on top of it.
