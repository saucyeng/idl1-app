# L6 Task 21 — implementer brief (Notebook empty state, New workbook, Rescan, workbook picker, default session)

You are the implementer for **L6 Task 21**, tracked in the ledger's
"**Tracked (preview 2026-09-06)**" note and named again in the
"**L6 follow-on LANDED**" entry at the end of `runs/2026-09-03/decisions.md`:

> the Notebook opens "the first indexed workbook" and shows "No workbooks
> found" otherwise — no New-workbook action (`create_workbook` exists), no
> rescan (`rebuild_catalog` exists), and a workbook file dropped into
> `workbooks/` is invisible until the catalog is rebuilt. → **L6 Task 21**:
> empty state with "New workbook" and "Rescan", plus a workbook picker when
> more than one is indexed (the picker was deferred in R66; both now have
> their commands).

The same entry records the other half of the preview: "chart cells blank in
the capture with no session selected". **That is a real host-side rendering
gap, not a session-data problem, and it is Step 1 of this task.** The lead
traced it before writing this brief; the trace is in Step 1 and you should
confirm it rather than re-derive it.

ONE commit, then report.

Read, in this order, before writing a line:

1. **`CLAUDE.md`** — §1 (ambiguity policy), §2 (layers), §3 (principles:
   "the catalog is an index — deletable, rebuildable, never synced"),
   §4 (testing), §5 (typed errors), §6 (spec discipline), §7 (ownership).
2. **`runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2, §3, §4** — ownership,
   contract freeze, gates. §2's lead-owned file list is binding on you:
   `app/src/state/AppState.tsx` and `app/src/App.css` are **not yours**.
3. **`runs/2026-09-03/decisions.md`** — **R52** (Q9's `AppState` slice),
   **R53 Data Q3** (the `selection` slice's shape and who writes it — L7a
   writes, L6 reads), **R55** (the file-picker seam), **R66 item 3** (the
   picker deferral you are now closing), **R75** (front matter is serialised
   by core, never hand-built — you never write a workbook file yourself),
   **R77** (the four post-L8w seams), and the two 2026-09-06 entries named
   above.
4. **Design doc** `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
   **§6** (Notebook) and **D13** (Properties + Code, two editing surfaces).
5. **C3 §3.2** — `list_workbooks`, `rebuild_catalog`, `list_sessions`; and
   **C3 §3.4** — `create_workbook`, `read_workbook`, `save_workbook`,
   `open_workbook`, `eval_workbook`.
6. **C4 §2** (`workbooks/<file_name>.idl1wb`), **C4 §5** (the catalog as a
   rebuildable index and its rebuild procedure — note that step 6 walks
   `workbooks/*.idl1wb`), **C4 §4**'s "Watcher scope" paragraph.
7. **`docs/IDL0_SPEC.md` §26** in full, especially §26.1 and §26.6.
8. The code: `app/src/ipc/catalog.ts`, `app/src/ipc/workbook.ts`,
   `app/src/routes/pages/Notebook/index.tsx`,
   `.../model/openEvalDriver.ts`, `.../model/workbookState.ts`,
   `.../model/jsCellBinding.ts`, `.../model/sessionSpanDriver.ts`,
   `.../components/{CellList,JsCellFrame,ChartCell,EditorPanes,ConflictBanner}.tsx`,
   and `app/src/routes/pages/Data/index.tsx` (its `selectSession` and its
   existing "Rebuild catalog" toolbar button — the pattern you mirror).

