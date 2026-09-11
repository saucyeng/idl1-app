# Review: docs-agent lane (R222 items 1–5)

Commits reviewed — app (idl1-app-worktrees/docs-agent, main...docs-agent excl.
9eeb6d8 merge): c4d69c0, 51550d0, 2bb76b5, 037a4fd, 58e8d99, c00fe8b.
Rust (idl-rs-worktrees/docs-agent, main...docs-agent): 310aa20, 5075f60,
855a6e6, bb82ed6.

Files touched (41 app files, 15 Rust files) — key ones: `tauri/src/commands/docs.rs`,
`core/src/docs.rs`, `core/src/store/agents_md.rs`, `core/src/math/catalog.rs`,
`cli/src/docs_cmd.rs`, `app/src/shell/DocsPanel.tsx`, `docsMarkdown.ts`,
`docsPanelStore.ts`, `AskAnAgentButton.tsx`, `Notebook/editor/builtinDocs.ts`,
`CodeColumnActions.tsx`, `CodePane.tsx`, `WorkbookCodePane.tsx`,
`docs/WORKBOOK-REFERENCE.md`, `docs/reference-src/*`, `docs/llms.txt`,
`.github/workflows/ci.yml`, `docs/CI.md`.

Test command: gates were pre-run by the implementer (not rerun here, per
instructions) — reported idl-rs core/cli/tauri tests pass, tsc clean, 2579
vitest tests pass, vite build ok. Verified statically: Rust test bodies in
`tauri/src/commands/docs.rs`, `core/src/docs.rs`, `core/src/store/agents_md.rs`,
`cli/src/docs_cmd.rs` match their assertions (Arrange/Act/Assert, named
`thing — condition — result`); TS tests in `app/src/ipc/docs.test.ts`,
`docsMarkdown.test.ts`, `docsPanelStore.test.ts`, `builtinDocs.test.ts` read
correctly and assert what they claim.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `idl-rs-worktrees/docs-agent/tauri/src/commands/docs.rs:216-243` | `terminal_invocation`'s Windows-fallback/macOS/Linux paths interpolate `cwd` (the data root path) unescaped into a shell command string (`Set-Location '{cwd}'; …`, `cd '{cwd}' && …`). `check_context_field`/`check_agent_command` validate session/workbook/agent-command but never validate `data_root`. A data root containing an apostrophe (plausible on Windows, e.g. a user folder like `O'Brien`) breaks the quoting and is a local shell-injection point on the three shell-interpreted paths, not just a cosmetic break. | Validate/escape `cwd` the same way `check_context_field` does, or quote-escape single quotes before interpolation, on all three shell-taking paths. |
| Important | `idl-rs-worktrees/docs-agent/tauri/src/commands/docs.rs:154-170,223,231,241` | `check_agent_command` allows spaces and the doc comment claims "a bare program name or an absolute path" is supported, but on the macOS/Linux/Windows-fallback paths `agent_command` is spliced unquoted into the shell line (`& {agent_command} '{prompt}'`, `{agent_command} '{prompt}'`) while `cwd`/`prompt` are quoted. An absolute path containing a space (`C:\Program Files\...`, `/Applications/My App.app/...`, both realistic) is silently split into multiple shell tokens instead of one program — breaks the exact scenario the doc comment says is supported, on the two platforms explicitly marked "untested" plus the Windows non-Terminal fallback. | Wrap `agent_command` in the same quoting as `cwd`/`prompt` on those three paths, or reject a command containing whitespace with the existing `invalid_argument` path. |
| Minor | `idl1-app-worktrees/docs-agent/docs/CI.md:31-32` | A literal raw newline was written into the Markdown where the source clearly meant the two characters `` `\n` `` (the sentence "The renderer writes `\n` line endings…" is split mid-code-span across two lines in the committed file — confirmed with `cat -A`). Breaks rendering of that sentence. | Fix the two lines to read `` The renderer writes `\n` line endings on every platform… `` on one line. |
| Note | (repo-wide) | Ruling R222 item 5 ("tag this lane's own [CHANGELOG] entries") — CLAUDE.md §6 was updated with the one-line rule (`CLAUDE.md` diff), but none of the six reviewed commits add a tagged `CHANGELOG.md` entry for this lane's own work. Per the brief's own Gates section this is expected to land at the merge step ("Merge...CHANGELOG `[docs]`"), so not counted as a defect in these commits — flagging so the merge step doesn't skip it. | Confirm the merge step adds the `[docs]` CHANGELOG entry before pushing. |
| Note | `idl-rs-worktrees/docs-agent/core/src/store/settings.rs:33-36` | Doc comment on `agent_command` says "it is passed as the program, with arguments built by the command layer" — true only on the `wt.exe` path; on the other three paths it is shell-interpolated (see Important findings above). Minor doc-accuracy overclaim, not a behavioural bug in itself. | Soften the doc comment to describe both cases, or fix per the Important findings above so the comment becomes true everywhere. |

## Spec/ruling compliance

- **R222.1 (generated reference).** `core/src/docs.rs` renders the builtin
  catalog + retired-name table purely and deterministically from
  `math_builtin_catalog()`/`math_name_migrations()`, then appends curated
  `docs/reference-src/*.md` in filename order. CI job added
  (`.github/workflows/ci.yml`) regenerates and `git diff --exit-code`s. Spot
  checked ~15 of the 72 catalog rows' new `category`/`signature`/`unit_rule`/
  `shape` fields against C2 §3.3's table (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`)
  — all matched. C2 §3.3 also lists `lap_number`/`lap_time`/`sector_time`
  (R217, same date) which are absent from `math_builtin_catalog()` entirely
  (not just undocumented) — pre-existing engine/spec drift, not introduced by
  this lane, and out of this lane's scope (it documents the catalog, not the
  engine).
- **R222.2 (editor help).** Hover (`builtinHover`) and `F1` (bound in both
  `CodePane.tsx` and `WorkbookCodePane.tsx`) wired correctly; anchor slug
  computed identically in Rust (`idl_rs::docs::slugify`) and TS
  (`docsMarkdown.ts`'s `slugify`) — both drop everything but alnum/`_`/`-`
  and map space to `-`.
- **R222.3 (Ask an agent) — the security shape asked about.** The webview is
  granted no `shell:*` permission at all (`capabilities/default.json`); the
  only call into `tauri_plugin_shell` is the Rust-side `app.shell().command()`
  inside `open_agent_terminal`, spawning exactly one program per invocation.
  This satisfies the "allowlist of exactly the configured command" intent
  architecturally (no static plugin scope is possible since the command is
  user-configured) rather than via the plugin's declarative scope — a
  reasonable reading, not a deviation. `unsupported_platform` is correctly
  returned on Android/iOS via `#[cfg]`-gated duplicate command. Windows
  wt.exe-if-present-else-powershell fallback matches the ruling. See the two
  Important findings above for the real gaps: `cwd` is not validated the way
  context fields are, and `agent_command` is not quote-safe on non-Windows-Terminal
  paths.
- **R222.4 (AGENTS.md).** Template in core, versioned via a marker comment,
  rewritten on version change, written at launch only when the data root is
  present (`app/src-tauri/src/lib.rs`), never fatal. Content covers the
  folders table, all six CLI verbs with one example each, and the five
  never-touch rules — matches the ruling's list. `docs/llms.txt` added and
  cross-links correctly.
- **R222.5 (CHANGELOG tag).** CLAUDE.md §6 updated with the one-line rule.
  See Note above re: this lane's own entries.

## Typed errors / doc comments / units / layering

- No `Err(String)` found in the new Rust code; `IpcError`/`AgentsMdError`/
  `CliError` used throughout with typed kinds (`NotFound`, `Io`,
  `InvalidArgument`, `UnsupportedPlatform`).
- No `unwrap()` on data paths in non-test code (only in `#[cfg(test)]` helpers,
  acceptable).
- Doc comments present on every new public symbol; units are named where they
  apply (`Hz`, `rad`, `mm/s`, etc., transcribed from C2).
- Layering: `core/src/docs.rs` and `agents_md.rs` are pure, no Tauri; the
  shell/process spawn and resource resolution live only in
  `tauri/src/commands/docs.rs`; no DSP in `app/src-tauri`; no number computed
  in the new TypeScript — `docsMarkdown.ts` and `builtinDocs.ts` only parse
  and format strings the Rust side already computed.
- `read_workbook_reference` is `#[tauri::command(async)]` (R201 compliant)
  and correctly resolves via `tauri::path::BaseDirectory::Resource`, matching
  `bundle.resources` in `tauri.conf.json`.

## Verdict rationale

Core ruling compliance (generated reference, editor help wiring, AGENTS.md,
CHANGELOG rule) is solid and well tested. The two Important findings are real
gaps in the exact area flagged for special scrutiny — the security/injection
shape of `open_agent_terminal` — where the implementer clearly thought hard
about quoting for user-supplied `session_id`/`workbook`/`agent_command` values
but missed that the data-root `cwd` is spliced into the same shell strings
unvalidated, and that `agent_command` itself isn't quoted on the very paths
that do go through a shell. Neither is exploitable by a remote attacker, but
both are real breakage/injection risks on the machine's own local data, land
in code the reviewer was specifically asked to scrutinize, and are cheap to
fix. Not blocking on their own given no regression and low practical exposure
(the affected paths are Windows-without-wt.exe, and the explicitly
"untested" macOS/Linux paths), but should be fixed before merge.

VERDICT: NEEDS_FIXES
