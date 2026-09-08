# W3.2 lane T — time, cursors and playback: plan

Worktree `w32-time`, branch `w32-time` from main `d51243f`. Planning only; no
code, no build. Specification: `runs/2026-09-07/ui/UI-DIRECTION-2.md`
decisions **51–57** and **61**, round-1 decisions **18**, **25**, **27**,
**29**, **31**. Rulings **R115**, **R121**, **R123**, **R124**, **R131**,
**R132**, plus **R62**, **R69**, **R99**, **R117**, **R120**, **R126**,
**R127**, **R128**, **R133**.

Spec discipline: **spec-during**. This lane changes shipped chart behaviour
(the drag verb, the viewport's ownership, the playback span) and adds a
worksheet-level control surface; the SPEC section lands in the same PRs as
the code, per CLAUDE.md §6. No C3 command is added (see §5 Q5, Q8).

---

## 1. Survey — what exists, and what does not

### 1.1 Cursor

| Thing | Where | State |
|---|---|---|
| Shared worksheet cursor time | `Notebook/index.tsx:441-443` — `manualCursorTUs: bigint \| null` + `playback.tUs`, merged into `sharedCursorTUs` | **exists**, absolute session-relative µs |
| Cursor line drawn per chart | `components/ChartCell.tsx:784` `cursorLinePx = pixelXForTUs(liveViewport, Number(cursorTUs))` | **exists**, host-drawn |
| time → px | `interaction/cursorFollow.ts:26` `pixelXForTUs` (returns `null` off-viewport) | **exists** |
| px → time | `model/cursor.ts:44` `cursorRequestFor` (returns `null` off-viewport) | **exists** |
| Click pins the cursor | `ChartCell.tsx:655-670` — pointerup within `CLICK_MAX_MOVEMENT_PX` of pointerdown calls `onSetCursor` | **exists** (decision 51's second half) |
| Cursor **follows the pointer** without a click | — | **DOES NOT EXIST.** A hover move only feeds the per-cell readout settle (`ChartCell.tsx:620` `cursorDriverRef.current.notify`). The shared cursor moves only on click or playback. Decision 51's first half is unbuilt. |
| Unpin gesture | `interaction/chartActions.ts` / `keymap.ts` expose a clear-cursor action; `onClearCursor` at `index.tsx:1829` | **exists** |
| Settle-time numeric readout | `model/cursor.ts` (`formatReadout`, `ReadoutPanelState`), `model/cursorReadoutDriver.ts`, `components/CursorReadout.tsx` (68 lines), R62's own 150 ms pointer-stop settle | **exists**, but it is **per chart cell**, keyed by channel id, single-window, and calls `cursor_readout` over IPC. Decision 55's card is one card at the cursor, one row **per series and per window**, on the interaction path. |
| Per-pointer-move tooltip with no IPC | `model/hover.ts` `hoverAt` reads the decoded tile column | **exists** — this is the P2-compliant precedent for a hover-rate readout |

### 1.2 Viewport, tiles and gestures

- `model/viewport.ts` — `Viewport {startUs, endUs, pixelWidth}`, `panBy`,
  `zoomAt`, `clampTo`, `transformFor`. Pure, complete, well-tested.
- `interaction/rectZoom.ts:19` `zoomToRect(viewport, x0, x1)` — composes
  `zoomAt` + `panBy`. **exists**.
- Gesture verbs today (`ChartCell.tsx:579-706`):
  - plain left-drag → **pan** (`panBy` per frame, `applyViewport`)
  - **shift**-left-drag → rectangle **zoom** on release (`zoomToRect`)
  - left-click (movement ≤ `CLICK_MAX_MOVEMENT_PX`) → pin cursor
  - wheel → `zoomAt` at the pointer
  - right-click → `ChartContextMenu`
  - keys → `interaction/keymap.ts` + `chartActions.ts`
  Decision 56 says **plain drag zooms**. The modifier is therefore inverted
  from what ships, and the pan verb is left unnamed by the decision (§5 Q2).
- **Each chart owns its own viewport.** `index.tsx` holds
  `chartWindows: Map<cellId, {viewport, tiles}>`; `ChartCell` receives
  `viewport` as a prop and commits back through `onViewportSettled`
  (`index.tsx:1770-1839`). There is **no worksheet-level X range** — decision
  52's "X range is shared by every chart" **does not exist**.
- Settle: `model/settle.ts` `makeSettle`, `SETTLE_DELAY_MS` 150 ms in
  `ChartCell.tsx`; the fetch/tier re-selection runs only in the settle
  callback (P3/P4). A gesture frame updates local state and posts
  `transform` — never IPC.

### 1.3 Window-relative mapping (R131 Q2)

`model/viewportWindows.ts` — 2 functions, no React, no IPC:

- `mapViewportToWindow(viewport, primaryStartUs, window): AbsoluteSpan | null`
  — re-bases the primary window's viewport onto another window by *offset
  from each window's own start*, clamped to that window's end, `null` when
  empty. This is exactly decision 55's "overlaid windows align by
  window-relative time".
- `resolveWindowSpan(span, detail): AbsoluteSpan | null` — `"lap"` looks up
  `detail.laps`; `"range"` is `[t0_us, t1_us)` verbatim; **`"session"`
  returns `{startUs: 0, endUs: Infinity}`.**
- Consumed at `model/channelBindDriver.ts:360` inside `runChannelSettle`.

**R131 Q2 confirmed against R115:** a boundary drag mints a `range` window,
whose `resolveWindowSpan` arm is the one that needs no lookup at all — the
strip hands `{kind:"range", t0Us, t1Us}` straight into the object S1 already
resolves, fetches and colours. No new resolution path.

### 1.4 Selection

`app/src/state/selection.ts` — `SelectionWindow {sessionId, span, colour}`,
`Span = session | lap | range`, `windowKey`/`windowsKey` (identity excludes
colour, includes list order), `nextWindows(list, window, modifier)` with
`"replace" | "add" | "toggle"`, `assignColour`, `describeWindow`.
`AppState.tsx:14` `type Selection = SelectionWindow[]`, `initialSelection =
[]`, actions `SET_WINDOWS` / `TOGGLE_WINDOW` / (colour by index). Ordered;
first entry is the "primary window" by convention.

### 1.5 Playback

- `interaction/playback.ts` — `PlaybackState {tUs: bigint, playing, speed}`,
  `tick(state, elapsedMs, spanUs)` clamping and stopping at `spanUs[1]`,
  `togglePlay`, `shouldRenderPlaybackTransport`, `formatPlaybackTime`. Pure,
  no timer, no DOM.
- `interaction/cursorFollow.ts:56` `advanceViewportByTime(viewport, deltaUs)`
  — pans a chart by the elapsed session time, keeping the cursor fixed on
  screen. This is **decision 57's second mode** (cursor fixed, charts pass
  under it), already built.
- `index.tsx:456-469` — the RAF loop, gated on `primeState.running` (R95);
  `index.tsx:471-479` pauses on hide.
- `interaction/PlaybackTransport.tsx` — play/pause + `mm:ss.mmm`, portalled
  into `TopBar`'s `playback-transport-slot`.
- `ChartCell.tsx:535-577` — the shared-cursor effect: when `playing`, a
  `cursorTUs` change pans this cell's viewport through `advanceViewportByTime`
  + `clampTo`; when not playing, it does not.

**Not built:** speed is fixed at `1` and nothing writes `playback.speed`
(decision 57 wants selectable speeds); the playable span is
`[0n, sessionSpanUs]` (`index.tsx:463`) — the **whole session**, not the end
of the lap; and the first mode (window **scrolls when the cursor reaches its
edge**) does not exist — the only implemented behaviour is the second,
cursor-fixed one, and it is unconditional rather than user-selectable.

### 1.6 Rendering, the sandbox, and what the host can address

- Cell **output renders inside the sandbox iframe** (R69.1); `cellResult.html`
  was removed and the sandbox reports `cellRendered {cellId, heightPx}`.
- The sandbox is origin-isolated, no `allow-same-origin` (design §6, R69).
  The host cannot touch its DOM, and must not.
- The host keeps **gestures, the tile cache, the settle-bound fetch, the
  cursor readout, and the Properties/Code panes** (R69.2); during a gesture it
  posts `transform {cellId, translateXPx, scaleX}` per frame and
  `layout {cellId, top, left, width}` on re-layout.
- `sandbox/sandboxCanvas.css` — the iframe is `position: fixed; inset: 0`,
  sized to the browser viewport so `getBoundingClientRect()` rects line up
  1:1 with `layoutMessage` coordinates. `:root, body { background:
  transparent }`.
- **The iframe is `pointer-events: none`** (`ChartCell.tsx:265-267`,
  `index.tsx`): the host's `ChartCell` frame sits *over* the sandbox-rendered
  picture, shows it through, and captures every pointer, wheel and key event
  itself. **This is the whole answer to §2.**
- Protocol surface (`host/protocol.ts`): host→sandbox `init`, `setCells`,
  `setHostVar`, `evalInline`, `transform`, `layout`, `ping`, `teardown`;
  sandbox→host `ready`, `pong`, `cellRendered`, `cellError`, `inlineResult`,
  `spanError`. `HostVarPayload` carries `w` (per-sample window index) and a
  `windows: WindowDescriptor[]` descriptor with `{sessionId, span, colour,
  label}` (R127/R129).
- **What the host cannot address:** anything inside a rendered Plot — its
  margins, its actual plotting rectangle, its scales, its marks. The host
  assumes the plot area is `originPx: 0, pixelWidth: width`
  (`ChartCell.tsx:632` `HoverGeometry`). That assumption is the one real
  crack in a pixel-exact cursor (§5 Q8).

### 1.7 Explicitly does not exist

1. A worksheet-level shared X range.
2. A master timeline strip, in any form.
3. A pointer-following (unpinned) cursor.
4. A cursor value card with one row per series **and per window**.
5. Selectable playback speed, or a UI that writes `playback.speed`.
6. Stop-at-end-of-**lap** (playback stops at end of session).
7. The scroll-at-edge playback mode, or any mode switch.
8. Any notion of **distance** on X anywhere in `app/src`
   (`Settings/units.ts` is unit *display*, unrelated), and no worksheet-level
   setting of any kind — `notebookPrefs.ts`'s `idl1.notebook.ui.v1` holds
   Notebook UI prefs but nothing worksheet-scoped.
9. Per-window session spans: `sessionSpanDriver` resolves the **primary**
   window's span only; every other window's `"session"` end is `Infinity`.

---

## 2. The architectural question: where does cursor state live, and how does a
pointer move in one chart reach the others?

**Answer: entirely in the host realm, over a plain in-host subscription. No
new sandbox message, no postMessage on the pointer path, no IPC.**

### 2.1 Why the sandbox is not in the loop at all

The premise "every chart lives inside one sandboxed iframe" is true of the
*picture* and false of the *pointer*. `sandboxCanvas.css` and
`ChartCell.tsx:265` establish the layering: the iframe fills the browser
viewport, paints transparent except where a cell's container is positioned,
and is `pointer-events: none`. Every `ChartCell` renders a host-realm frame
positioned over its cell's picture, and that frame is what receives
`pointerdown`/`pointermove`/`wheel`/keys. Pointer events **never enter the
sandbox**. This is not a workaround; it is how R69.2 already divides the two
realms ("the host keeps gestures").

So a pointer move in chart A arrives in the host with a host-realm
`clientX`, and a cursor line drawn in chart B is a host-realm DOM element in
chart B's own frame, above a transparent region of the iframe. Both ends are
host-side. Routing this through the sandbox would mean host → iframe →
(opaque origin, no shared DOM) → back — a round trip that gains nothing and
costs a structured clone per pointer move.

**Precedent, already shipping:** the *pinned* cursor line does exactly this
today. `index.tsx` holds `sharedCursorTUs`; every mounted `ChartCell` receives
it as a prop and draws its own line with `pixelXForTUs(liveViewport, …)`
(`ChartCell.tsx:784`). Cross-chart cursor propagation is a solved problem in
this codebase; what is missing is only the *hover* trigger.

### 2.2 Where the state lives, and why not in React state

Naively, decision 51 is "call `onSetCursor` from `handlePointerMove` too".
That is wrong for the reason CLAUDE.md §2 states: `setState` on every pointer
move re-renders `Notebook/index.tsx` — 2000 lines, every cell, every
`ChartCell` — at pointer rate (up to 120 Hz on a high-rate mouse). That is an
interaction-path cost, even though it is not IPC.

The codebase already has the right pattern for interaction-rate cross-cell
signalling: R69.2's per-frame `transform` push, which bypasses React entirely
and is applied imperatively. Mirror it.

**`interaction/cursorBus.ts`** — a plain, dependency-free publish/subscribe
holder for the worksheet cursor:

```
CursorState = { tUs: number | null; pinned: boolean }
```

- One instance per worksheet, created in `Notebook/index.tsx`, handed down by
  context or prop (a ref, not state).
- `publish(tUs)` on hover; `pin(tUs)` / `unpin()` on click / Esc.
- Subscribers are `ChartCell` cursor-line elements and the value card. Each
  subscriber positions its own element imperatively
  (`el.style.transform = translateX(px)`, `el.hidden = px === null`),
  computing `px` from `pixelXForTUs` against the viewport it already holds in
  a ref (`liveViewportRef`, `ChartCell.tsx:351` — already present).
- `pin`/`unpin` — and **only** those — also write React state
  (`manualCursorTUs`), because pinning is a settle-grade event: it is what the
  R62 readout settle, the context menu (`hasCursor`), the playback seed
  (`handleTogglePlay`) and "cursor to peak" all read.

`tUs` is `number` on the bus (µs, session-relative), not `bigint`: the bus
runs at pointer rate and `bigint` allocates per operation. `bigint` stays at
the pinned/playback boundary where it is today (`PlaybackState.tUs`), with one
documented conversion at the `pin` call, mirroring `ChartCell.tsx:548`'s
existing `Number(cursorTUs)`.

### 2.3 Does the sandbox protocol need a new message?

**No new message. One field on an existing one, and only if §5 Q8 is answered
"pixel-exact".**

The cursor line, the drag rectangle, the value card and the timeline strip are
all host-realm overlays over a `pointer-events: none` iframe. None requires
the sandbox to know the cursor exists.

The single thing the sandbox knows and the host does not is **Observable
Plot's actual plotting rectangle** inside the cell (its left/right margins and
inner width). The host currently assumes `originPx: 0, pixelWidth: width`
(`ChartCell.tsx:632`). With a y-axis label of varying width, the host's
pixel→time conversion is offset by the margin, so the cursor line sits a few
px away from where the value it reports actually is — a small error in one
chart and a *visibly inconsistent* one across charts whose axis labels differ
in width, which decision 51 makes obvious for the first time.

