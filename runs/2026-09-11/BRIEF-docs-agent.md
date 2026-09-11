# Brief: docs + agent -- generated reference, editor help, Ask an agent, AGENTS.md (R222/R223)

Lean owner, Rust cli + tauri + TypeScript + CI YAML. Worktrees: Rust `idl-rs-worktrees/
docs-agent`, app `../idl1-app-worktrees/docs-agent`. Read CLAUDE.md, rulings R222, R223; C2 §3
(maths language), §5.1 (host vars), §5.3 (plotForm); `list_math_builtins` in
`rust/tauri/src/commands/engine.rs` and the catalog it reads (`rust/core/src/math/catalog.rs`);
`Notebook/editor/*` (CodeMirror), `CodePane.tsx`; `.github/workflows/ci.yml`; `docs/CI.md`.

## Rulings (do not ask)
1. **Generated reference.** `idl-rs docs workbook --out <path>` writes `docs/WORKBOOK-REFERENCE.md`
   from the builtin catalog (name, signature, unit rule, shape, description, one example each,
   grouped by category) followed by curated sections kept in `docs/reference-src/*.md`
   (annotations `# label:`/`# unit:`/`# shape:`, windows and laps, host vars, plotForm subset,
   retired names). CI job: regenerate and `git diff --exit-code`; fails when stale. The file is
   bundled into the app (Tauri resources) and read at runtime for the help panel.
2. **Editor help.** CodeMirror hover on a builtin name shows its catalog entry (signature,
   unit rule, one-line description); F1 and a "Docs" button in the code column open the
   reference in the sidebar (or the Properties/Code column if the vscode-shell lane has not
   merged; read main) scrolled to the anchor; Plot/d3 identifiers link to upstream docs.
3. **Ask an agent.** Button in the code column AND in the Data tab's session detail and the
   status bar: a C3 §3.10 command `open_agent_terminal(context: { session_id?, workbook? })`
   spawns the user's terminal with the configured agent command (Settings, default `claude`),
   cwd = `<data>` (the data root), initial prompt built in Rust: "You are working in the idl1
   library at <data>. Read AGENTS.md first. Context: <session/workbook if any>." Uses the Tauri
   shell plugin with an allowlist of exactly the configured command; `unsupported_platform` on
   mobile. Windows: `wt.exe` if present else `powershell`; document macOS/Linux as untested.
4. **AGENTS.md at the data root**, written on first launch and rewritten when the app version
   changes (template in core, versioned): folders and their meaning, the CLI verbs with one
   example each (`import`, `library fold-in|scan|stale|rebuild|index`), where the reference
   lives, and the never-touch rules (blobs immutable; catalog disposable; never edit
   `data.parquet`; workbooks are the truth, edit them). Also `docs/llms.txt`.
5. **CHANGELOG tag**: every entry from now on carries `[docs]` or `[no-docs]`; add the rule to
   CLAUDE.md §6 in this lane (one line) and tag this lane's own entries.

## Gates
Rust: targeted filters, `cargo test -p idl-rs-cli`, `-p idl-rs-tauri -- --test-threads=4`,
`cargo check -p app`. App: tsc + vitest, vite build. CI YAML validated with python yaml. One
reviewer (sonnet). Merge both repos (main into branch first, --no-ff), submodule bump,
CHANGELOG `[docs]`, retire in the R171 order. Contract text in the app worktree. Lanes never
create branches or edit files in the main checkout. Never push. Report 12 lines or fewer.
