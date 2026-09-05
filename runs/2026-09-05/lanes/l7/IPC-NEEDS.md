# L7 — IPC needs (Data, Device, Settings), consolidated

**Written:** 2026-09-05, by the L7 wave-2 planner, from the three tab plans
(`docs/superpowers/plans/2026-09-05-idl1-wave2-l7{a,b,c}-*.md`).
**Purpose:** one list of every command the three tabs need that C3 does not
have, for the lead's single C3 write-amendment batch and the one Rust lane
that implements it (operating brief §3, §4).

**How to read this.** Each entry gives a proposed name, its arguments and
return shape in C3 §3's own style, the `IpcError` kinds it raises, the C3 §3
group it belongs in, the idl0 feature that needs it, and the plan task that
builds against a `NotImplementedError` stub meanwhile. Nothing here is a
decision — the lead owns C3.

**Two conventions the plans already assume:**
- **Stubs never invent an `IpcError` kind.** C3 §2's vocabulary is
  additive-only and a placeholder does not belong in a signed contract, so
  each lane's `ipcStubs.ts` throws a local TS `NotImplementedError` carrying
  the command name. Replacing a stub with a real wrapper is an import-path
  change.
- **JSON fields are `snake_case`** and argument names are named Tauri command
  parameters, exactly as C3 §1 fixes them.

**Confirmed against the idl0 source and the landed Rust.** The operating brief
§3 listed five known gaps. All five are real and appear below (needs 1, 2, 3,
4, 6). Three of them turn out to be **smaller than the brief implies**, because
core already has the logic and only the command is missing: settings
(`rust/core/src/store/settings.rs`), profiles (`rust/core/src/store/profile.rs`)
and the data-dir override (`rust/tauri/src/paths.rs`). Eight further needs were
found while reading the Device and Data tabs; they are marked **NEW**.

---

## Summary

| # | Command | C3 §3 group | Wave-2 lane | Priority |
|---|---|---|---|---|
| 1 | `save_session_metadata` | 3.2 Catalog | L7a | **High** — the Data tab's edit form is otherwise write-only-to-nowhere |
| 2 | `save_track` / `delete_track` | 3.2 Catalog | L7a | Low — the track editor is deferred to wave 3 anyway |
| 3 | `delete_session` | 3.2 Catalog | L7a | Medium |
| 4 | `list_quarantine` / `resolve_quarantine` | 3.2 Catalog | L7a | Low |
| 5 | `rescan_track_visits` **NEW** | 3.2 Catalog | L7a | Low — needs engine work, not just a command |
| 6 | `get_settings` / `set_settings` | new group, 3.10 App | L7c | **High** — Settings persists nothing durable without it |
| 7 | `get_data_dir` / `set_data_dir` **NEW** | new group, 3.10 App | L7c | Medium |
| 8 | `device_status` **NEW** | 3.8 Device | L7b | **High** — the hero card is otherwise blank |
| 9 | `device_control` **NEW** | 3.8 Device | L7b | **High** — no recording start/stop without it |
| 10 | `pull_config` **NEW** | 3.8 Device | L7b | Medium — also the only way to verify a push |
| 11 | `list_profiles` / `save_profile` / `delete_profile` **NEW** | new group, 3.10 App | L7b | **High** — a config the user builds is lost on close |
| 12 | `preview_channel_registry` **NEW**, conditional | 3.8 Device | L7b | Conditional on L7b open question 1 |
| 13 | `connect_device` / `disconnect_device` (managed link) **NEW** | 3.8 Device | L7b | Medium — 8, 9 and 13 are one piece of work |

Needs 6, 7 and 11 do not fit any existing C3 §3 group. They are app/profile
state rather than catalog, import, workbook, tiles, cursor, device or sync —
so this list proposes **a new §3.10 "App" group** rather than stretching an
existing one. That is a lead call.

---

## 1. `save_session_metadata` — Data