Recommended fix if Q8 is answered "yes": extend **`cellRendered`** from
`{cellId, heightPx}` to `{cellId, heightPx, plotRect?: {leftPx, widthPx}}`.
That message already fires **once per render**, not per frame, so it stays off
the interaction path; `heightPx` from it already flows through
`model/jsCellFrameHeight.ts`. `isHostMessage` gains the optional-field check.
No new message type, no per-frame traffic, and single-window behaviour is
byte-identical when the field is absent.

**Rejected alternatives, with reasons:**
- A `cursor {tUs}` host→sandbox message per pointer move — a structured clone
  and a cross-realm dispatch per frame, for a line the host can draw itself.
  Violates "no IPC/heavy work on the interaction path" in spirit.
- Letting the sandbox own cursor state and broadcasting up — puts an
  untrusted realm on the authority path for a value the host's own
  `chartActions`, playback clock and readout settle all read.
- `allow-same-origin` so the host can reach into the plots — forbidden
  outright (design §6, R69).

### 2.4 Budget compliance, restated

| Path | Rate | Cost |
|---|---|---|
| pointer move → bus → N line elements | pointer rate | N × one `style.transform` write. No React render, no postMessage, no IPC. |
| pointer move → value card | pointer rate | Reads already-decoded tiles via `hover.ts`'s `hoverAt` (P2's own precedent) — no IPC. |
| pointer stop (150 ms, R62) | settle | `cursor_readout` IPC, unchanged. |
| click / pin | gesture settle | One React state write. |
| gesture settle | settle | tier re-selection + tile fetch, unchanged. |

