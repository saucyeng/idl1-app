# Review: Task 4 — BLE config push/read-back framing (SPEC §7.2)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport`
Branch: `wave1-l4-transport`, commit under review: `2c2540d` (on top of `e440410`).
File touched: `transport/src/ble_config.rs` only (confirmed via `git diff e440410 2c2540d --stat`
— single file, 173 insertions, 1 deletion of the placeholder doc comment).

## Test commands and results

```
cargo test -p idl-transport ble_config:: 2>&1 | tail -40
```
→ `test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 11 filtered out` (matches plan's
claimed 8/8).

```
cargo test -p idl-transport 2>&1 | tail -60
```
→ `test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out` (matches plan's
claimed 19-test full-crate suite; doc-tests: 0/0).

```
cargo build -p idl-transport
```
→ `Finished` cleanly, no warnings (rebuilt after `touch`ing the file to force recompilation).

## Other checks

- Shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: `git status` clean,
  `git branch --show-current` → `main`. Untouched by this task, as required.
- Commit `2c2540d` message: `transport: BLE config push/read-back framing (SPEC §7.2)` — no
  `Co-Authored-By` or other AI attribution trailer. Author `isaacallen73`.
- Diff is purely additive (one placeholder line removed, 173 added) — matches Task 4's plan text
  verbatim, function-for-function and test-for-test (`validate_config_size`, `chunk_config`,
  `reassemble_config_reads`, `configs_match`, plus all 8 tests byte-for-byte match the plan's
  Step 1 code block). No `cargo fmt` churn — indentation and brace style match the rest of the
  crate (`error.rs`), no reformatting of untouched lines.
- Doc comments: every public symbol in the new code has one —
  `CONFIG_BUFFER_MAX_BYTES`, `CONFIG_READ_CHUNK_MAX_BYTES`, `validate_config_size`,
  `chunk_config`, `reassemble_config_reads`, `configs_match`, plus the module doc comment. The
  gap pattern flagged in Task 1/2 reviews (missing doc comments on public items) is **not**
  reintroduced here.
- Typed errors: uses `TransportError::new(TransportErrorKind::Config, ...)` — no `Err(String)`,
  no new `TransportErrorKind` variant added (plan forbids extending the enum in this lane; none
  added). No bare `// TODO` (none present in this file).
- Layer boundary: no JSON parsing, no `serde_json` use, no `idl-rs` core / `tauri` dependency —
  `chunk_config`/`reassemble_config_reads`/`configs_match` treat the config as an opaque `&[u8]`
  throughout, matching C3 §3.8's `push_config` layering note quoted in the plan.
- Open question 5 (plan line 1516, "assigned: reviewer"): `validate_config_size`'s client-side
  8 KB pre-check is not itself SPEC-mandated (SPEC only requires the device to reject oversize
  buffers at COMMIT). Reviewed and judged acceptable to keep — it's a documented, narrowly-scoped
  optimisation using the existing `Config` error kind, well tested, and the doc comment already
  flags the drift risk (buffer size constant needs updating if firmware changes it). No action
  required this task; not itself a finding.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `transport/src/ble_config.rs:38` | `chunk_config(json: &[u8], chunk_size: usize)` — `chunk_size` is a byte count but lacks the `_bytes` unit suffix CLAUDE.md §5 requires on every numeric value (the file's own constants, `CONFIG_BUFFER_MAX_BYTES`/`CONFIG_READ_CHUNK_MAX_BYTES`, do follow the convention). Present in the plan's own Step 1 code block, so this is a plan-authored gap the implementer transcribed verbatim rather than a new deviation. | Rename the parameter to `chunk_size_bytes` when this module is next touched (e.g. Task 5 wiring), or note the exception explicitly if intentional. |

No Critical or Important findings. Diff matches Task 4's plan exactly; all claimed test counts
reproduce; no process-hygiene violations (attribution trailer, `cargo fmt`, shared-checkout
cleanliness) found.
