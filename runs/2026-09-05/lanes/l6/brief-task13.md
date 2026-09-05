# L6 Task 13 — implementer brief (open, evaluate, and render the workbook)

You are the implementer for L6 Task 13 of the idl1 rewrite — the pure
`workbookReducer` over open/eval/save/watch results, and the components that
render each `CellOutput` kind. This task also owns two things the plan's
tracked notes assign here: routing inline `${…}` prose spans to the sandbox,
and (if time/scope allows within this task) documenting the cell-to-cell
reference gap. ONE commit, then report.

## Before anything else: verify Task 12 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need a commit adding `Notebook/components/PropertiesForm.tsx` (Task 12),
and before it Task 11's `CodePane.tsx`. **If either is missing — STOP and
report.** This task assembles the panes Tasks 11–12 built; read both
components' actual props (not just their briefs) before wiring
`Notebook/index.tsx`.

Also read, before writing anything — this task touches more landed surface
than any prior one:
- `app/src/ipc/workbook.ts` — **already landed**, this task's primary IPC
  dependency. Read every exported type: `WorkbookHandle`, `HostChannelRef`,
  `CellDefResult`, `CellOutput`, `SaveResult`, `WorkbookEvent`, `IpcError`,
  and the four functions `openWorkbook`, `evalWorkbook`, `saveWorkbook`,
  `watchWorkbook`. Note **`evalWorkbook(id, sessionId)` takes no lap-context
  argument today** — IPC need N4 (`lap_context`) has not landed. Note there
  is **no `readWorkbook`/`read_workbook` export at all** — IPC need N1 has
  not landed either. Confirm both by grepping the file yourself; do not
  assume either has landed since the plan was written.
- `Notebook/host/protocol.ts` — `HostToSandboxMessage`,
  `SandboxToHostMessage`, `channelPayload`. Note `SandboxToHostMessage`
  already has an `inlineResult` variant (`{ type: "inlineResult"; spanId:
  string; text: string }`) — the **receive** side exists. There is **no**
  `HostToSandboxMessage` variant to **ask** the sandbox to evaluate a span.
  This is exactly the gap the 2026-09-05 tracked note "L6 inline `${…}`
  prose spans have no host→sandbox trigger yet" describes
  (`runs/2026-09-03/decisions.md`, search "inline `${…}`") — read that note
  in full before designing the fix.
- `Notebook/sandbox/main.ts` — read the `handleMessage` switch and its
  `// TODO(idl0): inline ${…} span evaluation` comment (near the end of the
  file) and the `compileCell`/`setCells` TODOs above it (free-identifier
  analysis, cross-cell references — both explicitly deferred to "Task 13 if
  cross-cell references are needed").
- `Notebook/model/cells.ts` — `scanCells`, `ScannedDoc`, `ScannedCell` (Task
  4). This task's `openWorkbook` → `scanCells` step uses this, not a new
  parser.
- `app/src/ipc/tiles.ts`, `app/src/ipc/catalog.ts` — already landed;
  `openWorkbook`'s eventual channel binding for math-cell host variables may
  need session/channel lookups from these, if your design calls for it (see
  N3 below).
- C3 §3.4 "Workbook" in full
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  465–591) — especially the "Host-channel byte path — open item" paragraph
  at the end (lines 570–590), which is IPC need **N3**.
- C2 §5.2 "Inline `${…}` in prose" (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
  lines 594–614) — the exact semantics an inline span must have: evaluated
  as JS in the same host-mediated scope as a `js` cell, coerced with
  `String(value)`, re-evaluated reactively.
- Ruling R21/R22 (`runs/2026-09-03/decisions.md`) for `CellOutput`'s shape
  rationale (already reflected in `ipc/workbook.ts`'s doc comments — read
  them there, they're accurate and save you a decisions.md search).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- **This task reads `AppState.selection`** (`{ sessionId: string | null,
  lapContext: { mainLap: number; overlayLaps: number[] } | null }`,
  `app/src/state/AppState.tsx` — already landed per R53 Data Q3). Reading it
  is fine (`state/AppState.tsx` is lead-owned to *edit*, not to *import
  from* — every tab reads it). Do **not** modify `AppState.tsx`.

## The two IPC needs this task must stub, not fake

**N1 — `read_workbook` (hard blocker, not landed).** `save_workbook`'s
`based_on_hash` is "the hash the editor last read" (C3 §3.4, R44), and no
command returns a workbook's source text or hash. Create
`Notebook/ipcStubs/readWorkbook.ts`:
```ts
/** Stub for IPC need N1 (runs/2026-09-05/lanes/l6/IPC-NEEDS.md) — no
 *  `read_workbook` command exists yet. Throws `NotImplementedError`, never
 *  an `IpcError`-shaped rejection, so callers can distinguish "this feature
 *  doesn't exist yet" from a real backend failure. Delete this file and
 *  replace its one call site with `app/src/ipc/workbook.ts`'s `readWorkbook`
 *  once the Rust write-amendment lane lands N1. */