---

## 3. The master timeline and selection

### 3.1 It is a selection editor, not a viewport control

R115 is explicit: "a dragged boundary mints an explicit-range window, the same
type a lap click mints — so the master timeline needs no separate concept."
Consequences, stated so no task quietly re-invents a second model:

1. **The strip writes `AppState.selection`**, through the existing
   `SET_WINDOWS` / `TOGGLE_WINDOW` actions and `selection.ts`'s `nextWindows`.
   It owns no window list of its own.
2. **Everything downstream is already wired.** A `range` window is
   `resolveWindowSpan`'s no-lookup arm; `windowsKey` changes; the per-window
   eval map (R131), `channelBindDriver`'s per-window fetch, the R127 `w`
   column and the `WindowDescriptor` colour all re-run unchanged.
3. **Therefore a boundary drag is expensive** — it re-runs
   `eval_workbook_v2` per window (R121) and re-fetches every bound channel.
   The strip must commit **on pointer-up only**; during the drag it moves its
   own handle and nothing else. This is the same settle discipline as
   `ChartCell`, and it is a hard requirement, not a nicety.
4. **R123 is not violated and must not be misread.** Dragging a boundary
   changes the *aggregation and display* domain — which samples `mean`/`max`/
   the lap table/the single-spectrum FFT reduce over (R124's eleven
   aggregates). It never changes what is *computed*: definitions still
   evaluate over the whole session, filters still settle, integrators still
   keep history. A task that "slices the channel lookup to the dragged range"
   is a defect (R122 superseded by R123).
