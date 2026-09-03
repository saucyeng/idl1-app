# idl1

Trackside race-engineering analysis for the IDL0 data logger — and for a decade
of FIT/GPX files from anything else. Rust engine (`idl-rs`), Tauri v2 shell,
Observable Plot/D3 notebook cells, Parquet canonical store, pit-lane LAN sync.

**Status:** M0 (foundations). Not yet usable. idl0-app (Flutter) remains the
shipping app until M2.

- Design: `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
- Standing orders for contributors and agents: `CLAUDE.md`
- Device, wire and firmware contract: `docs/IDL0_SPEC.md` Parts 1–2 and §3–10
  (app-side parts of that document describe idl0 and are being rewritten lane by lane)
- Work queue: `TASKS.md`

## Build

Requires a Rust toolchain, Node.js, and the Tauri v2 prerequisites for your
platform (see the Tauri docs). Then:

    git submodule update --init
    cd app && npm install && npm run tauri dev

## Licence

AGPL-3.0-or-later. See `LICENSE` and `CLA.md`.
