# idl1 — live evaluation state, per cell and on the maths map (R250)

Status: **DRAFT**, spec-first for the `eval-progress` lane.
Ruling: R250. Brief: `runs/2026-09-20/BRIEF-eval-progress.md`.
Amends: C3 §3.4 (§4 of this document), UI-DIRECTION "Notebook" and "Maths".

Isaac, 2026-09-20: *"right now it's kind of just blank charts and i dont know
what's going on ... i'm only seeing it green after it's calculated, not the
progress before. maybe we can integrate this better into the flow map, so i
can see at a glance where it's working, and if one of the steps has an error,
which branches won't calculate."*

---

## 1. Diagnosis — why a cell shows nothing until it is done

Seven findings, each against the code as it stands on `main` at 0889635.

**1.1 A cell with no output renders one ellipsis, not a slot.**
`components/CellList.tsx:155-165` dispatches on `outputs.get(cell.id)`. When
that is `undefined` — a freshly opened workbook before its first
`eval_workbook_v2` round trip, every cell — it renders
`<div className="cell-list-pending">…</div>`. `styles/notebook.css:361` gives
that div a mono font, body size and `--fg-faint`: a grey ellipsis roughly one
line tall. `renderJsCell` is never called, so no `JsCellFrame`, no
`DEFAULT_JS_CELL_HEIGHT_PX`, no chart-sized slot. **This is the "blank
charts".** It is also a guaranteed layout jump: when the outputs land, every
one-line box becomes a full-height chart frame at once.

**1.2 A chart cell's only state indicator is a 12 px corner spinner over
that ellipsis.** `chrome` comes from `denseChromeMode(dense, cell.kind)` —
`cell.kind`, from the document scan, so a `js` cell is `"overlay"` chrome
even before it has ever evaluated (`plotChrome.ts:39`). In `"overlay"` chrome
`CellFrame` draws `StatusGlyph` at `absolute top-1 left-1` (12 px) and
**deliberately skips** the full-size busy overlay, which is gated
`isCellBusy(status) && !overlay` (`CellFrame.tsx:324`). So the entire visible
state of an un-evaluated chart cell is a 12 px unlabelled spinner in the
corner of a 20 px box. Nothing says what it is waiting for.

**1.3 `queued` draws differently in the two chromes, and nothing in one of
them.** `plotStatusGlyph` returns `"spinner"` for `queued`
(`plotChrome.ts:68`) but `isCellBusy("queued")` is `false`
(`cellStatus.ts:107`). Overlay chrome therefore spins for a cell that is not
running; band chrome draws nothing at all for it. Neither is the truth.

**1.4 There are five states and none of them is the interesting one.**
`CellStatus = "queued" | "evaluating" | "stale" | "settled" | "error"`. No
`fetching`, no `rendering`, no `blocked`, no `idle`. The decode fraction
*does* reach the cell (`decodeFractionFor` → `CellFrame.decodeFraction` →
`DecodeRing`, R221), but it only swaps the spinner glyph for a ring: the
status stays `evaluating`, and no text names the channel being read.

**1.5 `evalInFlight` is document-level and can never be otherwise today.**
`index.tsx:1188` keeps `evalInFlightCount`, a count of in-flight round trips;
`cellStatusFor` (`index.tsx:3904`) hands the same boolean to every cell. That
is not a shortcut — it is forced. `ipc/workbook.ts:294`:

```ts
export async function evalWorkbookV2(id: string, windows: Window[]): Promise<WindowEval[]> {
  return invoke<WindowEval[]>("eval_workbook_v2", { id, windows });
}
```

One `invoke`, one return, every cell of every window at once, no `Channel`.
Underneath, `rust/tauri/src/commands/workbook.rs:531` `build_cell_outputs`
calls `idl_rs::workbook::v3::eval_cells(doc, structural, handle, lap_ctx)`,
which returns a `Vec` and exposes no observer. **Per-cell progress cannot
exist on the app side until §4 lands.** Until then the honest per-cell
signals available are: the decode events (R221, real and per channel), the
call boundary (queued → evaluating), and the sandbox's own `cellRendered` /
`cellError` messages (rendering → done/error).

**1.6 `blocked` does not exist, so an upstream failure prints N identical
red ✕s.** `model/graphStatus.ts` has a `"grey"` status, but it is decision
44's *session-gap* rule: a channel present on one selected session and
missing from another greys, and its forward-reachable descendants grey with
it. An `error` has no such rule — `definitionPerWindow` returns `"error"`
for every node whose `CellDefResult.error !== null`
(`graphStatus.ts:246-248`), independently, so a typo in one definition marks
its whole downstream chain as separately broken with no hint of which one is
the cause. This is exactly Isaac's "which branches won't calculate".

**1.7 The derivation is cheap and the data is already there.**
`computeNodeStatuses` already builds `forwardTargets` (a `source -> targets`
adjacency over `model.edges`) and already runs a BFS from the grey roots
(`graphStatus.ts:176-199`). `GraphNode.cellId` maps every node back to its
owning cell, so a cell-level `blocked` and a node-level `blocked` come from
one walk of one graph the page already holds.

