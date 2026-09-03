# L4 — `idl-transport` desktop

**Status (2026-09-03): 8.5/9 tasks complete.** Tasks 1–9 Steps 1, 3, 4, 5 are done and
committed; Task 9 Step 2 (real-device BLE/WiFi verification) is the one remaining half-task,
explicitly pending Isaac and physical hardware — see "Done when" below and the manual
instructions there. This mirrors M0's own precedent (`npm run tauri dev` visual check: complete
pending Isaac, documented as such in `CHANGELOG.md`/`TASKS.md`, not blocking lane exit for the
rest of the work).

Commits:
- `idl-rs-worktrees/wave1-l4-transport` (crate `idl-transport`): `8ec05e3`, `4c995e1`, `aeac6ea`,
  `a006ec0` (Tasks 1–8; earlier Task 1–4 commits precede this list, all on branch
  `wave1-l4-transport`).
- `idl1-app-worktrees/wave1-l4-transport` (docs): `0bd3532` (SPEC §14a, Task 8), plus this
  lane's Task 9 docs commit (SPEC TOC/`resume_from_bytes` review fixes, CHANGELOG, TASKS).

**Scope:** Extend the M0 `idl-transport` stub (typed error only) into a working desktop device
client: BLE scan/connect/status/control/config-push (`btleplug`), WiFi file listing, resumable
download and config-push fallback (`reqwest`) against SPEC §6/§7/§8. Defines `BleTransport`/
`WifiTransport` traits that L9's later mobile plugins implement against the platform BLE/WiFi
stack. `rust/transport` stays I/O-only: no DSP, no config-schema parsing (that's `idl-rs`
core's `parse_config`/`ConfigErrorKind` per C3 §3.8 — this crate treats config JSON as opaque
bytes throughout), never depends on Tauri.

**Plan:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l4-transport.md` (9 tasks).

**Dependency gate:** none. Independent of L1/L2/L3 (different crate, no `idl-rs` core
dependency) — starts immediately, in parallel with the other wave-1 lanes.

**Branch:** `wave1-l4-transport`, own worktree.

**Done when:** Download + config against the real IDL0 device from Windows (plan Task 9 Step
2, marked Manual/Isaac, required before lane exit — does not block Tasks 1–8, which are all
automatable with `Expected:` checks and are all done). Task 9 Steps 1 (pre-check), 3
(CHANGELOG/TASKS), 4 (commit) and 5 (this brief) are complete; Step 2 is the sole outstanding
item, pending Isaac. Manual instructions (plan Task 9 Step 2, reproduced here so they don't
require re-reading the plan): with an IDL0 device powered on, in range, and this Windows
machine joined to its `IDL0-XXXX` AP in Windows network settings —
1. In `idl-rs-worktrees/wave1-l4-transport`, write a throwaway example or `#[test] #[ignore]`
   test (run via `cargo test -p idl-transport -- --ignored`) that does `BtleplugBle::new()` →
   `scan(Duration::from_secs(5))`, printing discovered devices → `connect(<device_id>)` →
   `read_status()` → `send_command(ControlCommand::WifiOn)` → poll `read_status`/`watch_status`
   until `wifi_on == Some(true)`.
2. `ReqwestWifi::new("http://192.168.4.1")` → `ping()` (assert `device` matches the scanned
   name) → `list_files()`.
3. `download(file_index, 0, sink, on_progress)` on one listed file to a local file; confirm the
   byte length matches `DeviceFile::size_bytes`; re-run with `resume_from_bytes` set to half the
   file's length and confirm the concatenated halves match the full download.
4. `push_config(config_json)` changing one harmless field (e.g. `bike_profile.name`); confirm
   the device reboots, BLE reconnects, and `read_config()` + `configs_match` report the pushed
   bytes were stored unchanged.

Record the date, device firmware version (`ConnectionInfo::firmware_version`), and pass/fail of
each of the four checks in `CHANGELOG.md`'s `### Verified` section (replacing the "pending
(Isaac)" note added 2026-09-03), then tick off this brief's Status line.

**SPEC section(s) touched:** `docs/IDL0_SPEC.md` new §14a ("Transport Trait Architecture
(idl1)"), inserted after §14 Error Handling, before §15 — records the trait shapes, the
`ble_scan` live-channel shape (resolves C3 §2 open question 6), config-push chunk-size default,
and download-resume behaviour this lane actually built. §6–8 (the wire contract) are read
as-is, untouched — spec-during discipline, not spec-first, since §6–8 already fix everything
the wire protocol needs.

**Open questions logged:** 10, in the plan's closing section — most load-bearing: (1) `reqwest`
has no version pin in the M0 ecosystem report, blocking Task 6 until the lead supplies one; (7)
`btleplug`'s MTU-negotiation API is not uniform across platforms, so the config-push chunk size
default (20 bytes, ATT minimum) may be what actually ships on Windows; (8) `btleplug` 0.13.0's
exact Manager/Adapter/Peripheral API shape is left to the Task 7 implementer to read from
docs.rs rather than guessed here. None block Tasks 1–5; only Task 6 (WiFi) is gated on #1.
