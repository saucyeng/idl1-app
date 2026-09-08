# Lane M — maths graph: survey, file mapping, task plan

Worktree `idl1-app-worktrees/w32-maths`, branch `w32-maths`, from main `d51243f`
(`rust` submodule `57dc0dc`). Planning only — no implementation code, no build run.

Sources read: `CLAUDE.md`; `runs/2026-09-06/RULINGS-DIGEST.md`;
`runs/2026-09-07/WAVE3-PLAN.md` (lane M); `runs/2026-09-07/ui/UI-DIRECTION-2.md`
decisions 38–45c, 82, 83 + Open; C2 §§1, 2, 3.1–3.6, 7 (`docs/superpowers/specs/
2026-09-03-idl1-c2-workbook-v3.md`); rulings R110, R118, R123, R124, R131 in
`runs/2026-09-03/decisions.md`.

**Spec discipline for this lane: spec-first.** Task 1 writes a C2 section before
any code (same posture R110 imposed on §3.6, and for the same reason — the file
mapping is the part that is expensive to change later).

---

## 1. Survey

### 1.1 What the file is, and who may write it

| Thing | Where | Notes |
|---|---|---|
| Document container, front matter, fence scan, cell ids, prose spans | `rust/core/src/workbook/v3/mod.rs:142` `parse_workbook` | Front-matter identity/version is fatal; every other problem is *collected* into `Vec<WorkbookError>` and the doc still parses (`mod.rs:118`–`141`). |
| Cell bodies, verbatim | `CellDoc::raw_fence_body`, `rust/core/src/workbook/v3/cell.rs` | Bodies are stored **raw and unparsed**; comments and blank lines survive byte-for-byte. |
| Render back to text | `rust/core/src/workbook/v3/mod.rs:264` `render_workbook` | R103 fixed point: byte-identical for `body` in every case, whole-document when front matter is already canonical. Used only by L11 sync install today. |
| Front matter | `rust/core/src/workbook/v3/front_matter.rs:157` `FrontMatter` | Exactly five fields: `id`, `name`, `constants`, `units`, `version`. `render_front_matter` (`front_matter.rs:225`) serialises **only those five**. |
| Math-cell line grammar | `rust/core/src/workbook/v3/math_cell.rs:58` `parse_math_cell_body` | Classifies `Blank`/`Comment`/`Const`/`Def`; `Def` carries `{name, expr_text, label}`. `extract_label` (`math_cell.rs:189`) implements the `# label:` display name — **on a `def_line`'s trailing comment only**. |
| Flat definition namespace | `WorkbookDoc::defs: Vec<MathCellDef>` (`mod.rs:65`, `mod.rs:111`) | `{cell_id, name, expr_text, label, order}`, document-cell order then per-cell line order. |
| Cross-cell evaluation | `rust/core/src/workbook/v3/resolve.rs` `resolve_workbook_defs` | Deps-first, cycle-guarded, one result per definition **always**; definitions shadow session channels (L3-R18a). |
| Dependency extraction | `rust/core/src/math/resolve.rs:23` `channel_refs(expr) -> Vec<String>` | **`pub(crate)`** — not reachable from `idl-rs-tauri`, not on the wire. |