---

## 2. The cell state machine

One pure module, `Notebook/model/cellStatus.ts` (the existing file, widened —
not a second vocabulary beside it). Nine states:

| state | meaning | drawn as |
| --- | --- | --- |
| `idle` | no window is selected, so nothing will run | quiet slot, one line, no spinner |
| `queued` | this cell will run, and no round trip is out yet | skeleton + "queued" |
| `fetching` | its channels are being decoded (R221 fraction) | determinate ring + `fetching IMU0_AccelZ 40 %` |
| `evaluating` | the engine is computing it | skeleton + "evaluating" |
| `rendering` | its output has landed, the sandbox has not drawn it | skeleton + "rendering" |
| `done` | current, clean result on screen | ✓, fading after `SETTLE_FADE_MS` |
| `error` | this cell's own failure | ✕ + message |
| `blocked` | an upstream cell failed or is missing | dimmed slot + "blocked by Cell 3: unknown channel" + **Go to Cell 3** |
| `stale` | decision 59 — last output kept, greyed, under a spinner | unchanged from today |

### 2.1 Self-ruling: `"settled"` is renamed `"done"`

R250 names the state `done`. The existing spelling is `"settled"`. The two
are the same state and an alias would be the sentinel shape CLAUDE.md's
review guidance names as the recurring defect here, so the member is renamed
and its three readers (`plotChrome.ts`, `CellFrame.tsx`, their tests) are
updated in the same commit. `SETTLE_FADE_MS` keeps its name — it times the
fade, not the state.

### 2.2 Precedence

Evaluated top-down, first match wins:

1. `blocked` — an upstream cell is in `error`. Outranks everything because a
   blocked cell's own "queued" is a lie: it is never going to run.
2. `stale` — there is a previous result on screen and it predates the latest
   edit. Decision 59, unchanged, including that `stale` outranks `error`: a
   failed cell that is re-running reports the re-run, not the superseded
   failure. It also outranks `fetching`, so a cell keeping a greyed previous
   result does not flicker between two waiting shapes mid-decode.
3. `error` — this cell's own failure. Above `fetching` so a ring can never
   hide a cross.
