# Review — UI-2 primitives: shadcn set + hand-rolled brand widgets

Commit: `55ba799` on branch `ui-2`, worktree
`C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-2`.

Files touched (29): `CHANGELOG.md`; `app/package.json` + `package-lock.json`;
`app/src/components/brand/{DenseRow,NoteBlock,PulsingDot,SectionHead,SpecRow,
StatusDot,StatusIcon,ToolGroup}.tsx` + `{emphasis,labels}.{ts,test.ts}`;
`app/src/components/ui/{badge,button,checkbox,collapsible,input,scroll-area,
select,switch,table,tabs,toggle-group,toggle,tooltip}.tsx`;
`app/src/styles/index.css` (the `pulse-dot` keyframes).

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run
```
`tsc --noEmit`: clean, no output. `npx vitest run`: **959 passed (959)**,
101 test files — matches the implementer's and the dispatch's reported
numbers exactly. No cargo run (TypeScript lane, not applicable).

## Findings

| Severity | file:line | Finding | Fix |
| --- | --- | --- | --- |
| Minor | `CHANGELOG.md` (UI-2 bullet, parity-gaps sentence) | The brief ("Spec discipline") requires every parity gap be listed "with the task that should own it." Of the six gaps listed (`ColorGridPicker`, `StatusDropdownTrigger`, `GroupedChannelList`, `ModeAwareCheckbox`, `ChartContextMenu`/`ChartAction`, `BrandSheet`/`CollapsibleSection`), only the last two name an owning task (UI-11, UI-3). `ColorGridPicker`, `StatusDropdownTrigger`, `GroupedChannelList`, `ModeAwareCheckbox` have no lane assigned anywhere in `PLAN.md` either — a real gap in the lane plan, not just the report. | Not a blocker for UI-2 (the widgets are honestly listed, not silently dropped), but the lead should assign an owning task for the remaining four before the lanes that would need them (UI-6 Data most likely owns `GroupedChannelList`/`ModeAwareCheckbox`; `ColorGridPicker`/`StatusDropdownTrigger` have no obvious home in the current lane split) or note them in `TASKS.md`. |
| Minor | `app/src/components/ui/table.tsx:22` vs `app/src/components/brand/DenseRow.tsx:32` | Confirmed name collision: both export a component named `TableHeader` (one wraps `<thead>`, the other a `<div>` row for `DenseRow` lists). No file currently imports both — grepped the whole `app/src` tree, only the two definition sites reference the name — so it is latent, not live, exactly as the implementer flagged. | Recommend a standing alias rule for later tasks: `import { TableHeader as DenseTableHeader } from "@/components/brand/DenseRow"` wherever a page needs both the shadcn `table` header and the dense-list header side by side (most likely UI-6 Data, which uses `DenseRow` results groups next to a pinned header). Put this in UI-6's brief so the first real collision doesn't get resolved ad hoc. |

No other deviation found. Specifically checked and clean:
- **Colour discipline.** Grepped every new `.tsx`/`.css` file for hex/`rgb()`/
  `rgba()`/`hsl()`/`hsla()` literals: none outside `tokens.css`.
  `tokenSheet.test.ts` was not modified by this commit but its recursive
  `listFiles(SRC_DIR, [".css", ".tsx"])` scan already covers
  `app/src/components/ui/**` and `app/src/components/brand/**` — confirmed
  by re-reading the test file, not just assuming it. `SpecRow`'s inline
  `style` uses `var(--fg-faint)` in a `repeating-radial-gradient`, no literal.
  Grepped for `box-shadow`/`shadow-` across every changed file: zero hits.
- **R94 (`--accent` collision).** `emphasis.ts`'s `accent` branch resolves to
  `bg-brand-accent`/`text-brand-accent`/`border-brand-accent`, which
  `tokens.css`'s `@theme inline` maps to `--color-brand-accent: var(--accent)`
  (the real alert red); nothing in the diff emits a bare `bg-accent`/
  `text-accent`/`border-accent` class, which would have resolved to
  `--shadcn-accent` instead. `emphasis.test.ts`'s second test asserts this
  directly with a regex excluding `brand-accent` matches. Grepped the whole
  commit for `-accent` usages outside `brand-accent`: none.
- **Radii (decision 23).** `--radius` (7 px) on `button`, `input`, `select`
  trigger, `toggle-group`; `--radius-structural` (2 px) on `checkbox` and
  `select-item`; `--radius-card` (0 px + hairline) on `select-content` and
  `tooltip-content`. `table`, `badge` (pill, deliberately fully round per
  brief), `tabs`, `switch`, `scroll-area` have no competing radius family.
  No shadow anywhere (checked above); floating layers (`select-content`,
  `tooltip-content`) use `bg-surface-2` + `border-rule`, matching the
  Elevation rule.
- **Five `ButtonEmphasis` variants.** `emphasis.ts` maps `normal | accent |
  good | hivis | info` — a total function over the union (no `default`
  branch, so a sixth emphasis is a compile error, matching the brief's
  "compile error, not silent fallback"). `normal` filled = `bg-fg text-bg`:
  `--fg` is `#EFEAE0` (warm off-white) and `--bg` is `#121412` (near-black) —
  high-contrast, easily AA-legible, and matches "the one primary action per
  screen" language: this is a fair reading of "the brightest available
  surface" since idl0's own `QuietButton` normal-filled has no other
  candidate colour to reference (the direction file assigns no token to
  plain "normal"). Debatable, but the alternative (leaving `normal` filled
  uncoloured or falling back to a token that already carries semantic
  meaning) would be worse; no ruling needed unless the lead disagrees on
  sight.
- **`abbreviateLabel`.** `IMPERIAL` at `maxChars=8` → `IMP` (8 is not `< 8`,
  so it looks up the table); `SPEED` (5 `< 8`) unchanged; `SUSPENSION` (10,
  unknown) unchanged and reported by `unabbreviated`. The `<`/`>=` boundary
  is consistent between the two functions (checked by reading both bodies
  side by side, not just the tests) — a label of exactly `maxChars` length
  is treated as needing abbreviation in both, so there's no boundary case
  where one function acts and the other doesn't.
- **3 px selection bar.** Both `table.tsx`'s `TableRow` and
  `DenseRow.tsx`'s `DenseRow` use the identical technique: an always-present
  `border-l-[3px] border-l-transparent`, flipped to `border-l-good` via
  `data-[selected=true]`. Because the border width itself never changes
  (only its colour), there is no layout shift on selection — verified by
  reading the class list, not by rendering.
- **`cn` import hygiene.** Grepped every new file: every `cn` import is
  `from "@/lib/utils"`. `package.json`/`package-lock.json` carry no stray
  `cn` npm package — the CHANGELOG's own account (generator pulled in a
  `cn` package via a generated `import { cn } from "cn"`, rewired to the
  project's `@/lib/utils` `cn`, dependency dropped) matches what's actually
  in the lockfile.
- **`radix-ui` pin.** `"radix-ui": "1.6.7"` in `package.json`, no caret, and
  the lockfile's own top-level entry resolves to the same version.
- **Stripped animations.** `tooltip.tsx`'s `TooltipContent` and
  `select.tsx`'s `SelectContent` carry no `animate-in`/`fade-in`/`zoom-in`
  classes and no orphaned `data-[state=...]` rules that would only have
  applied to those removed classes — every remaining `data-[state=...]`
  selector in the diff (`checkbox`, `switch`, `tabs`, `toggle`,
  `toggle-group`) does real, still-visible work (checked/selected colour or
  position). No Radix primitive lost required plumbing: `Portal`,
  `Viewport`, `Provider`, `Indicator` are all still wired.
- **`TableHeader` collision** — see Minor above; confirmed via grep that no
  file imports both names yet.
- **Parity gaps cross-checked against the survey's twelve widgets** (§7):
  shipped — `MinimalSectionHead`→`SectionHead`, `SpecRow`, `DenseRow`/
  `TableHeader`, `QuietButton`→`button`, `BrandSegmented`→`toggle-group`,
  `ToolGroup`/`IconBtn`, `BrandChip`→`badge`, `StatusDot`, `StatusIcon`,
  `PulsingDot`; deferred — `StatusDropdownTrigger`, `CollapsibleSection`,
  `BrandSheet` (all correctly listed as parity gaps; `CollapsibleSection`
  and `BrandSheet` grouped under "UI-3 owns sheet" is slightly imprecise
  since `CollapsibleSection` isn't a sheet, but it's a cosmetic label issue,
  not a missing entry — folded into the Minor above rather than a separate
  line). `ColorGridPicker`, `GroupedChannelList`, `ModeAwareCheckbox` are
  from `widgets/` (non-brand, cross-tab), also honestly listed as gaps.
- **Generated vs. hand-edited.** All twelve requested shadcn components plus
  `toggle` (an undeclared but necessary dependency of `toggle-group`, noted
  honestly in the CHANGELOG as "thirteen files landed") are present under
  `app/src/components/ui/`; none of the excluded ones (`dialog`, `sheet`,
  `dropdown-menu`, `context-menu`, `popover`, `sonner`, `resizable`,
  `command`) were added.
- Nothing wired into a page (grepped `app/src/routes` and `app/src/App.tsx`
  for imports from `@/components/{ui,brand}` — none); nothing touched
  outside `app/src/components/{ui,brand}/**`, `app/src/styles/index.css`,
  `app/package.json`+lockfile, and `CHANGELOG.md`. NUL-byte check
  (`grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) is `0` on every file the
  commit touches.
- `CHANGELOG.md` bullet is accurate to the diff, including the `cn`-package
  and `toggle`-dependency notes.

## Verdict rationale

The restyle is faithful to `UI-DIRECTION.md` and `FLUTTER-UI-SURVEY.md`
value-for-value: tokens, radii, the R94 accent split, the reserved selection
bar, and the five-emphasis button all check out by reading the code, not by
trusting the report. Tests are real Arrange/Act/Assert with the exact names
the brief specifies and they assert what they claim (re-derived the
`abbreviateLabel`/`unabbreviated` boundary by hand rather than just running
the suite). The two findings are both Minor and non-blocking: the
`TableHeader` name collision is latent (nothing imports both yet) and the
implementer already flagged it for a ruling; the parity-gap task attribution
is an honest list with an incomplete "who owns this" column, which is a
planning gap more than an implementation one. Nothing needs reverting or
relaunching.

VERDICT: CLEAN
