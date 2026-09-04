# L3 Task 8 — implementer brief (JS cells, `${…}` spans, host-variable data; C2 §5)

You are the implementer for L3 Task 8 of the idl1 rewrite — the eighth task
of the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 7 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md`
  — Global Constraints (41–135), `### Task 8` (509–577); contract C2
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c2-workbook-v3.md`
  §5.1 (host variables — `channel()`, `laps`, `session`, `constants`), §5.2 (`${…}` span
  grammar); the pre-read `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks6-9.md`, Task 8
  section (G8.1–G8.9, L3-R21–R24); ledger `R21` in `runs\2026-09-03\decisions.md` (approves
  L3-R21–24 as drafted; Q2's `HostSession.name = None` default is already folded into L3-R23);
  Task 5's landed `core/src/math/eval.rs` (`ChannelLookup`, `LookupChannel{t_us: Arc<[i64]>}`,
  `MathLapContext{main_lap_bounds: Vec<(f64,f64)>}`, 1-based lap indexing at `eval.rs:567`);
  Task 6's `workbook/v3/resolve.rs` (the overlay-lookup pattern — reuse it for `channel()`'s
  definition lookup, plan 548); `core/src/session/handle.rs:632-641` (`SessionHandle::
  slice_by_time` — the inclusive-both-ends window convention to mirror) and
  `core/src/session/mod.rs:341-362` (`Session`'s fields — no `name`, feeds `HostSession.name`'s
  `None` default); `workbook/v3/cell.rs:121` (`scan_cells`'s existing
  `pulldown_cmark::Parser::new_ext(...).into_offset_iter()` — reuse the same style of parse
  pass for `find_inline_exprs`'s Code/CodeBlock skip-ranges) and its fence-in-prose test (an
  inert fence's body lands in `prose_before` verbatim — `${...}` inside it must not be
  extracted).

## COMPUTE RULES — non-negotiable
This machine is memory-bound (cargo is capped at 2 jobs machine-wide; do not override). **The
plan's own gate is broken:** plan 573's `cargo test -p idl-rs "workbook::v3::(host|js_cell)"`
matches **zero tests** — `cargo test`'s filter is a plain substring, not a regex, so this would
silently "pass" at `0 passed; 0 failed`. Run two instead, per the standing rule: `cargo test -p
idl-rs workbook::v3::host` and `cargo test -p idl-rs workbook::v3::js_cell`, each reporting a
non-zero `passed` count. No full suite, no tarpaulin, no `-j`, no separate `cargo build`/`cargo
check` (not required this task — no `pub` signature reaching `idl-rs-cli` changes), no
`.cargo/` edits, never `cargo fmt`. One cargo process at a time, foreground.

## The task (plan Task 8, Steps 1–5) with these rulings
Three of the plan's stated interfaces are wrong: `to_host_channel`'s own test (plan 537, "empty
input — HostChannel with length 0") enshrines the wrong rule for L3-R12's routine axis-less
case (G8.1) — superseded by L3-R21. `channel()`'s plan signature (line 524) cannot do what the
plan's own prose requires — no `MathLapContext` param, no second lookup for cross-session, wrong
error type (G8.5) — superseded by L3-R22. `host_session(session: &Session)` is uncallable from
anything this lane builds — `SessionHandle.session` is private, `eval_cells` takes no `Session`
(G8.3) — L3-R23 states it plainly as a standalone function with no caller in wave 1; do not
thread a `Session` into Task 9 to make it callable.

**Ruling (lead, R21) — L3-R21.** `pub fn to_host_channel(t_us: &[i64], v: &[f64]) ->
HostChannel`, with **`length = v.len()`** — values are never dropped. `t` is
`t_us[i] as f64 / 1e6` over `min(t_us.len(), v.len())` entries, so `t` is **empty when the
source has no recorded axis** (L3-R12) and is documented as such: *"`t.len() == length` for any
channel with a recorded axis; `t` is empty for a scalar or table-sourced result, and a consumer
must not plot such a value against `t`. A time axis is never synthesized (C1 §3.5 invariant
4)."* Tests: `t_us = [0, 1_000_000, 2_500_000] — t = [0.0, 1.0, 2.5]`; `empty t_us, three
values — length 3, t empty, v preserved`; `both empty — length 0`.

**Ruling (lead, R21) — L3-R22.** `pub fn channel(lookup: &dyn ChannelLookup, name: &str, lap:
Option<u32>, lap_ctx: &MathLapContext, other_session: Option<(&str, &dyn ChannelLookup)>) ->
Result<HostChannel, MathEvalError>`. Failure kinds: `UnknownChannel` for an unknown name,
`UnknownChannel` for a requested `session` id with `other_session == None` or a mismatched id,
`NoLapContext` for a `lap` with empty `main_lap_bounds`. No `WorkbookError` — this is C2 §3.5.B
territory and C3 §2 already carries every kind. The lap window converts seconds→µs once
(`(t_secs * 1e6).round() as i64`) and is **inclusive at both ends**, matching `SessionHandle::
slice_by_time`; that conversion site gets its own test.

**Ruling (lead, R21) — L3-R23.** `HostLap`/`HostSession`/`HostChannel` derive `Serialize` with
`#[serde(rename_all = "camelCase")]` — C2 §5.1's `startT`/`endT`/`timestampUtcMs` are the signed
JS-visible names, and a doc comment records that this is a deliberate, host-variable-only
exception to C3 §1's snake_case rule (these are Observable module-scope bindings, not IPC
payload fields). `host_laps` numbers laps `index + 1` and its doc comment states this is the
engine's 1-based index into `main_lap_bounds` (`eval.rs:567`), equal to `Lap.lap_number` only
when the caller built the bounds from an unfiltered ascending lap list. `HostSession.name` is
`None` with a `// TODO(idl0):` pointing at Q2. `host_session`/`host_laps`/`host_constants` are
standalone functions with **no caller in wave 1** — `eval_cells` does not call them (host-var
injection is L6's, plan 96–101); stated so nobody threads a `Session` into Task 9. **Lead-owned
flag (batch with L3-R4):** C3 has no byte path for host channels (G8.7); `HostChannel`'s doc
comment says it is an in-process shape, not an IPC payload, and that decimation is the host's
job per C2 §5.1, not `to_host_channel`'s.

**Ruling (lead, R21) — L3-R24.** `find_inline_exprs(prose: &str) -> Vec<InlineExpr>` scans raw
text with a brace depth counter that **skips `'…'`, `"…"` and `` `…` `` string literals
(honouring `\` escapes)**, and skips byte ranges that `pulldown-cmark` reports as `Event::Code`
or `CodeBlock` in `prose` (collected in one prior pass — the parser is already a dependency and
`scan_cells` already uses `into_offset_iter`). Nested `${}` inside a template literal is out of
scope and documented. `start`/`end` are byte offsets **into the `prose` slice passed in**, not
into the document — stated on the struct, since L6 splices with them and L11 merges near them.

### Step 1: `to_host_channel`
Implement exactly L3-R21. Tests: the three named in L3-R21 above — NOT the plan's own "empty
input — HostChannel with length 0" (plan 537), which is the wrong rule (G8.1).

### Step 2: `channel()` general lookup
Implement L3-R22's corrected signature. Tests: `channel("X") with no lap/session — same as
ChannelLookup::lookup("X") converted via to_host_channel`; `channel("X", lap: Some(2), ...) —
t/v windowed to lap 2's bounds`; `channel("nonexistent") — UnknownChannel`;
`session: Some("other"), other_session: None — UnknownChannel`; `lap: Some(n) with empty
main_lap_bounds — NoLapContext`.

### Step 3: `host_laps`/`host_session`/`host_constants`
Thin, direct mappings per L3-R23 — one test each, field-for-field, against a synthetic
`MathLapContext`/`Session`/`WorkbookDoc`. `host_constants(doc)` reads `WorkbookDoc.constants`
(Task 6's L3-R16 field). `host_session(...).name` is always `None`, with the `// TODO(idl0):`.

### Step 4: `find_inline_exprs`
Implement L3-R24's scanner. Tests: `"Bottom-outs: ${count(x)}" — one InlineExpr, js_expr ==
"count(x)"`; `"${a} and ${b}" — two InlineExprs in order`; `"${ {a: 1} }" — brace-balanced,
js_expr == " {a: 1} "`; `no ${...} present — empty Vec`; plus L3-R24's two new ones:
`"${ x + \"}\" }" — one InlineExpr, brace inside the string ignored`; `${…} inside a fenced code
block in prose — not extracted`.

### Step 5: Test and commit
Run both filters above, expect non-zero `passed`, `0 failed` each. Commit with explicit paths
(NOT `git add -A`): `git add core/src/workbook/v3/js_cell.rs core/src/workbook/v3/host.rs` —
message `workbook: v3 host-variable data (channel/laps/session/constants) and \${...} span
extraction (C2 §5)`. Single line, no AI attribution trailer.

## Do not
- Do not run the plan's literal Step 5 gate (`"workbook::v3::(host|js_cell)"`) — it matches
  zero tests (see COMPUTE RULES above).
- Do not implement `to_host_channel`'s "empty input — length 0" case as the plan states it (plan
  537) — L3-R21 supersedes it; `length` always equals `v.len()`, never follows `t`.
- Do not return `WorkbookError` from `channel()` (plan 524, 558) — a missing channel is
  evaluation-time, `MathEvalErrorKind::UnknownChannel` (G8.5).
- Do not use snake_case field names on `HostLap`/`HostSession`/`HostChannel` for JS-visible
  serialization (G8.6) — `#[serde(rename_all = "camelCase")]`, per L3-R23.
- Do not thread a `Session` into Task 9's `eval_cells` to make `host_session` callable (G8.3) —
  it has no caller in wave 1, by design (L3-R23).
- Do not build any byte/decimation path for `HostChannel` reaching the sandbox (G8.7) —
  lead-owned flag, batched into ledger R21's contract-amendment list, not this task's job.
- Do not use a naive `{`/`}` depth counter with no string-literal or fenced-code-block awareness
  (plan 531's own suggestion) — it mis-parses `${ x + "}" }` and extracts `${…}` out of an inert
  fenced code block inside prose (G8.9; `cell.rs`'s existing fence-in-prose test already proves
  the latter case exists).

## Style / hygiene
Doc comment on every public symbol; units where numeric (`t`/`start_t`/`end_t` in seconds,
`t_us` in µs — state which, at every conversion site); typed errors only; A/A/A tests named
`thing — condition — result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — per the lead's explicit instruction, the `{length, t, v}` shape's
contract text and the C3 byte-path gap are folded into ledger R21's lead-owned
contract-amendment batch; this task codes the ruled behaviour, it does not touch C2 or C3.

## Report back (concise)
Commit hash + `git show --stat`; both test commands and result lines (with `passed` counts);
per-step done/deviated; confirmation no `regex` crate was added; confirmation `to_host_channel`'s
three L3-R21 tests and `find_inline_exprs`'s two L3-R24 tests are present by name; confirmation
`host_session(...).name` is `None` with the TODO; anything ambiguous you resolved (say how) or
that needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