export class NotImplementedError extends Error {}
export async function readWorkbook(_idOrPath: string): Promise<{ markdown: string; hash: string; path: string }> {
  throw new NotImplementedError("read_workbook (IPC need N1) not yet implemented");
}
```
`workbookState.ts`'s open flow calls this stub. On the thrown
`NotImplementedError`, the reducer/UI must show a **visibly labeled
"not yet available"** state for editing the raw markdown/hash-based save
flow — **not** a generic error, **not** a blank/frozen editor, and
**not** a fabricated hash. Evaluation and rendering (via `evalWorkbook`,
which does not need source text) still work fully; only "open the
document's own text for editing outside a form" and "save" are affected.
Say explicitly in your report what the UI shows in this state.

**N3 — `fetch_host_channel` (not landed, and not this task's to implement).**
C3 §3.4's own "open item" paragraph assigns the byte layout to L5/L6
jointly (R45, this plan's Q6 → L6 designs it, Rust implements it) — **this
task does not implement the byte path**, only documents where it plugs in.
Math-cell → JS-cell binding (a math definition's `HostChannelRef` becoming a
`channel`-shaped variable inside the sandbox) is **not achievable in wave 2**
without it: `CellDefResult.value` only carries `{length, has_t}` (a
`HostChannelRef` marker), never the actual samples, over IPC today.
Implement math cells' **scalar/error rendering** in full (every
`CellDefResult`'s `name`/`label`/`error`), but where a `js` cell's code would
need to consume a math definition's *samples* (not just see that it
succeeded), render that binding as unavailable with a `// TODO(idl0):`
comment citing N3 — do not synthesize fake sample data from
`HostChannelRef.length` alone (that field is a count, not values, and
fabricating values would be silently wrong output, the worst class of bug
per the standing reviewer brief).

## Interfaces (from the plan, Task 13)

- Produces a pure reducer `workbookReducer(state, action)` over
  `{ handle, markdown, hash, cells, outputs, dirtyCellIds, status }`:
  ```ts
  interface WorkbookState {
    handle: WorkbookHandle | null;
    markdown: string | null;      // null until read_workbook lands or succeeds; see N1 above
    hash: string | null;          // null until a read or a save; based_on_hash source
    cells: ScannedCell[];         // from scanCells(markdown), empty while markdown is null
    outputs: Map<string, CellOutput>;  // by cell_id, from the last evalWorkbook
    dirtyCellIds: Set<string>;
    status: "loading" | "ready" | "not_implemented" | "error";
  }
  ```
  Adjust field types as needed to make the six tests below exact — the plan
  states the shape loosely; you are free to refine it as long as every test
  name's behaviour holds and the refinement is documented.
  - `workbookReducer — an eval result for a cell — replaces that cell's output and leaves others untouched`
  - `workbookReducer — a cell carrying errors — keeps the cell and stores its errors (never drops it)`
  - `workbookReducer — a definition-level error — attaches to that definition, not to the cell`
  - `workbookReducer — an edit to one cell body — marks only that cell dirty`
  - `workbookReducer — a save result — clears dirty and stores the new hash`
  - `workbookReducer — a watch event naming two cells — marks exactly those two stale`
  6 tests, matching the plan's Step 1 list exactly.
- Components rendering one `CellOutput` each:
  - math → `MathCell.tsx`: each `CellDefResult` as `name` (or `label`) with
    its `HostChannelRef` summary (`length`, `has_t`) and, on failure, its
    typed `IpcError` (`kind`/`message`, never a raw stack).
  - table → `TableCell.tsx`: `value.model` + `value.results[r][c]` as a
    grid, per-cell error text (`results[r][c].error`) in place of a value
    (C3 §3.4).
  - js → the sandbox's rendered output for that cell id (mounted by
    `host/SandboxHost.ts`, already landed — this task wires which cell's
    output lands in which `ChartCell`'s sandbox-mount div, it does not
    rebuild the host).
  - prose → `ProseSpan.tsx`: Markdown with `${…}` splices filled from
    `inlineResult` messages (see "Inline spans" below).