```
save_session_metadata(session_id: string, metadata: SessionMetadataPatch) -> SessionDetail
```
```ts
/** The nine editable `session.json` fields (C1 §6). "" is the only
 *  not-set representation — C1 §6 has no null for these. Every field is
 *  required: this is a whole-block replace, not a sparse patch, so a
 *  concurrent editor cannot half-apply. */
interface SessionMetadataPatch {
  rider: string; bike: string; bike_comment: string;
  venue_name: string; event_name: string; event_session: string;
  short_comment: string; long_comment: string; tag: string;
}
```
**Returns** the re-read `SessionDetail` so the pane redraws from canonical
truth rather than from what it hoped it wrote.
**Errors:** `not_found` (unknown `session_id`), `invalid_argument` (a field
that is not a string), `io`, `internal`, and — if the implementation adopts
C4 §4's optimistic check the way `save_workbook` does — `conflict`.
**C3 group:** §3.2 Catalog (it writes `sessions/<id>/session.json`, which
`get_session` reads).
**idl0 feature:** `ui/tabs/data/metadata_editor.dart` — the nine-field form,
its venue autocomplete and its save path.
**Built against a stub by:** L7a **Task 7**.
**Note:** the write path exists in core already —
`rust/core/src/store/session_json.rs` plus `store::atomic` — so this is a
command over landed logic. Whether it also re-indexes the catalog row (idl0
upserted its SQLite index on save) or leaves that to `rebuild_catalog` is the
implementer's question; L7a assumes the row may be briefly stale, which the
catalog is explicitly allowed to be (C4 §5: "nothing reads the catalog for
truth").

## 2. `save_track` / `delete_track` — Data

```
save_track(track: TrackDetail) -> TrackDetail
delete_track(track_id: string) -> void
```
**Errors:** `not_found`, `invalid_argument` (malformed geometry), `io`,
`internal`, `conflict`.
**C3 group:** §3.2 Catalog (C3 has `list_tracks` / `get_track` only).
**idl0 feature:** `track_editor_modal.dart` (1204 lines),
`track_editor_lap_timing_tabs.dart`, `track_editor_sector_list.dart`,
`track_editor_neutral_zone_list.dart`, `track_import_conflict_dialog.dart`.
**Built against a stub by:** L7a **Task 6** (the stub only — the editor itself
is deferred to wave 3).
**Blocked on more than a command:** `TrackDetail`'s `lap_timing`,
`neutral_zones`, `sector_gates` and `reference_polyline` are typed `unknown` /
`unknown[]` in C3, and C3 §6 item 10 assigns pinning them to L1 when
`track_artifact::model::Track` lands. A write command over `unknown` would fix
a wire format nobody can validate. **Pin the shapes first.**

## 3. `delete_session` — Data

```
delete_session(session_id: string, delete_blob: boolean) -> void
```
`delete_blob: false` removes `sessions/<id>/` and the catalog row but keeps the
immutable source blob — "log files and blobs are immutable" (CLAUDE.md §3)
argues the two are genuinely different actions and the caller must say which.
**Errors:** `not_found`, `io`, `internal`.
**C3 group:** §3.2 Catalog.
**idl0 feature:** session removal via `runs_provider.dart`.
**Built against a stub by:** L7a **Task 8** (behind a confirmation dialog,
because it is destructive the moment it becomes real).

## 4. `list_quarantine` / `resolve_quarantine` — Data

```
list_quarantine() -> QuarantineEntry[]
resolve_quarantine(entry_id: string, action: "retry" | "discard") -> void
```
```ts
interface QuarantineEntry {
  entry_id: string;
  path: string;          // under <data>/tmp/quarantine/ (C4 §2, §7)
  reason: string;
  quarantined_at_ms: number;   // i64
}
```
**Errors:** `not_found`, `invalid_argument` (unknown action), `io`, `internal`.
**C3 group:** §3.2 Catalog.
**idl0 feature:** none directly — this is an **idl1 concept** (C4 §2's
`tmp/quarantine/`, C4 §7's repair path) that the operating brief §3 named as a
Data-tab gap. Included because C4 creates the directory and nothing surfaces
it; a quarantine nobody can see is a silent data loss.
**Built against a stub by:** L7a **Task 8**.

## 5. `rescan_track_visits` — Data (**NEW**)

```
rescan_track_visits(session_id: string | null, progress: Channel<Progress>) -> RescanReport
```
`null` means every session. **Errors:** `not_found`, `io`, `internal`.
**C3 group:** §3.2 Catalog.
**idl0 feature:** `runs_provider.rescanAllTrackVisits()`, the toolbar's
"Rescan visits".
**Built against a stub by:** nothing — L7a **drops** this for wave 2 rather
than stubbing it, because unlike the others it needs real engine work
(track-visit detection over a session, writing `session.json`'s
`track_visits[]`) that no lane owns. Listed here so the gap is recorded, not
because a command alone closes it.

## 6. `get_settings` / `set_settings` — Settings

```
get_settings() -> AppSettings
set_settings(settings: AppSettings) -> AppSettings
```
```ts
/** Exactly `idl_rs::store::settings::AppSettings` and C4 §1's settings.json
 *  keys — no translation layer. */
interface AppSettings {
  data_dir: string | null;
  rider_name: string;                        // "" = not set (C4 §1)
  unit_system: "imperial" | "metric";        // default "imperial"
}
```
**Errors:** `io`, `internal` (`store::settings::save` returns
`SettingsErrorKind::{Io, Encode}`; `Encode` folds to `internal` per C3 §2's
folding rule; `load` never fails — it defaults).
**C3 group:** new **§3.10 App** (proposed).
**idl0 feature:** `settings_tab.dart`'s Profile and Units sections over
`app_settings.dart` / `settings_provider.dart`.
**Built against a stub by:** L7c **Task 2** — which persists to the WebView's
`localStorage` behind a `PrefsBackend` interface meanwhile, so landing this
command is one factory line.
**Almost free:** `rust/core/src/store/settings.rs` already implements both
halves against the same file C4 §1 fixes, atomically. The command is a path
resolution (`app_config_dir()`) plus two calls. This is the highest
value-per-line item on the list.

## 7. `get_data_dir` / `set_data_dir` — Settings (**NEW**)

```
get_data_dir() -> DataDirInfo
set_data_dir(path: string | null) -> DataDirInfo
```
```ts
interface DataDirInfo {
  /** The `<data>` root in use for this process (C4 §1). */
  resolved_path: string;
  /** The override from settings.json, or null when the platform default is in use. */
  override_path: string | null;
  /** True when `resolved_path` differs from what `override_path` would give —
   *  i.e. the override changed and the app has not restarted. */
  restart_required: boolean;
}
```
**Errors:** `invalid_argument` (a relative path, or one the app cannot create),
`io`, `internal`.
**C3 group:** new **§3.10 App**.
**idl0 feature:** none — this is C4 §1's "Override in Settings", an idl1
concept with no Dart counterpart.
**Built against a stub by:** L7c **Task 4**.
**Two things the implementer must carry:** C4 §1 says changing the override
does **not** move existing files and the old tree is left in place, which the
UI must state before committing a change; and `<data>` is resolved once at
startup and cached for the process lifetime, so `restart_required` is real, not
defensive. Also worth riding along: the tracked BOM bug — a `settings.json`
written by Windows tooling with a UTF-8 BOM parses as absent and silently falls
back to the platform default (`runs/2026-09-03/decisions.md`, 2026-09-05 entry).
One line and a test in `rust/tauri/src/paths.rs`; without it, a data-dir
override set from Settings can appear to do nothing.

## 8. `device_status` — Device (**NEW**)

```
device_status(device_id: string) -> DeviceStatus
```
```ts
/** One read of SPEC §7.3's BLE status characteristic. Every field is
 *  nullable: a value the device did not report must read as unknown, never
 *  as zero. */
interface DeviceStatus {
  mode: "idle" | "wifi" | "recording" | "unknown";
  recording: boolean;
  sd_card_present: boolean | null;
  sd_free_bytes: number | null;      // u64
  gps_fix_quality: number | null;    // u8, SPEC §5.6
  gps_satellites: number | null;     // u8
  imu_ok: boolean | null;
  hrm_connected: boolean | null;
  battery_millivolts: number | null; // u16
  firmware_version: string | null;
}
```
**Errors:** `ble`, `not_found`, `internal`.
**C3 group:** §3.8 Device.
**idl0 feature:** `device_hero_card.dart`'s whole status readout, and
`device_provider.dart` behind it.
**Built against a stub by:** L7b **Task 9** — which renders every field as
"unavailable" rather than as a plausible zero, because a fake battery reading
on a race day is worse than a blank one.
**SPEC §7.3 already defines the characteristic**; L4's transport reads it for
`ble_connect`'s firmware version. This is a command over existing transport
code.

## 9. `device_control` — Device (**NEW**)

```
device_control(device_id: string, command: "start_recording" | "stop_recording" | "wifi_on" | "wifi_off") -> DeviceStatus
```
Returns the post-transition status so the UI never has to guess whether the
device took the instruction.
**Errors:** `ble`, `not_found`, `invalid_argument` (unknown command),
`config` (the device refused the transition — SPEC §10.4 suspends BLE control
in WiFi mode, and a reboot would abort a recording), `internal`.
**C3 group:** §3.8 Device.
**idl0 feature:** `mode_controller.dart`, `mode.dart`, `mode_status_line.dart`,
`mode_result_listener.dart`, and the hero card's Start/Stop.
**Built against a stub by:** L7b **Tasks 8 and 9** — the push bar *states* the
idle-mode requirement instead of enforcing it, since the app cannot read or set
the mode.
**Already half-built:** `idl_transport::ble_control::ControlCommand` exists and
`list_device_files` already drives `ControlCommand::WifiOn` with a poll loop
(`rust/tauri/src/commands/device.rs`). This command exposes what that file
already does privately.

## 10. `pull_config` — Device (**NEW**)

```
pull_config(device_id: string) -> string
```
Returns the device's live `idl0_config.json` as a JSON string, symmetric with
`push_config`'s `config_json` argument.
**Errors:** `ble`, `not_found`, `config` (the device returned something
unparseable), `internal`.
**C3 group:** §3.8 Device.
**idl0 feature:** `push_config_button.dart`'s "Pull from device", and its
`_verifyApplied` round-trip check after a push.
**Built against a stub by:** L7b **Task 8**.
**Consequence of its absence, worth stating:** SPEC §7.2 describes a push as
verified by reading the config back. Without this command a push can only be
reported as "applied", never as "applied and verified" — the plan's
`describePushResult` returns exactly that arm, honestly.

## 11. `list_profiles` / `save_profile` / `delete_profile` — Device (**NEW**)

```
list_profiles() -> ProfileLoadReport
save_profile(profile: BikeProfile) -> BikeProfile
delete_profile(profile_id: string) -> void
```
```ts
interface BikeProfile {
  profile_id: string; profile_name: string;
  created_at_ms: number; updated_at_ms: number;   // i64
  /** The SPEC §8 device-config document, pushed verbatim. */
  config: Record<string, unknown>;
}
interface ProfileLoadReport {
  profiles: BikeProfile[];                 // sorted by profile_name ascending
  /** Files that failed to parse — never a failure of the whole load. */
  skipped: { path: string; reason: string }[];
}
```
**Errors:** `not_found` (delete of an unknown id), `invalid_argument`
(a `config` that is not an object), `io`, `internal`.
**C3 group:** new **§3.10 App** (they are `<data>/profiles/*.idl0p`, C4 §2 —
not catalog rows and not device I/O).
**idl0 feature:** `profile_provider.dart`, `profile_bar.dart`,
`profile_dialogs.dart` — the profile dropdown and its
new/rename/duplicate/delete/import/export actions.
**Built against a stub by:** L7b **Task 8**, which keeps the library in memory
for the session.
**Almost free, like need 6:** `rust/core/src/store/profile.rs` already
implements `load_all` / `save` / `delete` with the skip-malformed behaviour
`ProfileLoadReport` mirrors, and C4 §2 already fixes the path. Without the
command, a user who spends ten minutes configuring channels loses it when the
app closes — which is why the Device plan rates this High.

## 12. `preview_channel_registry` — Device (**NEW**, conditional)

```
preview_channel_registry(config_json: string) -> RegistryRow[]
```
```ts
interface RegistryRow {
  channel_id: number;                         // u16, SPEC §5.2
  data_type: "i16" | "i32" | "u8" | "u16" | "u32";
  sample_rate_hz: number;                     // 0 = event-driven (SPEC §5.7)
  scale: number; offset: number;
  name: string; units: string;
}
```
**Errors:** `config_parse`, `config_unsupported_version`, `invalid_argument`,
`internal`.
**C3 group:** §3.8 Device.
**idl0 feature:** `resolveRegistryEntries()` across all six
`data/channel_sources/*.dart` classes — the channels table's per-channel
`channel_id`, data type, rate, scale and units.
**Built against a stub by:** nothing yet — **this need exists only if the lead
answers L7b open question 1 with option (b)**. The L7b plan's Task 4 implements
the derivation in TypeScript and is gated on that answer. Filed here so the
alternative is costed rather than discovered later.
**Why it is a real question:** the derivation includes `scale = range / 32768`
per IMU axis. That is physics-adjacent arithmetic, and CLAUDE.md §2 says "no
number the sync model depends on is computed in JavaScript". These particular
numbers are a preview — the firmware writes its own registry and the parser
reads that one — but CLAUDE.md §1 says a layer placement no contract states is
a question, not an inference.

## 13. `connect_device` / `disconnect_device` — Device (**NEW**)

```
connect_device(device_id: string) -> ConnectionInfo
disconnect_device(device_id: string) -> void
```
A **managed** link held in Tauri state across commands, unlike C3 §3.8's
existing `ble_connect`, which connects and disconnects inside its own call.
**Errors:** `ble`, `not_found`, `internal`.
**C3 group:** §3.8 Device. Per C3 §5, this is an added command, not a changed
signature — `ble_connect` stays.
**idl0 feature:** `device_provider.dart`'s persistent connection, which every
other Device-tab affordance gates on.
**Built against a stub by:** nothing — L7b **Task 1** instead treats
`ConnectionInfo.connected` as "the last attempt succeeded" and gates nothing on
a live link.
**Why it is here:** `rust/tauri/src/commands/device.rs`'s own module doc calls
this out as a judgment call it deferred — "a persistent connection manager (so
the Device tab can show live status between actions) is left to whichever later
task builds that UI". This is that task saying it needs one. Needs 8, 9 and 13
are one coherent piece of work: live status is meaningless without a live link,
and control commands need both.

---

## What is deliberately **not** here

- **Firmware / OTA push.** `push_ota` exists on the transport trait; the
  operating brief §3 defers it to wave 3 unless Isaac says otherwise. No L7
  task builds against it.
- **Export commands.** C3's own §6 item 1 leaves `export_unknown_channel` /
  `export_no_gps_data` without a command, and design §10 says "L8 (export) does
  not exist in v1". idl0's `fit_export_controls.dart` is a parity gap in the
  L7a plan, not an IPC need.
- **IMU calibration.** SPEC §7.6 defines the BLE procedure; wave 3. The
  `orientation` and `bias` config blocks round-trip untouched through L7b's
  config model meanwhile, so no calibration data is lost.
- **`import_file` / `list_importers`.** These **are** C3 §3.3 commands whose
  Rust side lands with L5 Task 9 on the Rust track. L7a Task 5 builds against
  the real typed wrappers, which reject until then. Not a gap; do not stub them.
- **`sync_status` / `sync_now` / `pair_peer`.** Real C3 §3.9 commands awaiting
  L11. L7c Task 5 builds against them directly. Not a gap; do not stub them.
- **Catalog columns for the has-GPS / has-gates facets.** L7a open question 2
  proposes them as a C4 §5 + C3 §3.2 amendment rather than a new command, so
  they belong in the amendment batch's schema half, not this list.
</content>
