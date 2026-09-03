# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Added

- **Repository created (2026-09-02).** From the idl1 rewrite design
  (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`). Docs carried
  over from idl0-app: SPEC, design rationale, signal pipeline, datasheet,
  tools. The idl-rs engine is the same submodule idl0-app used, continued on
  `main` after tag `idl0-final`.
- **M0 complete (2026-09-02).** Tauri v2 scaffold, `idl-rs-tauri` with the binary IPC
  smoke path, `idl-transport` stub, and contracts C1–C4 signed. Wave 1 may start.

### Verified

- Binary IPC path (Rust 2/2, vitest 3/3, cargo build, tsc clean) on Windows desktop, 2026-09-02 — automated. Visual check via `npm run tauri dev` pending (Isaac).