5. **Under R120/R119**, a dragged range must be committed with
   `t0Us < t1Us` and overlapping its session, or the eval call returns a typed
   `InvalidArgument` for that window (R121: the window's entry fails, not the
   call). The strip enforces a **minimum drag width in time**, not only in
   pixels, so a zoomed-out strip cannot mint a sub-microsecond window that is
   legal in pixels and rejected in µs.
6. **Decision 61 holds:** dragging a boundary to a range with no data does not
   leave a previous picture on screen. The strip's own commit path must go
   through the same empty-state path as unchecking a lap.

### 3.2 The viewport is a *different* object from the selection window

Two distinct things are called "window" in the source documents, and conflating
them is the single most likely way this lane ships silent-wrong-number bugs:

| | Selection window (`SelectionWindow`) | Viewport (`Viewport`) |
|---|---|---|
| Means | what data is in scope | what part of it is on screen |
| Lives in | `AppState.selection` | host UI state, per worksheet after task 4 |
| Set by | Data tab, master timeline boundaries | pan/zoom/drag gestures |
| Affects | evaluation, aggregation, colour, the card's rows | tier choice, tile fetch, the card's *values* |
| Persisted | selection is not persisted (decision 48) | not persisted (§5 Q4) |

R131 Q2 ties them: the viewport is expressed as an **offset from the primary
window's start**, and `mapViewportToWindow` re-applies that offset from each
other window's own start. The cursor must be carried in the **same** frame —
an offset from the primary window's start, not an absolute session `t_us` —
or a cursor pinned in a lap-3 chart reads lap-7's chart at the wrong instant.
Today's `sharedCursorTUs` is absolute session µs, correct only while one
window is selected. That is task 6.

