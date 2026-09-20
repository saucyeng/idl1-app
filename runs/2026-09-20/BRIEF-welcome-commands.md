# Brief: Welcome commands and the generated function table (R244 follow-up, R249)

Lean owner (Sonnet), TypeScript plus one small Rust CLI addition. Worktrees: app
`../idl1-app-worktrees/welcome-cmds` (branch `welcome-cmds`, `app/node_modules` junctioned to
main's: never `npm install` there), Rust `idl-rs-worktrees/welcome-cmds` (branch
`welcome-cmds`). The only Rust lane running (R235). Read CLAUDE.md (section 6 generated
artefacts; section 8: >= 3 GB commit free, cargo in the FOREGROUND only, gate on the exit
code), digest entries R222, R228-R230, R244, the "Queued: generated function table" entry, the
Dockview lane's report items 8 and 10 in the digest, then `app/src/shell/welcomeItems.ts`,
`WelcomePanel.tsx`, `commandTiers.ts` and where commands are registered, `docsPanelStore.ts`,
`recentWorkbooks.ts`, `updateState.ts`, `model/functionCatalog.ts` + its tests, and in Rust
`cli/src/verbs/docs.rs` (how `docs cli --json` is done) and `core/src/math/catalog.rs`.

## Do (commit after every task)
1. **Generated function table (R249).** `idl-rs docs workbook --json --out <path>` emits the
   builtin catalog (name, signature, category, status, one-line doc, units if present) as
   stable, sorted, LF JSON, the same pattern as `docs cli --json`; no new verb, a flag on the
   existing one (C6 row amended). The app's `MATH_FUNCTIONS` is read from the checked-in
   `app/src/routes/pages/Notebook/model/functionCatalog.json`; the hand-transcribed array and
   its count-pinning tests go; a test asserts the JSON's shape. CI gains the same
   regenerate-and-`git diff --exit-code` step as the CLI table (`.github/workflows/ci.yml`,
   `docs/CI.md`, `.gitattributes` LF pin, CLAUDE.md section 6's list of generated outputs).
   The runtime mismatch banner stays (it guards a stale installed app against a newer engine).
2. **Five commands in the registry**, each with a tier, a label, and a palette entry, each
   async where it touches the filesystem (R201), no new IPC command unless stated:
   `library.revealFolder` (open the data root in the OS file manager: use the opener plugin
   already in the app; if its capability scope does not allow the data dir, escalate with the
   exact capability change needed rather than widening it yourself); `help.workbookReference`
   and `help.cliReference` (open the docs panel at that document through `docsPanelStore`);
   `help.releaseNotes` (open the release notes panel without triggering an update check);
   `workbook.openPath` (takes a path argument; the registry gains argument support only if it
   lacks it, in the smallest form that works, and Recent rows use it).
3. **Welcome panel** gains the items R244 listed that were left out, wired to those ids;
   session count in the footer only if an existing store already has it, else leave it out.
4. UI-DIRECTION and C6 text (spec-during), CHANGELOG `[docs]`.

## Gates
Rust: targeted `docs` tests, `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`,
`cargo check -p idl-rs-cli --tests`. App: tsc, vitest, the madge cycle scan, vite build. All
four generated outputs regenerate with no diff. One Sonnet reviewer. Do NOT merge: stop with
both branches committed and report in 10 lines or fewer. Never push. Lanes never create
branches or edit files in the main checkout. Escalate with "ESCALATION:" + a proposal and do
not proceed past it on that point.
