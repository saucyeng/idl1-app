# Review: chrome-layer 377a063 (R221.1 — one chrome layer, one content container)

Commit: `377a063da5d61f58efa5e0a310f3055c6d918680` on branch `chrome-layer`
Files touched: `CHANGELOG.md`, `app/src/routes/pages/Notebook/components/NotebookToolbar.tsx`,
`app/src/routes/pages/Notebook/index.tsx`, `app/src/shell/ActivityBar.tsx`,
`app/src/shell/AppShell.tsx`, `app/src/shell/BottomBar.tsx`, `app/src/shell/Sidebar.tsx`,
`app/src/shell/StatusBar.tsx`, `app/src/shell/TimelineSlotRow.tsx` (new),
`app/src/shell/TitleBar.tsx`, `app/src/shell/ToolbarSlotRow.tsx`,
`app/src/shell/stackingLayers.test.ts` (new), `app/src/shell/stackingLayers.ts` (new),
`app/src/shell/timelineSlot.ts` (new), `app/src/styles/index.css`, `app/src/styles/tokens.css`,
`runs/2026-09-06/ui/UI-DIRECTION.md`.

## Test command and result

Per dispatch, gates already green (`npx tsc --noEmit` exit 0; `npx vitest run` 235 files /
2456 tests, baseline 234/2446; `npx vite build` exit 0) were not rerun. Ran the scoped
follow-up permitted by the dispatch:

```
npx vitest run src/shell   (from app/)
→ Test Files  27 passed (27)
→ Tests       244 passed (244)
```//
Non-zero passed count confirmed for the new `stackingLayers.test.ts` (and the rest of `shell/`).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Notebook/components/NotebookToolbar.tsx:300-305` | The component's doc comment still says, unchanged by this commit: "this row needs `relative` + an explicit `z-index` and an opaque background, or the sandbox iframe host … paints over it." The very same commit deletes exactly that (`relative z-10`) from the row two lines below the closing `*/`. The comment now describes behaviour the code no longer has, in the same file, same commit. | Rewrite the "Layer order" paragraph to say the row no longer needs its own z-index — it inherits `shell-chrome` from its `ToolbarSlotRow` wrapper — and point at `shell/stackingLayers.ts` instead of the retired per-element story. |
| Important | `app/src/routes/pages/Notebook/index.tsx:3902-3911` | The sandbox-iframe-host comment still reasons "…why the toolbar's `z-10` — not lowering this `0` — is what keeps a scrolled chart from painting over it," and points at `toolbarElement`'s "layer-order comment above" for the explanation. Both referents are gone: the toolbar's `z-10` was deleted by this same commit, and the toolbar's own comment (see row above) was left stale rather than rewritten. A reader of this file, which this commit otherwise treats carefully (the new `shell-content` comment in `AppShell.tsx` is accurate), is given a false account of why the chart no longer paints over chrome. | Replace the "toolbar's `z-10`" sentence with the real mechanism: the fixed host is a descendant of `.shell-content` (`isolation: isolate`), so it is confined to that stacking context and cannot out-paint any `shell-chrome` region regardless of its own `zIndex: 0`. |
| Minor | dispatch vs. commit message | The review dispatch describes the patches being deleted as "R161/R216"; the commit itself (and git history: `995c620` "top bar gets the toolbar row's stacking treatment (R209.1)", the R161 toolbar hoist) attributes them to R209 (title bar) and R161 (toolbar row). The code correctly deletes both actual patches (`TitleBar.tsx`, `NotebookToolbar.tsx`) regardless of the label used to describe them. Recorded for the ledger, not a code defect. | None needed; note for whoever reconciles ruling numbers. |

No Critical findings. No functional or stacking-order defect found — see reasoning below.

## Verification detail

**1. Does the fix work?** Traced the DOM ancestry from `AppShell.tsx`: `TitleBar`, the
`ActivityBar`/`Sidebar`/editor-column row, and `StatusBar`/`BottomBar` are children of plain
flex wrappers that declare no `position`, `transform`, `filter`, `contain` or `opacity` —
none of them create a stacking context. That means `TitleBar`, `ActivityBar`, `Sidebar`,
`ToolbarSlotRow`, `TimelineSlotRow`, `StatusBar`/`BottomBar` (all `shell-chrome`,
`position: relative; z-index: 1`) and `.shell-content` (`isolation: isolate`, no explicit
z-index) are all siblings in the *stacking-context tree*, even though several are not DOM
siblings. Per the CSS2.1 Appendix E painting order, stacking contexts with `z-index: auto`
(step 6, `.shell-content`) always paint before positioned descendants/contexts with a
positive `z-index` (step 7, every `shell-chrome` region), independent of DOM order. The
sandbox host (`position: fixed; inset: 0; zIndex: 0`, `Notebook/index.tsx:3912`) is a
descendant of `.shell-content`; `isolation: isolate` confines its stacking — including for a
`position: fixed` element — to that ancestor's stacking context (stacking-context assignment
is independent of containing-block assignment), so it can never reach the chrome layer. Every
chrome region has an opaque `bg-surface` background and the regions tile the window with no
gaps, so nothing needs clipping for this to look correct. Reasoning checks out; no bug found.

**2. `isolation: isolate` vs. `contain: paint`.** Verified against `ChartCell.tsx:579-580`:
`sendLayout` computes `frame.getBoundingClientRect()` — a viewport-relative rect — and hands
it straight to the sandbox to position the per-cell container inside the fixed host
(`Notebook/index.tsx:3912`, `position: fixed; inset: 0`). `contain: paint` (like `contain:
layout`, `transform`, `filter`, `perspective`, `will-change`) does make its element the
containing block for `position: fixed` descendants, which would make the host's `inset: 0`
resolve against `.shell-content`'s content box rather than the viewport — offsetting every
chart iframe by the title bar's and activity bar's own size while `sendLayout`'s rects stay
viewport-relative. `isolation` is not one of the properties that creates a containing block
for fixed descendants, so it avoids that offset while still creating the stacking context the
fix needs. The lane's stated reason is correct and the deviation from the ruling's first-listed
option is justified — R221.1 offered either explicitly ("`contain: paint` (or `isolation:
isolate`)").

**3. Timeline strip move.** `timelineElement` (`Notebook/index.tsx:3642-3650`) closes over
`windows`, `sessionDetailsByWindow`, `sessionSpanUsByWindow`, `sharedViewport`, `appDispatch`
— all declared well above (lines 409-607) — with the exact same props the old inline
`<TimelineStrip>` passed. It is gated `routeVisible && timelineSlotNode !== null` /
`routeVisible && timelineSlotNode === null`, the identical pattern already used for
`toolbarElement`/`toolbarSlotNode`, so a hidden Notebook tab does not leak its timeline strip
into the shared shell band (R93 stays satisfied: every route stays mounted, but only the
visible one portals). `TimelineSlotRow`/`timelineSlot.ts` mirror `ToolbarSlotRow.tsx`/
`toolbarSlot.ts` exactly (publish/subscribe convention, `useSyncExternalStore`). No other
call site referenced the strip's old position in the page's flex column — confirmed no other
match for `TimelineStrip` in the diff or file outside the relocated JSX.

**4. Completeness / CLAUDE.md.** `overflow: hidden` is declared on `.shell-content`
unconditionally (both axes); this is consistent with the ruling's "the axis it does not
scroll" since the content container itself scrolls on neither axis (the CSS comment states
"the panes inside it do"), and the ruling's "the axis it does not scroll" was written for the
single-scroll-axis case, not violated here. `stackingLayers.ts` carries a doc comment on every
exported symbol, units are not applicable (no numeric-with-unit values beyond the documented
`CHROME_Z_INDEX`), no `unwrap`-equivalent/untyped errors introduced, no `// TODO` added. Test
names in `stackingLayers.test.ts` follow `thing — condition — result`
(e.g. "layers — every chrome region — declares the one chrome z-index"); each test is a
single expect-focused assertion without an explicit Arrange/Act/Assert blank-line split, but
the bodies are one-liners where that structure would be vacuous — acceptable for this style of
invariant test, consistent with existing `tokenSheet.test.ts` referenced in its own comment.
`CHANGELOG.md` and `UI-DIRECTION.md` are both updated (spec-during, declared in the UI-DIRECTION
addition). No cargo/Rust files touched; no cargo run.

## Verdict rationale

The stacking-context reasoning behind both the chrome-above-content layering and the
`isolation` vs. `contain: paint` choice is correct CSS and was verified against the actual
DOM ancestry and `ChartCell.tsx`'s `sendLayout`, not just taken on the lane's word. The
timeline-strip relocation preserves props and scope and reuses an established slot pattern.
The one real defect is leftover, now-false doc-comment prose in two places (`NotebookToolbar.tsx`
and `Notebook/index.tsx`) that still describes the deleted per-element z-10 mechanism as
current — exactly the kind of stale reasoning this ruling exists to retire, left behind in the
same commit that removed the code it describes. That is a documentation correctness bug, not a
functional one, and is fixable without touching the model or CSS.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\chrome-layer\runs\2026-09-11\review-chrome-layer.md
COUNTS: critical=0 important=2 minor=1
NOTES: Two doc comments (NotebookToolbar.tsx, Notebook/index.tsx) were left describing the deleted per-element z-10 mechanism as still in effect; the stacking-context and isolation-vs-containment reasoning itself checks out.