### 3.3 What "the whole lap/session" means with N windows — UNRESOLVED

Decision 52 says the strip "always shows the whole lap/session". With one
window that is unambiguous. With N windows of different lengths over possibly
different sessions, the documents do not settle it, and I cannot resolve it
from R115, R117, R131 or decision 55. **Flagged as open question 1**, with a
recommendation there. Nothing in tasks 1–7 depends on the answer; tasks 8–9
do, and must not start before it is ruled.

### 3.4 The sentinel, named up front (warning (b))

`viewportWindows.ts`'s `AbsoluteSpan` uses **`endUs: Infinity`** for a
`"session"` window — a value meaning "everything, end unknown" sitting in the
same field as real finite ends. This is precisely the S1 failure shape the
lead warned about, and the master timeline makes it lethal: a strip cannot
draw a lane of infinite length, and `(t - start) / (end - start)` with
`end = Infinity` is `0` for every `t` — every window collapses onto the left
edge, silently, with no error and no NaN.

**Rule adopted for this lane, to be stated in the SPEC section and asserted
in tests: no time value in the timeline, cursor or playback path may be
non-finite. A window whose real end is not yet resolved is `null` — absent,
excluded from the strip, excluded from the card — never `Infinity` and never
`0`.** Task 3 replaces the sentinel by resolving every selected window's real
recorded span (extending `sessionSpanDriver` from primary-only to per-window),
and lands a test asserting `Number.isFinite` on every `AbsoluteSpan.endUs` the
strip and the cursor consume. R128's own open follow-up (replace the
`(0.0, 0.0)` gate-off sentinel with an `Option`) is the same defect class in
Rust and is named here as adjacent, not claimed by this lane.