**Spec discipline: spec-during.** `docs/IDL0_SPEC.md` §26 gains a new
subsection and one §26.6 row in this commit, and only in this commit.

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -5
git merge-base --is-ancestor fca0694 HEAD && echo "ledger/L6-follow-on present"
git merge-base --is-ancestor e7643cb HEAD && echo "Task 20 FFT surface present"
```

Required: branch `main`, tree clean apart from untracked `runs/` files, and
**both `merge-base` lines print**. Any modified tracked file, or either
ancestry check failing, is **STOP and report** — a failing ancestry check
means you are on a worktree cut before the L6 follow-on merge, and the fix
is to merge `main` in first (R19 pattern, and the process note the ledger
recorded against Task 20), not to work around it.

Then confirm the premises this brief rests on, **by reading the files**:

- [ ] `app/src/ipc/catalog.ts` exports `listWorkbooks`, `rebuildCatalog`,
      `listSessions`, and the `WorkbookSummary` / `RebuildReport` /
      `SessionSummary` types.
- [ ] `app/src/ipc/workbook.ts` exports `createWorkbook(name) →
      Promise<WorkbookHandle>`, `openWorkbook`, `readWorkbook`,
      `saveWorkbook`, `evalWorkbook`.
- [ ] `model/openEvalDriver.ts`'s `runOpenAndEval` opens
      `workbooks[0].workbook_id` and dispatches
      `{ type: "markdownError", message: "No workbooks found." }` when the
      list is empty. Its doc comment says a picker is out of scope. **You
      are the task that changes both.**
- [ ] `model/workbookState.ts`'s `WorkbookState` has no "which workbook" and
      no "there are none" field; `handle` is `null` until `open_workbook`
      resolves.
- [ ] `index.tsx`'s render gates `CellList` behind `state.handle !== null`,
      so with no workbook the page shows only the `markdownError`
      paragraph.
- [ ] `Data/index.tsx` dispatches `SET_SELECTED_SESSION` from `selectSession`
      (row click) and clears it in `closeDetail`. Nothing else in the app
      writes that slice.

**Two facts about the Rust side, already verified by the lead — do not
re-verify by building, and do not design around a different assumption:**

1. **`create_workbook` does not insert a catalog row.** It writes the file
   and returns a `WorkbookHandle` (`rust/tauri/src/commands/workbook.rs`'s
   `create_workbook_via`). C3 §3.2 and C4 §5 put catalog reconciliation in
   `rebuild_catalog` alone. So a newly created workbook is **absent from
   `list_workbooks` until a rebuild**.
2. **Every other workbook command resolves by scanning `workbooks/`, not
   via the catalog.** `resolve_workbook_path` reads the directory and
   matches front-matter ids, so `open_workbook` / `read_workbook` /
   `save_workbook` / `eval_workbook` all work on a just-created workbook
   with no rebuild at all. `list_workbooks` is the *only* catalog-backed
   call in this task (`catalog_read::list_workbooks`).

Those two facts together are why Step 4 opens the created workbook from its
returned handle **and** rebuilds — one for correctness now, one so the
picker sees it.

---

## Where

- Repo `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  single primary checkout.
- Work only under `app/src/routes/pages/Notebook/**`, plus
  `docs/IDL0_SPEC.md` (§26 only) and `CHANGELOG.md` (repo root).
- **Never run any cargo command.** TypeScript only. **No new npm
  dependency** — not one, for any reason; if you think you need one, that is
  a question, not a decision.
- Do not push. Do not amend a reported commit.
- **Ownership STOPs** — touching any of these is STOP and report:
  `app/src/App.tsx`, `app/src/App.css`, `app/src/main.tsx`,
  `app/src/state/**` (including `AppState.tsx` — see Open Question 3),
  `app/src/routes/types.ts`, `app/src/routes/pages/Data/**`,
  `app/src/routes/pages/Settings/**` (including `prefs.ts`/`prefsStore.ts` —
  see Open Question 2), `app/src/ipc/**`, `app/vite.config.ts`,
  `app/package.json`, `app/src-tauri/**`, `rust/**`, and **either contract
  spec**. C3 and C4 are frozen for UI lanes (operating brief §3).
- Reference source, **read-only**: idl0's Flutter workbook chrome at
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\analyze\workbook_bar.dart`,
  `.../workbook_dropdown_menu.dart`, `.../browse_workbooks_modal.dart`.
  Read these for Step 8's parity list. Port semantics, never widgets.

---

## Interfaces

### 1. `model/jsCellNote.ts` — why a `js` cell has nothing to draw (Step 1)

New pure module. One exported function and one exported result type. This is
the fix for the rendering gap; everything about it is decidable from data
already in `index.tsx`'s scope.

```ts
/** Why a `js` cell is plain-mounting with no chart, or `null` when it has
 *  a real binding and nothing needs saying. The string is shown verbatim in
 *  `JsCellFrame`'s note slot. */
export type JsCellNote = string | null;

/** Decides the note for one `js` cell that did **not** resolve to a chart
 *  binding. Pure: every input is a value `Notebook/index.tsx` already holds
 *  at render time. Order of causes is fixed and tested — the most specific
 *  cause wins, so a cell naming an unknown channel says that rather than
 *  the generic no-session line. */
export function jsCellNote(input: {
  /** `false` when `plotForm.parse` returned `null` — custom code, which is
   *  a legitimate state and gets no note. */
  isFormGenerated: boolean;
  /** `AppState.selection.sessionId`. */
  sessionId: string | null;
  /** `unresolvedChannelId(...)`'s result, or `null`. */
  unresolvedName: string | null;
  /** True when `unresolvedName` is a known definition with no recorded axis
   *  (the existing `definitionsWithAxis` distinction, R78 Q3(a)). */
  isAxisLessDefinition: boolean;
}): JsCellNote;
```

Cause order and copy (three plain sentences, no new visual language, no
banner — the same house style Task 20's notes use):

1. `isFormGenerated === false` → `null`. Custom code is not a problem.
2. `isAxisLessDefinition` → `Definition "<name>" has no recorded axis.`
   (unchanged from today's string — do not reword it).
3. `unresolvedName !== null` → `Channel "<name>" is not part of this
   session.` (unchanged from today's string).
4. `sessionId === null` → **`No session is selected — choose one in the Data
   tab.`** ← the new case. This is the one the preview was missing.
5. otherwise → `null`.

`index.tsx`'s `renderJsCell` calls this in the `binding === null ||
sessionId === null` branch instead of building the note inline. The existing
inline construction is deleted, not left beside it.

### 2. `model/workbookEntry.ts` — which workbook to open, and what to show (Steps 2–3)

New pure module. Every "which action does the user see" and "which workbook
opens" decision lives here and is unit-tested; `index.tsx` renders what it
returns and never re-decides.

```ts
/** The minimum of `WorkbookSummary` this module reads (structural, so a
 *  caller passes the real `ipc/catalog.ts` type unchanged). */
