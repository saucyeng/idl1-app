# L6 Task 10 — implementer brief (cursor readout on settle)

You are the implementer for L6 Task 10 of the idl1 rewrite — the pure
pixel→time conversion for the cross-channel cursor readout, and the
formatting rule that renders "no data" honestly instead of a frozen or zero
value. TDD, ONE commit, then report.

## Before anything else: verify Task 9 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need a commit adding `Notebook/model/rasterLayer.ts` (Task 9) and, before
it, `Notebook/model/viewport.ts`/`settle.ts` (Task 8, pan/zoom + the settle
debouncer wired into `ChartCell.tsx`). **If either is missing — STOP and
report** which one; this task's cursor fetch reuses Task 8's settle callback
exactly the way Task 9's raster fetch does, so read Task 9's actual landed
commit (not just its brief) to see the pattern it established for hanging a
second settle-bound fetch off the same callback.

Also read before writing anything:
- `app/src/ipc/cursor.ts` — already landed, this task's only IPC dependency.
  Note its doc comment already states ruling R31 verbatim: a channel reads
  `null` past its last recorded sample, not a frozen value.
- `Notebook/model/hover.ts` (Task 7) — the **other** read of tile data this
  lane has, used for the *hover* tooltip (min/max/mean over the hovered
  pixel column, no IPC per P2). This task is a different thing: the
  cross-channel numeric readout at the settled cursor position, which *does*
  call IPC (`cursorReadout`), once, on settle — read `hover.ts` anyway so you
  don't accidentally duplicate its pixel→column logic; this task's
  `cursorRequestFor` is pixel→**time**, not pixel→column-index, and the two
  are different quantities (a column spans multiple points at high tiers;
  a cursor position is one instant).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 10` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 746–781); C3 §3.7 "Cursor" in full
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  761–795); C3 §4 "Interaction budget" (lines 891–929 — quoted in
  `brief-task8.md`'s header if you want it restated); ruling R31
  (`runs/2026-09-03/decisions.md`, search "R31") — verbatim in
  `app/src/ipc/cursor.ts`'s own doc comment already, read it there.

## Interfaces (from the plan, Task 10)

- Produces:
  ```ts
  /** Converts a pointer's CSS-px x position within the chart to a t_us
   *  instant on the session's t axis (C1 §3.1), or null when pixelX falls
   *  outside the plotted area — in which case no cursor_readout request is
   *  issued at all (not a request for an out-of-range time). */
  function cursorRequestFor(
    viewport: Viewport,      // Task 8's type
    pixelX: number,          // CSS px, relative to the plot's left edge
    channels: string[]
  ): { tUs: number; channels: string[] } | null;

  /** One formatted row for the readout panel. value is null exactly when
   *  CursorReadout.values[channel] is null (R31: past the channel's
   *  recorded span, or the channel has no samples/no time axis) — never
   *  coerced to 0 or omitted for that reason. */
  interface ReadoutRow {
    channel: string;
    label: string;
    value: number | null;
  }

  /** Builds display rows from a CursorReadout plus a channel-id -> label
   *  map. A channel present in `readout.values` always gets a row (value or
   *  null); a channel absent from `readout.values` entirely (e.g. the
   *  caller asked for a channel this session doesn't have) is omitted
   *  rather than rendered as a blank/zero row — that is a different
   *  condition from "null because no data here" and must not look the
   *  same in the row list, but per the plan's own test list it is also not
   *  rendered at all; state in the doc comment which of those two
   *  interpretations you implemented if the distinction matters to your
   *  chosen ReadoutRow shape. */
  function formatReadout(readout: CursorReadout, labels: Record<string, string>): ReadoutRow[];
  ```
- Consumes `app/src/ipc/cursor.ts` (`cursorReadout`, `CursorReadout` — already
  landed), `Notebook/model/viewport.ts`'s `Viewport` (Task 8).

## The task

**Files:**
- Create: `Notebook/model/cursor.ts`, `Notebook/model/cursor.test.ts`,
  `Notebook/components/CursorReadout.tsx`
- Modify: `Notebook/components/ChartCell.tsx` (wire a settle-bound cursor
  fetch alongside Task 8's tile settle and Task 9's raster settle; render
  the readout)

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests** (`cursor.test.ts` — pure functions
  only; `CursorReadout.tsx` is rendering, not unit-tested)

  - `cursorRequestFor — a pointer inside the plot — converts pixel x to a t_us on the session axis`
  - `cursorRequestFor — a pointer outside the plot — returns null and issues no request`
  - `formatReadout — a channel whose value is null — renders as "no data", not as 0 (R31)`
  - `formatReadout — a channel with a value — renders the number with its channel label`
  - `formatReadout — a channel absent from the readout entirely — is omitted rather than rendered blank`

  5 tests, matching the plan's Step 1 list exactly. A/A/A with blank lines
  between sections. Note the third test's name says "renders as 'no data'" —
  since `ReadoutRow.value` is typed `number | null`, "renders as ‛no data'"
  means the row's `value` is `null` and it is the *component's* job (not
  unit-tested) to print that as text; the test itself asserts `value === null`
  on the returned row, not a rendered string — say so explicitly in the test
  file if the name would otherwise mislead a reader into expecting a string
  assertion.

- [ ] **Step 2: Implement and wire**

  `cursorRequestFor`: same linear pixel→time mapping style as Task 8's
  `panBy`/`zoomAt` (`viewport.startUs + (pixelX / viewport.pixelWidth) *
  (viewport.endUs - viewport.startUs)`), clamped-out (returns `null`) when
  `pixelX` is outside `[0, viewport.pixelWidth]`.

  `formatReadout`: a straight map over `Object.keys(readout.values)`
  (channels **present** in the response) to `ReadoutRow`, looking up each
  one's display label from the `labels` map (fall back to the raw channel id
  if a label is missing — document that fallback, don't throw). A channel
  the caller requested but that is entirely absent from `readout.values`
  (not just `null`-valued) never appears as a row.

  Wire `cursorReadout()` into `ChartCell.tsx`'s **existing** settle callback
  (from Task 8, already extended once by Task 9) — this is the third thing
  hanging off that one debounced callback: re-choose tier + `ensureTiles`
  (Task 8), raster re-fetch (Task 9), and now `cursorReadout` for whatever
  channels the cell currently plots, at the cursor's last-known pixel
  position (tracked as component state, updated on pointer move with **no**
  IPC — only the settle-time call reaches `cursorReadout`, per P2). If the
  pointer has left the chart (no last-known position) or there is no active
  session, skip the call entirely rather than calling with a stale/invalid
  time. Render `CursorReadout.tsx` as a small panel listing `formatReadout`'s
  rows, "no data" text where `value === null`.

  This is the standing operating-brief's IPC-effects rule again (§4): the
  *decision* of when to call `cursorReadout` (pointer over the chart? has a
  session? has settled since the last call?) is exactly the kind of logic
  that belongs in a pure, tested function if it's more than "settle fired,
  call it" — since `cursorRequestFor` already encodes "pointer outside the
  plot → don't call," check whether that's sufficient or whether you need a
  small additional pure gate (e.g. "no session bound") and, if so, test it
  alongside `cursorRequestFor` rather than burying it in the effect.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/cursor
  ```
  Expected: 5 passed, 0 failed.

