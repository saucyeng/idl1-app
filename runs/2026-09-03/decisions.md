# Wave-1 decisions ledger

**Index of rulings:** R1 (scope=all 6 lanes), R2 (ODR fixture), R3 (sequencing),
R4 (overnight→runs rename), R5 (C1 `Channel` gains `t_recorded_us`/`unit`),
R6 (C4 gains `profiles/`), R7 (cross-lane adjudication pass, below), R8 (this
session's summary — see end of file).


Human rulings and lead adjudications for the idl1 wave-1 plan (L1–L5, L10).
Format per §12 of the design doc's operating model: every ruling states what
was decided, why, and the cost if it turns out wrong.

---

## 2026-09-03 — R1: Wave-1 scope is all six lanes (L1–L5, L10)

**Decision:** The daytime brief's lane list ("L1 core store/, L2 impor
idl-transport desktop, L5 scaffold hardening, L10 docs") was a paste
truncation, not a scope cut. Confirmed by Isaac: the intended list is L1, L2,
L3, L4, L5, L10 — matching design doc §10/§11's wave-1 row exactly.

**Why:** L3 consumes L1's `Channel` type directly (design's "vocabulary owner
first" rule names L1→L3 explicitly) and is what gives L6 (wave 2) anything to
render. Dropping it from wave 1 would silently break that sequencing.

**Cost if wrong:** Low — the six lane plans are independent documents; if L3
should in fact wait, its plan simply isn't executed tonight. Producing it
costs nothing but the planning pass.

---

## 2026-09-03 — R2: Burst-seam validation session (C1 §8 item 8) is ready

**Decision:** Isaac supplied a real `.idl0`/`.idl0w` pair for the C1 §3.3
burst-seam correction's real-data validation:
- `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\d365a19ae7ef2dc2d087a5887371281f.idl0`
- `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\d365a19ae7ef2dc2d087a5887371281f.idl0w`

Isaac's own words: "I think it's clean" — i.e. not independently confirmed
free of corruption or a known-bad recording; L1 verifies this itself (parses
cleanly, has both GPS and IMU channels enabled, so the GPS-anchored duration ÷
IMU sample count independent-ODR estimate from C1 §8 item 8 is computable).

**Why:** C1 §8 item 8 assigns this validation to L1, blocking before the
burst-seam correction ships; the file was missing from the workspace (I
searched — no `.idl0` files existed anywhere under `saucyeng/` before this).

**Cost if wrong (file turns out not clean / no real ODR offset):** Medium —
L1's plan makes this validation task independent of and after the core
round-trip tests (which use synthetic data from C1's own worked example), so
a bad fixture blocks only the validation step, not L1's landing. Fallback:
L1 reports the finding and the plan's validation task is re-run against a
different session once Isaac supplies one; nothing else in wave 1 depends on
this file. The two loose files are left untracked (git-ignored) at the repo
root — not moved into `rust/` or committed — since real session data doesn't
belong in source control (design principle: sync sources, not this kind of
fixture) and no test-fixture convention exists yet in `idl-rs` to place it
under.

---

## 2026-09-03 — R3 (lead): Wave-1 execution sequencing and worktree assignment

**Decision:**
1. **L1** lands first, solo, own worktree/branch on the `rust` submodule repo.
   No other lane starts real implementation before L1 merges to `rust`'s
   `main` — this is design doc's "vocabulary owner first" rule, taken
   literally for wave 1's execution order.
2. **L4** (`idl-transport` desktop) is fully independent of L1–L3 (different
   crate, no core dependency) — its worktree may open and start immediately,
   in parallel with L1, on the `rust` repo (a second worktree, per
   CLAUDE.md's "parallelise only across repos/worktrees").
3. **L3** starts once L1's types are landed. Because the brief calls out
   `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` for lanes that "need to talk to
   each other (L1↔L3)" — confirmed set (`=1`) in this environment — L1 and L3
   may run as a coordinating team sharing one worktree/branch if L1 is still
   in flight when L3's turn comes, rather than strictly serialized merge-then
   -start; either way L3's plan gates its first task on L1's Session/Channel
   types existing on disk.
4. **L2** (importers) needs only C1's already-fixed `Session`/`Channel`
   *output* shape (frozen in the signed contract, not L1's internal
   implementation) — its plan may be drafted and even implemented in
   parallel with L1, but its worktree is opened after L1 lands, to avoid a
   merge racing L1's own landing on the same crate.
5. **L5** (Tauri scaffold hardening) spans two repos (`app/` in idl1-app,
   `rust/tauri` in the submodule) and is independent of L1–L4 for its
   scaffolding tasks (routing, state, watcher plumbing), but its "tile
   fetched and rendered end-to-end" done-criterion depends on L3's
   `fetch_tile` command (C3 §3.5, owned by L3) — L5's plan sequences that
   task last, after L3 lands.
6. **L10** (docs) is per-lane SPEC sections written inside each lane's own
   plan (spec-first, CLAUDE.md §6) plus a standalone L10 plan for the
   cross-cutting pieces no lane owns: SPEC §11 rewrite, README/CHANGELOG/
   TASKS discipline, and the four deferred minors from the M0 carry list
   (idl0_dump.dart mention, app/README template text, transport test naming,
   idl0 CLAUDE.md §2 staleness). L10's own plan runs last, as a verification
   pass that every other lane actually landed its SPEC section.

**Why:** Matches CLAUDE.md's "serial by default... parallelise only across
repos/worktrees" together with the design doc's explicit vocabulary-owner
and agent-team callouts; avoids two lanes racing a merge into the same crate.

**Cost if wrong:** Medium — if L2/L5 turn out to need more of L1's actual
internals than C1's frozen output shape provides, their worktrees opened in
parallel would produce work that doesn't compile against the landed L1 and
needs a rebase. Mitigated by each plan's first task being an explicit,
checkable gate (a `git log`/file-content check) rather than a time-based
assumption.

---

## 2026-09-03 — R4: `overnight/` renamed to `runs/<date>/`

**Decision:** This directory (and design doc §12's operating-model text)
used `overnight/lanes/<lane>/BRIEF.md` and `overnight/decisions.md`,
echoing the naming of the separate `saucyeng/overnight/` cross-repo tool.
Isaac asked for different terminology — "overnight" reads fine for one
run then "nalls off" for the next. Renamed to `runs/<date>/decisions.md`
and `runs/<date>/lanes/<lane>/BRIEF.md`, dated per execution pass so
successive runs get their own subdirectory instead of overwriting the
ledger. Design doc §12 edited in place to match. The separate
`saucyeng/overnight/` tool is untouched — out of scope, not renamed.

**Cost if wrong:** Trivial — a `git mv` and one doc edit; no code or
contract content depends on the path name.

---

## 2026-09-03 — R7: Cross-lane adjudication of all six wave-1 plans

All six lane plans (L1 store, L2 importers, L3 workbook, L4 transport, L5
Tauri scaffold, L10 docs) landed. This ruling records the lead's review pass
over every `Assigned: lead`/`Assigned: Isaac (lead)` item each plan logged,
distinguishing contract amendments (edited in place, dated post-sign) from
plain approvals (no doc change needed) from items genuinely left for Isaac.

### Contract amendments made (see the contract files' own post-sign notes for full text)

- **C1 §2** — `Channel` gains `t_recorded_us: Option<Vec<i64>>` and
  `unit: String`. L1's plan needed both to satisfy §4.1/§4.2's already-signed
  requirements (independently-readable recorded-vs-corrected columns; a
  `unit` value with no other source) — the original struct listing simply
  omitted fields its own later sections required. **Cost if wrong:** Low —
  additive fields, no existing code depends on their absence (nothing shipped
  against C1 yet); a wrong shape costs one more amendment.
- **C1 §4.1** — the FIT/GPX-derived column row gains `GPS_SpeedKmh`/
  `GPS_Heading`. L2 flagged that lap timing/distance normalisation (L1's own
  scope) depends on `GPS_SpeedKmh` for `.idl0` sessions and would silently
  lack it for FIT/GPX without this. L2's plan gets a new Task 8 (mapping:
  FIT `speed`/`enhanced_speed` ×3.6; GPX `<speed>`/`<course>` or the ported
  Dart fallback) rather than a hand-authored diff, matching how this plan
  already leaves comparable follow-ups to the implementer. **Cost if wrong:**
  Low — if the columns turn out genuinely unwanted, dropping a Task 8 that
  was never executed costs nothing; if wanted but the mapping is subtly
  wrong, it surfaces in Task 8's own golden tests before the lane is done.
- **C4 §2/§6** — `profiles/<profile_id>.idl0p` added to the data-directory
  layout and the sync-scope "Moves" list (last-write-wins, alongside
  `session.json`/tracks). C4 had no location at all for the design doc's
  "profile/settings persistence" L1 scope item. Rooted inside `<data>`
  (synced) rather than beside the unsynced `settings.json` bootstrap file,
  since a rider's bike-profile data is exactly the kind of cross-device
  state LAN sync exists for. **Cost if wrong:** Medium — if profiles should
  in fact be unsynced per-machine state, this is a real (if small) rework:
  moving the file, an L11 (wave 2) endpoint that shouldn't have existed. Flagged
  to Isaac below since it's a product-shape call, not purely technical.
- **C3 §2** — seven new `import_*`-prefixed error kinds
  (`import_fit_malformed`, `import_gpx_malformed_xml`,
  `import_gpx_no_trackpoints`, `import_gpx_missing_lat_lon`,
  `import_gpx_unparseable_lat_lon`, `import_csv_malformed`,
  `import_not_utf8`), one per L2's `ImporterError` variant, matching C3 §2's
  own per-enum-domain-prefix rule. Needed before L5's Group B `import_file`
  wrapper task. **Cost if wrong:** Trivial — additive kinds, unshipped.
- **Ecosystem report** — added a `reqwest` row (`0.13.4`, MIT OR Apache-2.0,
  released 2026-05-25), verified against crates.io's own API the same way
  the original 32 rows were, since L4's WiFi-transfer task was genuinely
  blocked without a pin and the M0 research task's scope hadn't covered it.
  **Cost if wrong:** Trivial — one dependency version, easy to bump.

### Approved as drafted, no contract text change (technical calls within the lead's own discretion)

- L1: `Channel::from_f64`'s synthetic-uniform `t_us` for interior
  derived-channel storage (scoped exception to C1 §3.5 invariant 4 — never
  reaches `data.parquet`); `Time`/`Distance` losing the zero-storage
  `Ramp`/`Interp` in-memory representation (Parquet still never writes
  either column — this only changes L1's own RAM/module-layout choice, C1
  §1's own discretion); per-IMU (not session-wide-shared) `nominal_rate_hz`
  after burst correction (SPEC §15.2's shared-rate argument doesn't survive
  per-IMU true-ODR correction); reusing `app_config_dir()/settings.json` for
  `rider_name`/`unit_system` alongside `data_dir` (additive JSON keys, low
  risk).
- L3: the stray-math-line and malformed-table-JSON error-kind defaults;
  per-*definition* (not per-cell) `CellOutput` entries for a multi-definition
  math cell; the tile column-stats sample-range-mapping default; nearest-
  sample-clamped cursor interpolation. **Also ruled:** C3 §3.5's worked
  example (`sample_count = 512`) vs. the engine's `TILE_SIZE_BUCKETS = 1024`
  constant is **not** a real inconsistency — the worked example is
  illustrative arithmetic for the byte-offset formulas, not a claim about
  production tile sizes (the format is self-describing via its own
  `sample_count` header field either way); no contract edit needed.
- L4: leaving `DeviceStatus.hr` as a raw string this wave (typed `HrState`
  deferred to L7/wave 2's Device-tab HR UI, which may want to parse it
  differently anyway); accepting that BLE GATT calls are untested until
  Task 9's real device (same class of gap M0 itself accepted for
  `npm run tauri dev`); the BLE timeout policy (15 s per operation, no
  backoff — matching SPEC §6.2's own op-wait number for consistency, no
  retry logic at this layer since desktop has no reconciler to share it
  with).
- L5: `.setup()` panicking on `<data>` resolution failure before any window
  exists — accepted as a known, rare-failure-mode gap, consistent with how
  M0's own builder already panics via `.expect(...)`.

### Left for Isaac specifically (not the lead's call)

- **C1 §8 items 2/4** (already Isaac's per C1 itself, carried forward
  unchanged by L1's plan — not re-litigated here): `lap_gates`/`sector_gates`
  inclusion in `session.json`; their lat/lon units (decimal degrees vs. the
  Dart doc comment's "× 1e7", suspected copy-paste bug).
- **The `profiles/` sync-scope call above** — technically resolved by this
  ruling so L1's plan isn't blocked, but flagged for Isaac to confirm or
  reverse: is bike-profile data meant to sync between a rider's own devices?
- **Isaac's real FIT/GPX archive location** (L2 open question 7) — not
  blocking (L2's golden tests use hand-built fixtures), useful whenever
  convenient.
- **GPX per-point missing-`<time>` fallback behaviour** (L2 open question 2)
  — L2's plan ports Dart's whole-file fallback and extends it per-point with
  a warning (Dart silently zero-fills instead); a real behavioural choice,
  approved as the working default but worth Isaac's eyes since it changes
  Dart's existing behaviour, not just extends it.

### Not touched — genuinely deferred, already correctly assigned in-plan

L1's own open questions 5, 7, 10–13, 15–17 (implementation-time details,
each already says "Assigned: L1, resolved during Task N"); L2's open
questions 6, 8, 9 (L1/L3's or the L2 implementer's own call at execution
time); L3's open question 7 (already C3's own tracked item, not new); L4's
open questions 2, 3, 5–8 (implementation-time / reviewer-time calls, each
already assigned); L5's open questions 1–2, 4–5 (L6's call, cargo-resolved
versions, execution-time gate checks — self-healing, see below).

### Cross-lane consistency check

L3's brief names the exact functions L5's Group B tile/raster/cursor tasks
call (`idl_rs::tile::build_tile_bytes`,
`idl_rs::raster::build_spectrogram_raster_bytes`,
`idl_rs::raster::build_histogram2d_raster_bytes`,
`idl_rs::cursor::cursor_readout`) — L5's plan was drafted concurrently and
couldn't know these names in advance, so every Group B task states its gate
as "confirm against `<lane>`'s BRIEF.md/plan at execution time" rather than
a name it might get wrong. This is a deliberate, load-bearing design choice
(R3's gate mechanism), not a gap: the mismatch self-corrects when the
overnight/runs executor actually opens L3's landed brief before starting
L5's gated task, so no further reconciliation edit was made to L5's plan
text itself.

**Cost if wrong (across this whole ruling):** Low individually (see each
item above); in aggregate, medium — a lead adjudication pass concentrates
judgment calls that could each be second-guessed, but every one states its
reasoning and a cheap reversal path, and none blocks tonight's plan from
being executable.
