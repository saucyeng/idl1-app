# Review: welcome-cmds (R244/R249)

Commits reviewed:
- App (`idl1-app-worktrees/welcome-cmds`, branch `welcome-cmds` vs `main`):
  b1fee98, 441d156, d28580f (merge), c043b12.
- Rust (`idl-rs-worktrees/welcome-cmds`, branch `welcome-cmds` vs `main`):
  21f6c5a, 349b0b5, c8687ff, 15efe83.

Files touched: 30 in app (commands.ts, commandTiers.ts, commandRegistry.ts,
AppShell.tsx, DocsPanel.tsx, docsPanelStore.ts, UpdatePanel.tsx,
welcomeItems.ts, menuModel.ts, ipc/docs.ts, functionCatalog.{ts,json,test.ts},
app-tauri capability/plugin/bundle config, CI workflow, .gitattributes,
CHANGELOG, two spec docs); 6 in idl-rs (core/src/docs.rs, cli/src/docs_cmd.rs,
cli/src/verbs/store.rs, core/src/commands/table.rs, tauri/src/commands/docs.rs,
tauri/src/lib.rs).

Test command: none run (dispatch is read-only; no cargo/npm/vitest invoked,
per lead's instructions and CLAUDE.md §8 "readers never build"). Rust test
counts verified by reading the added `#[test]` fns statically; TS test
additions verified by reading the `*.test.ts` diffs.

| Severity | file:line | Finding | Fix |
| --- | --- | --- | --- |
| Minor | `CLAUDE.md` §6 (main checkout, untouched) | Brief item 1 explicitly required updating "CLAUDE.md section 6's list of generated outputs" (`idl-rs docs workbook`, `docs cli`, `docs wire`) to include the new `docs workbook --json` output; `CLAUDE.md:65` still lists only the three original generated sources and was not amended in either worktree. | Add `functionCatalog.json` / `docs workbook --json` to the §6 sentence in a follow-up commit. |
| Minor | `docs/CLI-REFERENCE.md:410`, `core/src/commands/table.rs:895` | Generated/user-facing CLI help text for `docs workbook` embeds "(ruling R249)" — an internal ruling id leaking into a document meant for external CLI users. | Reword without the ruling reference; regenerate. |
| Minor | `app/src/shell/welcomeItems.test.ts`, `commands.test.ts`, `docsPanelStore.test.ts` (new cases) | Several new test bodies skip the blank-line Arrange/Act/Assert separation CLAUDE.md §4 asks for (e.g. `commands.test.ts`'s three new `helpPaletteCommands` cases, `welcomeItems.test.ts`'s two new cases) — same style as some pre-existing tests in these files, not a regression this lane introduced wholesale. | Cosmetic; not blocking. |

No Critical or Important findings. Specifically checked and found clean:

- **Shell/opener capability scope**: `capabilities/default.json` grants only
  `opener:allow-reveal-item-in-dir` (not `opener:default`), the narrowest
  permission for the one call used. `library.revealFolder`
  (`AppShell.tsx`) calls `revealItemInDir(dataRootPath)` where
  `dataRootPath` comes from `useDataRootPath()` — a value published only by
  `DataRootGate`'s own `get_data_dir` IPC result, never user/webview input.
  The command is not registered at all until that value resolves (no
  no-op/undefined-path button). No webview-reachable path lets an arbitrary
  string reach the opener plugin.
- **`workbook.openPath`**: despite the name, its argument is an existing
  catalog id (`entry.id` from `recentWorkbookItems`), routed to the existing
  `handleSelect(workbookId: string)` — the same internal picker-selection
  path `OpenWorkbookDialog` already used. Not a raw filesystem path, so no
  new arbitrary-open surface. `commandRegistry.ts`'s `Handler` type widened
  from `() => void` to `(arg?: string) => void`, and every other handler
  ignores the argument — verified by reading each `useCommand`/registration
  call site touched.
- **`read_cli_reference` (Rust)**: resolves only the fixed bundled resource
  name `CLI-REFERENCE.md` via `BaseDirectory::Resource`, same pattern as
  the pre-existing `read_workbook_reference`; no path argument from the
  frontend. Bundled via `tauri.conf.json`'s `resources` map. Typed
  `IpcError`/`NotFound`, no `unwrap`/`Err(String)`.
- **R201 (async)**: both new Tauri commands and `library.revealFolder`'s
  handler are async/non-blocking; `read_bundled_doc` do a bounded local
  file read only.
- **Generated function table**: `core::docs::workbook_catalog_json` sorts by
  name, uses `serde_json::json!` without the `preserve_order` feature (key
  order is BTreeMap-alphabetical, so top-level and per-entry key order is
  deterministic run-to-run — matches the "byte-identical" test added).
  `docs workbook --json` writes via the CLI's own `--out`, LF-terminated
  (verified: no `\r` in output, single trailing `\n`), 75 entries matching
  the deleted hand-transcribed table's count. `.gitattributes` pins LF on
  the new file. CI step added correctly: regenerates then
  `git diff --exit-code`s the exact checked-in path. `docs/CI.md` and the C6
  spec (`docs/superpowers/specs/2026-09-11-idl1-c6-cli.md`) both updated in
  the same commits. `functionCatalog.ts`'s hand-transcribed array and its
  three count/name-pinning tests are gone; replaced with shape/uniqueness/
  sort-order tests against the generated import — no test still asserts the
  old 75/70/5 pinned counts or the deleted table.
- **CHANGELOG**: single new entry tagged `[docs]`, accurately describes all
  five commands and the generated table, correctly notes the runtime
  mismatch banner is intentionally unchanged.
- **UI-DIRECTION**: R244's Welcome-panel paragraph amended in place to name
  the five R249 additions and their sections — consistent with the actual
  `welcomeItems.ts` diff (Start gains "Open library folder", Learn gains the
  three Learn rows in R244's stated order before the pre-existing two).
- **Layer discipline**: all frontend logic stays in `app/src`; the one Rust
  addition (`docs workbook --json`) is core+CLI+tauri glue with no DSP: the
  Tauri crate only re-exposes an existing core function, correctly thin.

VERDICT: CLEAN
COUNTS: critical=0 important=0 minor=3
NOTES: no correctness/security issues found; the CLAUDE.md §6 generated-outputs list and the CLI help text's stray "(ruling R249)" are the only gaps worth a follow-up commit.
