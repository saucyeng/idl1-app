# Review — UI-3 overlay primitives + core-workflow toast set

Commit: `f6d6140` on branch `ui-3`, worktree
`C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-3`.

Files touched (16): `CHANGELOG.md`; `app/package.json` + `package-lock.json`
(adds `sonner: 2.0.8`, exact pin, only new dependency); `app/src/components/
Toaster.tsx`; `app/src/components/brand/BrandSheet.tsx`; `app/src/components/
overlays/sheetSide.{ts,test.ts}`; `app/src/components/toasts/events.{ts,test.ts}`;
`app/src/components/ui/{context-menu,dialog,dropdown-menu,popover,sheet,
sonner}.tsx`; `app/src/styles/index.css` (sonner shadow/font override block).
Matches the brief's file list exactly; nothing else touched.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run
```
`tsc --noEmit`: clean, no output. `npx vitest run`: **965 passed (965)**,
103 test files — matches the implementer's report and the dispatch's
expectation exactly. Entry gate re-verified: `git merge-base --is-ancestor
55ba799 HEAD` (UI-2's merge hash on `main`) → `GATE-OK`; `app/src/components/
brand` exists → `BRAND-OK`.

## Findings

No findings. Nothing rises to Minor.

## Checks performed (read the code, not the report)

- **No colour literal outside `tokens.css`.** `tokenSheet.test.ts`'s
  `listFiles(SRC_DIR, [".css", ".tsx"])` recursively covers every new `.tsx`
  and the `index.css` diff; it ran clean as part of the 965. The two pure
  `.ts` modules (`events.ts`, `sheetSide.ts`) carry no styling at all, so the
  extension gap doesn't matter here.
- **No `box-shadow` anywhere**, including the `[data-sonner-toast]` block:
  grepped every changed file, zero literal shadow additions. The
  `index.css` override sets `box-shadow: none` on `[data-sonner-toast]
  [data-styled="true"]` and again on `:focus-visible` (replacing sonner's
  vendored shadow with `none`, not adding one), and leaves `--normal-border`
  to sonner's own 1 px border rule rather than duplicating it. The vendored
  `app/node_modules/sonner/dist/styles.css` file itself is untouched — not in
  the commit's file list, confirmed present on disk.
- **`--accent`/`--shadcn-accent` split (R94).** Grepped every new file for
  `(bg|text|border|ring)-accent`: zero hits. `text-destructive`/
  `bg-destructive` are used in `dropdown-menu.tsx`/`context-menu.tsx`'s
  destructive item variant; `tokens.css:114` aliases `--destructive` to the
  real `--accent` (alert red) directly, so this is the correct alias, not
  the shadcn-accent collision. `--control-active` is used throughout for
  hover/open/checked highlight states (never `--accent`).
- **Radii/elevation (decision 23).** `dialog`, `popover`, `dropdown-menu`,
  `context-menu` content all carry `rounded-[var(--radius-card)] border
  border-rule bg-surface-2`, i.e. 0 radius + hairline + flat fill, no shadow.
  `sheet` content has no radius (flush to the viewport edge, correct for a
  docked panel) and the same `bg-surface-2`/`border-rule` treatment on its
  docked edge. Overlay/backdrop on dialog and sheet is a flat `bg-black/50`
  with no blur class.
- **`sheetSideFor` boundary.** `widthPx < 600 ? "bottom" : "right"` — tests
  assert 599→bottom and 600→right, matching the brief's boundary exactly
  (checked by reading the function body, not just running the suite). Both
  `Toaster.tsx`'s `usePosition` and `BrandSheet.tsx`'s `useSheetSide` call
  the same function and both resize-listen correctly (add on mount, remove
  on unmount); no duplicated breakpoint logic anywhere.
- **`toastFor` closed union.** `CoreToastEvent` has exactly the four variants
  in the brief; the switch has a case per variant plus a `default: { const
  exhaustive: never = event; throw ... }` — a fifth variant added to the
  union would fail to compile at that assignment, matching "compile error,
  not silent fallback." Four tests cover tone/title per event plus the
  `importFailed` file-name-in-detail assertion; all are real Arrange/Act/
  Assert with the brief's exact naming convention and each assertion
  matches what the function actually returns (re-derived by hand:
  `transferComplete`→good/"Transfer complete", `configPushed`→info/"Config
  pushed", `syncFinished`→good/"Sync finished", `importFailed`→accent/detail
  containing the file name — all correct).
- **Toaster not mounted.** Grepped `App.tsx` and `main.tsx` for `Toaster`:
  zero hits. `Toaster.tsx` is exported and unused elsewhere, exactly as the
  brief specifies (UI-4's job). No page calls `toastFor` — grepped
  `app/src/routes` for `toastFor` import: none.
- **`next-themes` dropped.** Not in `package.json`, `package-lock.json`, or
  anywhere in the diff; `ui/sonner.tsx` hardcodes `theme="dark"` with a
  doc-comment explaining why (idl1 is dark-only, no light-mode block in
  `tokens.css`). `package-lock.json`'s only new entry is `sonner` itself,
  with no other new transitive packages introduced in the diff — sonner
  needs no other runtime dependency here. Nothing fetches at runtime: the
  CSS import (`sonner/dist/styles.css`) is a build-time bundle import, not a
  network fetch, matching offline-first (§3).
- **`sonner` pinned exact.** `"sonner": "2.0.8"` in `package.json`, no caret;
  lockfile's own entry resolves to the same version, matching `radix-ui`'s
  pin style already established in UI-2.
- **Stray `cn` package.** Same pattern as UI-2 (generator emits `import { cn
  } from "cn"`, rewired to `@/lib/utils`): grepped every new file, all `cn`
  imports are from `@/lib/utils`; no `"cn"` entry in `package.json` or
  `package-lock.json`.
- **Keyboard correctness out of Radix.** All six primitives are thin
  wrappers over `radix-ui`'s `Dialog`/`ContextMenu`/`DropdownMenu`/`Popover`
  namespace imports with no re-implementation of focus trapping, Escape,
  roving tabindex, or typeahead — none of that logic appears in the diff.
  `--focus` outline (`focus-visible:outline focus-visible:outline-1
  focus-visible:outline-offset-2 focus-visible:outline-focus`) is present on
  every close control (`dialog`, `sheet`) and content region (`popover`).
  The bare `Trigger` wrappers (`DialogTrigger`, `SheetTrigger`,
  `PopoverTrigger`, `DropdownMenuTrigger`, `ContextMenuTrigger`) carry no
  className of their own — consistent with UI-2's `button`/other primitives
  already having their own focus ring, so a trigger wrapped in `<Button>`
  gets the ring for free; this matches the pattern shadcn ships and is
  consistent across all six new files, not a one-off gap.
- **`BrandSheet` composition.** Imports `Sheet`, `SheetContent`,
  `SheetHeader`, `SheetTitle` from `@/components/ui/sheet` and does not
  reimplement or edit the primitive; adds only the title-row hairline
  (`border-b border-rule`), the scrollable body (`flex-1 overflow-y-auto`),
  and the optional footer hairline (`border-t border-rule`). The `×` close
  control comes from `SheetContent`'s built-in `showCloseButton` default,
  matching the brief's "title row + × + rule + scrollable body + optional
  pinned footer CTA" parity target.
- **`DialogFooter`'s dropped `variant="outline"`.** `<Button>Close</Button>`
  with no props; `Button`'s defaults are `emphasis="normal"`,
  `filled=false`, which is the outline family — the CHANGELOG's claim that
  this is the equivalent of the generated `variant="outline"` checks out by
  reading `button.tsx`'s defaults, not just trusting the note.
- **Entrance animation.** Grepped every new file for
  `animate-in`/`fade-in`/`zoom-in`/`slide-in`/`-out` variants: zero hits —
  fully stripped, no orphaned `data-[state=...]` rules left pointing at
  removed classes (each remaining `data-[state=...]` selector in the diff
  still does visible work: `data-[state=open]:bg-control-active`,
  `data-[state=checked]`, etc., all inherited unmodified from UI-2 files not
  touched by this commit).
- **CHANGELOG accuracy.** The UI-3 bullet's claims (generation command and
  pinned CLI version, six components committed unmodified before restyle,
  semantic-class swap method, `cn`-package and `next-themes` drops, the
  `sonner` CSS/shadow override rationale) all match the diff on inspection;
  no unsupported claims found.
- **Scope.** Nothing outside the brief's file list touched; `App.tsx`/
  `main.tsx` untouched; no `toastFor` call site added; no context-menu
  chart action set built (correctly deferred to UI-11); no NUL bytes in any
  touched file (checked with `grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'`
  across all 16 files — all zero).

## Verdict rationale

Every restyle rule in the brief (zero elevation, `--surface-2` + hairline,
radius-card, no shadow/blur/animation, `--focus` ring, the R94 accent split)
checks out by reading the code and re-deriving the boundary/exhaustiveness
logic by hand, not by trusting the implementer's report. The `sonner` shadow
neutralisation is done correctly (override, not edit of the vendored file,
and no shadow re-added). The toast union is genuinely closed at the type
level with a `never` check, and `sheetSideFor`'s single breakpoint is shared
correctly by both callers. `next-themes` and the stray `cn` package are both
absent, `sonner` is pinned exact, and nothing was mounted or wired ahead of
schedule. File list, test counts, and `tsc` result all match the dispatch's
expectations exactly. No deviation, silent or otherwise, found.

VERDICT: CLEAN