export interface WorkbookChoice {
  workbook_id: string;
  name: string;
  file_name: string;
}

/** What the Notebook shows for the current workbook list. */
export type WorkbookEntry =
  /** No indexed workbooks, and the rescan-on-open has already run (or is
   *  not applicable) — show the empty state: New workbook + Rescan. */
  | { kind: "empty" }
  /** Exactly one — open it, show no picker. */
  | { kind: "single"; workbookId: string }
  /** More than one — open `workbookId` and show the picker over `choices`. */
  | { kind: "choice"; workbookId: string; choices: readonly WorkbookChoice[] };

/**
 * Decides what to show and what to open. `rememberedId` is the last
 * workbook this machine opened (Interface 4); it wins when it is still in
 * `workbooks`, otherwise the first entry does — a workbook deleted or
 * renamed away must not leave the Notebook unable to open anything.
 * `workbooks` order is `list_workbooks`' own; this function never sorts.
 */
export function chooseWorkbookEntry(
  workbooks: readonly WorkbookChoice[],
  rememberedId: string | null
): WorkbookEntry;
```

Tests to write for it, at minimum: empty list; one workbook; three with no
remembered id; three with a remembered id present; three with a remembered
id **absent** (falls back to the first, and says so); a remembered id equal
to the first (no special case). Names read
`chooseWorkbookEntry — condition — result`.

### 3. `model/openEvalDriver.ts` — open a **named** workbook (Step 3)

Two changes, both narrow. Do not restructure this file.

- `runOpenAndEval` gains a `workbookId: string` parameter and opens **that**
  id. It no longer calls `listWorkbooks` and no longer decides anything
  about which workbook to open; drop `listWorkbooks` from `OpenEvalDeps`.
  The listing is now the page's own concern (Interface 5), because the same
  list feeds the picker, the empty state and the rescan — three consumers,
  one fetch.
- The `{ type: "markdownError", message: "No workbooks found." }` dispatch
  is **deleted**. "There are no workbooks" is not a failure to read a
  document's markdown; it is a state of the page, and it is now carried by
  `WorkbookEntry` (Interface 2). Overloading `markdownError` for it is the
  bug that makes today's empty state look like an error.

The staleness contract (`isStale()` after every `await`), the typed-action
discipline, and `runEval` are unchanged. Update
`model/openEvalDriver.test.ts`'s existing cases to the new signature —
extend, never weaken; the "list is empty" case moves to
`workbookEntry.test.ts` as `chooseWorkbookEntry — no workbooks — empty`.

### 4. `model/notebookPrefs.ts` — the remembered workbook (Step 5)

New module, ~30 lines, modelled on `Settings/prefsStore.ts`'s
`localStorageBackend` **shape** but **not importing it** (that file belongs
to the L7c lane; see Open Question 2).

```ts
/** This machine's Notebook UI preferences. Never leaves the machine, never
 *  reaches the engine — the same "UI-only half" the Settings tab's `ui`
 *  block is (`Settings/prefs.ts`'s `UiPrefs`), kept under the Notebook's own
 *  key because `Settings/**` belongs to another lane. */
export interface NotebookPrefs {
  /** `workbook_id` of the last workbook opened here, or `null`. */
  last_workbook_id: string | null;
}

/** Reads this machine's Notebook prefs. Never throws: a WebView that
 *  refuses storage (private mode, cleared site data, a policy), absent
 *  values and unparsable JSON all yield the defaults. */
export function readNotebookPrefs(): NotebookPrefs;

/** Persists `prefs`. Never throws — a refused write is silently dropped,
 *  because a remembered selection is a convenience and losing it must never
 *  break opening a workbook. */