- Consumes `ipc/workbook.ts`, `ipc/catalog.ts`, `host/`, `model/cells.ts`.

## The task

**Files:**
- Create: `Notebook/model/workbookState.ts`, `Notebook/model/workbookState.test.ts`,
  `Notebook/components/CellList.tsx`, `Notebook/components/MathCell.tsx`,
  `Notebook/components/TableCell.tsx`, `Notebook/components/ProseSpan.tsx`,
  `Notebook/ipcStubs/readWorkbook.ts`
- Modify: `Notebook/index.tsx` (replace the wave-1 canvas page with the real
  page: open → scan → eval → render), `Notebook/host/protocol.ts` (add the
  host→sandbox message for triggering an inline-span evaluation — see below),
  `Notebook/sandbox/main.ts` (implement the corresponding handler)

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests** (the reducer only — components are
  rendering, not unit-tested)

  The 6 tests listed above. A/A/A with blank lines between sections.

- [ ] **Step 2: Implement the reducer and the open/eval flow**

  On mount: `openWorkbook(idOrPath)` → attempt `readWorkbook` (the N1 stub)
  → on success, `scanCells(markdown)`; on `NotImplementedError`, set
  `status: "not_implemented"` for the markdown/hash slice specifically (not
  for the whole page — evaluation still proceeds) → `evalWorkbook(id,
  sessionId)` using `AppState.selection.sessionId` (read-only import) →
  bind host variables via `host/SandboxHost.ts`'s existing API → render.

  `evalWorkbook` is called: once on open, once per `watchWorkbook` event
  (subscribe once, per cell ids named in `WorkbookEvent`), and once per
  debounced editor change (P6 — reuse whichever debounce Task 11's
  `CodePane` or a shared utility already established; do not invent a third
  debounce constant with a different value without saying why).

  A per-cell failure never blanks the notebook: a `CellOutput` carrying
  non-empty `errors` still renders (its error inline, via the relevant
  `*Cell.tsx` component), and every other cell still renders (CLAUDE.md §5,
  C2 §3.5.B, C3 §3.4's own "a per-cell failure never rejects the command").

  `AppState.selection.lapContext` is **read** by this task (it's there,
  R53 Data Q3) but **cannot yet be passed to `evalWorkbook`** — the
  IPC signature has no `lap_context` parameter (N4, not landed). Do not add
  a client-side workaround (e.g. filtering results after the fact) that
  pretends to implement lap scoping — leave a `// TODO(idl0):` at the call
  site citing N4, and confirm in your report that `lapContext` is read but
  currently unused, not silently dropped without a trace.

- [ ] **Step 3: Wire inline `${…}` prose spans (tracked note, this task's to close)**

  Per the tracked note, the **receive** side already exists
  (`inlineResult` in `SandboxToHostMessage`) but nothing **asks** the
  sandbox to evaluate a span. Add a `HostToSandboxMessage` variant — e.g.
  `{ type: "evalInline"; spanId: string; expr: string }` — carrying the raw
  `${…}` expression text (C2 §5.2's `js_expression` production) extracted
  from prose by `model/cells.ts`'s `proseBeforeRange`/`proseAfterRange`
  spans (you will need a small span-extraction step here — a regex over
  `${...}` within a prose range is sufficient; this is not `plotForm`-grade
  parsing, C2 §5.2's grammar is one line). On the sandbox side
  (`sandbox/main.ts`), implement the corresponding case in `handleMessage`:
  evaluate `expr` in the same scope `compileCell` gives a `js` cell (same
  `inputNames`, same `new Function` construction — reuse `compileCell`
  rather than duplicating it), coerce with `String(value)` (C2 §5.2, exact
  template-literal semantics), and post back `{ type: "inlineResult",
  spanId, text }` on success or `{ type: "cellError", cellId: spanId,
  message }` on a throw (reusing the existing error channel rather than
  inventing a third one — document this choice, since `spanId` and `cellId`
  are conceptually different but the wire message doesn't currently
  distinguish them; if that reuse feels wrong once you're looking at the
  real code, say so in your report rather than forcing it).

  `ProseSpan.tsx` renders prose text with `${…}` occurrences replaced by
  the corresponding `inlineResult.text` once received (a loading/pending
  state — the literal `${expr}` or a placeholder — before the first result
  arrives; document which). Re-evaluation reactivity ("whenever the
  Runtime re-runs any cell the expression's free variables depend on," C2
  §5.2) is **not** fully achievable this task without the free-identifier
  analysis `sandbox/main.ts`'s existing TODO defers — implement re-sending
  `evalInline` whenever the surrounding cell's dependencies change is
  reasonable **best-effort** (e.g. re-issue on every `setCells`/`setHostVar`
  call), and say explicitly in your report that true reactive re-evaluation
  of inline spans awaits the free-identifier analysis the sandbox's own
  TODO names — do not claim full reactivity if your implementation is
  coarser than that.

- [ ] **Step 4: Implement the render components**

  `MathCell.tsx`, `TableCell.tsx`, `ProseSpan.tsx` per the Interfaces
  section above. `CellList.tsx` iterates `ScannedDoc.cells` in document
  order, looking up each one's `CellOutput` by id from `workbookState`'s
  `outputs` map, and dispatches to the right renderer by `kind` (`js` cells
  render via the existing `ChartCell`/sandbox-mount machinery, not a new
  component — confirm `ChartCell.tsx`'s existing props are sufficient or
  say what's missing).

- [ ] **Step 5: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/workbookState
  ```
  Expected: 6 passed, 0 failed. Also run
  `npx vitest run src/routes/pages/Notebook/host` once (no filter narrowing
  needed beyond the directory) to confirm the `protocol.ts` change didn't
  break `protocol.test.ts` — report that count too, though it is not the
  brief's primary gate.

- [ ] **Step 6: CHANGELOG**

  ```
  - **Workbook open/eval/render (L6 Task 13).** Math, table, js and prose cells render from `eval_workbook`; a per-cell failure never blanks the notebook. Inline `${…}` prose spans now round-trip through the sandbox (best-effort re-evaluation, pending free-identifier analysis). `read_workbook` (N1) and math→JS host-channel binding (N3) stubbed as `NotImplementedError`, visibly labeled, pending the Rust write-amendment lane.
  ```

- [ ] **Step 7: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/workbookState.ts src/routes/pages/Notebook/model/workbookState.test.ts src/routes/pages/Notebook/components/CellList.tsx src/routes/pages/Notebook/components/MathCell.tsx src/routes/pages/Notebook/components/TableCell.tsx src/routes/pages/Notebook/components/ProseSpan.tsx src/routes/pages/Notebook/ipcStubs/readWorkbook.ts src/routes/pages/Notebook/host/protocol.ts src/routes/pages/Notebook/host/protocol.test.ts src/routes/pages/Notebook/sandbox/main.ts src/routes/pages/Notebook/index.tsx ../CHANGELOG.md
  ```
  (add/omit `protocol.test.ts` from the list depending on whether you added
  a case for the new message variant — you should)
  Message, single line, no AI attribution trailer:
  ```
  app: workbook open/eval/render -- math, table, js and prose cells; inline span routing
  ```

## Do not

- Do not fabricate a hash, markdown string, or sample values to work around
  N1/N3's absence — every stub throws or renders a visible "not yet
  available" state. A guessed `based_on_hash` that happens to work by luck
  today is a silent future data-loss bug the moment `save_workbook` is
  actually exercised against it.
- Do not have the stub throw an `IpcError`-shaped object — it throws
  `NotImplementedError`, a distinct class, so callers never confuse "not
  built yet" with a real backend rejection.
- Do not pass `AppState.selection.lapContext` into `evalWorkbook` by any
  means (positional argument reuse, a query-string hack, etc.) — the
  command's signature has no slot for it (N4 not landed). Read it, note the
  `TODO(idl0)`, move on.
- Do not modify `state/AppState.tsx` — read-only import.
- Do not claim full reactive re-evaluation of `${…}` spans if your
  implementation only re-issues on a coarser trigger — say precisely what
  triggers a re-evaluation in your report.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol, with units where numeric; `//
TODO(idl0):` never bare `// TODO`, and every N1/N3/N4-related TODO cites the
IPC need by number so a later reader can `grep -rn "N1\|N3\|N4"` and find
every open thread; A/A/A tests with blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line for
`model/workbookState` (expect 6 passed) and for `host` (report the count,
confirm no regression); what the UI shows while `status === "not_implemented"`
(exact text/state); confirmation `lapContext` is read but not passed to
`evalWorkbook`, with the `TODO(idl0)` citing N4; the exact new
`HostToSandboxMessage` variant you added for inline-span evaluation and
whether you reused the `cellError` channel for span failures or added a
distinct one (state which, and why); how re-evaluation of an inline span is
triggered in your implementation, stated precisely (not "reactively" —
name the actual trigger); per-step done/deviated; anything ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).
