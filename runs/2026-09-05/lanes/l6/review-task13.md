# L6 Task 13 review — open, evaluate, render the workbook (+ R60 orchestrator)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commits under review: `a61ab5c` (reducer/driver/
`NotebookSession`), `8fb068e` (render components + inline-span routing),
`ae04242` (coverage-only). A fourth commit, `a13d443` ("MarkRow reuses
PropertiesFormLapOption…", a Task 12 review fix), sits on top at review time
— explicitly out of scope per the dispatch and ignored here.

Four ambiguities this task's brief left open (js cells as a plain sandbox
mount rather than through `ChartCell`; `cellError` reuse for span failures;
no workbook picker; coarse cell-set-triggered re-evaluation of inline spans)
are already ruled on in `runs/2026-09-03/decisions.md` R66 and are **not**
findings here — R66 assigns the `ChartCell` binding and the distinct
`spanError` message to a new Task 13b.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage.reporter=json-summary src/routes/pages/Notebook
```
`tsc`: silent, no errors.
`vitest`: `Test Files 24 passed (24)`, `Tests 196 passed (196)`.

Targeted filters matching the implementer's reported gate:
```
npx vitest run src/routes/pages/Notebook/model/workbookState   -> Test Files 1 passed, Tests 10 passed
npx vitest run src/routes/pages/Notebook/host                  -> Test Files 5 passed, Tests 22 passed
```
Reproduces the implementer's reported `workbookState 10 passed`, `host 22
passed` exactly (6 brief-mandated `workbookReducer` cases plus 4 extra —
`handleOpened`, `markdownReady`, `markdownNotImplemented`, `markdownError`
— all present and all pass). No `--coverage` flag was actually enabled by
`--coverage.reporter=json-summary` alone (no `coverage/` directory was
produced), so no coverage percentage is reported; not required by the
dispatch beyond running the command once. `coverage/` (none produced) and
`dist/` (from a separate `npx vite build`, which succeeded — two output
chunks, `main` and `notebookSandbox`, both bundling cleanly) were deleted
after. Worktree is clean (`git status --porcelain` empty) after cleanup.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `Notebook/index.tsx` (module doc, "no Markdown formatting… out of scope"); `components/ProseSpan.tsx:60-75` | The brief's Interfaces section states `prose → ProseSpan.tsx: Markdown with ${…} splices filled from inlineResult messages`. The shipped `ProseSpan` renders prose as plain text (`<span>{text}</span>` around each segment) with no Markdown formatting at all — a `#` heading or `**bold**` in a workbook's prose renders as literal punctuation. This is a real, user-visible scope narrowing from the brief's Interfaces section, documented only in a code comment ("out of scope… not named in the brief's Step list") rather than raised as a CLAUDE.md §1 ambiguity for a lead ruling, and it is not one of R66's four ruled ambiguities. | Either add a lead ruling accepting plain-text prose for wave 2 (cheap — mirrors R66's other scope cuts) or wire a minimal Markdown pass before the `${…}` splice step. |
| Minor | `Notebook/model/openEvalDriver.test.ts` | The dispatch specifically asked whether staleness is tested for "a slow `eval_workbook` for an old session must not overwrite a newer one." The existing tests cover staleness detected *before* `evalWorkbook` is even called (readWorkbook-stage staleness skips `runEval` entirely) and cover a rejected `evalWorkbook`, but no test drives `isStale()` to flip `true` specifically between `evalWorkbook`'s resolution and the `evalResult` dispatch inside `runEval` — the exact "late eval result for a now-superseded run" case. The code path (`if (isStale()) return;` right after `await deps.evalWorkbook(...)`) is correct and mirrors the already-tested pattern one step up, so this is a coverage gap, not a live bug. | Add one `runEval`/`runOpenAndEval` test where `isStale()` only turns true on its 4th call (after `evalWorkbook` resolves), asserting `evalResult` is never dispatched. |
| Minor | `Notebook/index.tsx:220` | `dangerouslySetInnerHTML={{ __html: result.html }}` is new call-site code, but it consumes a `{ cellId, html }` shape (`SandboxToHostMessage`'s `cellResult`, and `SandboxHost.ts`'s `onCellResult` callback signature) that pre-dates this task — this is the first task to actually render it, and there is no sanitization step between the sandbox's `serializeCellValue` output and the host DOM. Since cell code already runs inside the `allow-scripts`-only, no-`allow-same-origin` iframe, this is a pre-existing design shape (not introduced here), but it is worth flagging now because this task is the first real consumer: an `onerror`/`onload` handler embedded in a cell's rendered HTML would execute in the *host* page's own origin once injected via `dangerouslySetInnerHTML`, which is exactly the privilege boundary the sandbox iframe exists to avoid crossing. | Not this task's to fix (the wire shape is inherited) — worth a design-level TODO/decisions.md note for a later sanitization pass (e.g. DOMPurify) before `js`-cell rendering ships past wave 2. |

