# L1 — core `store/` — lane brief

**Scope:** Arrow model ↔ Parquet r/w for `data.parquet`/`derived/<hash>.parquet` (C1); CAS blob
store and atomic-write primitive; SQLite catalog + rebuild + `verify` (C4); `session.json`
(replaces `.idl0w`, C1 §6); `.idl0t` track-artifact writer; bike-profile/app-settings persistence;
session/lap-level ports from the inventory (gate synthesis, session-wide lap renumbering,
lap-distance normalisation, session filenames). L1 is the wave-1 vocabulary owner — every other
wave-1 lane codes against contracts C1/C4 directly, not against L1's code.

**Plan:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l1-store.md` (16 tasks).

**Dependency gate:** none — L1 is first, starts immediately.

**Branch:** `wave1-l1-store`, in its own git worktree in both repos (idl-rs submodule and
idl1-app), per the plan's Global Constraints.

**Done when** (verbatim, design doc §10): Round-trip tests on real `.idl0` sessions with recorded
timestamps preserved bit-exact; catalog rebuild from a scanned tree; CLI `idl-rs import`/`sessions`
work.

**SPEC sections touched:** §15 (Session & File Model — full rewrite), §16.3 (Track Storage Model —
rewrite), §18 (Bike Profiles & Riders — storage-persistence parts only).
