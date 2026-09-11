# Review: shell-scroll @ e976424

Commit: `e9764245ea98f797128454f5d9f64e69412395f4` on branch `shell-scroll`
("shell: the window is a frame, not a page -- nothing above the content
scrolls (R221.1)")

Files touched: `CHANGELOG.md`, `app/src/routes/pages/Notebook/index.tsx`,
`app/src/shell/AppShell.tsx`, `app/src/shell/GlobalErrorBanner.tsx`,
`app/src/shell/stackingLayers.test.ts`, `app/src/shell/stackingLayers.ts`,
`app/src/styles/index.css`, `app/src/styles/tokens.css`.

## Test command and result

`npx vitest run src/shell` (from `app/`, as authorized in the dispatch):

```
Test Files  27 passed (27)
     Tests  250 passed (250)
```

Non-zero `passed` count — gate satisfied. Full-suite claim (235 files / 2462
tests) taken as reported, not rerun, per instructions. `tsc --noEmit` and
`vite build` claims likewise not rerun.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | app/src/routes/pages/Device/index.tsx:368 | Device's route root (`mx-auto flex max-w-[480px] flex-col gap-4 p-4`) has no `h-full`/`overflow-auto` of its own, unlike Data (`min-h-0 flex-1 overflow-y-auto`, index.tsx:647), Settings (`overflow-auto`, index.tsx:176/178) and Notebook (multiple `overflow-auto` panes). `.shell-content`'s `overflow: hidden` (pre-existing from `377a063`, unchanged here) is the nearest ancestor that clips overflow, and the flex chain above it is all `min-h-0 flex-1`, so Device content taller than the available column (hero card + WiFi controls + files list, on a short window) is clipped with no scrollbar and no way to reach it. This exact clipping mechanism predates this commit (`.shell-content { overflow: hidden }` landed in `377a063`), so this commit does not *introduce* the bug — but the dispatch explicitly asked this lane to walk every route and confirm each has its own scroll container, and the commit's own doc comment in `AppShell.tsx` (route content "is the only thing that scrolls") states an invariant that Device does not satisfy. Not caught by any of the new tests, which only check the shell frame's source text, not that every route supplies a scrolling container. | Give Device's root (or an inner wrapper) `h-full overflow-y-auto` like its sibling routes, or file a follow-up ruling if intentional. |
| Minor | app/src/shell/AppShell.tsx:289 | Doc comment inside the `shell-content` block still says "the sandbox iframe host's `zIndex: 0`" — stale as of this commit, which changed that host to state *no* z-index (`Notebook/index.tsx`). The surrounding comment wasn't touched even though the fact it states was, in the same commit. | Update the example to say "no z-index" or drop the specific value. |
| Minor | — | `h-[100dvh]` requires dvh-unit support (Chromium ≥108, WebKit ≥15.4/16). Fine for current Tauri WebView2/WKWebView targets but undocumented as a floor; worth a one-line note if the app's minimum OS/webview version is ever pinned lower. | No action needed now; flag for the target-matrix doc if one exists. |

## Verification detail (for the record, not separate findings)

1. **Route scrolling walk.** Data (`overflow-y-auto` on its list container)
   and Settings (`overflow-auto` at two breakpoints) each rely on their own
   internal scroll container, unaffected by the html/body/#root pin — they
   were already doing this before the commit, since `AppShell`'s flex chain
   (`min-h-0 flex-1` at every level, `.shell-content { overflow: hidden }`)
   already bounded them. Notebook's editor/register panes are `h-full
   overflow-auto`. Device is the exception (Important finding above).

2. **Sandbox host `zIndex: 0` removal.** Verified against the CSS2.1/CSS3
   painting-order model: step 6 ("child stacking contexts with stack level
   0 and positioned descendants with stack level 0") covers both explicit
   `z-index: 0` and `z-index: auto` on a positioned element identically,
   and that step paints *after* step 3 (non-positioned in-flow content,
   i.e. cell text) and *before* step 7 (explicit positive z-index). So the
   claim "a positioned element paints above static in-flow content in its
   stacking context whatever its z-index, `auto` included" is correct, and
   removing the explicit `0` changes nothing relative to CellFrame's
   `absolute z-10` overlays, `CursorCard`'s `z-10`, or Data's `sticky
   top-0 z-10` — all three are explicit positive z-index and stay above the
   sandbox host either way (step 7 > step 6, before and after this change).
   `.shell-content`'s pre-existing `isolation: isolate` is confirmed to be
   the sole thing scoping any of this away from chrome (`.shell-chrome`'s
   `z-index: var(--z-chrome)` sits outside that stacking context). No
   `zIndex` is set on the iframe children `sendLayout` positions inside the
   host, so the loss of a local stacking context there (auto vs. 0 differ
   in whether the element itself becomes a stacking-context root) has no
   observable effect on this codebase.

3. **`--z-global-banner: 2` vs. chrome's `1`.** `main.tsx` confirms
   `GlobalErrorBanner` is a genuinely separate `ReactDOM.createRoot` over a
   `<div>` appended as a sibling of `#root` on `document.body` — not a
   child or portal target of `#root`. Neither `#root` nor that sibling div
   establishes a new stacking context (no `position`, `transform`, `filter`,
   `opacity<1`, `isolation`, or `contain` on either), so both participate in
   the document's root stacking context together, where explicit z-index
   ordering (`--z-chrome: 1` vs. `--z-global-banner: 2`) decides paint order
   regardless of DOM position. `2` wins. Pinning `#root` (and `body`) to
   `overflow: hidden` does not clip the banner: the banner is
   `position: fixed`, and neither `#root` nor `body` establishes a new
   containing block for fixed descendants (no transform/filter/will-change/
   contain on either) — an `overflow: hidden` ancestor does not clip a
   `position: fixed` element it isn't the containing block for. Both
   claims check out.

4. **`h-[100dvh]`/`w-full`.** `w-full` is correct: `#root` has no explicit
   width, so it defaults to the block width of `body` (effectively 100%);
   `w-screen` (100vw) would have counted the scrollbar's width, which was
   the bug being fixed. `100dvh` support flagged as a Minor note above, not
   a defect.

5. **CLAUDE.md compliance.** Doc comments present and substantive on
   `SHELL_ROOT_SCROLLS`/`SHELL_REGION_SCROLLS`/`scrollingRegions` and the
   CSS rules added. New tests in `stackingLayers.test.ts` follow
   `thing — condition — result` naming and have a blank line between
   arrange and assert in every case (some are single-expression
   arrange+assert with no separate "act", consistent with the file's
   pre-existing style for pure-model assertions). `CHANGELOG.md` entry
   present, correctly tagged `[no-docs]` per the established R223
   convention (not an invented tag). No `unwrap()`/Rust surface (TS/CSS
   only lane). Commit message has no AI attribution trailer, single logical
   commit.

6. **Scope.** The two `z-10`/`z-[…]` patches deleted here (`GlobalErrorBanner`'s
   `z-[9999]`, the sandbox host's `zIndex: 0`) are exactly the two not
   already deleted by the merged `0f84a2b` (which removed `TitleBar`'s and
   `NotebookToolbar`'s). No unrelated files touched; no scope creep found.

## Verdict rationale

The core scroll-containment mechanism (html/body/#root pin, `100dvh`/
`overflow-hidden` root, invariant tests) is implemented correctly and
verified against the actual paint/stacking-context model rather than taken
on faith — the two riskiest claims in the commit message (z-index removal
safety, banner layering) both hold up under the CSS spec's painting-order
rules and the actual DOM structure in `main.tsx`. The one real gap is that
Device's route content has no scroll container of its own and can be
silently clipped under the now-strictly-enforced `overflow: hidden` chain;
that specific clipping mechanism predates this commit, but this lane was
explicitly dispatched to check every route for exactly this and the gap
stands unaddressed and untested. That is a functional regression risk
(unreachable UI, not a crash) rather than a spec violation of the ruling
itself, and is fixable as a small follow-up without touching this commit's
actual scroll/stacking model — hence NEEDS_FIXES rather than a rework.

VERDICT: NEEDS_FIXES
OUTPUT: C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/shell-scroll/runs/2026-09-11/review-shell-scroll.md
COUNTS: critical=0 important=1 minor=2
