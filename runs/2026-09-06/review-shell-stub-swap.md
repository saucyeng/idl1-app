# Review — post-L8w UI shell task (stub swap)

**Commits:** `d83a14d` (ipc wrappers for 20 L8w commands, `IDLH` decoder,
`WorkbookEvent.hash`, `readWorkbook` stub retired, `lapContext` wiring) ·
`65d1b21` (Settings/Device/Data stubs swapped) · `b53b19b` (`pickImportFile`
via `@tauri-apps/plugin-dialog`) · `7e82dae` (`functionCatalog` self-check) ·
`404d979` (CHANGELOG/TASKS docs).

**Files touched:** `app/src/ipc/{app,catalog,device,hostChannel,rasters,workbook}.ts`
+ their `*.test.ts`; `app/src/routes/pages/Data/{DetailPane,FilePicker,
ImportPanel,MetadataForm,index}.tsx` + `FilePicker.test.ts`, `ipcStubs.ts/.test.ts`;
`app/src/routes/pages/Device/{PushConfigBar.tsx,ipcStubs.ts}`;
`app/src/routes/pages/Settings/{DataSection.tsx,ipcStubs.ts}`;
`app/src/routes/pages/Notebook/{index.tsx,ipcStubs/readWorkbook.ts,
model/{openEvalDriver,workbookState,saveFlow,functionCatalog}.ts}` + tests;
`CHANGELOG.md`, `TASKS.md`. Nothing outside `app/src/**` + the two docs files
(`git diff --stat d83a14d~1 404d979` confirms — no `rust/`, no `app/src-tauri`,
no `App.tsx`/`state/`/`vite.config.ts`).

**Test command (run once):**
```
cd app && npx tsc --noEmit && npx vitest run
```
**Result:** `tsc` clean; vitest **81 files / 625 tests passed** — matches the
implementer's report exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Major | `app/src/routes/pages/Data/FilePicker.ts:23-40`, `ImportPanel.tsx:56-59,115-125` | Ruling R55/R77.1 requires the pasted-path field to keep its tested "paste a path → import" behaviour, with a separate Browse button opening the native dialog beside it. `b53b19b` instead repurposes the field as the dialog's `defaultPath` (starting folder) and deletes the old direct-import tests (`FilePicker.test.ts` no longer has a "paste a path, no dialog interaction, import that path" case). CHANGELOG documents the repurposing honestly ("the pasted-path field becomes the dialog's starting folder instead of the literal import target"), so this isn't a silent deviation, but it is an explicit ruling violation as landed. | Add a second entry point: keep `pickImportFile`'s current dialog-opening behaviour under a `Browse…` button, and restore a direct `Import` action that calls `importFile` with the trimmed pasted path verbatim when non-empty (no dialog round trip) — i.e. two buttons, "Import path" (direct) and "Browse…" (dialog, optionally seeded from the pasted text). Restore/port the deleted "paste a path → import it directly" test case. |
| Minor | `CHANGELOG.md` bullet (2026-09-06 UI shell task) | The bullet correctly states the pasted-path repurposing but does not flag it as an open ruling conflict (R55/R77.1) the way it flags the four intentionally-left-unwired seams. A reader skimming CHANGELOG could mistake the repurposing for an accepted design choice rather than a pending fix. | Add one clause noting the repurposing needs a follow-up per R77.1 (or point at this review). |
| Note | — | Everything else checked (20 IPC wrapper signatures/arg-names/return types against `rust/tauri/src/commands/{app,catalog,device,workbook,rasters}.rs`, the `IDLH` header layout against `core/src/workbook/v3/host_channel_wire.rs`, `lapContext` field-name mapping, `WorkbookEvent.hash`'s required-ness, the tightened IPC-effects rule across every effect in `Notebook/index.tsx`, `saveSessionMetadata`/`deleteSession` wiring, `diffFunctionCatalog`'s three mismatch kinds, the `MarkdownStatus`/`not_implemented` removal, and file-scope) came back clean — see rationale below. | — |

### Verification detail (no findings)

1. **20 command wrappers, byte-for-byte.** Checked every command name, arg
   name (camelCase on the wire per Tauri's default convention — consistent
   with C3 §1's "not one wrapped object" and distinct from the JSON-payload
   snake_case rule) and return type against the Rust signatures: `app.ts`'s
   7 (`getSettings`/`setSettings`/`getDataDir`/`setDataDir`/`listProfiles`/
   `saveProfile`/`deleteProfile`) against `commands/app.rs:190-368`;
   `device.ts`'s 11 against `commands/device.rs:640-821`; `catalog.ts`'s 2
   against `commands/catalog.rs:590-606`; `workbook.ts`'s 8 (`openWorkbook`,
   `readWorkbook`, `createWorkbook`, `evalWorkbook`, `fetchHostChannel`,
   `listMathBuiltins`, `saveWorkbook`, `watchWorkbook`) against
   `commands/workbook.rs:695-812`; `rasters.ts`'s `fetchFft` against
   `commands/rasters.rs:511-521`, including the `AveragingToken` snake_case
   enum. All match exactly; `IpcError` passes through untouched (frontend
   never reshapes rejections).
2. **`IDLH` decoder** (`ipc/hostChannel.ts`) matches
   `core/src/workbook/v3/host_channel_wire.rs`'s `encode_host_channel_idlh`
   field-for-field (offsets 0/4/6/8/12/16/24, little-endian, reserved
   zero-padding). Copies every value out via `DataView.getFloat64` — no
   `Float64Array` view over the raw buffer (ruling R59 Q3(a) honoured).
   Typed `HostChannelDecodeError` (`kind: "internal"`) on bad magic, wrong
   version, and truncated buffer; tests assert literal byte offsets and
   error messages by regex.