export function writeNotebookPrefs(prefs: NotebookPrefs): void;
```

Key: `"idl1.notebook.ui.v1"` — the `idl1.<area>.<thing>.v<n>` shape
`Settings`' `idl1.settings.prefs.v1` already established. Both functions
wrap every `localStorage` access in `try`/`catch`, for the reason
`prefsStore.ts` states. Test both through an injected storage seam or by
stubbing `window.localStorage` — including the throwing case and the
corrupt-JSON case.

### 5. `components/WorkbookBar.tsx` — the visible surface (Steps 2, 4, 5)

New presentational component, rendered by `index.tsx` above the existing
save bar. It holds **no** IPC and **no** decisions: it takes a
`WorkbookEntry`-derived view model plus callbacks and renders. All logic is
Interfaces 2 and 4.

```tsx
export interface WorkbookBarProps {
  /** `null` while the first list is still in flight. */
  entry: WorkbookEntry | null;
  /** True while `rebuild_catalog` is running (either the automatic one or
   *  the Rescan button's) — disables both actions and shows progress. */
  rescanning: boolean;
  /** True while `create_workbook` is in flight. */
  creating: boolean;
  /** The last `rebuild_catalog` / `create_workbook` failure, typed
   *  (`IpcError` from `ipc/workbook.ts`), or `null`. Never a bare string. */
  error: IpcError | null;
  /** The last rebuild's counts, for the "Rescan found N workbooks" line. */
  lastRebuild: RebuildReport | null;
  onCreate: (name: string) => void;
  onRescan: () => void;
  onSelect: (workbookId: string) => void;
}
```

Rendering rules:

- **Empty state** (`entry.kind === "empty"`): a short paragraph — "No
  workbooks yet." — then two controls.
  - **New workbook**: an **inline `<input type="text">`** with a visible
    label and a `Create` button beside it. **Never `window.prompt`** — this
    is a dispatch-level rule, and a reviewer grades a native prompt a Major
    on sight. `Create` is disabled while the trimmed value is empty (C3
    §3.4: an empty `name` is `invalid_argument`) and while `creating`.
    Submitting on Enter is fine; the field lives in this component's own
    `useState` and is cleared on success.
  - **Rescan**: a `<button>` reading `Rescan`, disabled while `rescanning`.
    Beside it, once a rebuild has finished, one line of read-only text from
    `RebuildReport`: `Rescan found <workbooks_indexed> workbook(s) in
    <duration_ms> ms.` Units on the number, per CLAUDE.md §5.
  - One sentence telling the user why Rescan exists: "A workbook file copied
    into the `workbooks` folder appears here after a rescan." Say it in
    words; the catalog being a rebuildable index is a CLAUDE.md §3
    principle, not an implementation detail to hide.
- **Picker** (`entry.kind === "choice"`): a `<select>` labelled `Workbook`,
  one `<option>` per choice with `summary.name` as the text and
  `workbook_id` as the value, rendered **in the editor header row** —
  i.e. inside the same `workbook-save-bar` row that already holds Save, as
  its first element. `entry.kind === "single"` renders **no** picker (R66's
  deferral said "when more than one is indexed"; one workbook needs no
  choice), but **does** render the New workbook and Rescan actions in a
  compact form, since a second workbook has to be creatable from a
  non-empty notebook too.
- **Errors**: `error !== null` renders `error.message` in a
  `role="alert"` element. Route on `error.kind`, never on the message text
  (C3 §2).
- New CSS class names are fine; **do not add rules to `app/src/App.css`** —
  it is lead-owned (operating brief §2). If a control is unusable without
  styling, say so in your report and leave it unstyled. Note that
  `js-cell-frame`, `js-cell-frame-note` and `js-cell-frame-error` already
  have no rules anywhere in `app/src`, so unstyled-but-visible is the
  lane's current normal, not a regression you are introducing.

### 6. `index.tsx` — the wiring (Steps 2–5)

One new effect and three new handlers. Every one of them obeys the wave-2
operating brief §4 effects rule, which a reviewer grades **Critical** on
sight: an effect that starts IPC depends **only on data**, never on a
callback identity; the sequencing lives in a pure driver; staleness is a
monotonic sequence ref bumped at the start of each run and checked after
every `await`; **a cleanup never cancels in-flight work**.

- **The workbook-list effect.** Runs once on mount (empty dependency array
  is correct here — it depends on nothing) and again when a `reloadSeq`
  counter in local state changes (bumped by Rescan and by a successful
  create). It calls `listWorkbooks()`, and if the result is empty **and this
  is the first run for this mount**, it calls `rebuildCatalog()` once and
  re-lists (see Open Question 1 — implement this, it is the
  recommendation). It then sets `entry` from `chooseWorkbookEntry(list,
  readNotebookPrefs().last_workbook_id)`. Guard with a `listSeqRef`, exactly
  as `openSeqRef` is used today.
- **The open/eval effect.** Today's effect keyed on `[sessionId]` becomes
  keyed on `[sessionId, selectedWorkbookId]`, where `selectedWorkbookId` is
  derived from `entry` (and is `null` for `kind: "empty"`, in which case the
  effect returns early and starts nothing). It calls `runOpenAndEval` with
  the id. Keep `openSeqRef` and its `isStale` unchanged.
- **`handleCreate(name)`**: `createWorkbook(name)` → on success, in this
  order: (a) write `last_workbook_id = handle.id` through
  `writeNotebookPrefs`; (b) set `entry` to `{ kind: "single", workbookId:
  handle.id }` so the document opens **immediately** — this works with no
  rebuild, because `open_workbook` resolves by scanning `workbooks/`
  (GATE fact 2); (c) bump `reloadSeq` **and** run `rebuildCatalog()` first,
  so the re-list actually contains the new file (GATE fact 1 — without the
  rebuild the new workbook is invisible to `list_workbooks` and the picker
  would silently drop it on the next list). A `create_workbook` rejection
  sets the typed `error` and changes nothing else.
- **`handleRescan()`**: `rebuildCatalog()` → then bump `reloadSeq`. Store
  the `RebuildReport` for the bar's read-only line. Mirror
  `Data/index.tsx`'s existing "Rebuild catalog" button for the
  disabled-while-running and error-reporting shape; **read that file, do not
  edit it.**
- **`handleSelect(workbookId)`**: write the remembered id, then set `entry`'s
  `workbookId` — which re-keys the open/eval effect and opens the chosen
  document. Do not call `listWorkbooks` again.
- **The note fix** from Interface 1 replaces the inline note construction in
  `renderJsCell`.
- **The swallowed eval rejection** (Step 1b): see Step 1 below.

---

## Steps

- [ ] **Step 1 — the rendering gap (do this first; it is the preview's
      visible symptom).**

      The lead's trace, for you to confirm and then fix:

      With `selection.sessionId === null`, `runSessionSpan` dispatches
      `sessionDetail: null` and `sessionSpan: null` immediately
      (`model/sessionSpanDriver.ts`'s first branch). In `index.tsx`'s
      `renderJsCell`, the `binding === null || sessionId === null` branch
      then computes `const unresolved = sessionDetail !== null ? … : null`
      — which is `null` — so `note` is `undefined` and `JsCellFrame`
      renders **an empty `div` reserving `DEFAULT_JS_CELL_HEIGHT_PX` (240 px)
      with no text in it at all**. Meanwhile the sandbox still evaluates the
      cell: `channel()` resolves through `SandboxRuntime.channelLookup`,
      which returns `[]` for a name the host never pushed, so Plot renders
      an empty frame, `cellRendered` fires with that frame's height, and the
      host frame shrinks to it. **Net effect: blank space, no explanation,
      exactly what the 2026-09-06 preview captured.** Nothing is broken
      downstream of this — the note slot is simply never filled.

      Fix: Interface 1's `jsCellNote`, wired into `renderJsCell`. Confirm
      the trace in your report (say which of the two — the empty note or the
      empty Plot — you observed, if you can observe either).

- [ ] **Step 1b — the silently swallowed eval rejection.**
      `model/openEvalDriver.ts`'s `runEval` catches every `evalWorkbook`
      rejection with an **empty `catch` block** and dispatches nothing, so a
      whole-command failure is invisible everywhere in the app. This matters
      concretely: C3 §3.4 states every non-null `lap_context` rejects with
      `invalid_argument` until lap indexing at import lands, so selecting a
      lap makes the whole notebook stop updating with no message anywhere.

      Fix: add `{ type: "evalError"; error: IpcError }` to `WorkbookAction`,
      store it on `WorkbookState` as `evalError: IpcError | null` (cleared
      by a successful `evalResult`), dispatch it from `runEval`'s catch, and
      render `state.evalError.message` in a `role="alert"` line above the
      cell list. Typed throughout — never `String(error)` into a bare field
      (CLAUDE.md §5). Reuse the existing `IpcError` type from
      `ipc/workbook.ts`; if the rejection is not a recognisable `IpcError`,
      wrap it as `{ kind: "internal", message }` at the driver boundary, the
      same way `fftDriver.ts` already does. Tests in
      `openEvalDriver.test.ts` and `workbookState.test.ts`.

- [ ] **Step 2.** `model/workbookEntry.ts` + `workbookEntry.test.ts`
      (Interface 2).
- [ ] **Step 3.** `model/openEvalDriver.ts` — the `workbookId` parameter,
      `listWorkbooks` dropped from `OpenEvalDeps`, the "No workbooks found."
      dispatch deleted (Interface 3). Update its tests.
- [ ] **Step 4.** `model/notebookPrefs.ts` + tests (Interface 4).
- [ ] **Step 5.** `components/WorkbookBar.tsx` (Interface 5) and
      `index.tsx`'s wiring (Interface 6). Pure logic is tested; rendering is
      not (CLAUDE.md §4).
- [ ] **Step 6. Default session — implement the note, not the auto-select.**
      Do **not** dispatch `SET_SELECTED_SESSION` from the Notebook. Step 1's
      note tells the user what to do instead. See **Open Question 3**: the
      alternative touches lead-owned state and is the lead's call, not
      yours. Do not call `listSessions` for this purpose at all.
- [ ] **Step 7. Effects audit.** Re-read wave-2 operating brief §4 and check
      your own diff: no effect dependency array contains a function; no
      effect cleanup cancels in-flight IPC; every new async sequence checks
      a sequence-ref `isStale()` after every `await`. State the result in
      your report, per effect you added.
- [ ] **Step 8. Parity gaps.** Read idl0's `analyze/workbook_bar.dart`,
      `workbook_dropdown_menu.dart` and `browse_workbooks_modal.dart`, and
      list — in your report and in the §26.6 table — every workbook-chrome
      affordance idl0 had that this bar does not port, each with a reason.
      Silence is not deferral (operating brief §2). Start from what §26's
      opening paragraph already records ("idl0's worksheet/workbook-bar
      hierarchy is not carried forward") and make it concrete: name the
      worksheet tabs, the rename/duplicate/delete actions, the browse modal
      and the sync settings dialog explicitly, each as ported, deferred with
      a reason, or deliberately dropped. Do **not** implement any of them.
- [ ] **Step 9. SPEC (spec-during).** `docs/IDL0_SPEC.md` §26:
      - Add **§26.8 "Opening a workbook: empty state, rescan, picker"** —
        one or two paragraphs stating: `list_workbooks` is catalog-backed
        and therefore an index, not truth; an empty list triggers one
        automatic `rebuild_catalog` per page open and then the empty state;
        `create_workbook` writes a file but does not index it, so the
        Notebook opens the returned handle directly and rebuilds for the
        picker's sake; the picker appears only above one indexed workbook
        and remembers its choice per machine, never in the file; and a
        workbook file copied into `workbooks/` becomes visible after a
        rescan (C4 §4 watches `workbooks/` for *content* changes to an open
        document, not for catalog membership).
      - Add one sentence to **§26.1** stating what a `js` chart cell shows
        when no session is selected.
      - Add the Step 8 rows to **§26.6**'s parity-gap table.
      - Do not renumber existing subsections, and do not touch §26.2–§26.5
        or §26.7 beyond what is listed here.
- [ ] **Step 10. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: nothing printed, `exit=1`.
- [ ] **Step 11. Gate.**
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Notebook
      npx vitest run
      ```
      The lane filter must report a **non-zero `passed`** count and 0
      failed (a filter matching nothing is a failed gate), then the whole
      suite once. Report both real result lines, verbatim. The whole suite
      stood at **90 files / 834 passed** on `main` before this task; if your
      run is below that, something regressed and you stop and report.
      Coverage: the pure modules you add or touch
      (`model/jsCellNote.ts`, `model/workbookEntry.ts`,
      `model/notebookPrefs.ts`, `model/openEvalDriver.ts`,
      `model/workbookState.ts`) stay above 80 % — CLAUDE.md §4. Judge that
      by whether every branch you added has a test reaching it; do **not**
      run a coverage tool as part of the gate.
