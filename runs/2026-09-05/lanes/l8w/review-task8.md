# L8w Task 8 review — `preview_channel_registry`

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Commit under review: `41d3865` ("core+tauri:
preview_channel_registry, SPEC 5.2 fixed-ID subset only (C3 3.8, R63)"), on top
of Task 7's `a23553a`. Files touched (verified via `git show --stat`): new
`core/src/parse/registry_preview.rs`, `core/src/parse/mod.rs` (+1 line, module
registration), `tauri/src/commands/device.rs`, `tauri/src/error.rs`,
`tauri/src/lib.rs` — exactly the file list the task brief authorized. `git
status --short` in the worktree is clean; `Cargo.lock` unchanged; nothing under
`docs/` touched; no `app/src/` file touched. No Task 9 commits present on top
at review time, so nothing else is in scope.

## Test command and result

Not re-run (reviewer does not build, CLAUDE.md §8 / standing brief). Implementer
reported:

- `cargo test -p idl-rs preview_channel_registry` → 9 passed
- `cargo test -p idl-rs-tauri preview_channel_registry_via` → 3 passed
- `cargo check -p idl-rs-cli --tests` and `cargo check -p idl-rs-tauri` both clean

Verified statically: `core/src/parse/registry_preview.rs`'s `tests` module has
exactly 9 `#[test]` functions (`grep -c "fn preview_channel_registry"` = 10,
i.e. the 1 production fn + 9 tests), all substring-matching the `preview_channel_registry`
filter. `tauri/src/commands/device.rs`'s `preview_channel_registry_tests` module
has exactly 3 `#[test]` functions, all named with a `preview_channel_registry_via_`
prefix, substring-matching the corrected filter from the lead's test-filter
note. Both counts are consistent with the reported `passed` numbers and each
test's assertions trace to landed types (`RegistryPreviewRow`, `RegistryRow`,
`ConfigError`/`ConfigErrorKind`, `IpcError`/`IpcErrorKind`) that already exist
in the diff or in `core/src/config.rs` (pre-existing, unmodified) — they would
compile and each would fail if its named behaviour broke (e.g. the per-IMU
range-override test reads `imu1_accel_x.scale` and asserts `16.0/32768.0`,
which only holds if `push_imu_rows`'s override-then-default logic is correct).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/parse/registry_preview.rs:20-24` | Doc comment calls `RegistryPreviewRow` a "field-for-field mirror" of `ChannelRegistryEntry`, but `channel_id` is `u16` here vs. `u8` on the wire type (`session/mod.rs:65`), and `data_type` is `&'static str` vs. the wire type's `u8` code — not actually field-for-field on type. (The `u16` choice itself is correct: it matches the brief's mandated interface and C3 §3.8's `RegistryRow.channel_id: number; // u16, SPEC §5.2` verbatim, so this is a pre-existing C3 wording quirk, not this task's error.) | Soften the doc comment to "shares field *names* with" rather than "field-for-field mirror", or note the type differences explicitly. |
| Minor | `tauri/src/commands/device.rs:821` (`preview_channel_registry` command) | Deviates from this lane's established `_via`-suffixed-plain-function idiom (every other command in this file splits Tauri plumbing from a testable `_via` function) — tests call the `#[tauri::command]` function directly. Documented in a comment above the test module with a stated reason (the command takes no `tauri::State`/transport parameter to abstract over, so a `_via` split would be a no-op duplicate). The standing brief's stated rationale for the `_via` idiom ("not constructible outside a running app") does not apply here, since the function's only parameter is a plain `String`. | No fix required; flagging per the standing brief's "silent, undocumented deviation is a finding" rule — this one is *not* silent, so it does not rise above Minor. If the lead wants strict `_via` uniformity regardless of signature, a trivial `preview_channel_registry_via(config_json: &str) -> ...` wrapper could be added, but it would be dead ceremony given the signature. |

No Critical or Important findings.

## Checks performed (all pass)

- **C3 §3.8 field-for-field.** `RegistryRow { channel_id: u16, data_type: String, sample_rate_hz: f64, scale: f64, offset: f64, name: String, units: String }` matches C3's `interface RegistryRow` exactly in name, order-independent field set, and type (TS `number`↔Rust numeric, `string`↔`String`).
- **Error kinds.** `map_device_config_error` maps `ConfigErrorKind::Parse → IpcErrorKind::ConfigParse`, `::UnsupportedVersion → ::ConfigUnsupportedVersion`, `::Io → ::Io` (existing cross-cutting variant, reused not duplicated) — matches C3 §2's `config_parse`/`config_unsupported_version` rows and the command's own "Errors:" line. `#[serde(rename_all = "snake_case")]` on `IpcErrorKind` confirmed present in `error.rs`, so the two new variants serialize to `config_parse`/`config_unsupported_version` verbatim.
- **`IpcErrorKind` additive-only.** Diff only adds two new variants and their doc comments at the end of the enum; no existing variant's name, discriminant, or `From` impl touched (confirmed via `git show` diff — pure insertion).
- **SPEC §5.2 row-by-row.** IMU: 18 rows, IDs 0–17, base offsets 0/6/12 for IMU0/1/2, axis order `AccelX,AccelY,AccelZ,GyroX,GyroY,GyroZ`, `data_type "i16"`, `units "g"`/`"dps"`, `scale = range/32768.0`, `offset 0.0`, names `IMU{n}_{Axis}` — all match §5.2's table and §8's per-IMU range-resolution text (per-IMU override falls back to `imu`-level default; an absent `imuN` sub-block emits zero rows for that IMU; a disabled individual axis emits zero rows for that axis only). Wheel: IDs 18/19, `u32`, `sample_rate_hz 0.0`, `scale 1.0`, `offset 0.0`, `units "pulse"`, gated on `wheel_speed.front/rear.enabled`, absent block ⇒ no rows — matches §5.2 and §8 "Wheel speed defaults". Pressure: IDs 20/21 correctly never emitted — confirmed no field in §8's schema names their scale/offset, and a dedicated test (`preview_channel_registry_never_emits_pressure_rows_absent_an_explicit_config_source`) asserts this, per R63 (2) / R64.5. HR: ID 22 `u8`, 1 Hz, `bpm`, scale 1.0/offset 0.0; ID 23 `u16`, 0 Hz (event), `ms`, scale exactly `1000.0/1024.0`/offset 0.0 — matches §5.2's BLE HRM table and §8's "added only when `heart_rate_monitor.enabled`" text; absent block or `enabled:false` ⇒ no rows, both covered by tests.
- **`imu.sample_rate_hz` sourcing.** Confirmed §8's schema has exactly one `imu.sample_rate_hz` field (no per-IMU override) — the implementer's `ImuConfig.sample_rate_hz: f64` (an addition beyond the brief's suggested struct skeleton, which omitted it) is the correct and necessary source for the "(configured)" Rate column value on all 18 IMU rows; each test's IMU rows correctly report `833.0` from the seeded JSON.
- **Field types.** `accel_range_g`/`gyro_range_dps`/`sample_rate_hz` deserialize as `f64` from bare JSON integers (`serde_json` numeric coercion) — matches the brief's stated reasoning.
- **Scope-limit documentation.** The module doc comment (top of `registry_preview.rs`) and the function doc comment on `preview_channel_registry` both state the fixed-ID-subset scope limit and the specific reason no pressure row is emitted, satisfying the brief's "document this in the doc comment" instruction. CHANGELOG.md is untouched by this commit, consistent with this lane's established pattern (Task 7's `a23553a` also does not touch CHANGELOG.md) and with `BRIEF.md`'s "Done when" section, which places the CHANGELOG/TASKS.md scope-limitation writeup at Task 14's wrap-up, not per-task.
- **No invented channel IDs.** No code path in `preview_channel_registry` reads `analog.channels[]`/`digital.channels[]` at all — confirmed by `grep` absence of any such field on `DeviceConfig`.
- **CLAUDE.md §4 (testing).** All core tests use Arrange/Act/Assert with blank lines between sections (except two tests with no setup, which correctly have Act/Assert only); names are descriptive `thing_condition_result`-style Rust identifiers (the underscored equivalent of the mandated `thing — condition — result`, matching this lane's established naming style elsewhere in the same file, e.g. `commands/device.rs`'s existing tests). Tauri tests likewise.
- **CLAUDE.md §5 (docs/errors).** Doc comments present on every new `pub` symbol (`DeviceConfig` and all its sub-structs, `RegistryPreviewRow` and its fields, `preview_channel_registry` (core and tauri), `RegistryRow` and its fields, the `From` impl, the two new `IpcErrorKind` variants). Units named where applicable (`Hz`, `g`, `deg/s`). No `Err(String)` anywhere in the diff. No `.unwrap()`/`.expect()`/indexing panic on parsed/untrusted input in production code paths (`push_imu_rows` uses `let Some(slot) = imu_slot else { return }`, not `.unwrap()`; `.unwrap()` calls only appear in `#[cfg(test)]` code, which is the accepted convention).
- **No reformatting.** Diff is purely additive to the five named files; no whitespace/import churn elsewhere.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer; `git show --stat` file list matches the task's authorized file list exactly; shared checkout untouched (not visited by this review, out of scope for this worktree).
- **Additive-only `IpcErrorKind` growth**, verified above.
- **`pub`-surface check.** New `pub` items in `core` (`DeviceConfig`, `RegistryPreviewRow`, `preview_channel_registry`, and sub-structs) are covered by the implementer's reported `cargo check -p idl-rs-cli --tests` clean run; new tauri command + error variants covered by `cargo check -p idl-rs-tauri` clean run.

## Verdict rationale

The derivation is correctly placed in `core` as a pure function (no Tauri, no
fs, no network), the Tauri wrapper is thin (parse → derive → map), and every
emitted row matches SPEC §5.2's fixed-ID table field for field, including the
two most failure-prone details (per-IMU range-override resolution and the
deliberate absence of a pressure-channel row, both directly covered by named
tests). The two new `IpcErrorKind` variants are strictly additive and their
snake_case wire names match C3 §2 exactly. The scope limit the brief called
out (no invented IDs for generic analog/digital channels, no pressure rows)
is implemented, tested, and documented in the doc comments as required; the
CHANGELOG bullet is deferred to Task 14 consistent with this lane's own prior
practice, not silently dropped. The two findings are both Minor: a slightly
imprecise doc-comment claim about type parity with the wire struct, and a
documented (not silent) deviation from the `_via` naming idiom whose stated
rationale — no Tauri-specific parameter exists to abstract over — holds up
under inspection. Neither requires code changes before merge; this is CLEAN
with no rework implied.

VERDICT: CLEAN
