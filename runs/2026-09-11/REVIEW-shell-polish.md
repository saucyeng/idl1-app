# Review: shell-polish (R216)

Commits reviewed: `404b1c4`..`467d97b` (`git diff main...shell-polish`).
Files touched: `CHANGELOG.md`, `app/src-tauri/capabilities/default.json`,
`app/src-tauri/tauri.windows.conf.json`,
`Notebook/components/{CellFrame,NotebookToolbar}.tsx`, `Notebook/index.tsx`,
`Notebook/model/{denseMode,plotChrome}.ts(+.test.ts)`,
`shell/{AppShell,TopBar,WindowControls}.tsx`,
`shell/{toolbarLayout,windowChrome}.ts(+.test.ts)`.

Test command: `npx tsc --noEmit` (from `app/`) — clean, no output.
`npx vitest run` (from `app/`) — `Test Files 212 passed (212)`, `Tests 2174
passed (2174)`. Matches the lane's reported baseline.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `Notebook/index.tsx:2532-2570` (frame callback) + `CellFrame.tsx:279-280` | The Alt+C "Show code" shortcut (R216 item 2) is wired as `onKeyDown` on the cell's outer `<div>`, but that div has no `tabIndex` and nothing else in a settled, non-error chart cell is focusable (the ✕ glyph is `tabIndex=0` only when `glyph === "cross"`). A keydown only bubbles from a focused descendant, so for the common case (settled/spinner plot) Alt+C never reaches the handler — the brief's "and to a keyboard shortcut" requirement is unmet in practice. | Give the cell frame (or the plot wrapper) `tabIndex={0}` so it can receive focus (on click/select), or attach the shortcut at a document/notebook-level listener keyed to the selected cell. |
| Important | `Notebook/index.tsx:2532` (`cellTitle = cellLabelFromBody(...)`), `plotForm/types.ts` | R216 item 2 says the plot title shows when the cell has `# label:` **or** the plot form's title field is set. `plotForm/types.ts` has no title field at all (only `x.label`/`y.label`), and the implementation only ever supplies `cellLabelFromBody`'s `# label:` result — the "plot form's title field" half of the OR is silently dropped, with no note in the brief response, CHANGELOG, or a "no spec change needed" callout explaining the gap. Either the plot form needs a title field or the brief's second clause needs an explicit ruling that it doesn't apply. | Add a one-line note (CHANGELOG or a comment on `plotChrome.ts`) stating the plot form carries no separate title field today, so `# label:` is the only source — or add the field if it was meant to exist. |
| Minor | `NotebookToolbar.tsx` `useGroupWidths` (commit function, ~line 200) | `labelStates.current` is one value per group id, written synchronously by the callback ref at render/commit time, and read later by the deferred (`requestAnimationFrame`) commit that assigns a pending `ResizeObserver` measurement to `labelledWidth`/`compactWidth`. If the group's label state flips (labelled↔compact) between the `ResizeObserver` callback firing and the next `rAF`, the stale measurement can be filed under the new state instead of the state it was actually measured in. Low probability (both are driven by the same `width`/`specs` render), but the doc comment's claim that "a width always lands in the field for the row that produced it" is not fully guaranteed. | Key `pending`/committed values by `${id}:${labelled}` captured at measurement time (store the label state alongside the width in the RO callback) rather than re-reading `labelStates.current` at commit time. |
| Minor | `CellFrame.tsx` `denseChromeMode` path (via `Notebook/index.tsx`) | In dense mode, `math`/`table` cells also get `chrome="overlay"`, so the ✕/spinner/✓ glyph absolutely-positions itself at `top-1 left-1` over whatever content those cells render (a short text/table), with no test or brief confirmation of how that reads visually. Spec-compliant per the literal R216 item 3 wording ("chrome overlay-only" for every kind), but worth a visual sanity check before merge since it wasn't called out. | None required if intentional; note the small-cell overlay behaviour in CHANGELOG for completeness. |
| Minor | `capabilities/default.json` | `core:default` already includes broad window permissions in some Tauri 2 builds (varies by version) — could not verify against `gen/schemas/desktop-schema.json` in a read-only pass; the five explicit `core:window:allow-*` permissions match R216 item 1's list exactly, which is what matters. No action needed, flagging only that the schema itself wasn't cross-checked (no cargo run). | — |

## Notes on other checks

- **R216 item 4 (toolbar overlap):** `toolbarLayout.ts`/`withMeasuredGroupWidths`/`inlineGroupSpans` and their tests correctly model the fix; the DOM now renders `shrink-0` boxes fed real `ResizeObserver` widths, and `toolbarLayout.test.ts` asserts no-overlap at 1100/1300/1600 px plus a regression test against the stale-nominal-widths bug. Sound.
- **R216 item 1 (title bar):** `decorations: false` is correctly scoped to `tauri.windows.conf.json` only (not the base `tauri.conf.json`), which is the correct way to satisfy both "Windows first" and "macOS/Linux keep native decorations" — a defensible, better reading of the brief's literal text. Double-click-to-maximize is not separately wired in JS; it relies on Tauri's built-in `data-tauri-drag-region` double-click behaviour, which is correct and not a gap.
- **R216 items 2/3 pure modules:** `plotChrome.ts`/`denseMode.ts` are pure, dependency-light, doc-commented, and their tests (`plotChrome.test.ts`, `denseMode.test.ts`) are AAA-structured with `thing — condition — result` names; sampled several and they assert what they claim.
- No `cargo fmt`/cargo run in this lane's diff (TS-only + Tauri config, matches gate note that `cargo check -p app` is optional/deferred).
- CHANGELOG entries present for all four R216 sub-items; no AI attribution trailers in the five commits.

## Verdict rationale

The core engineering (measured-width toolbar layout, pure chrome/dense
modules, capability/config scoping) is solid and well-tested, and both gate
commands pass with the expected counts. However, the keyboard shortcut for
"Show code" is not actually reachable in the common case, which is a
functional miss against an explicit brief requirement, and the "plot form's
title field" half of the title-display OR condition was dropped without any
acknowledgment — a silent deviation. Both are fixable without a redesign.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\shell-polish\runs\2026-09-11\REVIEW-shell-polish.md
COUNTS: critical=0 important=2 minor=3
NOTES: Alt+C shortcut is unreachable for most chart cells (no focusable target), and the "plot form title field" half of R216 item 2's title condition was silently omitted.