- [ ] **Step 12. CHANGELOG** — one bullet at the top of `### Added`, edited
      to match what actually shipped:
      ```
      - **Notebook empty state, New workbook, Rescan and workbook picker (L6 Task 21, R66, ledger 2026-09-06).** The Notebook no longer opens "the first indexed workbook" and reports "No workbooks found." as a document error. An empty catalog now runs one `rebuild_catalog` per page open and then shows a real empty state: an inline name field creating a workbook through `create_workbook` (never a native prompt), and a Rescan button re-running `rebuild_catalog` so a file copied into `workbooks/` becomes visible. Because `create_workbook` writes the file without indexing it, and every other workbook command resolves by scanning `workbooks/`, a new workbook opens immediately from its returned handle and the rebuild only serves the picker. Above one indexed workbook a `<select>` in the editor header chooses which to open, remembered per machine under `idl1.notebook.ui.v1` — the choice is UI state, never written into the file. Which workbook opens and which actions appear are decided by the new pure `model/workbookEntry.ts`, not inline in the page. Two rendering gaps found and fixed alongside: a `js` chart cell with no session selected reserved 240 px of blank space with no explanation (its note slot was only ever filled when a session was resolved) and now says so, and a whole-command `eval_workbook` rejection was swallowed by an empty `catch` and is now a typed `evalError` shown above the cell list.
      ```
