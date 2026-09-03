# Review: Task 8 — SPEC §14a + composed BLE+WiFi sequencing test (L4 idl-transport)

Repos/commits reviewed:
- `idl-rs-worktrees\wave1-l4-transport` commit `a006ec0` — "transport: composed BLE+WiFi
  sequencing test (download+config flow, SPEC §14a)" — `transport/src/ble_transport.rs`,
  `transport/src/wifi_transport.rs`.
- `idl1-app-worktrees\wave1-l4-transport` commit `0bd3532` — "docs: SPEC §14a — L4 transport
  trait architecture, Windows ACK-byte gap" — `docs/IDL0_SPEC.md`.

## Test command and result

```
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l4-transport
cargo test -p idl-transport sequencing   → running 1 test
                                            test ble_transport::sequencing::
                                            wifi_on_then_status_poll_then_wifi_download_
                                            runs_in_expected_order ... ok
                                            test result: ok. 1 passed; 0 failed

cargo test -p idl-transport               → test result: ok. 29 passed; 0 failed
                                            (up from Task 7's 28 — exactly the one new
                                            `sequencing` test, no regressions, no other
                                            test count drift)
```

Both runs pass cleanly. No `error[` lines, no `FAILED`, only the crate's pre-existing 16
`async fn in public trait` lint warnings (unchanged from Task 7's review, not introduced here).

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `docs/IDL0_SPEC.md` §14a Table of Contents (line 6 area, row for §14/15) | §14a gets no Table-of-Contents row, unlike the repo's own precedent — SPEC's existing §17a ("Workbook Entity") *does* have a TOC row ("17a \| Workbook Entity \| Analyze tab, Drive sync"). §14a is the same kind of inserted lettered subsection but is invisible from the TOC. | Add a `14a \| Transport Trait Architecture (idl1) \| Transport layer` row to the TOC under Part 3, matching the §17a precedent. |
| Minor | `docs/IDL0_SPEC.md` §14a, "Download resume" paragraph | Says "`WifiTransport::download`'s `resume_from` parameter" — the actual trait/impl parameter (unit-suffixed per this lane's own convention, confirmed in `wifi_transport.rs`) is `resume_from_bytes`. Carried over unedited from the plan's boilerplate text rather than updated to the real, already-renamed identifier. | Say `resume_from_bytes` to match the shipped signature. |

No Critical or Important findings. Both checks the review brief called out explicitly pass:

1. **Test counts** — `sequencing` 1/1; full crate 29/29, up from Task 7's confirmed 28/28 by
   exactly the one new test. No regressions.
2. **Windows ACK-byte gap** — present in §14a as its own bolded paragraph ("Known platform
   limitation — the ACK byte is unreachable on Windows"), stating plainly that
   `Peripheral::write` on `winrtble` surfaces only `GattCommunicationStatus`, never the WinRT
   `GattWriteResult`/ATT app-error byte, so `AckCode::from_byte`'s `0x03`/`0x80`/`0x81`/`0x82`
   codes are unreachable from a real write on this platform, and that mutex refusals still
   propagate as a coarse `TransportErrorKind::Ble` rather than being silently swallowed. This
   matches Task 7's review finding (`review-task7.md`) accurately and is not watered down —
   it names the same file/function (`winrtble/ble/characteristic.rs::write_value`,
   `WriteValueWithOptionAsync`) the Task 7 reviewer verified against the pinned source.
3. **Placement** — `### 14a.` (line 1083) sits directly after §14.2's content and before
   `## 15. Session & File Model` (line 1147); grepping every `##`/`###` header in the file
   top-to-bottom shows §15 onward is untouched/unrenumbered.
4. **Composed sequencing test is genuine** — `StubBle` is a real canned-response
   `BleTransport` impl (every unused method returns a typed `Ble` error, not
   `unimplemented!()`, so an accidental call fails as a normal assertion); the test drives
   `send_command(WifiOn)` → polls `read_status` up to 10 times for `wifi_on == Some(true)` →
   calls `ping`/`verify_device_identity`/`list_files`/`download` against Task 7's real
   `spawn_mock_server` (now `pub(crate)`, confirmed via diff, exposed only for this reuse) —
   asserting on `files[0].name`, `bytes_written`, and the sink's exact content. This is not a
   no-op: removing the `send_command`/poll step or reordering the WiFi calls would change
   observable behaviour the assertions depend on.
5. **Hygiene** — no AI attribution trailer in either commit message (grepped
   `co-authored`/`generated with`/`claude`, no match in either); no tabs/rustfmt churn in the
   diff (`git show a006ec0 | grep -P '\t'` empty); `idl1-app\rust` shared checkout is clean, on
   `main`, matches `origin/main`, untouched by this lane; the app worktree's `M rust` gitlink
   status is the expected, documented consequence of two separately-committed worktrees
   sharing one submodule (not a defect — confirmed, no action needed). Doc comments and
   unit-suffixed numeric fields (`resume_from_bytes`, `size_bytes`, byte counts) are present
   throughout the new test and the §14a prose (module/struct/fn all doc-commented per
   CLAUDE.md §5), aside from the one stale-identifier Minor above.
6. **Scope** — `0bd3532` touches only `docs/IDL0_SPEC.md` (62 insertions, 0 deletions); no
   `CHANGELOG.md`/`TASKS.md` changes leaked in from Task 9's scope. `a006ec0` touches only
   `transport/src/ble_transport.rs` and `transport/src/wifi_transport.rs`, no `Cargo.toml`/
   `Cargo.lock` changes (no new dependency needed for the test).
