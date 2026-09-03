# L4 — `idl-transport` desktop

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
automatable with `Expected:` checks).

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