- [ ] **Step 13. Commit.** Explicit paths, never `git add -A`:
      ```bash
      git add app/src/routes/pages/Notebook CHANGELOG.md docs/IDL0_SPEC.md
      ```
      Single-line message, **no AI attribution trailer**:
      ```
      app/Notebook: empty state, New workbook, Rescan, workbook picker (R66)
      ```

---

## Do not

- Do not use `window.prompt`, `window.alert`, or a native dialog for the
  workbook name. An inline field, in the page.
- Do not add a dependency, and do not add rules to `app/src/App.css`.
- Do not write to `app/src/state/AppState.tsx` or dispatch
  `SET_SELECTED_SESSION` from the Notebook (Open Question 3).
- Do not edit `app/src/routes/pages/Data/**` or `Settings/**`; read them for
  patterns and copy the shape into your own lane.
- Do not write a workbook file yourself, hand-build front matter, or
  interpolate a name into YAML — R75 put that in core, and `create_workbook`
  is the only path.
- Do not call `rebuild_catalog` on any schedule, on a timer, on every mount
  unconditionally, or from an interaction path. It is an explicit user
  action plus the one first-open-when-empty case.
- Do not sort, filter or de-duplicate `list_workbooks`' result. It is the
  catalog's own order.
- Do not persist the chosen workbook into the workbook file, into front
  matter, or into shared app state.
- Do not list a function in an effect's dependency array; do not cancel
  in-flight work from a cleanup.
- Do not weaken or delete an existing test. Cases move; they do not vanish.
- Do not run cargo, push, or amend.

## Style / hygiene

Doc comment on every exported symbol. **Units on every numeric value** — ms,
px, counts. `// TODO(idl0):` never a bare `// TODO`. Typed errors only:
every failure in this task is an `IpcError` with a `kind` you route on, never
a bare string and never a `throw` that reaches a render. Tests are
Arrange / Act / Assert with blank lines between; names read
`thing — condition — result`.

