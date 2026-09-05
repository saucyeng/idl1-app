# L8w Task 11 — implementer brief (`fetch_host_channel`, `IDLH` encoder, C3 §3.4)

You are the implementer for L8w Task 11: a pure core encoder
(`encode_host_channel_idlh`) turning a decimated `HostChannel` into the
`IDLH` v1 binary layout, plus the `fetch_host_channel` Tauri command that
evaluates one named workbook definition and returns its bytes via
`tauri::ipc::Response`. TDD, ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Do NOT touch `docs/`. Do NOT push.
- **Files:** create `rust/core/src/workbook/v3/host_channel_wire.rs` (or add
  to `host.rs` — implementer's call, document which and why: a separate
  file keeps the pure-encoder concern away from `host.rs`'s lookup logic,
  which is this brief's recommendation but not mandatory); modify
  `rust/tauri/src/commands/workbook.rs`, `rust/tauri/src/lib.rs`.

- Read first: `CLAUDE.md`; plan Task 11 in full
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  C3 §3.4's `fetch_host_channel` entry, **byte-exact**, quoted below —
  this is the binding layout, not L6's originally-filed one (see next
  paragraph); the landed `rust/core/src/workbook/v3/host.rs`'s
  `HostChannel`/`to_host_channel` **in full** (lines ~1–75) — `to_host_channel`
  already does the µs→s conversion this encoder must not repeat;
  `rust/core/src/chart_decimation.rs`'s `decimate_channel`/`TIER_BASE`/
  `TILE_SIZE_BUCKETS` doc comments — read to judge whether its bucket
  min/max-per-bucket semantics fit a host channel's "decimate to N points
  for a line chart" need, or whether they don't (a tile's decimation is
  min/max *pairs* per bucket, doubling point count — a host channel
  plotted as a line series wants single values, not pairs; read the doc
  comment yourself and decide, do not assume either way); the landed
  `tauri/src/commands/workbook.rs`'s `eval_workbook_via`/session resolution
  path (you reuse its session/lap resolution, not reinvent it) and its
  `CellDefResult`/`HostChannelRef` (the JSON marker this binary command's
  bytes are the *other half* of — do not confuse the two: `HostChannelRef`
  stays JSON, this task's bytes are the actual sample data);
  `runs/2026-09-05/lanes/l6/IPC-NEEDS.md`'s N3 entry (in the L6 worktree,
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook\runs\2026-09-05\lanes\l6\IPC-NEEDS.md`,
  read-only) — **this filing's layout is a 20-byte header; it is stale.**
  C3 §3.4 as amended (quoted below) fixes a **24-byte** header per ruling
  R59 Q3(a)'s alignment padding. Implement C3's 24-byte layout; L6's TS
  decoder, if it was built against the 20-byte filing, needs a fix that is
  a **lead shell task**, not this one — flag the discrepancy in your report
  regardless, do not silently assume L6 already matches.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs encode_host_channel_idlh`
(core) and `cargo test -p idl-rs-tauri
commands::workbook::fetch_host_channel` (tauri), foreground, each non-zero
`passed`. No `cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo
process at a time.

**`pub`-change check:** `cargo check -p idl-rs-cli --tests` (new `pub` core
surface) **and** `cargo check -p idl-rs-tauri`.

## C3 §3.4 (quoted — binding layout, 24-byte header)

> `budget`: `u32`, max points, validated `1..=65536`. Returns raw bytes via
> `tauri::ipc::Response`, arguments and existence validated first.
>
> **Binary layout `IDLH`, version 1.** Little-endian throughout.
>
> | Field | Type | Byte offset | Notes |
> |---|---|---|---|
> | `magic` | `[u8; 4]` | 0 | ASCII `"IDLH"` |
> | `version` | `u16` | 4 | `1` |
> | `flags` | `u16` | 6 | bit 0 = `has_t`; all other bits reserved, zero |
> | `length` | `u32` | 8 | number of `f64` values in `v` |
> | `t_length` | `u32` | 12 | number of `f64` values in `t`; `0` when the source has no recorded axis |
> | `reserved` | `[u8; 8]` | 16 | zero-filled |
>
> Header ends at byte offset **24**, padded so both payload arrays start on
> an 8-byte boundary (ruling R59 Q3(a)). Then `t` as `t_length` × `f64` at
> offset 24 (seconds), then `v` as `length` × `f64` at offset `24 +
> t_length*8`. Total length `24 + t_length*8 + length*8`.
>
> `t` is empty (`t_length == 0`, `has_t` clear) when the source has no
> recorded axis. Decimation to `budget` happens before these bytes are
> produced, so `length` is always ≤ `budget`.
>
> Errors: `not_found` (unknown workbook or definition), `invalid_argument`
> (`budget` outside range), the `math_*` kinds when the definition itself
> fails to evaluate, `io`, `internal`.

## Interfaces

```rust
// core (new module)
/// Encodes `hc`, decimated to at most `budget` points, as `IDLH` v1 bytes
/// (C3 §3.4, ruling R59 Q3(a)'s 24-byte padded header).
pub fn encode_host_channel_idlh(hc: &idl_rs::workbook::v3::host::HostChannel, budget: u32) -> Vec<u8>;

// tauri/src/commands/workbook.rs
#[tauri::command]
pub fn fetch_host_channel(
    data_dir: tauri::State<'_, DataDir>,
    workbook_id: String,
    session_id: Option<String>,
    def_name: String,
    budget: u32,
) -> Result<tauri::ipc::Response, IpcError>;
```

## Key logic — `encode_host_channel_idlh`

- Decimate first, encode second — never encode more than `budget` points.
  **Decide, don't assume, whether `chart_decimation.rs` fits**: its
  `decimate_channel` produces `(min, max)` *pairs* per bucket for a tile's
  min/max rendering — a host channel bound to a JS host variable and
  plotted as a plain line series wants single values per point, not
  min/max pairs, so `decimate_channel` as-is almost certainly does **not**
  fit this need directly. If, after reading its doc comment, you agree it
  doesn't fit, implement the simplest correct thing instead: a uniform
  stride downsample (`step = ceil(v.len() / budget)`, take every `step`-th
  sample) — state this explicitly in the function's own doc comment ("a
  plain stride sample, not `chart_decimation`'s bucket min/max — see
  `encode_host_channel_idlh`'s own doc comment for why") rather than
  silently inventing something fancier or silently reusing something that
  doesn't fit.
- Decimate `v` and (if `hc.t` is non-empty) `t` **together**, at the same
  indices, so a sample's value and its time stay paired.
- `flags` bit 0 = `hc.t` non-empty after decimation (equivalently, before —
  emptiness doesn't change under decimation).
- Byte-build with `Vec<u8>` + `extend_from_slice(&x.to_le_bytes())` for
  every field, in the exact field order/offsets above. `reserved: [u8; 8]`
  is eight zero bytes.
- No `budget` validation inside this function — that's the command's job,
  before calling it (§1's binary-command validation-before-bytes rule); this
  function assumes `budget >= 1` and just does not exceed it.

## Key logic — `fetch_host_channel`

1. Validate `budget` in `1..=65536` → `invalid_argument` otherwise, before
   touching the workbook/session.
2. Resolve the workbook + session using `eval_workbook_via`'s existing
   session/lap resolution path (`resolve_workbook_path`,
   `session_source::{load_session_handle, load_lap_context}`) — do not
   duplicate that resolution logic freshly.
3. Evaluate the named definition. **Decide, don't assume**, which of these
   two shapes to implement, and document which and why in your report:
   (a) evaluate the **whole** workbook via the existing cell-evaluation path
   and pick `def_name` out of the resulting `defs`/`CellDefResult`s
   (simpler, almost certainly fine at wave-2 scale — a few dozen cells at
   most); or (b) find/add a single-definition evaluation entry point if one
   already exists in `idl_rs::workbook::v3::eval`/`resolve`. Check for (b)
   first; if none exists, (a) is the correct scope for this task (writing a
   new single-definition entry point in `core` "for efficiency" is out of
   scope unless it already exists).
4. Unlike `eval_workbook` (which never rejects the whole command for one
   cell's failure), **this command does reject** on a failing definition —
   there is no partial result to return for the one channel actually
   requested. Map the definition's `math_*` failure straight to the
   command's own `IpcError` via the existing `From<MathEvalError>` impl.
5. `not_found` for an unknown `workbook_id` or a `def_name` that names no
   definition in the document (distinct from a `def_name` that exists but
   fails to evaluate, which is a `math_*` kind).
6. On success, get the definition's `HostChannel` (via `to_host_channel`,
   already how `CellDefResult`s are built today — reuse that conversion,
   don't hand-roll a second one), call `encode_host_channel_idlh(&hc,
   budget)`, wrap in `tauri::ipc::Response::new(bytes)`.

## Tests

**Core** (`rust/core/src`, no filesystem):
- A channel with a recorded axis (`t` non-empty) round-trips: build a
  `HostChannel`, encode, manually decode by reading bytes at the documented
  offsets, assert every value matches, header is exactly 24 bytes, `flags`
  bit 0 set.
- An empty-`t` channel (scalar/table-column result) encodes `t_length == 0`,
  `flags` bit 0 clear, and the `v` region starts immediately at offset 24
  (no gap left for a `t` region that isn't there).
- Decimation reduces point count when the source exceeds `budget`
  (`length <= budget`, exactly `budget` if you chose a fixed stride that
  lands there, or documented behaviour if not) and is a no-op when the
  source is at or under `budget`.
- Header is exactly 24 bytes for every case above (compute the offset of
  the first `t`/`v` byte yourself from the encoder's own output and assert
  it against the documented formula, not just "looks plausible").

**Tauri**:
- `budget` outside `1..=65536` → `invalid_argument`, no evaluation
  attempted.
- Unknown `workbook_id` → `not_found`.
- Unknown `def_name` on a real workbook → `not_found`.
- A `def_name` whose definition fails to evaluate (e.g. references an
  unknown channel) → the command's own rejection carries the `math_*` kind,
  not a partial/empty byte response.
- A successful fetch returns bytes whose header, decoded manually in the
  test, matches the requested `def_name`'s known channel.

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the worktree.
- [ ] **Step 2: Decide the decimation approach** (stride vs. reusing
      `chart_decimation`) after reading its doc comment — do not skip this
      read.
- [ ] **Step 3: Write failing core tests**, implement
      `encode_host_channel_idlh`.
- [ ] **Step 4: Write failing tauri tests**, implement
      `fetch_host_channel`/its `_via` core, deciding the single-definition-
      vs-whole-workbook evaluation approach (document your choice).
- [ ] **Step 5: Register** in `lib.rs`'s `handler()`.
- [ ] **Step 6: Test** — both filters, confirm non-zero `passed` each.
- [ ] **Step 7: `cargo check -p idl-rs-cli --tests` and `cargo check -p
      idl-rs-tauri`**, both clean.
- [ ] **Step 8: Commit** — explicit paths (name the new module) plus
      `tauri/src/commands/workbook.rs tauri/src/lib.rs` — message
      `core+tauri: fetch_host_channel, IDLH v1 encoder (C3 3.4, R59 Q3a 24-byte header)`.

## Do not

- Do not implement the stale 20-byte header from L6's IPC-NEEDS filing —
  C3's signed 24-byte layout wins.
- Do not repeat `to_host_channel`'s µs→s conversion inside the encoder —
  `HostChannel.t` is already in seconds by the time it reaches this
  function.
- Do not touch `app/src/` — the TS decoder fix (if L6 built against the
  stale layout) is a lead shell task.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol, stating the deliberate stride-vs-tile
decimation choice; units on every numeric value (`t`: seconds); A/A/A tests
named `thing — condition — result`; no `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.4 already fixes this layout byte-exact;
this task implements it as specified.

## Report back (concise)

Commit hash + `git show --stat`; both test-filter results with `passed`
counts; both `cargo check` results; the decimation approach chosen (stride
vs. `chart_decimation`) and why; the single-definition-vs-whole-workbook
evaluation approach chosen and why; whether L6's shipped TS decoder matches
C3's 24-byte header or the stale 20-byte filing (say which you found, even
though fixing it is a lead shell task, not yours); anything else ambiguous
you resolved (say how) or that needs a lead ruling (stop and report instead
of guessing — CLAUDE.md §1).
