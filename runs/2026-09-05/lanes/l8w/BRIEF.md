# L8w — Rust Write-Amendment Lane — Brief

**Plan:** `docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`
**Branch:** `wave2-l8w-write-amendment`

## Scope

17 new commands + 1 amended (`eval_workbook`) + 1 superseded (L6's
`parse_workbook_cells` need — no command, a TS fence scan instead, R52 Q3;
not this lane's concern) across four C3 §3 groups: new §3.10 App
(`get_settings`/`set_settings`, `get_data_dir`/`set_data_dir`,
`list_profiles`/`save_profile`/`delete_profile`), Catalog
(`save_session_metadata`, `delete_session`), Workbook (`read_workbook`,
`create_workbook`, `fetch_host_channel`, `eval_workbook`'s `lap_context`),
Rasters/DSP (`fetch_fft`), Device (`connect_device`/`disconnect_device`,
`device_status`, `device_control`, `pull_config`, `preview_channel_registry`).
Plus the `settings.json` BOM strip (R53 Settings Q4), three new
`IpcErrorKind` variants (`DeviceRejected`, `ConfigParse`,
`ConfigUnsupportedVersion`), a new `state::Connections` managed value, and
the `@tauri-apps/plugin-dialog` wiring in `app/src-tauri` (this lane's one
real Tauri build). This is the batched Rust lane the wave-2 UI lanes (L6,
L7a, L7b, L7c) stubbed against — every command here is already fully
specified in C3 (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
amended by ruling R59/R60). No file under `app/src/` changes in this lane
(Task 13's `package.json`/capability edits are the two narrow exceptions).

## Dependency gate — check before opening a worktree

L8w needs **L2 Task 8** (importers wrap-up) and **L5 Task 9**
(`import_file`/`list_importers` commands, `commands/import.rs`, the
`parse_*`/`import_*` `IpcErrorKind` rows) merged to `idl-rs` `main` first —
Task 9 establishes the command-module pattern and error-kind rows this lane
extends, and the operating brief places this lane strictly after both in the
Rust track's serial order. As of this brief's writing, `main`'s `rust`
submodule (`75589bc`) pre-dates **both** — do not start against the current
worktree tip. Verify:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs   # must be >= 1
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs   # must be >= 1
```
Both must return `>= 1`. If either fails, report to the lead rather than
proceeding.

## Done when

- All 17 commands registered in `idl_rs_tauri::handler()` and passing their
  targeted tests; `eval_workbook`'s `lap_context` argument landed additively
  (C3 §5, no `_v2`); the three new `IpcErrorKind` variants added.
- `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` green once at the
  lane gate (Task 14). Never `cargo test --workspace`, never a bare
  `cargo test`.
- `app/src-tauri` builds/checks clean with the dialog plugin wired
  (Task 13's proof, whichever form — `tauri dev` or `cargo check` + `tsc`).
- CHANGELOG.md and TASKS.md both updated (Task 14); the two scope
  limitations found while implementing (Task 8's fixed-registry-IDs-only
  note, Task 7's platform-limited `device_rejected`) are stated there, not
  silently absorbed.

## SPEC section(s) touched

None — this lane implements C3 as already amended; no SPEC section changes
unless the lead's answer to Open Question 3 (fetch_fft's `averaging` union)
requires extending `idl_rs::fft::Averaging`, which is core logic, not a SPEC
document change, and even then no SPEC section names `Averaging`'s variants
directly (`docs/IDL0_SPEC.md` doesn't fix the DSP module's Rust API).

## Open questions logged (3, all assigned to the lead, none blocking — this
plan is written as if each recommendation held)

1. **`device_control`'s `device_rejected` kind is likely unreachable on the
   desktop `BtleplugBle` transport** — `btleplug`'s Windows backend never
   surfaces the SPEC §7.2 ACK byte, only `Ok(())` or a generic `Ble` error.
   Recommendation: ship per C3 as written (kind defined, practically
   unreachable today), documented — not a trait change to `idl-transport`
   in this lane. See plan's Open Question 1.
2. **`preview_channel_registry`'s generic-analog-channel gap** — SPEC §5.2
   fixes `channel_id`s only for IMU/wheel/pressure/HR channels, not
   arbitrary configured analog/digital channels. Recommendation: ship the
   SPEC-fixed subset only, ask Isaac separately whether generic IDs are
   deterministic from config order. See plan's Open Question 2.
3. **`fetch_fft`'s `averaging` union names `"none"`/`"max"`, which
   `idl_rs::fft::Averaging` doesn't have** (only `Mean`/`Median`).
   Recommendation: extend the core enum with the two missing modes (small,
   well-defined DSP addition) rather than narrow the wire contract. See
   plan's Open Question 3.

## Task list (14 tasks, see plan for full detail)

1. `paths::resolve_data_dir` BOM strip
2. App group — settings + data-dir commands
3. App group — profile commands
4. `read_workbook`
5. Catalog writes — `save_session_metadata`, `delete_session`
6. Device group — managed connection + `device_status`
7. Device group — `device_control`, `pull_config`
8. `preview_channel_registry`
9. `eval_workbook`'s `lap_context` argument
10. `create_workbook`
11. `fetch_host_channel` (`IDLH` encoder)
12. `fetch_fft` (`IDLF` encoder)
13. `app/src-tauri` — dialog plugin
14. Wrap-up — CHANGELOG, TASKS.md, full suite gate

## After this lane (lead shell tasks, not part of this lane's scope)

Swap `Settings/ipcStubs.ts`, `Device/ipcStubs.ts`, `Data/ipcStubs.ts`'s
functions for real `app/src/ipc/*` wrappers (import-path change per each
stub's own design); L7a's `pickImportFile()` seam → the real dialog plugin
call; L7c's one-time `localStorage` → `settings.json` import; L7b Task 4's
channel-preview widening onto `preview_channel_registry`. See the plan's
"After this lane" section for the full list.

## Lead addition 2026-09-05 -- four-task gates

CLAUDE.md section 8's every-four-tasks rule applies inside this lane: after Task 4 (done), after Task 4c (covering 5, 4b, 6, 4c -- 4c dispatches after 6), after Task 10 (7-10), after Task 12b (11, 12, 12b), and at Task 14, the implementer of that task also runs, foreground, once: `cargo test -p idl-rs-tauri` (the whole Tauri crate -- every command in this lane lives there) and `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, reporting each `test result:` line verbatim; a failure is STOP and report, never a fix in place. The lead names this in each such task's dispatch.