---

## Open questions for the lead

Answer none of these yourself. Where one blocks nothing, implement the
recommendation, say you did, and flag it.

**QUESTION 1 — Should the Notebook call `rebuild_catalog` once on open when
`list_workbooks` returns empty?**
Context: `list_workbooks` reads the catalog (`catalog_read::list_workbooks`),
which is "an index — deletable, rebuildable, never synced" (CLAUDE.md §3).
A fresh install, a restored `<data>` directory, a changed data-dir override,
or a deleted `catalog.sqlite` all produce an empty list over a directory that
has workbooks in it.
The gap: nothing states whether an empty index may be treated as "possibly
stale" rather than "there are none". Sources checked: C3 §3.2
(`rebuild_catalog`, `list_workbooks`), C4 §5's rebuild procedure and
"Nothing reads the catalog for truth", CLAUDE.md §3, SPEC §26.
Options: (a) rebuild once per page open when and only when the list is
empty, then re-list, then show the empty state if it is still empty;
(b) never rebuild automatically — the empty state's Rescan button is the
only path; (c) rebuild on every page open.
My recommendation: **(a)**. It is the reading that makes "the catalog is a
rebuildable index" true in the UI rather than only in the docs, it costs
nothing in the common case (a non-empty list never triggers it), and it
removes the one state where a user with workbooks on disk sees a page that
says they have none and cannot tell why. (c) is rejected outright: C4 §5's
rebuild walks blobs, sessions, `derived/*.parquet` and `lap_summary`, so it
is not a per-open cost. The cost of (a) is that a genuinely empty
installation pays one full rebuild before showing its empty state — show
"Looking for workbooks…" while it runs so that is not mistaken for a hang.
Cost if wrong: one conditional. Blocking: no.

**QUESTION 2 — Where does the remembered workbook choice live?**
Context: the brief asks for the choice remembered "per the Settings `ui`
convention". That convention is `Settings/prefs.ts`'s `UiPrefs` block inside
the `idl1.settings.prefs.v1` document, read and written through
`Settings/prefsStore.ts`'s `PrefsBackend` — and L7c Task 8 has already moved
the **engine** half of that document to `get_settings`/`set_settings`, with
the `ui` half staying in `localStorage`.
The gap: `app/src/routes/pages/Settings/**` belongs to the L7c lane
(operating brief §2), so the Notebook adding a `last_workbook_id` field to
`UiPrefs` is a cross-lane edit, which CLAUDE.md §7 routes through the lead.
Sources checked: operating brief §2, R53 Settings Q1, `Settings/prefs.ts`,
`Settings/prefsStore.ts`, `Settings/prefsMigration.ts`.
Options: (a) a Notebook-local `idl1.notebook.ui.v1` key with its own tiny
try/catch-wrapped reader/writer, following the same naming and
failure-handling convention without importing the other lane's module;
(b) add `last_workbook_id` to `Settings`' `UiPrefs` as a lead shell task and
have the Notebook read it through `PrefsBackend`; (c) keep it in memory only
and re-choose the first workbook every launch.
My recommendation: **(a)** now, with a `// TODO(idl0):` naming (b) as the
consolidation once one lane owns app-wide UI prefs. It respects the
ownership boundary, it is ~30 lines, and the key name makes the eventual
merge obvious. (c) is rejected: it makes the picker forget every launch,
which is most of its value.
Cost if wrong: one small module deleted and one field added elsewhere.
Blocking: no.

**QUESTION 3 — Should the Notebook default `selection.sessionId` to the most
recent session?**
Context: with `selection.sessionId === null`, chart cells plain-mount and
(after Step 1) say so. The alternative is for the Notebook to call
`list_sessions`, pick the most recent by `timestamp_utc_ms`, and dispatch
`SET_SELECTED_SESSION`.
The gap: `state/AppState.tsx` is lead-owned (operating brief §2), and R53
Data Q3 assigned the writer role for the `selection` slice to **L7a Data**
— "L7a writes it; L6 reads it". A Notebook that writes it makes two writers
of one slice, and the Data tab's own detail pane keys off the same value, so
opening the Notebook would silently open a session detail pane in another
tab. Sources checked: R53 Data Q3, R52 Q9, operating brief §2,
`AppState.tsx`, `Data/index.tsx`'s `selectSession`/`closeDetail`.
Options: (a) keep the note; the Notebook never writes the selection;
(b) the Notebook defaults the selection to the most recent session and
dispatches `SET_SELECTED_SESSION`, making it a second writer;
(c) a lead shell task adds a distinct "default session" resolution to
`AppState` that both tabs read, so the default is computed in one place and
neither tab writes the other's slice.
My recommendation: **(a)** for this task, with **(c)** as the right shape if
Isaac wants a chart on screen without a trip to the Data tab. A blank
notebook that says "no session is selected — choose one in the Data tab" is
honest and one click from correct; a notebook that silently picks a session
is a number the user did not choose driving every chart on the page, which
is the opposite of "time is recorded, not assumed" in spirit. If the lead
rules (b), it is a small change: one `listSessions` call in the existing
session effect and one dispatch, and this brief's Step 6 inverts.
Cost if wrong: one effect added, one note left unreachable. Blocking: no —
(a) is implementable now and is strictly a prerequisite of (b) anyway, since
the note is still what a user with **no** sessions at all must see.

