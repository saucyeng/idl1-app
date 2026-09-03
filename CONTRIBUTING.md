# Contributing to IDL0

## Licensing of contributions

Contributions are accepted under the repository's license (AGPL-3.0-or-later
here and for `idl-rs`; GPL-3.0-or-later for firmware) **and** the [CLA](CLA.md),
which lets the project offer commercial/dual licenses. A bot (CLA Assistant)
records your agreement on your first pull request.

## Before You Start

Read `docs/IDL0_SPEC.md`. It is the source of truth for all architecture decisions. If your contribution conflicts with the spec, open an issue to discuss the spec change first — don't silently deviate in code.

## Code Standards

### Test-Driven Development
Write the test file before the implementation. Tests must pass before a PR is mergeable.
Run `cargo test --workspace` in `rust/` for Rust changes and `npm test` in `app/` for
TypeScript changes. Coverage targets: Rust > 90% (`cargo tarpaulin`); pure TS modules
> 80%; UI rendering is not unit-tested.

### Documentation
Every public class, method, and field requires a `///` doc comment. Comments must state units explicitly — never leave a numeric value's units ambiguous between raw LSB, g, m/s², etc.

### Layer Separation
```
rust/core/       idl-rs        PURE. Signal processing, parsing, importers, store
                                (Parquet/CAS/catalog), workbook evaluation. No Tauri,
                                no async runtime, no network. std::fs only.
rust/transport/  idl-transport I/O: BLE, WiFi transfer, config push, LAN sync.
                                Never depends on Tauri. Never does DSP.
rust/tauri/      idl-rs-tauri  #[tauri::command] glue over core + transport. The only
                                crate the frontend sees. Thin.
rust/cli/        idl-rs-cli    The idl-rs binary. Depends on core (and transport when needed).
app/src-tauri/                 Tauri app crate: builder, plugin registration, mobile plugins.
app/src/                       TypeScript UI. Talks only to idl-rs-tauri commands.
```

**Rust = numbers, JS = pictures.** No number the sync model depends on is
computed in JavaScript; no chart is drawn in Rust. `core` functions must be
testable without Tauri or a device.

### State Management
Riverpod only. No Provider, no Bloc, no raw setState except for local widget state.

### Naming
```
snake_case        files
PascalCase        classes
camelCase         functions and variables
SCREAMING_SNAKE   constants
```

### TODOs
```dart
// TODO(idl0): description
```
Never use bare `// TODO`.

## Pull Request Checklist

- [ ] `cargo test --workspace` (in `rust/`) and `npm test` (in `app/`) pass with zero failures
- [ ] Coverage targets met for affected layers
- [ ] All public symbols have `///` doc comments with units
- [ ] Complex algorithms have mathematical basis comments
- [ ] No bare TODOs
- [ ] Implementation matches spec — no silent deviations
- [ ] `CHANGELOG.md` updated if meaningful change

## Firmware Contributions

- Zero processing in firmware — the firmware reads raw binary from sensors and writes to SD card. No filtering, integration, or signal conditioning belongs in firmware.
- All structs use `__attribute__((packed))`
- ISR handlers marked `IRAM_ATTR`
- Document every register read sequence with datasheet section reference

## Questions

Open an issue. Don't guess at architectural decisions — if something isn't covered by the spec, ask.
