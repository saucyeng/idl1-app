# Brief: lap UI -- the lap column through the app, lap progression draws, the lap table (R233)

Lean owner, TypeScript only, never cargo. Worktree `../idl1-app-worktrees/lap-ui`. Read
CLAUDE.md, rulings R127, R210, R216, R217, R233 and the laps-shapes digest entry (2026-09-13);
C2 §3.6 (minimal shapes), §4 (table cells, `rowSource: "windowLaps"`, `mainRowId`), §5.1 host
vars, §5.3 lap-progression form; C3 §3.4 IDLH v2 (`axis_kind`); `Notebook/model/{jsCellBinding,
channelBindDriver}.ts`, `host/protocol.ts`, `SandboxHost`, `NotebookSession`, `sandbox/main.ts`,
the four `channelData` handlers in `Notebook/index.tsx` incl. the rebuild-replay paths (the b2
lane's critical bug was a missing replay), the tier B lap-progression chart generator, and the
table cell rendering (`Notebook/components/*Table*`, the C2 §4 table model).

## Do (commit after every task)
1. **Lap axis through the app.** The IDLH decoder exposes `axis_kind`; the sandbox host-var
   record gains a `lap` column (1-based lap numbers as numbers) when `axis_kind` is `Lap`, `t`
   stays for `Time`; thread it through the bind driver, protocol, SandboxHost, NotebookSession,
   the sandbox, and all four `channelData` handlers **including rebuild replay**; pure tests on
   the decode and the record shaping; a replay test that a `[lap]` host var survives a sandbox
   rebuild.
2. **Lap progression draws**: the tier B form `{x: "lap"}` binds a `[lap]` value (a definition
   or `lap_time()`) and draws a per-lap series per window with the R216 legend/title rules.
3. **Lap table UI**: an app-side table model over the new per-row-lap table command;
   `rowSource: "windowLaps"` renders one row per lap of the selected windows, the main row
   (incl. `"fastest"`) highlighted, columns as authored (`lap_time()`, `sector_time(i)`,
   definitions), units in headers, R210 status per cell; edits to the table cell's source go
   through the normal cell edit path. Dense mode (R216.3) applies.
4. **Docs**: the generated reference already lists the builtins; add a "Lap tables and
   progression" page to `docs/reference-src/` so `idl-rs docs workbook` picks it up (run the
   generator? no cargo: write the source page and note in the report that CI regenerates; the
   lead runs the generator at merge time if needed).
5. CHANGELOG `[docs]`.

## Gates
From `app/`: tsc, vitest (baseline from main), vite build. One reviewer (sonnet). Merge --no-ff
(main into branch first), retire in the R171 order with the tightened check. Lanes never create
branches or edit files in the main checkout. Never push. Report 10 lines or fewer.