**Writers of the file today.** Exactly one app path:
`Notebook/index.tsx:1146` builds the next document with
`model/cells.ts:297 replaceCellBody(markdown, cellId, nextCode)`, dispatches
`workbookReducer`'s `editCell {cellId, markdown}`
(`model/workbookState.ts:234`), and `model/saveFlow.ts` writes the whole text
through `saveWorkbook(id, markdown, basedOnHash)` (`app/src/ipc/workbook.ts`).
Rust never re-renders the app's own saves — `save_workbook` takes the finished
markdown. Both editor panes (`components/PropertiesForm.tsx`, `components/
CodePane.tsx`) funnel through that one `onChange`, guarded against echo by
`model/editorEcho.ts` (`components/EditorPanes.tsx`'s "Update-loop guard").

### 1.2 What crosses IPC, and what a node card can therefore show

`eval_workbook_v2(id, windows) -> WindowEval[]`, `WindowEval = {ok: CellOutput[]}
| {error: IpcError}` (`rust/tauri/src/commands/workbook.rs:954`;
`app/src/ipc/workbook.ts`). Per definition the wire carries
(`commands/workbook.rs:62` `CellDefResult`):

```
{ name, label, value: { length, has_t } | null, error: IpcError | null }
```

That is the **whole** per-definition surface. It does **not** carry: the
expression text, the dependency list, the unit, the shape, the sample rate, or
which session channel a failure named. The expression text is available to the
app only because the app holds the raw markdown (`WorkbookState.markdown`).

`fetch_host_channel_v2(workbookId, window, defName, budget)` returns the decimated
samples (binary, `ipc/hostChannel.ts`); `list_math_builtins()` returns
`{name, arity[], status}` per builtin (`commands/workbook.rs:1004`, R64.2).

### 1.3 How definitions reach charts today

`model/jsCellBinding.ts` `bindingFor` parses a `js` cell with `plotForm/parse.ts`;
a mark whose channel names a workbook definition binds with
`source: "definition"` and is fetched whole via `fetchHostChannelV2` rather than
tile-by-tile (`model/channelBindDriver.ts`). Per-window fetching, viewport
re-basing (`model/viewportWindows.ts` `mapViewportToWindow`) and the NaN-break
join (`host/protocol.ts` `combineChannelWindows`) are all in place from S1
(R127/R129/R131 Q2). `MathCell.tsx` renders a math cell's definitions as
name + `HostChannelRef` summary or the definition's own error — that is the only
"node-like" surface that exists today.

Per-window state is `WorkbookState.windows: Map<windowKey, WindowEvalState>`
(`model/workbookState.ts:47,109`), pruned on selection change; `NO_WINDOW_KEY`
holds the "nothing selected" result and whole-call rejections.

### 1.4 What C2 §3.6 implies for ports and wires

- A port's label is a **shape**, written `[]`, `[t]`, `[f]`, `[lap]`, `[t,f]`,
  `[t,c9]`, `[t,c{roll,pitch,yaw}]` (§3.6.1). The comma form is canonical
  precisely so the same string works in a port label and an error message.
- A wire is legal only if the shapes are compatible: same `kind`, `len` **and
  `origin`** (§3.6.2). Two `[t]` values with different origins (spectrogram
  frames vs. samples) do not connect — §3.6.7's worked error. So a wire's
  validity is **not** a function of the port labels alone; only the engine knows
  origins. The graph must therefore render a `ShapeMismatch` as a red edge after
  evaluation, not refuse the drag before it.
- Reductions/`argmax`/`at`/`nearest`/`slice`/`axes`/`broadcast`/`align` take the
  axis as an ordinary string literal argument (§3.6.3) — no grammar change, so a
  node's parameter form is "the literal arguments of the outer call", nothing
  more.
- Only rank ≤ 1 charts, plus the one `[t,f]`-is-literally-a-`spectrogram(...)`-call
  raster case (§3.6.6). Any other rank ≥ 2 output must render decision 58's empty
  slot with the "reduce it first" message.

### 1.5 The honest gap list — what does NOT exist

1. **§3.6 is unimplemented in core.** `MathEvalErrorKind`
   (`rust/core/src/math/error.rs:10`) has nine variants and none of
   `ShapeMismatch` / `UnknownAxis` / `ShapeAnnotationMismatch`. There is no
   shape type, no `argmax`/`at`/`nearest`/`slice`/`axes`/`broadcast`/`align`, and
   `spectrogram` is still a `NotImplemented` stub. **No port can display a real
   shape.** See Open Q1.
2. **No dependency edges on the wire.** `channel_refs` is `pub(crate)`; nothing
   in `CellDefResult` names a definition's inputs. Wires must be derived
   somewhere new.
3. **No `# shape:` support anywhere.** §3.6.4's annotation is spec text only; the
   trailing-comment scanner (`math_cell.rs:189`) recognises `label:` and nothing
   else, and the ordered `shape:`-then-`label:` scan §3.6.4 specifies is not
   implemented.
4. **No cell-level display name.** Decision 45b says a subgraph is "one `math`
   cell named by `# label:`", but `# label:` is defined only for a `def_line`'s
   trailing comment. A whole-line `# label: iEKF` is `MathCellLine::Comment` and
   carries no meaning. Contract gap, not a code gap.
5. **No canvas-position storage of any kind**, and no place in the parsed model
   to put one: `MathCellDef` has no position field and `FrontMatter` has exactly
   five keys.
6. **`render_front_matter` drops unknown top-level keys.** `FrontMatter` has no
   `deny_unknown_fields`, so unknown keys *parse* (ignored) but are **deleted on
   render**. This already violates C2 §1's own requirement that a v3 parser
   round-trip `_migrate_charts`/`_migrate_math` "unmodified" — a pre-existing
   conformance defect, independent of this lane, that this lane's file mapping
   would otherwise inherit.
7. **No front-matter edit path in the app.** `workbookState` has `editCell` only;
   `dirtyCellIds` is keyed by cell id, and `Notebook/index.tsx`'s save debounce
   keys on that set's identity — so a change that touches no cell would never
   mark the document dirty and never save.
8. **No expression parser in TS.** `plotForm/parse.ts` parses generated *JS*
   chart code, not C2 §3.2 math expressions. Nothing can read `butter(2, 3,
   "low", x)`'s cut-off for a card.
9. **No graph library.** `@xyflow/react` is not in `app/package.json` and not in
   `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`'s pins table. Docs
   *are* vendored (`docs/vendor/react-flow/`, `SOURCES.md` notes "not in the M0
   ecosystem pins table (wave-3 material)").
10. **No channel-list surface to drag from** in the Notebook; session channels are
    `SessionDetail.channels: ChannelSummary[]` (`app/src/ipc/catalog.ts:103`,
    carrying `channel_id`, `unit`, `nominal_rate_hz`, `channel_kind`) and are
    fetched by `model/sessionSpanDriver.ts`, but nothing renders them as a list.
11. **No chart-type selector and no idl0 pictograms** (decision 83); `plotForm/
    generate.ts` can emit the code, but nothing offers the choice.
12. **Downstream failures are indistinguishable from typos.** `resolve.rs`'s
    doc comment: a definition that cannot resolve — including one whose *input*
    failed — surfaces as "the same leftover `UnknownChannel` every other cycle
    member gets". Decision 44's grey-vs-red distinction cannot be read off the
    error kind.

### 1.6 React Flow, offline (constraint check)

`@xyflow/react` (React Flow v12) is an ordinary MIT npm package: ESM + one
stylesheet, dependencies `d3-zoom`/`d3-drag`/`d3-selection`/`zustand`, all npm.
It fetches nothing at runtime — the stylesheet is a local `import
"@xyflow/react/dist/style.css"`, bundled by Vite like every other asset, so
"offline-first means bundled: no CDN, ever" holds with no special handling. It
needs a pins-table row and a `package.json` entry, which by precedent (R52 Q1,
R53's shell task) is a **lead shell task**, not a lane task.

---

## 2. The file mapping, worked out

Decision 45b fixes four things; three are already expressible and one is not.

| 45b clause | Mapping | Contract status |
|---|---|---|
| one node = one `name = expr` line | `MathCellDef` (`mod.rs:65`) | exists |
| multi-operation node = a nested expression on that line | `expr_text`, unchanged | exists |
| subgraph = one `math` cell named by `# label:` | needs a **cell-level** label line | **C2 amendment** (§2.4/§3.1) |
| canvas positions live in the file | needs a home | **C2 amendment** (§1, §7.1) |

### 2.1 Where positions go, and why

**Decision: a new optional top-level front-matter key, `graph`.**

```yaml
---
id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d
name: Fork tuning
graph:
  nodes:
    fork_spec: [120, 80]
    peak_freq: [320, 80]
  cells:
    7f3c9a12: [80, 40]
---
```

`nodes` is keyed by **definition name** (the graph's own identity — it is what
`[Name]` references use); `cells` is keyed by **hex8 cell id** for subgraph
frames (§2.2 guarantees an id never changes, not on edit, kind change or
reorder). Values are `[x, y]` integer canvas units. Both sub-keys optional; the
whole key optional.

**Why front matter is the only home that satisfies (b).** C2 §7.2 classifies a
cell as `Changed` when its content differs from base byte-for-byte, and prose
belongs to the following cell (§2.4). So *any* byte written inside a cell body, on
its fence line, or in the prose around it makes that cell `Changed`. If a
position lived there, Isaac moving a node and a teammate editing a different
definition in the same cell would be `Changed`×`Changed` → C2 §7.2's conflict
rule → the peer's whole cell duplicated below with a `<!-- conflict from … -->`
marker. Front matter is merged **per top-level key**, outside the cell table
(§7.1), so a move and an edit cannot collide. That is the whole argument, and it
is decisive.

**Merge rule for the key (C2 §7.1 amendment).** Merge **per entry**, like
`constants` — but, unlike `constants`, **no conflict note**: an entry changed on
both sides keeps local's value silently. A position is cosmetic; injecting an
HTML comment into body prose because two people dragged the same card would be
noise in the document the user reads. An entry present on one side only carries
through. An entry naming a definition/cell that no longer exists is **kept, not
pruned** — a definition commented out during a hand edit must not lose its place
— and ignored on read. Positions are never a reason for sync to report a
conflict.

**Requirement (a) — a human hand-editing the markdown cannot corrupt the graph.**
The key is advisory. Every failure mode degrades to layout, never to data:

- key absent → every node auto-laid-out (Task 6);
- entry missing for a node → that one node auto-placed;
- entry for a name that no longer exists → ignored;
- the block is malformed YAML → the whole key is treated as absent and is
  replaced wholesale on the next write;
- a definition renamed by hand → its entry orphans, the node re-lays-out once.

Nothing in `graph` can change a number, a wire, or an evaluation. That is the
property that makes hand-editing safe, and it is worth stating in the SPEC in
those words.

**Requirement (c) — an older build round-trips losslessly.** Two halves:

1. *The app's own path is already safe*: the app edits cell bodies by byte range
   (`replaceCellBody`) and saves the whole text; it never reconstructs front
   matter. An old build therefore preserves `graph` byte-for-byte without
   knowing it exists.
2. *Core's `render_workbook` is not safe*: `render_front_matter` emits only its
   five fields, so a sync install (L11) would silently delete the key — and
   already silently deletes `_migrate_charts`/`_migrate_math`, which C2 §1 says
   must round-trip unmodified. Task 2 fixes this generically (preserve unknown
   top-level keys), which is the right fix independent of this lane.

**Who writes the key.** The app, in TS, by replacing the `graph:` block's byte
range inside `frontMatterRange` and touching nothing else — the same
"narrow, non-authoritative TS scan, Rust remains the authority" posture
`model/cells.ts` already documents (R52 Q3). The app always writes the key in one
canonical, fully-controlled ASCII shape (identifier keys, integer values), so no
YAML library is needed and **no byte the user typed is ever reformatted**. Adding
a TS YAML dependency was rejected for exactly that reason: it would rewrite
`constants: { rider_mass_kg: 82 }` into block style the first time anyone dragged
a card. Round-tripping the key through a new Rust command was rejected for the
same reason — `render_front_matter`'s contract is explicitly "round-trips to the
same `FrontMatter`, not the same bytes".

### 2.2 Alternatives rejected

| Alternative | Why not |
|---|---|
| **A1. Trailing comment on the def line** — `x = butter(...) # pos: 120,80` | Every drag is a cell-content change: merge conflicts against ordinary expression edits (the exact hazard (b) names), the cell goes into `dirtyCellIds` and re-evaluates, and the graph becomes a second writer of a cell body the Code pane is also writing. It also puts a machine field in the same comment channel as `label:` and §3.6.4's `shape:`, so a human tidying a comment silently moves a node. |
| **A2. A fence attribute** — ` ```math id=… pos=120,80 ` | §2.2's reserved attribute namespace would tolerate it, but the fence line is part of the cell's content for merge (A1's problem), and a per-cell attribute cannot hold per-definition positions at all. |
| **A3. An inert ` ```idl1graph ` fence** | Round-trips (C2 §1: an unknown fence language is inert and preserved), but it renders as a visible code block in the paper view and in decision 85's PDF, and being prose it belongs to the following cell for merge (§2.4) — A1's conflict problem again. |
| **A4. A sidecar layout file** (`<data>/workbooks/<id>.layout.json`) | Contradicts 45b directly, contradicts 81 ("as few files as possible"), needs its own sync rule, and a workbook copied to another machine arrives unlaid-out. |
| **A5. No stored positions — deterministic auto-layout only** | Genuinely attractive: hand-editing becomes perfect and merges free. Rejected because Isaac's model is a canvas he arranges (42: ~50 nodes, minimap, search), and a re-layout on every added definition destroys the spatial memory that makes 50 nodes navigable. **Kept as the fallback**, which is what makes (a) hold. |

### 2.3 The subgraph boundary

A `math` cell **is** the subgraph. Concretely (C2 amendment, Task 1):

- **Name**: a `math` cell whose **first non-blank line** is a whole-line comment
  matching `# label: <text>` carries that text as the cell's display name. This
  is a new meaning for a line that is `MathCellLine::Comment` today, chosen over
  a new fence attribute because it is what decision 45b says and because it
  survives every older build unchanged (it is a comment).
- **Inputs**: names referenced by the cell's definitions but defined outside it
  (another cell's definition, or a session channel).
- **Outputs**: names defined in the cell that are referenced outside it, charted
  by a `js` cell, or used in a prose `${…}`. Everything else is internal and
  hides when the subgraph is collapsed — decision 39's "intermediate datasets
  never appear unless the user names them", read at cell scope.
- **Sharing across workbooks (82)**: copying the cell's text copies the subgraph.
  Nothing more is designed in this pass; the boundary above is what makes a
  later "insert subgraph" command a text paste rather than a new model.

### 2.4 Constraints this mapping is held to

- **Rust = numbers, JS = pictures.** Everything in §2 except Task 2 lives in
  `app/src`. The graph computes no number: it reads `CellDefResult` and the
  markdown, and writes text. Shapes, units, values and errors all come from core.
- **No IPC on the interaction path.** Dragging updates React Flow's local node
  state only. On drag settle (`model/settle.ts`, the existing debouncer) the
  layout key is rewritten and the document marked dirty; the save is the existing
  debounced `saveFlow`. A move triggers **no** `eval_workbook_v2` and no
  `fetch_host_channel_v2` — nothing about a position is an input to a number
  (R123: the window is the domain of aggregation, the viewport is independent,
  and a canvas position is neither).
- **One writer per cell.** The graph is a third pane of the existing editor, not
  a second writer: every definition-changing gesture produces a new cell body
  string and goes through `Notebook/index.tsx`'s existing
  `replaceCellBody` → `editCell` path with `model/editorEcho.ts`'s guard.
  Positions are the one exception and go to front matter, which no other pane
  writes. Invariant to state in review: **no pane writes both a cell body and
  the layout key in one gesture** (a rename writes both — see Open Q3).

---

## 3. Task plan

Every task is independently committable and leaves the tree green. TS gate is
`npx tsc --noEmit && npx vitest run <filter>` in `app/` (operating brief §4 — no
cargo in a UI worktree); the one Rust task runs alone (R13). Full suite at the
lane gate only.

| # | Lang | Task | Test filter |
|---|---|---|---|
| 1 | docs | **C2 §3.7 "The graph view's file mapping"** — the `graph` front-matter key (§1 table row + shape + advisory rule), its §7.1 per-entry merge rule with no conflict note, the cell-level `# label:` line (§2.4/§3.1), the subgraph input/output definition, and a §3.6 cross-reference saying a port shows the inferred shape. No code. | lead review, no build |
| 2 | **Rust** | **Front matter preserves unknown top-level keys.** `FrontMatter` gains a flattened catch-all map; `render_front_matter` re-emits it in a stable order. Fixes C2 §1's `_migrate_*` round-trip requirement as well as this lane's key. **Changes a `pub` struct in `core`** → also `cargo check -p idl-rs-cli --tests` and `cargo check -p idl-rs-tauri`. | `cargo test -p idl-rs front_matter` |
| 3 | TS | `Notebook/model/graphLayout.ts` — pure read/write of the `graph:` block over `scanCells`' `frontMatterRange`. Absent/malformed ⇒ empty; write replaces only that block; every other byte identical. | `vitest run graphLayout` |
| 4 | TS | `Notebook/model/mathExpr.ts` — a narrow, non-authoritative C2 §3.2 scan: `[Name]` refs, outer call name, literal arguments. Anything it cannot classify is an **opaque expression** (the `plotForm` "custom code" precedent), still wired by its refs. | `vitest run mathExpr` |
| 5 | TS | `Notebook/model/graphModel.ts` — markdown + `CellOutput[]` ⇒ `{nodes, edges, groups}`: one node per `def_line`, source nodes for referenced session channels, edges from refs, groups from cells, stable ids. Consumes 3 and 4. | `vitest run graphModel` |
| 6 | TS | `Notebook/model/graphAutoLayout.ts` — deterministic layered placement by dependency depth for any node with no stored position. | `vitest run graphAutoLayout` |
| 7 | TS | `Notebook/model/graphStatus.ts` — per-node glyph from `WorkbookState.windows` (R131): worst-wins aggregate across selected windows, window-error vs. node-error separation, and decision 44's grey propagation by reachability from unresolved *session-channel* roots. | `vitest run graphStatus` |
| — | shell | **Lead shell task** (not a lane task, R53 precedent): add `@xyflow/react` to `app/package.json` and a pins-table row in `2026-09-02-idl1-m0-ecosystem.md`. Must land before Task 8. | — |
| 8 | TS | `Notebook/graph/NodeCard.tsx` + `GraphCanvas.tsx` — React Flow canvas, card (name, unit, key parameters, status glyph, port shape labels), hover shows the definition line/inputs/rate. Drag is local; settle commits through `graphLayout`. Logic that is testable lives in `graph/dragCommit.ts`. | `vitest run dragCommit` |
| 9 | TS | `Notebook/model/graphEdits.ts` — every mutation as pure text-in/text-out over `replaceCellBody`: rename (+ `[Name]` rewrite across cells + layout-key rename), rewire an input, edit a literal parameter, add a node from a channel, delete a node. | `vitest run graphEdits` |
| 10 | TS | Wire into `Notebook/index.tsx`: graph as a view of the open workbook; card click opens `EditorPanes` in the properties column (reuse `shell/editorSlot.ts` + `model/editorHost.ts`, R109). New `workbookState` action `editFrontMatter {markdown}` — updates `markdown`/`cells`, marks the document dirty for save, adds **nothing** to `dirtyCellIds` (no re-evaluation for a move). | `vitest run workbookState graphView` |
| 11 | TS | Node → chart in two gestures (83): output-port drag into the notebook column, or the card's chart button ⇒ chart-type selector (idl0 pictograms) ⇒ a new `js` cell via `plotForm/generate`. Enforces §3.6.6: rank ≥ 2 that is not a `spectrogram(...)` call offers decision 58's "reduce it first" slot, not a chart. | `vitest run graphToChart` |
| 12 | TS | Subgraph collapse/expand, canvas search, minimap (42, 43). Desktop-only canvas (77); the properties pane keeps its narrow sheet behaviour. | `vitest run graphSubgraph` |

**Ordering.** 1 gates everything (spec-first, R110's posture). 2 is independent
and can run any time before the lane gate, but must not overlap another cargo
lane. 3–7 are pure modules with no UI and no dependency on the React Flow pin.
8 needs the pin. 9 needs 4–5. 10 needs 3, 7, 8. 11–12 are additive on top.
Nothing between 3 and 12 breaks a previous task's tests.

**`pub`-signature flag:** Task 2 only. Every other task is `app/src`.

**Lane gate:** `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` (because
of Task 2) plus the full TS suite `npx tsc --noEmit && npx vitest run`.

---

## 4. Open questions for the lead

1. **C2 §3.6 is spec-only — what do ports show until core implements it?**
   No shape type exists in `rust/core/src/math/`, and the wire carries only
   `{length, has_t}`. *Recommendation:* ship the graph with a `Shape` type in the
   port component from day one, fed by a `shapeOf()` that today returns `[t]`
   (`has_t && length > 1`), `[]` (`length === 1`) or `unknown`, and later reads a
   real wire field with no change to the graph. Do **not** block lane M on a core
   §3.6 lane; do put that lane on the Rust backlog, because `spectrogram` is
   still a `NotImplemented` stub and R110's own worked example therefore cannot
   run end to end yet.

2. **Do dependency edges come from Rust or from a TS scan?**
   `channel_refs` is `pub(crate)`; R70 set the precedent that core owns the only
   `${…}` span scanner. *Recommendation:* **TS**, via Task 4 — because the card
   must also show the outer call and its literal parameters, which only exist in
   the expression text the app already holds. Exposing `deps` on `CellDefResult`
   would create a *second* scanner rather than replacing one. Document the module
   as non-authoritative exactly as `model/cells.ts` is.

3. **Rename touches a cell body and the layout key in one gesture** — the one
   violation of §2.4's "no pane writes both". *Recommendation:* allow it, as one
   atomic function in `graphEdits.ts` producing the whole new document text in a
   single `editFrontMatter`-plus-`editCell` dispatch pair, and require a test that
   a rename leaves the node in the same place. The alternative (orphan the entry
   and re-lay-out) is safe but visibly wrong to the user.

4. **How does a node show "unresolved input", and what happens downstream?**
   Decision 44 says grey, never hide — but core reports a dependent's failure as
   the same leftover `UnknownChannel` a typo produces (`resolve.rs` doc comment),
   so grey and red are not separable from the error kind.
   *Recommendation:* the graph decides it: a reference that names neither a
   definition nor a channel in any selected session's `SessionDetail.channels` is
   **red ×** (a typo — the user's mistake); a reference that names a channel
   present in *some* selected session but absent from this one, and every node
   reachable from it, is **grey** (this session lacks the input). Downstream grey
   nodes show no glyph at all, only the grey card — a spinner or an × on a node
   that was never asked to run would be a lie. Charts fed by a grey node grey
   too (44), they do not show decision 58's error slot.

5. **What is a node's status when a definition succeeds in one window and fails
   in another (R121/R131)?** *Recommendation:* worst-wins aggregate — any window
   errored ⇒ red ×; else any window not yet evaluated ⇒ spinner; else green
   check — with the card naming the split ("2 of 3 windows") whenever
   `windowCount > 1`, which is R132's requirement that a non-chart surface say
   which window it is showing rather than staying silent. The details pane lists
   status per window. Separately: a window whose *whole* eval failed
   (`WindowEvalState.kind === "error"`) is a **canvas-level** banner naming that
   window, never 50 red ×s — the failure is the window's, not the definitions'.

6. **Does the `graph` key belong to this lane's C2 section or to a C2 revision
   entry?** It changes §1 (a new front-matter key), §2.4/§3.1 (a cell-level
   label) and §7.1 (a merge rule). *Recommendation:* one new §3.7 that states the
   mapping, plus surgical edits to those three sections and a revision-history
   line — the same shape §3.6 took, so a reader of §1 or §7.1 alone is never
   misled.

7. **Should Task 2 (front-matter key preservation) be lane M's, or L11's?**
   It is a pre-existing C2 §1 conformance defect (`_migrate_*` is dropped on
   render today) and it is the only Rust work in an otherwise TS lane.
   *Recommendation:* keep it here — lane M is the lane that needs it and it is
   one small commit — but dispatch it when no other cargo lane is running.

8. **Is `@xyflow/react` a lead shell task, or in-lane?** Precedent (R52 Q1, R53)
   is a lead shell task for npm pins. *Recommendation:* lead shell task, landed
   before Task 8, adding both the `package.json` entry and the pins-table row
   with its MIT licence; `docs/vendor/react-flow/SOURCES.md` then gets its
   "no version pin to match against" note removed.