---

## 4. Task plan

All thirteen tasks are **TypeScript**; gate is `npx tsc --noEmit && npx vitest
run <filter>` (no cargo in a UI worktree). Every pure module named below lives
under `Notebook/model/` or `Notebook/interaction/` and imports **no**
`@/components/*` — vitest's node env cannot resolve that alias. Ordered so the
tree never breaks: 1–7 are independent of open question 1; 8–9 need it ruled.

Two standing test requirements, from the lane that just merged:

- **(a) Gates, not just derivations.** Every task that adds or changes an
  effect must test the *gate*, not only the pure function behind it: the
  identity/memo key, the dependency array's data key, and the subscribe/
  unsubscribe bookkeeping. R133 is explicit that a dependency array and an
  inner identity cache are two gates in series. Where a gate lives inside a
  React handler, the task **extracts the decision into a pure function** and
  tests that — a handler that cannot be tested is a handler that will be
  wrong.
- **(b) No "everything" sentinel.** Any task introducing an absent/unknown
  value uses `null` and asserts the distinction in a test named
  `… — window end unresolved — excluded, not treated as whole session`.

| # | Task | Files | Test filter |
|---|---|---|---|
| **1** | `interaction/cursorBus.ts` — pure pub/sub cursor holder: `{tUs: number \| null, pinned: boolean}`, `publish`/`pin`/`unpin`/`subscribe`, subscriber list, no React, no DOM, no timers. Documents µs units and the `number`-vs-`bigint` boundary. | new `cursorBus.ts` + test | `cursorBus` |
| **2** | `interaction/cursorFollowPolicy.ts` — pure verb decision: given `(event kind, pinned, pixelX, viewport)` → `publish(t)` \| `pin(t)` \| `unpin` \| `nothing`. Hover moves an unpinned cursor, a click pins, a click on a pinned cursor at the same place unpins, hover never moves a pinned one. Then wire `ChartCell` to publish on pointer move and subscribe its line element imperatively (no `setState` on move). Gate tests: subscribe on mount / unsubscribe on unmount / no publish while pinned. | new policy module + `ChartCell.tsx` | `cursorFollowPolicy` |
| **3** | Per-window session spans; **kill the `Infinity` sentinel**. `resolveWindowSpan`'s `"session"` arm returns `null` when the window's recorded span is unresolved; `sessionSpanDriver` resolves every selected window, not only the primary. Callers (`channelBindDriver:360`) updated to drop an unresolved window rather than fetch to `Infinity`. | `viewportWindows.ts`, `sessionSpanDriver.ts`, `channelBindDriver.ts` | `viewportWindows sessionSpanDriver` |
| **4** | `model/sharedViewport.ts` — one worksheet X range (decision 52); pure `viewportForCell(shared, pixelWidth)` since charts differ in width, plus `commitSharedViewport`. `index.tsx` promotes `chartWindows`' per-cell `viewport` to one shared value (tiles stay per cell). A settle in any chart commits the shared range; every chart re-fetches. | new module, `index.tsx`, `ChartCell.tsx` | `sharedViewport` |
| **5** | `interaction/gestureVerbs.ts` — pure `(button, modifiers, movementPx) → "zoom-rect" \| "pan" \| "pin" \| "context" \| "none"`, per decision 56 and §5 Q2's ruling. `ChartCell`'s three pointer handlers call it instead of branching inline (requirement (a): the verb becomes testable). | new module, `ChartCell.tsx` | `gestureVerbs` |
| **6** | Window-relative cursor (R131 Q2). Cursor carried as an **offset from the primary window's start**; new pure `cursorTimeInWindow(offsetUs, window): number \| null` in `viewportWindows.ts`, `null` past a shorter window's end (decision 55's "renders absence"). `cursorBus`, `ChartCell`'s line, and the R62 readout all read through it. | `viewportWindows.ts`, `cursorBus.ts`, `ChartCell.tsx` | `viewportWindows` |
| **7** | `model/cursorCard.ts` — decision 55: pure rows `{windowIndex, windowLabel, colour, seriesLabel, unit, value: number \| null}`, **one per series per window**, from the already-decoded per-window tiles/host-var payload at the cursor offset. Reuses `hover.ts`'s tile read (P2: no IPC) and `WindowDescriptor.colour`/`label`. Then `components/CursorCard.tsx` positioned at the cursor. Existing `CursorReadout` stays as the settle-time panel (R62). | new module + component | `cursorCard` |
| **8** | `model/timelineStrip.ts` — pure strip model, **after open question 1 is ruled**: lane list, strip px↔time, handle hit-testing, drag → candidate `range` span with a minimum width **in µs** (R120), clamped to the session (R119), `t0Us < t1Us` asserted. Includes the viewport bracket's position per lane in window-relative coordinates. Zero React. | new module | `timelineStrip` |
| **9** | `components/TimelineStrip.tsx` — renders task 8's model at the top of the worksheet; drag moves handles locally, **commits on pointer-up only** via `SET_WINDOWS`. Test the commit decision as a pure function (`timelineCommit`), not the component. | new component, `index.tsx` | `timelineStrip` |
| **10** | Playback speeds + **stop at end of lap** (decision 57). `playback.ts` gains a named speed set and `tick` is called with the **primary selected window's** resolved span (task 3's per-window spans), not `[0, sessionSpanUs]`. `handleTogglePlay` seeds from the window start. | `playback.ts`, `index.tsx` | `playback` |
| **11** | `interaction/playbackMode.ts` — decision 57's two modes: `"cursor-fixed"` (today's `advanceViewportByTime`) and `"scroll-at-edge"` (viewport unchanged until the cursor crosses an edge margin, then advances by one page). Pure `advanceForMode(viewport, cursorOffsetUs, deltaUs, mode)`. `ChartCell`'s shared-cursor effect (`:535-577`) calls it; the effect's dep array stays data-only (operating brief §4). | new module, `ChartCell.tsx` | `playbackMode` |
| **12** | `PlaybackTransport` gains a speed select and a mode toggle; state lives in `index.tsx` beside `playback`. UI only — every decision it makes is task 10/11's tested function. | `PlaybackTransport.tsx`, `index.tsx` | `playback playbackMode` |
| **13** | `model/xMode.ts` — decision 54: worksheet-level `"time" \| "distance"`, persisted in `notebookPrefs`' `idl1.notebook.ui.v1`, threaded to the shared viewport, the strip and the card. `"distance"` ships **present and disabled with a stated reason** (§5 Q5) — never silently absent, never silently falling back to time. | new module, `notebookPrefs.ts`, `index.tsx` | `xMode notebookPrefs` |

