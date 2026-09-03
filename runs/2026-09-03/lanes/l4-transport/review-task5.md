# Review: Task 5 — `BleTransport` trait + `BtleplugBle` skeleton

**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport` (branch `wave1-l4-transport`)
**Commits reviewed:** `b4b46c8` (rename `chunk_size` → `chunk_size_bytes`, closes Task 4 review finding), `8ec05e3` (`BleTransport` trait + `BtleplugBle` skeleton, Task 5)

**Test commands and results:**
```
cargo build -p idl-transport
→ Finished `dev` profile [unoptimized + debuginfo] target(s) in 2m 31s
→ 8 warnings, all "use of `async fn` in public traits is discouraged as auto trait
   bounds cannot be specified" — one per trait method in BleTransport. Expected/benign:
   the trait is deliberately not dyn-safe (commit message + doc comment on BleTransport
   both call this out, referencing Open question 2); desktop and mobile pick concrete
   impls at compile time, so no vtable/Send-bound issue in practice.

cargo test -p idl-transport
→ running 19 tests ... test result: ok. 19 passed; 0 failed; 0 ignored
→ No new tests added by 8ec05e3, correctly — unimplemented!() bodies can't be
  unit-tested, matching Task 5's own scope (Task 9 covers real-hardware verification).
```

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `transport/src/ble_transport.rs:92,101` (commit `8ec05e3`) | Implementer silently changed the plan's literal "Task 5 implementer" comment/`unimplemented!()` text to "Task 7 implementer" (the plan's own Task 5 code block, lines ~896/903, says "Task 5"). The change is correct — the plan's actual Task 7 ("Wire `BtleplugBle`/`ReqwestWifi` bodies against a fake peer") is where this wiring really happens, and the plan's "Task 5" self-reference reads as a leftover drafting artifact — but per CLAUDE.md §1 ("stop and ask... do not treat silence as approval") and the task's own framing (only one deviation was reported: the `TransportErrorKind` import), this second deviation from the plan's literal text was not called out anywhere in the commit message. | No code change needed; note in the next status update / PR description that this text was corrected from the plan's literal "Task 5" to "Task 7" and why, so it's a recorded decision rather than a silent edit. |

No Critical or Important findings.

## Checklist detail

- **Spec compliance:** `8ec05e3`'s diff matches Task 5's plan text closely: `uuids` module (all 7 UUIDs, SPEC §7.1), `BleTransport` trait (all 8 methods: `scan`, `connect`, `disconnect`, `read_status`, `watch_status`, `send_command`, `push_config`, `read_config`) with signatures identical to the plan, `BtleplugBle` struct (empty, fields deferred) and `impl BleTransport for BtleplugBle` with `unimplemented!()` bodies carrying the intended `btleplug` call sequence inline, matching the plan's Step 3 description and Step 4's build expectation ("the `unimplemented!()` bodies compile; they only panic if called, and nothing calls them yet"). Confirmed `TransportErrorKind` has zero code references in the file (only appears inside doc comments and `unimplemented!()` string literals), so the reported "imported only `TransportError`" deviation is accurate and the alternative (importing `TransportErrorKind` too) would indeed warn `unused_imports`. Two doc-comment additions beyond the plan's literal text — `disconnect` got a doc comment the plan's own code block omitted, and all `uuids::*` consts besides `SERVICE` got doc comments the plan's code block omitted — both are net-positive, closing exactly the kind of gap this crate's reviews have flagged three times before, not scope creep.
- **Layer/scope:** No Tauri, no `idl-rs` core dependency, no DSP in the new code. Nothing in `ble_transport.rs` calls into `app/src-tauri` — consistent with the plan's "L5 does that wiring" note.
- **Tests:** No new tests, correctly — Task 5's own scope explicitly defers unit coverage of the wiring to Task 9's real-device step. `cargo test -p idl-transport` still 19/19, no regressions.
- **`b4b46c8` rename:** `ble_config.rs`'s `chunk_config` parameter and both internal uses (`if chunk_size_bytes == 0`, `json.chunks(chunk_size_bytes)`) renamed together; doc comment above the function updated to match. Grepped the whole `transport/src` tree for `chunk_size` — no stale references remain (call sites in tests use positional args, unaffected). Pure rename, no behavior change, confirmed by identical 19/19 test pass.
- **Shared checkout:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` is clean, on `main`, untouched by this lane.
- **Commit hygiene:** No AI attribution trailers on either commit. No `cargo fmt` reformatting — diff is additive/targeted, 4-space indent matches existing style, no stray whitespace changes.
- **Doc comments:** Every `pub` symbol added in `8ec05e3` (`uuids` module and all 6 consts, `BleTransport` trait and all 8 methods, `BtleplugBle` struct, `BtleplugBle::new`) has a doc comment. This closes a gap pattern flagged in three prior reviews of this crate.
- **`docs/IDL0_SPEC.md`:** Untouched by either commit — correct, §14a is Task 8's job per the plan, not Task 5's. `CHANGELOG.md`/`TASKS.md` also untouched — correct, Task 9's job.

## Verdict

CLEAN — one Minor process-hygiene finding (an unreported but correct plan-text correction), no functional, spec-compliance, or test defects.
