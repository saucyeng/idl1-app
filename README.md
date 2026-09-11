# idl1

The IDL App is a cross-platform, open-source trackside race-engineering analysis app for the IDL1 data logger. 
I includes a Rust data processing engine (`idl-rs`), Tauri v2 shell, Observable Plot/D3 notebook cells, Parquet canonical store, and LAN sync.


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