**Blast radius.** `ChartCell.tsx` (tasks 2, 4, 5, 6, 11), `Notebook/index.tsx`
(4, 9, 10, 12, 13), `viewportWindows.ts` (3, 6), `channelBindDriver.ts` (3),
`sessionSpanDriver.ts` (3), `playback.ts` (10),
`PlaybackTransport.tsx` (12), `notebookPrefs.ts` (13); eight new pure modules,
two new components. No Rust, no C3 command, no crate. `state/selection.ts` and
`AppState.tsx` are **read and dispatched to, never changed** — R115 is
satisfied by the existing `range` span.

---

## 5. Open questions for the lead

1. **What does the master strip show with N windows of different length?**
   Decision 52 says "the whole lap/session"; with N windows that is ambiguous
   and I cannot resolve it from the documents.
   *Recommendation:* **one lane per selected window**, stacked, each drawn
   over its own session's full recorded duration in that window's colour, each
   carrying its own pair of boundary handles, with the shared viewport drawn
   as a bracket on each lane in window-relative coordinates. It is the only
   shape that stays true to both R115 (a boundary edits *a* window) and
   decision 55 (rows are per window). One strip over the primary window would
   leave the other windows' boundaries un-editable.
   *Blocks tasks 8–9 only.*

2. **What pans, now that plain drag zooms?** Decision 56 assigns hover, drag
   and click and leaves pan unnamed; plain drag currently pans.
   *Recommendation:* invert today's modifier — plain drag = rectangle zoom,
   **shift**-drag = pan — keeping wheel-zoom, the keyboard pan/zoom
   (`keymap.ts`) and double-click-to-reset as they are. Middle-drag as a
   second pan for mice that have it.