- [ ] **Step 4: CHANGELOG**

  ```
  - **Cross-channel cursor readout on settle (L6 Task 10).** `cursor_readout` called once per settle (P2, C3 §4); a channel outside its recorded span reads null, never a frozen value (R31).
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/cursor.ts src/routes/pages/Notebook/model/cursor.test.ts src/routes/pages/Notebook/components/CursorReadout.tsx src/routes/pages/Notebook/components/ChartCell.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: cross-channel cursor readout on settle, null outside a channel's span
  ```

## Do not

- Do not call `cursorReadout` from any pointer-move handler or
  `requestAnimationFrame` callback — settle only (P1, P2). A reviewer will
  grep `onPointerMove`/`onWheel`/`onTouchMove`/`requestAnimationFrame` in the
  diff for a reachable `cursorReadout`/`invoke(` call.
- Do not conflate this task's cursor readout with Task 7's hover tooltip —
  hover reads tile column stats with zero IPC on every move; this task fires
  once on settle for the cross-channel numeric panel. Do not remove or
  modify Task 7's `hoverAt`/hover rendering path.
- Do not render `0`, `"—"`, or a blank cell for a `null` value in a way that
  is visually indistinguishable from a real `0` reading — R31's whole point
  is that a dropped-out sensor must look dropped-out, not zero.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol, with units (`pixelX` in CSS px,
`tUs`/`startUs`/`endUs` in µs); `// TODO(idl0):` never bare `// TODO`; A/A/A
tests with blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(expect 5 passed); whether you needed a pure gate function beyond
`cursorRequestFor`'s own null-outside-plot check to decide when to call
`cursorReadout` (state which, or say it was unnecessary and why); how you
render `value === null` in `CursorReadout.tsx` (the exact text/markup);
confirmation no `cursorReadout`/`invoke(` call is reachable from
`onPointerMove`/`onWheel`/`onTouchMove`/`requestAnimationFrame` (grep it
yourself, paste the result); per-step done/deviated; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