3. **`lapContext` mapping.** `Notebook/index.tsx:167` maps
   `{ mainLap, overlayLaps }` → `{ main_lap: ..., overlay_laps: ... }`,
   matching `LapContext { main_lap: Option<u32>, overlay_laps: Vec<u32> }`
   (`commands/workbook.rs:138-147`) exactly. It's read via a ref
   (`evalLapContextRef`, updated every render) rather than added to any
   effect's dependency array — consistent with the tightened effects rule
   (data-only deps; a value that changes on every render but isn't itself
   IPC-driving stays out of the array, same pattern as `sessionIdRef`).
   Traced every IPC-driving effect in the file (open/eval on `[sessionId]`,
   session-span on `[sessionId]`, watch on `[state.handle?.id]`, debounced
   edit-eval on `[state.dirtyCellIds, state.handle?.id]`, channel-bind on
   `[state.cells, state.markdown, sessionDetail, sessionSpanUs, sessionId]`):
   all data-only deps, no cancelling cleanup (the debounce cleanup clears a
   *timer*, never an in-flight promise; the watch/channel-bind effects use
   monotonic sequence refs, not cleanup, for staleness).
4. **`WorkbookEvent.hash`.** `commands/workbook.rs:160-179`'s doc comment
   states no code path constructs a `WorkbookEvent` without a hash in hand,
   and the field is a plain (non-`Option`) `String`. `saveFlow.ts`'s
   `WorkbookEventWithHash` interim optional-hash type is correctly retired
   to a plain alias; `isSelfWrite`'s dead "hash === undefined" branch is
   removed along with it.
5. **Data save/delete flows.** `MetadataForm.tsx`'s `onSaved` calls
   `saveSessionMetadata`, then on success calls `onSaved(updated)` from a
   `.then()` (explicit button click, not an effect) →
   `Data/index.tsx:180-185`'s `handleMetadataSaved` refreshes both the open
   detail pane and the sessions list. `handleDeleteSession`/
   `handleForgetSession` (`index.tsx:143-170`) close the detail pane and
   reload sessions only inside the `SUCCEEDED` branch of
   `startMaintenanceAction`'s callback — no self-cancelling effect, no
   `invoke` call in a render body anywhere in this file. Errors surface via
   `describeIpcError`/`maintenanceState.status === "failed"`.
6. **`pickImportFile`.** The `openDialog` injection seam (`OpenDialogFn`,
   defaulting to the real `open()`) is correctly kept for testability. The
   repurposing of the pasted-path field is the Major finding above.
7. **`diffFunctionCatalog`.** All three mismatch kinds
   (`missing_locally`/`missing_remotely`/`status_mismatch`) are exercised
   in `functionCatalog.test.ts`, plus a self-consistency check of the real
   69-entry `MATH_FUNCTIONS` table against itself. The banner effect in
   `Notebook/index.tsx:230-239` runs once on mount (`[]` deps), has a
   `cancelled` guard (not a cancel of in-flight IPC — `listMathBuiltins`
   never rejects, so there's nothing to cancel), and only sets local state.
8. **`MarkdownStatus`/`not_implemented` removal.** `workbookState.ts`'s
   `"not_implemented"` value, the `markdownNotImplemented` action, and its
   reducer branch are all removed together; grepped the whole `Notebook/`
   tree for `markdownNotImplemented`/`NotImplementedError` — no stale
   references remain. (The `"not_implemented"`/`"notImplemented"` strings
   still present in `functionCatalog.ts`/`.test.ts` are the unrelated
   `list_math_builtins` wire vocabulary, not a leftover from this removal.)
9. **File scope.** `git diff --stat d83a14d~1 404d979` shows only
   `app/src/**`, `CHANGELOG.md`, `TASKS.md` — no `rust/`, `app/src-tauri`,
   `App.tsx`, `state/`, or `vite.config.ts` touched, per the operating
   brief's UI-lane ownership rule. TASKS.md's "real and wired" vs "real,
   unwired" distinctions (Device tab status/control/profiles,
   `get_settings`/`set_settings`, `fetch_host_channel`) match what the code
   actually does.
10. **Tests.** Spot-checked `hostChannel.test.ts`, `functionCatalog.test.ts`,
    `catalog.test.ts`, `FilePicker.test.ts`: Arrange/Act/Assert with blank
    lines, named `thing — condition — result` (the `ipc/*.test.ts` files use
    the pre-existing `"command resolves — calls invoke with ..."` two-part
    variant of that convention, matching untouched sibling files like
    `cursor.test.ts`/`tiles.test.ts` — not a new deviation). All exported
    functions/interfaces carry doc comments referencing C3 sections/rulings.

## Verdict rationale

The wrapper layer is correct in every mechanical dimension checked: 20
command signatures, the `IDLH` binary layout, `lapContext` field names, the
`WorkbookEvent.hash` contract, and every IPC-driving effect's compliance
with the tightened effects rule. Tests are well-formed and the CHANGELOG/
TASKS updates are honest about what's wired versus deferred. The one real
problem is a standing ruling violation (R55/R77.1: pasted-path import must
stay a direct import path, not become the dialog's start folder) that the
lead had already flagged before this review and that is not fixed in the
reviewed commit range — it's a scoped, single-file/two-component fix, not
a design gap, so it doesn't block on architecture but does need a follow-up
commit before this seam is considered done.

VERDICT: FINDINGS 0 Critical, 1 Major, 1 Minor
