# CLAUDE.md — idl1 Standing Orders

Read this file and `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
before any task. The design doc is the architecture; `docs/IDL0_SPEC.md` is the
device/wire contract (Parts 1–2, §3–10 are current; the app-side parts describe
idl0 and are rewritten lane by lane — a lane's SPEC section, once written, wins).

## 1. Ambiguity policy

A wrong assumption costs more than a question. If a field type, an edge-case
behaviour, a layer placement or a signature is not stated in the design doc, a
contract (C1–C4), or the lane's SPEC section — stop and ask. Do not infer, do
not pick "the reasonable one", do not treat silence as approval.

## 2. Layers

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

**Rust = numbers, JS = pictures.** No number the sync model depends on is
computed in JavaScript; no chart is drawn in Rust. Heavy arrays cross IPC as raw
bytes (`tauri::ipc::Response`), never JSON. No IPC on the interaction path
(hover/pan/zoom are local; IPC on gesture settle).

**Decision rule:** physics of the bike or bytes on disk → `core`. Bytes on the
wire → `transport`. Pixels or clicks → `app/src`.

## 3. Principles (quote these in reviews)

- The workbook is a file; the app is a live viewer of it.
- Sync sources; sync outputs only when content-addressed by their inputs.
- The catalog is an index — deletable, rebuildable, never synced.
- Time is recorded, not assumed: every sample keeps its hardware timestamp.
- Log files and blobs are immutable. `data.parquet` is a function of (blob, importer version).
- Offline-first means bundled: no CDN, ever.
- No renderer-only parameters.
- Nothing blocks the main thread (R201). A Tauri command that touches the filesystem beyond a stat, talks to a device or the network, or computes over a session is `#[tauri::command(async)]` and reports progress over a `Channel`; the webview never waits on it. In the UI, work over more than a frame's worth of data leaves the render path.

## 4. Testing

Arrange / Act / Assert with blank lines between. Names: `thing — condition — result`.
Rust tests inline `#[cfg(test)]`; TypeScript tests beside the module as `*.test.ts` (vitest).
Test what we own: wiring, physics, round-trips, merge rules. Not sci-rs, nalgebra,
Tauri, Plot. Coverage: Rust > 90 % (`cargo tarpaulin`); pure TS modules > 80 %;
UI rendering is not unit-tested.

## 5. Documentation and errors

Doc comment on every public symbol; units on every numeric value; `// TODO(idl0):`
never bare `// TODO`. All failures are typed (`TransportError`, core error enums,
the C3 IPC error shape) — never `Err(String)`, never a crash on bad data.

## 6. Spec discipline

Every task declares one of: spec-first (write the SPEC section before code),
spec-during (SPEC section in the same PR), or "no spec change needed" — said out
loud. Every task touching shipped behaviour updates `CHANGELOG.md` and/or `TASKS.md`.

## 7. Repo hygiene

- idl-rs is not rustfmt-formatted; never run `cargo fmt`. Match style by hand.
- No AI attribution trailers in commits, ever. The lead pushes `main` (both repos, submodule first) after each green gate; lanes never push.
- Lanes touch only their own crate/directory. Cross-lane needs are contract changes, through the lead.
- After changing an `idl-rs-tauri` command signature, update `app/src/ipc/` and the C3 contract together.

## 8. Compute rules (the dev machine is memory-bound — ruling R13)

- One cargo process on the machine at a time; jobs are capped machine-wide (`~/.cargo/config.toml`), never override with `-j`.
- Task cycles run only the targeted test filter the dispatch names; each run must report a non-zero `passed` count (a filter matching nothing is a failed gate, not a pass).
- The full suite runs once per lane at its merge gate: `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`. Never `--workspace`.
- No reruns to hunt flakiness unless the lead asks; a known-flaky test is rerun alone by name, once.
- A task that changes a `pub` signature in `core` adds `cargo check -p idl-rs-cli --tests`.
- A lane that touches `idl-rs-tauri` or `app/src-tauri` adds `cargo check -p app` run from `app/src-tauri` at its merge gate: nothing else compiles the app crate (R199).
- Never `cargo fmt`, `cargo tarpaulin`, or `cargo doc` inside a task. Readers (reviewers, adjudicators) never build.