No Critical findings.

## Checks performed (all pass)

- **`workbookReducer`** (`model/workbookState.ts`): all 6 brief-named tests present with the exact names given, plus 4 extra covering `handleOpened`/`markdownReady`/`markdownNotImplemented`/`markdownError`. A/A/A with blank lines between sections in every test. Every branch returns a fresh `state` object; `evalResult`/`editCell`/`saveResult`/`watchEvent` build fresh `Map`/`Set` instances rather than mutating in place — confirmed by reading every branch.
- **N1 stub** (`ipcStubs/readWorkbook.ts`): throws `NotImplementedError` (a distinct class), never an `IpcError`-shaped rejection; `openEvalDriver.ts`'s `isNotImplementedError` is injected rather than a concrete `instanceof` import, keeping the driver decoupled from the stub's exact class. UI shows `"Editing this document's raw text is not available yet (read_workbook is not implemented)."`, a visibly labeled state, distinct from `"error"` and from a blank/frozen editor; evaluation/rendering proceed independently via the separate `markdownStatus`/eval-outputs split the module doc comment justifies.
- **N3**: `MathCell.tsx`'s `DefRow` renders every `CellDefResult`'s `length`/`has_t` marker and its own `error`, with an explicit comment that a `HostChannelRef`'s `length` is a count, never fabricated into sample values.
- **N4 (`lapContext`)**: read via `useAppState()` in `index.tsx`, explicitly `void`-referenced with a `// TODO(idl0): thread lapContext into evalWorkbook's call below once N4 lands` comment citing the IPC need by number; never passed to `evalWorkbook`, never filtered client-side.
- **Tightened IPC-effects rule** (operating brief §4): every effect's dependency array is data-only (`[]` for the one-time `SandboxHost` mount; `[sessionId]` for open/eval; `[state.handle?.id]` for the watcher; `[state.cells, state.markdown]` for `setCells`/inline-span re-issue) — no callback/prop function appears in any dependency array; every callback (`onCellResult`/`onCellError`/`onInlineResult`) is routed through a ref updated every render, read via `.current` inside the effect body. Staleness for the open/eval flow is a monotonic `openSeqRef`/`evalSeqRef` counter bumped at the start of each run and checked after every `await` inside `openEvalDriver.ts`'s pure functions — no cleanup cancels an in-flight promise. The watcher effect's `disposed` boolean guards a long-lived `postMessage`/event-callback subscription that `watchWorkbook`'s own doc comment says has no exposed unsubscribe — it silences stale-workbook events after a *new* workbook is opened, which is the correct behaviour for a subscription with no cancel primitive, not the "cancel every in-flight import" anti-pattern the rule targets; no independent decision logic sits inside the effect itself (`runOpenAndEval`/`runEval` own all of it, unit-tested with injected fakes for both the fully-successful path and every failure/staleness interleaving named in the tests).
- **`eval` / `new Function`**: grepped both diffs — the only `new Function` call sites are in `sandbox/main.ts`'s pre-existing `compileCell` (reused, not duplicated, by the new `evalInline` method per the brief's explicit instruction) and its doc comment. No `eval`/`new Function` anywhere in `index.tsx`, `NotebookSession.ts`, `workbookState.ts`, `openEvalDriver.ts`, or any component.
- **Sandbox attribute**: `SandboxHost.ts`'s `iframe.sandbox.add("allow-scripts")` (only) is untouched by this task's diff — confirmed via `git show` on both commits, no hits.
- **R60 orchestrator**: `NotebookSession` holds the `TileCache` and a per-cell `BoundChannel` registry; `onChannelsInvalidated` reads the registry fresh at call time (not captured at construction); `rebindChannelsAfterRebuild` (pre-existing, Task 8) fetches nothing and re-sends every fully-cached bound channel exactly once. `NotebookSession.test.ts`'s test asserts exactly this (`sandbox.calls` has one entry per bound cell, `cache.bytesUsed()` unchanged before/after). `SandboxHost.ts`'s `rebuild()` (pre-existing, unchanged in ordering by this diff) sequences `init` → JSON host vars → `onChannelsInvalidated()` → `setCells`, matching R60's required order — confirmed by reading its doc comment and call sequence.
- **`readWorkbook` stub location/shape**: lives in `Notebook/ipcStubs/readWorkbook.ts` (the lane's own directory), not `app/src/ipc/`; matches the brief's exact code block.
- **Math/table cell rendering**: `MathCell.tsx` renders `name`/`label`, `HostChannelRef` summary, and per-definition `IpcError` (`kind: message`, never a raw stack) or the cell's own `errors`; `TableCell.tsx` renders `value.model`/`results[r][c]`, per-cell `error` string in place of a value, and the cell's own `errors` above the grid. Types checked against `app/src/ipc/workbook.ts`'s actual `CellOutput`/`CellDefResult`/`IpcError` exports — no mismatch.
- **Inline spans**: `extractInlineSpans` (`ProseSpan.tsx`) is a plain, documented non-nested `${...}` regex matching C2 §5.2's one-line grammar; `index.tsx`'s effect re-issues `host.evalInline(spanId, expr)` for every span on every `setCells`/markdown change, matching R66 item 4's ruled-acceptable coarse trigger; a pending span renders its literal `${expr}` source text (documented choice) rather than a spinner or blank; `sandbox/main.ts`'s `evalInline` reuses `compileCell` verbatim (same `inputNames`, same construction) per the brief's explicit instruction, and posts `inlineResult`/`cellError` (span-id-in-`cellId`-slot reuse, R66 item 2, deferred to 13b) exactly as specified.
- **`ChannelList`/`CellList`**: iterates `doc.cells` in document order; a cell with no evaluated output yet renders a stable pending placeholder rather than being skipped, preserving document order/count across a re-render mid-evaluation; dispatches `js`-kind cells to the injected `renderJsCell` rather than a new component, per the brief.
- **`selectedCellId`**: plain local `useState`, not threaded through shared state; matches the brief's silence on it needing to be shared.
- **Ownership/hygiene**: `git show --stat` on all three commits touches only paths under `app/src/routes/pages/Notebook/**` plus `CHANGELOG.md`; no `package.json`/`package-lock.json` touch; no `docs/` touch; no cargo invocation of any kind; each commit message is a single line with no AI attribution trailer; the third commit (`ae04242`) is coverage-only (two test files, no production code). `AppState.tsx` is read via `useAppState()` only, never modified. CHANGELOG bullet is accurate — it does not claim js-cell charts are interactive, correctly scoping the claim to "js… cells render from `eval_workbook`" plus the stub caveats.
- **Doc comments / TODOs**: every exported symbol in the new/modified files carries a doc comment; every `TODO` found in the diff is `// TODO(idl0):`-prefixed and cites the IPC need by number (N1/N3/N4) or the free-identifier-analysis gap.

## Verdict rationale

The reducer, driver, and R60 orchestrator are correct, well-tested (10 + 8
+ 2 tests for `workbookState`/`openEvalDriver`, 2 for `NotebookSession`, all
A/A/A, all matching the brief's exact required names plus reasonable
extras), and the tightened IPC-effects rule is followed to the letter —
data-only dependency arrays, ref-held callbacks, sequence-based staleness,
no self-cancelling cleanup. N1/N3/N4 are stubbed/left-unused exactly as the
brief requires, with visible, honest UI states and correctly cited
`TODO(idl0)`s. The four ambiguities the implementer flagged are already
covered by R66 and are not re-litigated here. The one real defect is the
silent Markdown-rendering scope cut against the brief's own Interfaces
section — a genuine deviation nobody ruled on, though a small, likely
one-line-ruling fix (either accept plain text for wave 2, matching R66's
pattern, or wire a minimal Markdown pass) — plus one missing edge-case test
and one inherited (not introduced) sanitization gap worth a forward note.
None of these block the gate or represent silently-wrong numeric output;
they are process/coverage gaps, not shipped-behaviour bugs.

VERDICT: NEEDS_FIXES