3. **Does dragging a `lap` window's boundary convert it to a `range`
   window?** A lap's bounds are gate crossings; they cannot be dragged and
   remain a lap.
   *Recommendation:* yes — the drag replaces that entry with a `range` window
   seeded from the lap's resolved bounds, and the lane's label changes
   visibly ("Lap 3" → "Lap 3 · trimmed") so the user is never silently holding
   something other than what they picked. Colour and list position are kept.

4. **Is the shared X viewport persisted?** Decision 48 persists only the
   workbook and which one is active.
   *Recommendation:* **not persisted, and not written to the workbook file** —
   a viewport is a renderer-only parameter and CLAUDE.md §3 forbids those in
   the file. Session-lifetime host state; reset to the selection's own span on
   any selection change.

5. **Distance on X (decision 54) needs a distance axis that does not exist.**
   Resampling every channel onto cumulative GPS distance is core work
   (`rust/core`), and would need a C3 command; a UI lane cannot produce it.
   *Recommendation:* task 13 ships the worksheet setting with `"distance"`
   present and **disabled with a stated reason**, and the distance axis becomes
   a named core follow-on with its own C3 amendment. The alternative — omitting
   the control — hides a specified decision; computing distance in TypeScript
   is forbidden outright ("Rust = numbers").

6. **With several windows selected, whose end does playback stop at?**
   Decision 57 says "the end of the lap", written when one lap was selected.
   *Recommendation:* the **primary** (first) window's end, consistent with
   R132's "non-chart cells may read the primary window but must name which"
   — and the transport names the window it is playing. Stopping at the
   *longest* window's end would run shorter windows past their data, which
   decision 61 forbids showing.

7. **Does the unpinned hover cursor drive the value card, or only a pinned
   one?** Decision 55 gives the card to "the cursor"; decision 56 says hover
   "shows values only".
   *Recommendation:* hover drives the card live (it is the whole point of
   56), and pinning freezes it in place so the numbers can be read and
   compared without holding the mouse still. Pin also triggers the existing
   R62 settle-time `cursor_readout` for exact sample values, so the hover card
   is fast-and-approximate (tile columns) and the pinned card is exact.

8. **Should `cellRendered` carry Plot's inner plotting rectangle?** The host
   assumes `originPx: 0, pixelWidth: width`; with real axis margins the cursor
   line is offset from the data it reports, and differently per chart.
   *Recommendation:* yes — add an optional `plotRect: {leftPx, widthPx}` to
   the existing `cellRendered` message (once per render, off the interaction
   path), with `isHostMessage` validating it as optional so absence is
   byte-identical to today. This is the **only** sandbox-protocol change this
   lane proposes; if it is refused, the cursor ships pixel-approximate and the
   SPEC section says so.