**QUESTION 4 — Should the picker appear at exactly one indexed workbook?**
Context: R66 item 3 deferred "a picker over `listWorkbooks`", and the
2026-09-06 ledger note says "a workbook picker when more than one is
indexed".
The gap: whether "more than one" is a literal rendering rule or a
description of when it matters. With exactly one workbook a `<select>` with
one option is inert but tells the user which document they are looking at,
which nothing else in the page currently does.
Sources checked: R66, the 2026-09-06 tracked note, SPEC §26, design §6.
Options: (a) `<select>` only above one workbook, and a plain read-only name
label at exactly one; (b) `<select>` always, even with one option; (c) no
name shown at all at one workbook.
My recommendation: **(a)**. It follows the ledger's wording literally while
still answering "which file am I editing", which a save-and-conflict surface
(§26.5) arguably needs anyway.
Cost if wrong: one conditional in `WorkbookBar`. Blocking: no.

**QUESTION 5 — What happens to unsaved edits when the picker switches
workbook?**
Context: `workbookState` carries `dirtyCellIds` and an in-memory `markdown`
that may differ from disk; `saveFlow` is explicit-save only (Task 14). Today
nothing can switch documents, so the question has never arisen.
The gap: no source states whether switching discards local edits, blocks, or
prompts. Sources checked: C2, C4 §4, SPEC §26.5, R44, R67,
`model/saveFlow.ts`, `components/ConflictBanner.tsx`.
Options: (a) disable the picker while `state.dirtyCellIds.size > 0`, with a
visible reason ("save first"); (b) switch and discard; (c) a confirm dialog.
My recommendation: **(a)**. It is the only option that cannot lose a user's
typing, it needs no new dialog vocabulary (the app has none yet — the Data
tab still uses `window.confirm` under a `TODO(idl0)`), and it is one
`disabled` attribute to relax once L11's per-cell merge exists. (b) silently
loses work; (c) invents a modal this lane has no home for.
Cost if wrong: one `disabled` condition. Blocking: no.

**QUESTION 6 — Should Rescan report sessions and tracks too?**
Context: `RebuildReport` carries `sessions_indexed`, `workbooks_indexed`,
`tracks_indexed` and `duration_ms`. The Data tab's existing "Rebuild
catalog" button runs the same command and this task adds a second entry
point to it.
The gap: whether two buttons in two tabs running one global rebuild should
each report the whole report or only their own tab's slice.
Sources checked: C3 §3.2, C4 §5, `Data/index.tsx`'s `maintenance.ts`.
My recommendation: report `workbooks_indexed` and `duration_ms` only in the
Notebook, since a user pressing "Rescan" in the Notebook asked about
workbooks — but do not hide that the rebuild is global; the accompanying
sentence should say the whole index was rebuilt.
Cost if wrong: one string. Blocking: no.

---

## Report back (concise)

- Commit hash and `git show --stat`.
- Your GATE findings: both `merge-base` lines, and each of the six read-the-
  file premises, confirmed or not.
- **Step 1's rendering gap**: confirm or correct the lead's trace, and say
  exactly what a `js` chart cell rendered before your fix and after it.
- **Step 1b**: confirm the empty `catch` in `runEval` was there and what it
  now dispatches.
- The exact gate commands and their **real** result lines — lane filter and
  whole suite, both non-zero `passed`, 0 failed, whole suite at or above
  90 files / 834 passed.
- The exact names of every test case you added, grouped by file, and the
  name of every existing case you changed and why.
- Which resolution you used for each of the six open questions, and anything
  you resolved that is not in this brief.
- Your parity-gap list from Step 8, and confirmation that §26.6 now records
  all of it.
- One line each confirming: no `window.prompt`/`alert`/native dialog; no new
  npm dependency; `App.css` untouched; `AppState.tsx` untouched and no
  `SET_SELECTED_SESSION` dispatched from the Notebook; `Data/**` and
  `Settings/**` untouched; `rebuild_catalog` called only from Rescan and the
  one first-open-when-empty case; no effect dependency array gained a
  function; no effect cleanup cancels in-flight work; every new async
  sequence checks `isStale()` after every `await`.
- Whether the new workbook opens without a rebuild in your reading of the
  code, and where the rebuild is therefore actually needed.
- Per-step done/deviated.
- Anything ambiguous you could not resolve — stop and report rather than
  guessing (CLAUDE.md §1).

## Questions template (use verbatim if you must stop)

```
QUESTION <n>
Context: <the file/line and what you were doing>
The gap: <what no source states — cite the sources you checked by path/section>
Options: (a) … (b) … (c) …
My recommendation: <one option, one sentence why>
Cost if wrong: <what has to be undone>
Blocking: yes/no — <what you can finish without the answer>
```