4. `fetching` — this cell has at least one channel with a live decode
   (`cellDecodeFraction` non-`null`). The common case for a chart, and the
   one with a real fraction: the engine returns in milliseconds and the
   channel decode is what takes twenty seconds (R221's own measurement).
5. `evaluating` — a round trip is in flight and this cell has no result.
6. `rendering` — a `js` cell whose `CellOutput` has landed but whose sandbox
   has not reported `cellRendered`.
7. `idle` — no window is selected and this cell has no result.
8. `queued` — this cell has no result and nothing is out yet.
9. `done`.

With the three new inputs at their resting values (`blockedBy: null`,
`decodeFraction: null`, `awaitingRender: false`, `hasSelection: true`) this
reduces exactly to today's five-state function, so no existing behaviour
changes except by the signals this ruling adds.

### 2.3 The blocked derivation

Pure, in `Notebook/model/blockedCells.ts`, over the graph model the page
already computes:

- Input: `GraphModel` (nodes + edges), the set of node ids currently in
  `error`, and each node's `cellId`.
- Walk forward from every error node over `model.edges`, transitively.
- Every node reached is `blocked`; it records the **nearest** error ancestor
  (first reached in a breadth-first walk) as its `blockedBy`, so the label
  names one cause and not a list.
- A cell is `blocked` when every one of its own nodes is `blocked` or
  `error`, and at least one is `blocked`. A cell with an independently fine
  definition beside a blocked one is not blocked as a whole.
- Cycles terminate on the visited set. Self-blocking is impossible: an
  `error` node is never re-labelled `blocked`.

Decision 44's `"grey"` stays what it is — *this session lacks the input* —
and is **not** folded into `blocked`, which means *an upstream step failed*.
The two have different causes, different fixes and different drawings (§3.2).

---

## 3. The maths map is the evaluation view

### 3.1 Node states

`NodeStatus` gains the same vocabulary as §2, minus `stale` (a node has no
picture of its own to keep). The card's fill and outline come from existing
tokens — `--fg-faint`, `--good`, `--accent`, `--surface-2` — and **no new
colour literal is introduced**.

- `fetching` — a small progress arc on the card's status corner, the same
  `DecodeRing` geometry the cell frame uses, at the same fraction.
- `evaluating` / `rendering` — a pulse on **only** the node(s) actually
  working, never on the whole graph. Wrapped in
  `@media (prefers-reduced-motion: reduce)`, where the pulse becomes a static
  outline.
- `error` — the existing red ✕, kept.
- `blocked` — the card is **dimmed** (reduced opacity, no glyph: a status
  implies the node was asked to run, and this one was not), and **every edge
  from the failing node down is dashed**, so one look follows the failure to
  the branches it kills.
- `done` — the existing ✓.

### 3.2 Blocked vs grey

Two dimmings that must not be confused:

| | cause | edges | label |
| --- | --- | --- | --- |
| `grey` (decision 44) | this session has no such channel | solid | "not in this session" |
| `blocked` (R250) | an upstream cell failed | **dashed** | "blocked by Cell 3: …" |

The dash is the whole distinction and it is the one Isaac asked for.

### 3.3 Hover and focus

Hovering or keyboard-focusing a node shows: its state, its duration once one
is known, its error text if it has one, and its "blocked by" cell. Click
keeps today's behaviour exactly — scroll to the cell.

### 3.4 Legend and summary

- A legend chip on the canvas naming the state treatments.
- A status-bar summary: `12 done, 2 working, 1 error, 4 blocked`, built by a
  pure counter beside the state module. Clicking it opens the map.
- Zeros are omitted, not printed: `12 done` alone when nothing else applies.

### 3.5 The interaction-path rule

A map update never triggers an evaluation and never touches IPC. Every input
to §3 is a value the Notebook page already holds at render time. Hover, pan
and zoom stay local (CLAUDE.md §3).

---

## 4. C3 §3.4 delta — per-cell progress over a `Channel`

*Deferred to task 3, which starts only when the lead frees the Rust slot.
Specified here so the TS half is written against the shape it will get.*

`eval_workbook_v2` gains an optional third argument, a progress channel. The
command stays `#[tauri::command(async)]` (R201).

```ts
type EvalProgress =
  | { kind: "cell_started";  run: number; window: number; cell_id: string }
  | { kind: "cell_finished"; run: number; window: number; cell_id: string;
      outcome: "ok" | "error" }
  | { kind: "run_cancelled"; run: number };

export async function evalWorkbookV2(
  id: string,
  windows: Window[],
  onProgress?: (e: EvalProgress) => void,
): Promise<WindowEval[]>;
```

- Events are emitted in **dependency order**, which is the order
  `eval_cells` already evaluates in.
- They are **cheap**: ids and enums, no payloads. The result still arrives
  as the command's return value; the channel never carries a value.
- `run` is the app's own monotonic sequence number, passed in and echoed
  back, so a late event from a superseded run is dropped by the reader
  rather than mis-attributed. **Cancellation on a newer request**: a run
  superseded by a newer one stops emitting and reports `run_cancelled`.
- The channel is optional. Omitting it reproduces today's behaviour
  byte-for-byte, so no existing caller changes.

Core exposes an **observer**, not async and not Tauri (layer rule):

```rust
/// Called once as each cell starts and once as it finishes. Synchronous,
/// on the evaluating thread; implementors must not block.
pub trait EvalObserver {
    fn cell_started(&self, cell_id: &str);
    fn cell_finished(&self, cell_id: &str, ok: bool);
}
```

`eval_cells` gains an `observer: Option<&dyn EvalObserver>` parameter (or a
sibling `eval_cells_observed`, whichever keeps the existing call sites
untouched — decided in task 3 against the code). No `async`, no runtime, no
network in `core`.

No byte DTO is involved, so **no wire golden is required**.

`app/src/ipc/` is updated in the same commit as the command signature
(CLAUDE.md §7).

---

## 5. Until §4 lands

The TS half is honest about what it knows:

- `queued` / `evaluating` come from the **call boundary** — the existing
  `evalInFlightCount`, unchanged in meaning.
- `fetching` comes from the **real** R221 decode events, which are already
  per channel and per cell.
- `rendering` comes from the **sandbox**, which already reports
  `cellRendered` / `cellError` per cell.
- `blocked` comes from the **previous** evaluation's errors, which is
  correct: a cell blocked by an upstream failure was blocked before this run
  started.

Nothing in the TS half guesses a per-cell evaluation boundary it cannot see.
When §4 lands, `evaluating` narrows from "the document is running" to "this
cell is running" and nothing else changes.

---

## 6. Rules this document is held to

- No blank and no freeze: from the first frame after a trigger every cell
  says what it is doing. No spinner without a label.
- No layout jump between states: the slot is chart-sized from the first
  frame (§1.1's defect), and stays that size through `done`.
- Elapsed time appears after 2 s, not before — a number that flashes up and
  vanishes is noise.
- Determinate wherever a fraction exists; indeterminate only where one
  genuinely does not.
- No new colour literals; every treatment from an existing token.
- `prefers-reduced-motion` is respected by every animation added here.
- No number the sync model depends on is computed in JavaScript. Nothing
  here is such a number: these are pictures of work, not results.

---

## 7. Open question for the lead

Not a blocker — the lane proceeds on the answer given in §2.1 and §3.2
unless told otherwise.

1. **`"settled"` → `"done"`** (§2.1). A mechanical rename across three
   readers and their tests, adopting R250's own vocabulary. Alternative:
   keep `"settled"` and treat R250's `done` as prose. Taken: rename.
2. **`grey` and `blocked` stay two states** (§3.2), distinguished by a
   dashed edge. Alternative: fold decision 44's grey into `blocked`. Taken:
   keep them separate — different cause, different fix.
