# Review — Task 1: Crate dependencies and module skeleton (wave1-l4-transport)

Reviewed at worktree `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport`,
branch `wave1-l4-transport`, commit `0246079` ("transport: crate skeleton for BLE/WiFi device
client (deps, module stubs, device.rs)"), against the plan re-read fresh from
`docs/superpowers/plans/2026-09-03-idl1-wave1-l4-transport.md` (post-correction Global
Constraints) and `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`.

## Commands run and results

```
cargo build -p idl-transport
```
Result: `Finished `dev` profile [unoptimized + debuginfo] target(s) in 2m 06s` — clean, no
warnings surfaced, exit 0.

```
cargo test -p idl-transport
```
Result:
```
running 2 tests
test error::tests::transport_error_display_carries_kind_and_message ... ok
test error::tests::transport_error_serialises_kind_as_snake_case ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
Both pre-existing `error.rs` tests pass; `error.rs` is byte-for-byte untouched by this commit
(confirmed via `git show --stat 0246079` — `error.rs` not in the changed-file list).

## Findings

| Severity | File:line | Finding | Fix |
| --- | --- | --- | --- |
| Minor | `transport/src/device.rs:18-23` (`ConnectionInfo`) | Only `firmware_version` has a field doc comment; `device_id` and `connected` are undocumented, so the struct doesn't fully meet CLAUDE.md §5 "doc comment on every public symbol." This is inherited verbatim from the plan's own Task 1 Step 2 code block, not an implementer deviation. | Add one-line doc comments to `device_id` (`"Same identifier as the `DiscoveredDevice` passed to `connect`."`) and `connected` (`"`true` once GATT setup completed."`) — small, low-risk, can ride with a later task or a quick follow-up commit. |

No Critical or Important findings.

## Verification detail

- **Cargo.toml deps**: `serde`, `serde_json`, `btleplug = "0.13.0"`, `tokio = "1.53.1"` (features
  `sync`, `time`, `macros`, deliberately no `rt`) match the plan's Step 1 exactly, and
  `btleplug`/`tokio` pins match the ecosystem report row-for-row.
- **`reqwest`**: correctly left commented out with a `// TODO(idl0):` explaining the missing pin
  and citing Open question 1 — Task 1 does not guess a version. The ecosystem report has since
  been updated by the lead with `reqwest = 0.13.4` (added post-M0, 2026-09-03, ruling R7), but
  that pin is Task 6's concern (Task 6 is explicitly "Blocked on Open question 1" in the plan);
  Task 1 correctly deferred it and does not reference or half-apply the pin.
- **Module skeleton**: `lib.rs` declares all five new `pub mod`s
  (`ble_config`, `ble_control`, `ble_status`, `ble_transport`, `device`, `wifi_transport`) plus
  the existing `error`, and re-exports `ConnectionInfo`/`DeviceFile`/`DiscoveredDevice` alongside
  `TransportError`/`TransportErrorKind` — matches the plan's `lib.rs` block verbatim. The five
  stub files (`ble_config.rs`, `ble_control.rs`, `ble_status.rs`, `ble_transport.rs`,
  `wifi_transport.rs`) each contain only their module-doc comment, as specified.
- **`device.rs`**: `DiscoveredDevice`, `ConnectionInfo`, `DeviceFile` byte-for-byte match the
  plan's code block, including the `size_bytes`/SPEC-`size` naming note left as prose (not code)
  and correctly not yet acted on (Task 6's job per the plan's own Open question 3).
- **Style**: CRLF line endings, no trailing blank line, 4-space indent — consistent with
  `error.rs`'s existing convention; no sign of a `cargo fmt` pass (spot-checked byte-level EOL
  and trailing-newline shape against `error.rs`).
- **Commit hygiene**: single commit, message is a plain one-line subject, no `Co-Authored-By` or
  other AI-attribution trailer.
- **Worktree state**: `git -C rust worktree list` (run from the shared checkout) shows both
  `wave1-l1-store` and `wave1-l4-transport` as separate worktrees; the shared
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` checkout is on `main`, clean, matching
  `origin/main`. The top-level `idl1-app` repo has an unrelated, empty (LF/CRLF-only) diff on
  `app/src-tauri/Cargo.toml` unconnected to this commit or this lane's files — not a Task 1
  finding, out of scope for `rust/transport`.

## Verdict

CLEAN — Task 1 as landed matches the plan's Step 1–3 code and constraints exactly, builds clean,
the two pre-existing tests pass untouched, dependency pins match the ecosystem report (with
`reqwest` correctly deferred rather than guessed), the shared checkout is clean on `main`, and
there is no AI attribution trailer or `cargo fmt` churn. One Minor, plan-inherited doc-comment
gap on `ConnectionInfo`'s fields; nothing blocking.
