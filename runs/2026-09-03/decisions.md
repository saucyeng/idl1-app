# Wave-1 decisions ledger

**Index of rulings:** R1 (scope=all 6 lanes), R2 (ODR fixture), R3 (sequencing),
R4 (overnight→runs rename), R5 (C1 `Channel` gains `t_recorded_us`/`unit`),
R6 (C4 gains `profiles/`), R7 (cross-lane adjudication pass), R8 (profiles
sync confirmed; gate lat/lon units — decimal degrees confirmed, below).


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

---

## 2026-09-03 — R8: profiles sync confirmed; gate lat/lon units — decimal degrees, confirmed

**Profiles sync.** Isaac confirmed R7's default: `profiles/<id>.idl0p` syncs
(last-write-wins by `updated_at_ms`, alongside `session.json`/tracks) —
bike-profile data is meant to travel between a rider's own devices. No
contract change (C4 already amended under R7); closed.

**Gate lat/lon units (C1 §8 item 4).** Isaac's first reaction was that the
`× 1e7` doc comment on Dart's `LapGate` was probably just an artifact of
figuring out units — the opposite of what this contract's own draft text
had guessed (it called the comment "almost certainly a copy-paste artifact"
and assumed decimal degrees was the real runtime unit). Neither guess was
checked against the actual code, so before ruling, verified directly:

- `lap_detector.dart`'s `LapGate` class doc comment states the `×1e7`
  rationale explicitly (matches raw `GPS_Latitude`/`GPS_Longitude` wire
  scale, "keeps gate/track comparison scale-agnostic") — not a stray
  per-field comment, a deliberate class-level design note.
- `track_editor_modal.dart` multiplies a map tap's decimal-degree `LatLng`
  by `_coordScale = 1e7` at every `LapGate` construction site, and divides
  by the same constant at every render site (three independent call sites
  checked). Fully consistent with the doc comment, not contradicted
  anywhere.
- Isaac raised, correctly, that lap detection might have already moved to
  Rust — confirmed: `rust/core/src/laps/geometry.rs` (`find_crossings`) and
  `rust/core/src/gps.rs` (`GpsFix`) are the real, already-tested
  crossing-detection pipeline, and `GpsFix` is documented as native `×1e7`
  scale ("no conversion" from raw channel samples).
- Decisive fact for the ruling: `find_crossings`'s geometry (flat-earth line
  intersection) is **scale-invariant by its own doc comment** — it produces
  identical crossings fed decimal degrees or `×1e7`. So `×1e7` was never a
  correctness requirement, only a convenience that avoided a conversion step
  when idl0 built `GpsFix` from raw channel samples.

**Decision (Isaac's, after seeing the sharpened tradeoff):** `session.json`
keeps C1 §6's original decimal-degrees choice — it's a new, human-legible
file, not an internal struct feeding real-time comparison against raw
bytes, and the scale-invariance means there's no correctness cost either
way. C1 §6 and §8 item 4 rewritten to state the real reasoning (the
original "copy-paste artifact" claim was removed — it was wrong, not just
imprecise) and to require the conversion explicitly: L1 converts once at
the `session.json` ⇄ `Gate`/`GpsFix` boundary, verified by a round-trip
test that exploits the algorithm's own scale-invariance. L1's plan (Task
14) had already independently arrived at exactly this design, flagged as
contingent on this confirmation — no plan rework needed, only its own open
question 14 marked ruled.

**Cost if wrong:** Low — the conversion is one multiply/divide at one
boundary, already written into L1's plan with a test that would fail loudly
(wrong-shaped gates that produce visibly wrong lap crossings, not a silent
corruption) if the scale were ever mismatched.

---

## 2026-09-03 — R9: execution-time fix — every lane needs its own real worktree, not the shared checkout

**What happened.** Execution started: L1 Task 1 and L4 Task 1 dispatched in
parallel. L1's plan had explicit `git worktree add` commands (its own
Global Constraints, Steps 1-2) and correctly created an isolated worktree at
`idl-rs-worktrees/wave1-l1-store`. L4's plan said "own worktree" in prose
but never gave the actual command, and its "Working directory for every
Rust step" line pointed straight at the **shared** `idl1-app/rust`
checkout — so its implementer ran `git checkout -b wave1-l4-transport`
directly there, committing Task 1 with the shared checkout left on that
branch instead of `main`.

**Why this matters.** The shared submodule checkout is meant to always sit
on `main` so any lane can cleanly `git worktree add ... main` from it at
any time. A lane that checks out its own branch there instead doesn't just
risk a merge conflict — it makes the checkout unusable as a branch-off
point for whichever lane runs next, and (worse) if two lanes ran this way
concurrently, the second would silently switch the first's checkout out
from under it mid-task.

**Fix, immediate:** converted L4's Task 1 work into a real worktree at
`idl-rs-worktrees/wave1-l4-transport` (`git checkout main` in the shared
checkout to restore it, then `git worktree add` attaching the *existing*
`wave1-l4-transport` branch to the new directory) — no commits lost, no
code changed, purely a checkout-structure fix. Verified `git -C rust
worktree list` afterward: shared checkout on `main`, `wave1-l1-store` and
`wave1-l4-transport` each in their own directory.

**Fix, systemic:** audited every wave-1 plan (`grep` for direct `cd`s into
the shared `idl1-app`/`idl1-app/rust`/`idl1-app/app` paths, excluding
legitimate `git worktree add` setup lines and read-only `git status`
checks). Found the same gap in **L2, L3, L5, and L10** — all four pointed
at least one working-directory line or commit step at a shared checkout
instead of an isolated worktree; L10's was the most dangerous of the four,
since its own text proposed *reusing* the shared `rust` checkout by
switching its branch, exactly the mechanism that just caused L4's mistake,
with only a defensive-but-fragile "if another lane's branch is checked out
here, stop" check rather than real isolation. Every plan now has explicit
`git worktree add` commands in its Global Constraints (rust submodule
worktree, plus an idl1-app-repo worktree wired to it the same way M0 Task 3
Step 6 and L1's own plan already did), and every task-level `cd`/working-
directory reference was corrected to point at the lane's own worktree, not
the shared checkout. L4's plan additionally had a real bug beyond the path
issue — Task 8's commit step tried to `git add docs/IDL0_SPEC.md` from
inside the `rust/` working directory, where that file doesn't exist at all
(it lives in the idl1-app repo) — split into the two separate per-repo
commits the plan's own text already said should exist but the literal bash
block didn't do.

**Cost if wrong:** Low — this is a mechanical correction to *where* each
task runs, not to *what* any task does; no plan's actual file contents,
commands, or acceptance criteria changed, only the working-directory paths
around them. The real cost was already paid (one lane's Task 1 had to be
manually repaired) — this ruling exists to make sure it doesn't recur
across the other five lanes as they start.

---

## 2026-09-03 — R10: execution-time fix — `git worktree add` doesn't init submodules

**What happened.** L1's Task 1 implementer hit a second, worse bug in the
same worktree-setup step this one just reviewed as "correct" (R9): its
Step 2 does `git worktree add` on the idl1-app superproject, then
immediately runs `git -C rust remote add/fetch/checkout` against the new
worktree's `rust/` path. `git worktree add` does **not** initialize
submodules — the new worktree's `rust/` starts as an empty placeholder
directory with no `.git`. Because a bare `rust/` directory with no `.git`
still resolves via git's normal upward repo-discovery, every `git -C rust
...` command silently ran against the **idl1-app superproject's own git
directory** instead of failing loudly — resetting the shared
`wave1-l1-store` branch ref, adding a stray `local-wave1` remote to the
wrong repo, and checking idl-rs's tree into the app worktree.

**Why it wasn't caught by R9's audit.** R9 checked *which directory* every
task's commands ran in; this bug is about a missing prerequisite command
*within* an already-correct worktree-setup sequence — a different class of
mistake, invisible to a path-based grep. L1's implementer caught it only
by noticing the actual `git -C rust` output didn't match what the
placeholder directory should have produced, diagnosed the repo-discovery
mechanism, and repaired it (`git reset --hard` the app worktree back to
`main`, removed the stray remote, added `git submodule update --init --
rust` before the remote/fetch/checkout sequence, re-ran clean) — with no
data loss and the lead's own main checkouts confirmed untouched throughout
(verified independently after the fact: `git status`/`git remote -v` on
both `idl1-app` and `idl1-app/rust` clean, correct origin, no stray refs).

**Fix.** Added `git submodule update --init -- rust` as the required first
line after `cd` into the new idl1-app worktree, in L1's own Step 2 and in
the equivalent worktree-setup block R9 had just added to L2, L3, L4, and
L5 (all five copy the same sequence; all five needed the same one-line
fix). L10 doesn't wire a submodule this way (its rust-side task is a
standalone worktree with no cross-repo pointer to set) — not affected.

**Cost if wrong:** Low — same class as R9: a missing prerequisite command,
not a change to what any task produces. The actual damage this run (one
branch ref reset, one stray remote) was real but fully diagnosed, fully
reversible, and reversed before it reached anything the lead or any other
lane depends on.

---

## 2026-09-03 — Tracked, non-blocking: SPEC §16.1 Drive contradiction

L1 Task 2's review (`runs/2026-09-03/lanes/l1-store/review-task2.md`) found
`docs/IDL0_SPEC.md` §16.1 still says Tracks live in Google Drive — pre-existing,
untouched by Task 2 (correctly out of its declared scope, §15/§16.3/§18
only), and now contradicts the rewritten §16.3's "no cloud store" language.
No wave-1 lane owns §16.1/§16.2/§16.4 (design §10 doesn't assign them to
L1-L5/L10). **Owner: lead, tracked for a future pass** — not blocking wave 1.

---

## 2026-09-03 — Execution fix: L1 plan's Task 9 parquet writer used the wrong filter

L1 Task 4's review (`runs/2026-09-03/lanes/l1-store/review-task4.md`) caught
a real forward-compatibility break in the *plan text*, not the landed code:
Task 4 correctly changes `Time`'s in-memory representation from
`RawColumn::Ramp` to `RawColumn::F64` (required by C1 §3.5 invariant 4).
The already-drafted Task 9 parquet-writer section of the same plan excluded
synthesized channels (`Time`, `Distance`) from `data.parquet` by matching
`RawColumn::Ramp | RawColumn::Interp` — a filter that would silently stop
catching `Time` once it's `F64`, so Task 9 as drafted would have written
`Time` into `data.parquet`, violating C1 §4.1 ("never a column, regenerated
on read"). Fixed in the plan (three call sites) to filter on
`c.source_kind == "synthesized"` instead — set on both `Time` and `Distance`
by Task 4, stable regardless of either's `RawColumn` representation. Caught
and fixed before Task 9 was ever implemented, so no code rework was needed.

**Cost if wrong:** Trivial — caught pre-implementation; if `source_kind`
turned out not to be the right filter either, it's the same one-line-per-
call-site fix again, still before any code exists to rework.

---

## 2026-09-03 — R11: two execution-time process notes (both benign, tracked)

**1. `git submodule update --init -- rust` can print a scary-but-harmless
"remote error" during worktree setup.** L5's Task 1 implementer (and,
per its own report, L1/L4 before it) saw `fatal: remote error:
upload-pack: not our ref …` when running the R10-fixed submodule-init
command — because the submodule's configured remote is GitHub (`origin`),
which does not have the unpushed local commits the new worktree needs
(everything in this run stays local until Isaac pushes). The command still
leaves a usable partial clone, and the plan's own next steps
(`remote add local-wave1` pointing at the actual local worktree, `fetch`,
`checkout -B ... FETCH_HEAD`) correctly redirect to local objects and
complete the setup correctly regardless. Confirmed end-to-end by L5's
reviewer: the new worktree's submodule checkout matches the standalone
`rust` worktree's tip exactly. **Not a bug** — expected output given local,
unpushed branches; implementers should not stop or report it as a blocker.
Noted in L2/L3's plans (not yet executed) so their implementers aren't
alarmed by the same message.

**2. A reviewer's "verify by reverting" left stale git state in a shared
worktree.** L1's GPS-fix reviewer (`review-gps-fix.md`) verified its test
by "reverting in a scratch copy" — but reviewers have `Bash`, not a
separate isolated checkout by default, so this most likely ran directly in
the shared `wave1-l1-store` worktree and didn't fully clean up (`git
revert --abort`/`--quit`), leaving `REVERT_HEAD`/index metadata in a
partially-resolved state. L1's next implementer (Task 5) found this on
starting, verified `git diff HEAD` was empty (no content was ever at risk
— the working tree already matched HEAD), and cleared it cleanly. No data
was lost at any point. **Process fix, going forward:** a reviewer verifying
"does the test fail without the fix" must do so in a disposable copy (e.g.
`git worktree add` to a throwaway path, or `git stash`/`git diff | patch
-R` against an in-memory buffer) — never a live `git revert`/`git reset
--hard` in the worktree another task will resume from — and must always
leave the worktree exactly as it found it. Not re-dispatching a fix for
this now (already resolved); flagging for future review-dispatch prompts
to state explicitly.

**Cost if wrong:** Both trivial — (1) is a documentation note about an
already-harmless message; (2) already fully resolved with independently
verified zero data loss, this is a forward-looking process note only.

---

## 2026-09-03 — R12: L1 Task 6 blocker — three pre-existing gap-detection fixtures are too small for burst correction's median robustness

**What happened.** L1 Task 6 (integrating burst-seam correction into gap
reconciliation, C1 §3.3's "ruled" ordering) implemented Steps 1-3/5 cleanly
(587 tests pass, including the new worked-example test and the
`ImportWarning` threading Task 5's review flagged), but three *pre-existing*
tests fail: `single_imu_drop_is_linearly_filled_and_recorded`,
`two_imus_with_different_drops_align_a_shared_spike_to_the_same_slot`,
`all_imu_channels_report_the_single_nominal_rate_despite_different_drops`.
The implementer correctly stopped rather than guess — hand-verified this is
not an implementation bug (the code matches C1 §3.3's formulas exactly) and
not a spec bug either.

**Root cause.** These fixtures are tiny — 2-3 bursts, 4-11 samples, with one
genuine drop. C1 §3.3 justifies its median-not-mean effective-period
estimate as robust to exactly this case ("a burst that straddles a genuine
drop would skew a mean but not a median") — but that robustness requires
enough *other* burst estimates for the skewed one to be an outlier the
median ignores. With one or two total estimates, "median of one value" *is*
the skewed value, so the single genuine drop gets statistically
reinterpreted as an off-nominal true ODR and re-spaced away — a gap that
should exist gets silently absorbed instead of detected. The algorithm is
behaving exactly as C1 §3.3 specifies; the fixtures are too small to
actually exercise the robustness guarantee the spec claims for them.

**Ruling.** Extend all three fixtures with realistic surrounding burst
context (enough consecutive normal bursts before/after the one genuine drop
that the drop's skewed estimate is a clear, ignorable median outlier — as a
concrete floor, at least ~8-10 total burst-to-burst estimates, so one
skewed value can't be the median or adjacent to it) — **preserving each
test's original name and intent** (the drop must still be detected as a gap
and linearly filled; that is what `single_imu_drop_is_linearly_filled_and_
recorded`'s own name asserts, and rewriting it to accept "drop silently
absorbed, no gap" would make the test's name false). This is a fixture-data
change, not an algorithm or spec change — Task 5/6's implementation is
correct as landed and needs no rework.

**Why not the alternative** (accept new expected values for the small
fixtures as-is): that would make these three tests start asserting the
*opposite* of what their names claim, silently narrowing coverage to
exactly the small-session case burst correction is *least* accurate for,
with no test left covering the actually-common real-session case the
current fixtures were meant to represent.

**Cost if wrong:** Low — if 8-10 estimates turns out not to be enough
margin in practice, the fix is widening the fixtures further, not
redesigning anything; the underlying algorithm and its tests-must-detect-
the-drop intent are unaffected either way.

---

## 2026-09-03 — Tracked, non-blocking: pre-existing flaky watcher test

L5 Task 10's review found `watcher::tests::self_write_with_pre_registered_
hash_never_fires_callback` (Task 3's work, already reviewed CLEAN twice)
fails intermittently — confirmed real, ~1.6% failure rate over ~61 runs —
but is a pre-existing timing-sensitive issue (the TTL/debounce design ruled
safe in Task 3's review) merely exposed by more parallel test execution in
Task 10, not a Task 10 regression. **Owner: whoever next touches
`tauri/src/watcher.rs`** — fix the race (likely needs a slightly longer
debounce margin in the test, or a deterministic clock injection instead of
real sleeps) before this lane's own final done-criteria check, since a
~1.6% flake rate will eventually surface as a false CI failure. Not
blocking L5's current task chain.

**Cost if wrong:** Low — a known, characterized, low-frequency flake in one
test; the underlying watcher logic itself was independently judged safe.

---

## 2026-09-03 — L5 Task 10 blob path fixed: sharded, not flat

L5 Task 10's `download_file` command wrote downloaded blobs to a flat
`blobs/sha256/<hash>` path instead of C4 §2's fixed sharded
`blobs/sha256/<2 hex>/<62 hex>` convention — a real contract violation that
would have broken catalog/verify/sync's blob-path assumptions once those
lanes land (L1's own Task 8, already correct on the not-yet-merged
`wave1-l1-store` branch, uses the right sharding). L5 couldn't literally
import L1's `store::blob` writer yet (L1 hasn't merged to `main`), so a
duplicate ad hoc implementation was the only option available at the time
— fixed to use the *correct* sharded path formula directly, with a
`// TODO(idl0):` to replace the duplicated sharding logic with a real call
into `idl_rs::store::blob` once L1 merges to `main`, rather than blocking
L5 on L1's landing.

**Cost if wrong:** Low — the sharding formula itself is simple and fixed
by contract (first 2 hex chars / remaining 62), independently verifiable
against C4 §2's text; the TODO ensures the duplication doesn't linger
past L1's merge.

---

## 2026-09-03 — Process near-miss: dispatched a task before its worktree's prior fix had landed

**What happened.** The lead dispatched L1 Task 10's fix (a real bug fix to
`core/src/store/derived.rs`) and, before that fix's completion notification
arrived, dispatched L1 Task 11 into the *same* worktree
(`idl-rs-worktrees\wave1-l1-store`). Both agents ran concurrently against
the same physical directory. No damage resulted — Task 11 worked in a
different, unrelated file (`session_json.rs`, committed cleanly at
`e001565`) and its own implementer explicitly noticed the unexpected dirty
`derived.rs` state, correctly left it untouched, and flagged it for the
lead rather than assuming or clobbering. But this was the implementer's
good judgment saving an orchestration mistake, not a guarantee — two agents
building/testing concurrently in one worktree can genuinely race (stale
`target/` artifacts, one agent's `cargo test` run picking up the other's
half-written file, a commit landing mid-edit).

**Rule going forward:** never dispatch a new task (implementer, fixer, or
otherwise) into a worktree that has another dispatch still outstanding in
it — wait for the completion notification (or the review/fix cycle it
spawns) before starting the next one in that same worktree. This applies
per-worktree, not per-lane: a fix-up dispatch counts as "still outstanding"
in that worktree exactly like the task it followed. Different lanes'
worktrees remain safe to run in parallel (different directories, no
collision surface).

**Cost if wrong:** this instance — zero, no actual damage. In general,
were a real collision to occur, the cost is bounded and recoverable (git
history + the worktree's own uncommitted diff), but avoidable entirely by
just not doing it, which is now the standing rule.

---

## 2026-09-03 — Tracked, non-blocking: second flaky Windows timing test

`core/src/store/atomic.rs`'s
`write_atomic_exhausts_rename_retries_and_surfaces_io_error_when_the_
sharing_violation_outlasts_the_retry_window` (Task 7's work, reviewed CLEAN
with explicit 10x-rerun flakiness testing at the time) fails intermittently
under the crate's default *parallel* `cargo test` but passes standalone and
under `--test-threads=1` — a real, pre-existing Windows file-lock timing
race, not touched or introduced by Task 10's fix (which only edited
`derived.rs`). Same class of issue as the watcher flake logged earlier
this session: a test whose correctness depends on real OS-level timing
becomes more collision-prone as more tests run concurrently and compete
for CPU/IO scheduling.

**Owner: whoever next touches `store/atomic.rs`** — likely fix is a unique
temp-file path per test invocation (reducing cross-test file contention)
or a longer safety margin in the retry-window timing, mirroring whatever
fix the watcher flake eventually gets. Not blocking L1's current task
chain; `cargo test -p idl-rs` at Task 10's own single-threaded check
(626 passed, 0 failed, 1 ignored) is the authoritative green signal for
that task's own gate.

**Cost if wrong:** Low — same shape as the watcher flake: known,
characterized, low-frequency, isolated to test infrastructure rather than
the primitive's actual correctness (already independently verified
correct in Task 7's own review).

---

## 2026-09-03 — R13: compute-load ruling — the run made Isaac's machine unusable

**Symptom (Isaac, verbatim):** "my computer's been unusable all day" /
"go easier on my poor old computer".

**Root cause (verified, not inferred).** Three compounding factors:

1. Every lane worktree compiled the full arrow/parquet/tokio/btleplug/
   reqwest dependency graph into its *own* `target/` — the same
   `Cargo.lock`, built four times over. At the worst point `tasklist`
   showed 7 `cargo.exe` + 1 `rustc.exe` + 4 `node.exe` concurrently.
2. The machine is 12 logical cores / 15.7 GB RAM with ~1.8 GB free *at
   idle* (nothing building). Cargo's default of one `rustc` per core on
   this dependency graph pushes it straight into swap — memory, not CPU,
   is what made the desktop unresponsive.
3. Every implementer and reviewer ran the full 630-test suite (≈280 s
   per run) per task, and reviewers were defaulting to multi-rerun
   flakiness hunts on top of that.

**Fixes applied:**

- `rust/.cargo/config.toml` (idl-rs `main`, commit `78e4fa1`): shared
  `target-dir` at `saucyeng/.cargo-shared-target`. Applies to every worktree
  created from `main` from here on (L2, L3, and anything after). The
  existing warm worktree (`wave1-l1-store`) is deliberately **not**
  switched: the shared dir is still empty (0 GB), so switching would force
  exactly the cold compile the config exists to avoid. The `wave1-l5-tauri`
  worktree has an untracked copy of the same config; its next build (gated
  on L1/L2/L3 anyway) seeds the shared dir.
- `%USERPROFILE%\.cargo\config.toml` (machine-wide, outside every repo):
  `[build] jobs = 4`. Reversible by deleting the file; overridable per
  invocation with `-j`. This is the lever that reaches the L1 worktree
  without touching it.
- **Standing rules while the machine is the bottleneck** (tightens the
  per-worktree rule above): (a) one build-running dispatch at a time,
  across *all* worktrees, implementer or reviewer — not one per worktree;
  (b) task-cycle test gate is the task's own module (`cargo test -p idl-rs
  store::catalog`, etc.), never the full suite; (c) the full suite runs
  once per lane at its merge gate, with `-- --test-threads=4`; (d) no
  multi-rerun flakiness hunts unless the lead asks for one.

**Cost if wrong:** Low — every change is reversible and the only cost is
slower wall-clock per task, which is the intended trade. If the shared
target-dir ever misbehaves (path-dependent fingerprints, a worktree on a
different `Cargo.lock`), delete the config file in that worktree and it
falls back to a local `target/`.

---

## 2026-09-03 — R14: L1 Task 12 rework — four rulings the fix-up needs

Review `lanes/l1-store/review-task12.md` returned NEEDS-REWORK on two
Important, spec-explicit bugs plus three Minor items. Neither Important
bug has a fully specified fix in C4 §5 — both need a lead ruling rather
than an implementer's guess.

1. **`sessions.duration_ms` definition.** C3 says "RENAMED from
   `duration_s`" — it is the session's length, not anything lap-derived
   (most sessions have no laps). Ruling: the span of `data.parquet`'s
   `t_us` column, `round((max − min) / 1000)`, mirroring
   `Session::duration_ms()` exactly (`core/src/session/mod.rs:327`);
   `NULL` when the file has fewer than two rows. Read only the time
   column (a projection, or the row-group statistics if present in every
   row group) — never the whole file. *Correction (fix-up, `6ad093f`):
   the ruling as first written named the column `t_us`; C1 §4.1 names it
   `t` (Int64, session-relative µs). The implementer read `t` via
   `ProjectionMask::columns(schema, ["t"])` — the intent, not the typo.*
2. **`laps.track_id` join.** C4 §5 step 4 names the source ("from the
   session's track visits") but not the join. Ruling: containment by
   timestamp — lap `L` takes visit `V`'s `track_id` iff
   `V.start_timestamp_ms <= L.start_timestamp_ms && L.end_timestamp_ms <=
   V.end_timestamp_ms`; first matching visit in `track_visits` order;
   `NULL` when no visit contains the lap. **Not** by
   `visit.laps[*].lap_number`: C1 §6 documents those as cached copies from
   idl0's `workspace.dart`, and whether their numbering is per-session or
   per-visit is unspecified — timestamps are the visit's own explicit,
   documented fields. If the matched `track_id` is absent from `tracks`
   (the FK would reject it under `foreign_keys = ON`), insert `NULL` and
   push a `report.skipped` entry naming the dangling track — the lap row
   itself is still valid and still indexed.
3. **`sessions.created_at_ms`** (Minor, but the reviewer is right that a
   silent `0` reads as done). Interim: `session.json`'s filesystem mtime
   in UTC ms, with a `// TODO(idl0):` pointing here. **Open question
   (lead, non-blocking):** C1 §6 has no `imported_at_ms` field, so nothing
   under `<data>` durably records import time; `created_at_ms` cannot mean
   "import time" across rebuilds until C1 grows one. Needs a C1
   amendment; not in this fix.
4. **Remaining Minors.** Add the missing-blob → `report.skipped` test
   (the mechanism is verified sound but unexercised). Accept
   `read_derived_channels`' whole-file `concat_batches` with a doc comment
   stating it as a known simplification — no restructure in this cycle.

**Cost if wrong:** Low — "the catalog is an index: deletable, rebuildable,
never synced." Every rule above is one line to change and no synced
artifact depends on it. The one that could bite later is (2) if a real
session ever has overlapping visits; first-match is deterministic, and
the ledger records the choice.

---

## 2026-09-03 — Tracked direction: React Flow as the workbook control UI (wave 2 / L6)

Isaac's stated direction, recorded so it isn't lost between sessions:
React Flow becomes the UI for data filtering, maths-engine control, and
the control layer over D3/Plot. The `.idl1wb` file stays the source of
truth — React Flow is a *visual representation* of the workbook's data
flow, edited through C2's parse/generate boundary, not a second document
model. The device pane stays roughly as it is today. Expected effect:
less total UI work, since most of the control surface becomes an
off-the-shelf node editor over the design doc's existing reactive-DAG
model (`math::resolve` + Observable Runtime scheduling, design §4).

**Scope:** L6 / wave 2. Nothing in wave 1 depends on it — the four
contracts and every Rust lane are UI-agnostic by construction. Lead
recommendation: a §4 / D13 amendment to the design doc when L6 planning
starts, not now. Isaac has not yet ruled on the design-doc timing.

**Cost if lost:** Medium — it reshapes L6's plan and supersedes D13's
"Properties + Code" editor and the `plotForm` generate/parse module. Hence
this entry.

---

## 2026-09-03 — R15: L1 Task 13 pre-dispatch — plan-vs-reality corrections and rulings

Pre-reading Task 13's plan text against what Tasks 12 / R6 landed and
against `store::atomic`'s actual API surfaced the following *before*
dispatch — cheaper than a fix cycle on a constrained machine (R13).

1. **`write_atomic(…, None)` is not "overwrite".** The fourth argument is
   `based_on_hash: Option<&str>` — optimistic concurrency. `None` means
   "caller believes `target` does not exist"; if it does exist at rename
   time the call returns `RenameConflict`. The plan's `write_track` and
   `profile::save` pass `None` unconditionally, so every re-save of an
   existing track or profile would fail — and the plan's tests (each saves
   once) would not catch it. Same class as Task 12's literal-draft FK bug.
   **Ruling:** all three whole-document writers (`write_track`,
   `profile::save`, `settings::save`) go through
   `write_atomic_with_retry` with `based_on_hash` = sha256 of the file's
   current content if present, else `None`, and a `rederive` that returns
   the caller's bytes unchanged — a full replace, last-write-wins,
   consistent with C4 §6's LWW-by-`updated_at_ms` for tracks and profiles.
   Each writer gets an overwrite test.
2. **`Track` already carries `created_at_ms` / `updated_at_ms`** (Task 12,
   `track_artifact/model.rs:29,32`). The plan's Step 3 premise ("does not
   currently carry") is stale. **Ruling:** `write_track(data_root, &Track)`
   — the two-argument shape from the plan's own Interfaces line, timestamps
   read from the struct. Mechanism: serialise through the existing private
   `TrackDto` (adding `Serialize` derives), not a parallel
   `serde_json::json!` literal — the reader stays the single authority on
   the `.idl0t` wire shape. Round-trip test asserts every field, both
   timestamps included.
3. **`profiles/` is in C4 §2** (R6). The plan's "not fixed by C4 — this
   plan's own extension" module doc and open-question pointer are stale;
   the module doc cites C4 §2. **Ruling:** `load_all` returns
   `ProfileLoad { profiles, skipped: Vec<(PathBuf, String)> }` — no
   `eprintln!` in core (CLAUDE.md §2 "PURE", §5 typed failures); malformed
   files are reported to the caller, never printed.
4. **`verify` check #3 (session's blob missing) is now implementable in
   core:** Task 12 landed `read_data_parquet_session_fields` (private, in
   `catalog.rs`). **Ruling:** make it `pub(crate)` and implement #3 in
   `check_sessions`; the plan's "deferred to Task 15" note is withdrawn.
   #6 (workbook parse — needs L3's parser) and #9 (catalog cross-reference)
   stay deferred exactly as the plan states.
5. **`settings.json` gains keys → C4 §1 amendment (spec-during, lead).**
   `store::settings` writes `rider_name` and `unit_system` into the C4 §1
   bootstrap file beside `data_dir`. L5's `paths.rs` deserialises that file
   leniently (serde ignores unknown keys) and never writes it, so nothing
   breaks — but the contract's shape block must say so. Amended in C4 §1
   with a post-sign note citing this ruling. Lanes do not edit contracts;
   the lead does.
6. **Step 0:** the CLEAN fix-up review's one Minor (`catalog.rs:479-484`
   doc comment says "row group" where the code streams reader batches)
   rides along as a one-line preliminary commit rather than its own agent.

**Cost if wrong:** Low — (1) is the only item with a real failure mode,
and it is the one that would have shipped a broken re-save; the rest are
documentation truth and one visibility change. Lane-internal except (5),
which the lead owns.

---

## 2026-09-03 — R16: `write_atomic(…, None)` audit of landed L1 code — one latent bug (catalog swap)

R15 item 1 identified a bug *class* (passing `based_on_hash = None` to a
writer that legitimately overwrites). The lead audited every
`write_atomic` call site already on `wave1-l1-store` (`6ad093f`):

| Call site | 4th arg | Overwrites? | Verdict |
|---|---|---|---|
| `store/blob.rs:71` | `None` | never — `is_file()` early-return above it | correct (content-addressed) |
| `store/derived.rs:228` | `None` | never — `is_file()` early-return at `:151` | correct (content-addressed, C1 §5) |
| `store/session_json.rs:275` | caller's `based_on_hash` | yes (metadata edits) | correct — caller supplies the hash it read |
| `store/parquet.rs:324` | `None` | never *by design* — `data.parquet` is write-once; C1 §4.3 regeneration "deletes and rewrites" | correct as a guard; **Task 15's regeneration path must delete before rewriting** (brief item for Task 15) |
| `store/catalog.rs:376` | `None` | **yes — every rebuild after the first** | **bug** |

**The bug.** C4 §5: the rebuild "atomically renames [the staging file]
over `catalog.sqlite`". `rebuild_catalog` checkpoints the staging DB,
reads its bytes, then `write_atomic(data_root, catalog.sqlite, bytes,
None)`. With an existing `catalog.sqlite` that is `RenameConflict` on
every rebuild but the first. Latent because each Task 12 test rebuilds
once on a fresh temp root; the Task 12 review's stated priorities (FK
semantics, DDL, scan order) did not include the swap.

**Ruling (fix-up, queued behind Task 13 — same worktree, one dispatch at
a time per R13):**
1. Swap via `write_atomic_with_retry` with `based_on_hash` = sha256 of the
   current `catalog.sqlite` if present else `None`, `rederive` returning
   the same bytes (the rebuild supersedes whatever is there — C4 §5's
   stated semantics).
2. After a successful swap, remove stale `catalog.sqlite-wal` /
   `catalog.sqlite-shm` if present — they belong to the *previous*
   database and must not be applied to the new one. Prudence, not a
   contract line; say so in the comment.
3. Doc-comment precondition: no connection to the live catalog may be
   open during a rebuild (C4 §5's rebuild is an offline swap).
4. Test: rebuild twice on the same populated root → second call `Ok`,
   report counts identical, no `RenameConflict`.

**Standing reviewer checklist addition:** every `write_atomic` call site
— "can this target legitimately already exist when we write? If yes,
`None` is wrong." Two rulings (R15, R16) in one day from the same
primitive's most natural-looking misuse.

**Cost if wrong:** Low on (1)/(3)/(4) — they implement the contract's
stated semantics. (2) is the judgment call: deleting sidecars while a
connection were open would be harmful, which is exactly why (3) states
the precondition; the catalog is an index and rebuildable regardless.

---

## 2026-09-03 — R17: L1 Task 14 pre-dispatch — GPS unit scale, an inherited idl0 bug, two crash paths

Pre-read of Task 14's plan text (ports of `gate_geometry.dart`,
`cached_session_laps.dart`, `lap_distance_accumulator.dart`,
`session_filename.dart`) against the Rust types it consumes and the Dart
originals at `idl0-app/app/lib/data/`.

**The unit landscape, verified in code (not the plan's prose):**

| Thing | Scale | Evidence |
|---|---|---|
| `crate::gps::GpsFix.lat/lon` | degrees × 1e7 | `gps.rs:3-8` doc |
| `crate::laps::model::Gate` | degrees × 1e7 | `laps/model.rs:9` doc |
| `.idl0t` wire `latitude_deg` / `lat1_deg` … | **degrees × 1e7 despite the `_deg` name** | `track_artifact/read.rs:30-33` fixtures (`501163000`), DTO conversions copy without rescaling; SPEC §16.3 "unchanged" from idl0 |
| `store::session_json::LapGateJson.*_deg` | **decimal degrees** | C1 §6, ruling R8 |

So the one conversion point is `Gate`/`GpsFix` (×1e7) → `LapGateJson`
(degrees) = `/ 1e7`, which the plan's Step 1 does exactly once. Correct.

**Step 3 inherits a real idl0 bug.** The plan's `distance.rs` (and the
Dart it ports, `lap_distance_accumulator.dart:79-80, 88-89`) feeds ×1e7
latitude straight into `cos(mean_lat · π/180)` and multiplies ×1e7
coordinate deltas by `111_320` m/deg. The Dart is fed ×1e7 data at its
only call site (`lap_provider.dart:268`: raw session GPS + Track
polyline, no rescaling anywhere in `lib/` — grep for `/ 1e7` hits only
`gate_geometry.dart`). Consequences in idl0: `residual` is 1e7× too large
so the documented 5 m confidence-anchor threshold can never fire;
`lonScale` is the cosine of a meaningless angle (sign included), so the
projection geometry is distorted; only the scale-invariant pieces
(`tangentAgreement`, arc-fraction interpolation between the two endpoint
anchors) behave. The plan's own Step 3 test fixtures use decimal degrees
(`0.0001`), so the draft would pass its tests and fail on real data —
same shape as Task 12's literal draft.

**Rulings:**
1. `laps::gate_synthesis` and `laps::distance` operate on `GpsFix`'s ×1e7
   scale throughout, converting to metres via `111_320 / 1e7` per unit
   (the way `gate_geometry.dart:122-124` already does) and to decimal
   degrees only at the `LapGateJson` boundary. **The Rust `distance` port
   is corrected, not bug-faithful**; its doc comment cites the Dart lines.
   Required test: a sample displaced ≈3 m east of a due-north polyline at
   ~50° N yields `residual ≈ 3 m` (±0.1) — a metres-level assertion the
   buggy math cannot pass — plus an on-line fast sample qualifying as an
   anchor. Fixtures in ×1e7.
2. The plan's "C1 §8 item 4 … pending Isaac's confirmation" note is stale
   — resolved by R8 (decimal degrees). Module docs state the settled
   convention; the single `/ 1e7` stays.
3. Two crash paths on bad input become typed errors (CLAUDE.md §5):
   `speed_kmh.len() != samples.len()` → `LapDistanceErrorKind::LengthMismatch`;
   any `GateCrossing.sample_index >= samples.len()` →
   `LapDistanceErrorKind::IndexOutOfBounds`. `compute` returns `Result`.
4. `snap_to_nearest_fix`'s parameters are named for their actual scale
   (`lat_e7`/`lon_e7`), not `_deg`.
5. Doc-only, in `track_artifact/model.rs`: the wire DTOs' `*_deg` fields
   carry ×1e7 values (SPEC §16.3, unchanged from idl0) — say so, since the
   name actively misleads (it misled this plan's author in Step 3).
6. `renumber.rs` documents that the detector emits **per-visit** lap
   numbering and this module assigns session-wide numbers — which
   independently confirms R14 item 2's choice to join `laps.track_id` by
   timestamp containment rather than `visit.laps[*].lap_number`.

**For Isaac (non-blocking):** idl0's lap-distance normalisation was
running with this bug; if lap-distance overlays ever looked wrong in
idl0-app, this is a candidate cause. The Rust port will not reproduce it.

**Cost if wrong:** Low. (1) is the only substantive call and the Dart
code's own doc comments ("in metres", "km/h") state the intent the
arithmetic violates; every constant and threshold in the file only makes
sense in real metres. (3)–(5) are hardening and documentation.

---

## 2026-09-03 — R18: L1 Task 15 pre-dispatch — import pipeline belongs in core; re-import semantics

The plan puts the whole import pipeline (blob write → parse → synthesis →
`data.parquet` → `session.json` → catalog rebuild) inside the CLI's
`cmd_import`, with a comment that L5 "reuses this code as a library" —
but `cli/src/main.rs` is a binary, not a library, and C3 §2 already
carries seven `import_*` error kinds for L5's `import` command. The plan
also calls the write-once `write_session_parquet` unconditionally, so
**re-importing the same file fails** with `RenameConflict` (R16's table:
`parquet.rs:324` passes `None` by design; the *caller* must decide).

**Rulings:**
1. **Core owns the pipeline.** New module `store::import` with
   `pub fn import_idl0(data_root, bytes) -> Result<ImportReport, ImportError>`
   (typed error, kinds mirroring C3 §2's `import_*` set where they apply)
   doing: blob write → parse → `synthesize_base_channels` → import plan
   (below) → `data.parquet` → `session.json` if absent. It does **not**
   touch the catalog — the caller decides how to refresh it (the CLI
   rebuilds; L5 will do the same until incremental indexing exists).
   `cmd_import` becomes a thin printer over it.
2. **Import plan** — `pub fn plan_import(existing: Option<&SessionParquetMetadata>,
   new_blob_sha256, importer_version, seam_correction_version) -> ImportPlan`,
   pure, unit-tested for all four arms:
   - no `data.parquet` → `Write`;
   - same blob, same `importer_version` **and** `seam_correction_version`
     → `Skip` (idempotent re-import — C4 §3's stated intent);
   - same blob, either version differs → `Regenerate` (delete
     `data.parquet`, rewrite — C1 §4.3's regeneration rule; the guard in
     `parquet.rs:324` is exactly why the delete is explicit);
   - **different blob, same `session_id`** → `Collision { existing_blob }`
     → `ImportError`, refusing to overwrite. Real for `.idl0`: a truncated
     download and the full file share the device UUID (C4 §3: `.idl0`
     ids never extend). The message names both hashes and says to remove
     `sessions/<id>/` to re-import. L5 may later offer "replace"; the
     CLI does not.
3. **Metadata reader made public.** `store::parquet` gains
   `pub fn read_session_metadata(path) -> Result<SessionParquetMetadata, ParquetStoreError>`
   (a `pub` struct with C1 §4.3's nine keys), factored from the key parsing
   `read_session_parquet` already does at `parquet.rs:~360-380`.
   `catalog.rs`'s `pub(crate)` reader stays as is with a `// TODO(idl0):`
   to delegate — no churn in a file the R16 fix-up just touched.
4. **`importer_version` is a core constant**, `parse::IDL0_IMPORTER_VERSION
   = "0.1.0"`, documented per C1 §4.3 (bump when parsing/timing output
   changes). Not a CLI literal — L2's importers and L5 must use the same
   value the parquet writer stamps.
5. `cmd_sessions`: no `expect()` on SQL — map to stderr + `FAILURE`
   (CLAUDE.md §5; a corrupt catalog is data, not a bug). `cmd_prune`
   stays age-only as the plan documents.
6. Tests: `plan_import` × 4 in core; one end-to-end `import_idl0` test
   (import twice → second `Skip`) **if** a synthetic `.idl0`-bytes helper
   already exists in `core/src/parse/` tests; otherwise that path is
   exercised in Task 16 with the real file. CLI crate: existing tests only,
   as the plan says.

**Cost if wrong:** Low–Medium. (1) is a layering call the design doc
already makes ("Rust = numbers"; L5's commands are thin) — the cost of
*not* doing it is L5 re-implementing import. (2)'s `Collision` arm is the
one judgment call: refusing is the conservative choice and the message
tells the operator the one-step remedy.

---

## 2026-09-03 — R19: L1 Task 16 pre-dispatch — the real file's location, the ODR estimate, the merge gate

1. **The real `.idl0` was never copied into the idl-rs worktree.** It exists
   only at the idl1-app repo root (`idl1-app/d365a19ae7ef2dc2d087a5887371281f.idl0`
   + `.idl0w`, gitignored per Task 1). The plan's `CARGO_MANIFEST_DIR/..`
   path would resolve to nothing and the test would print "skipping" —
   silently defeating C1 §8 item 8. **Ruling:** the integration test reads
   the path from env var `IDL_RS_REAL_SESSION_IDL0` (absolute), skipping
   with a notice that names the variable when unset; no second copy of
   real session data is made anywhere. Task 16 runs it with the variable
   pointing at the idl1-app root file.
2. **"Corrected ODR" is measured from what §3.3 actually produces** — the
   corrected `t_us`: `(n − 1) / ((t_us.last − t_us.first) / 1e6)` over
   imu0 — with `nominal_rate_hz` printed alongside for reference, rather
   than trusting that Task 6 rewrote `nominal_rate_hz` (the plan asserts
   it; the test should not depend on it).
3. **The independent estimate counts only IMU samples inside the GPS
   window**: IMU samples whose `t_us` lies within the first–last GPS fix's
   `t_us`, divided by the GPS wall-clock span (`GPS_EpochMs` last − first).
   IMU typically records before the first fix and after the last; the
   plan's whole-file count would bias the estimate low by exactly that
   margin. 5 % tolerance stays.
4. **Merge-gate test run per R13:** `cargo test -p idl-rs -p idl-rs-cli --
   --test-threads=4` — **not** `--workspace` (that would build
   `idl-rs-tauri` and its Tauri dependency graph in this worktree for no
   reason). If either known flaky test (`watcher::…never_fires_callback`,
   `store::atomic::…outlasts_the_retry_window`) fails, rerun **that test
   alone by name once**; never the suite.
5. **CLI smoke with the real file**, recorded in the report: `import` to a
   temp `--data-dir` twice (second run must report the idempotent skip),
   then `sessions`, then `verify` (expect zero `Error` findings), then
   `prune` dry-run. Output pasted into the plan's Open-questions item 17
   alongside the ODR numbers.
6. **CHANGELOG text is written to what landed**, not the plan's draft:
   include the unit-corrected lap-distance port (R17), the catalog swap
   fix (R16), the `verify` checks actually implemented (#1–5, #8, #10;
   #6/#7/#9 deferred), import idempotency/collision semantics (R18), and
   the two contract amendments (C4 §1 settings keys, C4 §2 `profiles/`).
7. **Landing plan (lead, after Task 16 is CLEAN):** idl-rs `wave1-l1-store`
   → `main` as a merge commit (main carries L4's 12 commits; `Cargo.lock`
   will conflict — resolve by taking both sides' additions and letting
   one `cargo build -p idl-rs` regenerate, single build, jobs capped);
   idl1-app `wave1-l1-store` → `main` (two SPEC commits + Task 16's
   CHANGELOG/TASKS), then bump the submodule pointer. The stray untracked
   `nul` in the idl1-app L1 worktree is a Windows shell artifact — removed
   at merge, never committed. Both L1 worktrees are then retired.
   L2/L3 worktrees are created from the merged `main` and inherit the
   shared target-dir; **their first build seeds it — run one, not both**.

**Cost if wrong:** Low. (1)–(3) make the validation actually run and
measure the right quantity; (4) is R13; (7) is mechanical and reversible.

*Addendum (merge preview, `git merge-tree`, read-only):* idl-rs `main ←
wave1-l1-store` conflicts **only** in `Cargo.lock` (main +319/−32 from L4;
L1 +613/−1 — both sides essentially add packages). Resolution at landing:
take one side, one `cargo build -p idl-rs` re-adds the other's packages,
then assert the merged lock's `(name, version)` set **equals the union**
of both sides' sets — no pinned version may move (reviews cross-checked
behaviour against parquet 59.3.0). idl1-app merges clean, but `main` had
moved `CHANGELOG.md`/`TASKS.md`/the L1 plan doc since L1 branched, so
`main` was merged **into** the idl1-app L1 branch first (`4e2643e`, clean)
— Task 16's CHANGELOG/TASKS edits now land on current files and the
final landing fast-forwards. Task 16 does **not** edit the plan doc (it
diverged on `main`); it reports the ODR numbers and the lead records them
in this ledger and the plan on `main`.

---

## 2026-09-03 — Tracked: Task 14 landed (`8d6cb00`); three implementer flags, ruled

Task 14 (R17) landed at `8d6cb00`, 19/19 on the targeted run, metres-level
test confirmed to fail under the Dart-faithful math during development.
The implementer raised three things outside its declared files:

1. **Plan error:** Task 14's Interfaces line names
   `filename::session_file_base` but no step defines it, and it would
   need UTC→local calendar decomposition — a date/time dependency this
   crate deliberately does not have. **Ruling:** not added; the caller
   (CLI or L5, which have a time library) decomposes and calls
   `format_session_file_base`. The Interfaces line was wrong, not the
   implementation.
2. `store/session_json.rs:103-106` — `LapGateJson`'s doc still says the
   gate unit convention is "pending Isaac's confirmation" (settled by
   R8). **Ruling:** fixed as Task 15's Step 0 (same worktree, serial).
3. `laps::renumber::RenumberedLap.track_id: Option<String>` is always
   `Some` (`TrackVisitJson.track_id` is non-optional). The plan drafted
   the `Option`; nothing consumes it yet. **Ruling:** becomes `String` in
   Task 15's Step 0 — the type should not promise an absence that cannot
   occur.

**Cost if wrong:** negligible — (1) is a documentation correction, (2)
and (3) are one-line changes with no consumers.

---

## 2026-09-03 — Tracked: Task 15 landed (`13363d6`); dependent-crate blind spot; R18 addendum

Task 15 landed at `9bb291e` (Step 0) + `13363d6` (task): `store::import`
with `plan_import`/`import_idl0` per R18, `parse::IDL0_IMPORTER_VERSION`,
`store::parquet::read_session_metadata`, and the four CLI subcommands.
27 core / 51 CLI tests green. `Collision` covered end-to-end (two
`test_buffers` fixtures share `Header::default()`'s UUID with different
IMU payloads → different blob, same `session_id`).

**Process finding — targeted tests have a dependent-crate blind spot.**
`cargo test -p idl-rs-cli` had not compiled since core's `Session`/
`Channel` API changed in Tasks 3–4 (`SessionMetaInput`/`ChannelInput`
shapes, `Channel::from_f64` arity). Eleven tasks of `-p idl-rs`-only
targeted runs (R13) never built the CLI crate's test module, so the
breakage sat unnoticed until Task 15 touched `cli/`. The implementer's
fix was mechanical (match landed signatures; reviewer to confirm no
assertion was weakened). **Standing rule:** any task that changes a `pub`
signature in `core` adds `cargo check -p idl-rs-cli --tests` (cheap — no
link, no test run) to its gate; the lane merge-gate run (`-p idl-rs -p
idl-rs-cli`) remains the authoritative catch. This is what R13's
"targeted only" trades away; the check restores it at near-zero cost.

**R18 addendum (ordering, ruled at review dispatch):** in `import_idl0`,
`parse::parse` runs **before** `blob::write_blob` — an unparseable file
must leave nothing in the CAS. The plan's `cmd_import` draft wrote the
blob first; R18's text listed the steps in that order too. Corrected here;
the Task 15 reviewer checks it as an Important finding if violated.

**Cost if wrong:** Low — the rule costs seconds per task; the ordering
ruling only affects what is left behind on a *failed* import.

---

## 2026-09-03 — Tracked: Task 15 review NEEDS_FIXES (1 Important, 2 Minor) → folded into Task 16 Step 0

The Important is exactly the R18-addendum ordering: `import_idl0` wrote the
blob before parsing, so an unparseable file would leave an orphan blob
that nothing in the lane detects or prunes (`verify` has no orphan-blob
check). Fix: parse first; test that a bad-magic buffer leaves the CAS
empty. Minors, both ruled **fix**: (a) `read_session_parquet` parsed the
footer twice after delegating to `read_session_metadata` — factor one
`metadata_from_builder`; (b) `ImportReport.plan: ImportPlan` admitted
`Collision`, forcing an `unreachable!()` in the CLI — a panic path in
principle (CLAUDE.md §5); replaced by a 3-variant `ImportOutcome` so the
impossible state is unrepresentable rather than documented-unreachable.

All three ride as Task 16's Step 0 (one agent, one build) instead of a
separate fix-up; Task 16's own review and merge-gate run cover them.

**Cost if wrong:** Low — all three are local; Task 16's reviewer re-checks
the ordering with the new test.

---

## 2026-09-03 — Tracked: Task 16 landed — C1 §8 item 8 real-session ODR validation PASSES

idl-rs `2bf7a9f` (Task 15 review fixes) + `57e4d6e` (validation test);
idl1-app `ccd4127` (CHANGELOG/TASKS). Merge gate (R13/R19 scope,
`-p idl-rs -p idl-rs-cli -- --test-threads=4`): **743 passed, 0 failed**
(691 lib + 1 integration + 51 CLI), 1 pre-existing `#[ignore]`. Neither
known flaky test appeared.

**The validation (C1 §8 item 8), on Isaac's real session
`d365a19ae7ef2dc2d087a5887371281f.idl0`, GPS + IMU both enabled:**

```
corrected=812.348 Hz  nominal=812.348 Hz  independent=814.017 Hz
relative_error=0.2051 %   imu0 n=97927   count_in_window=96054   gps_span_s=118.000
```

- *corrected* = `(n−1) / (t_us span)` over imu0's §3.3-corrected timestamps.
- *independent* = imu0 samples inside the GPS window ÷ GPS wall-clock span
  (`GPS_EpochMs`, a clock the seam correction never sees).
- 0.21 % against a 5 % tolerance; the implied IMU span (≈120.5 s) exceeds
  the 118 s GPS window by the expected before-first-fix/after-last-fix
  margin (R19 item 3's reason for windowing the count).
- The device's true ODR on this file is ≈812 Hz against a configured
  nominal of 800 Hz — the ~1.5 % fast-clock case §3.3's worked example is
  built around, seen on hardware.

**CLI smoke on the same file** (temp data root, deleted after): `import`
→ 1 session/1 blob; `import` again → "already imported (skip)"; `sessions`
→ one row; `verify` → 0 findings; `prune` → 0 candidates, dry run. All
exit 0.

**Plan Open-questions item 17** updated on `main` with these numbers
(lead, per R19 addendum). Lane is fit to merge pending the Task 16
review's verdict.

---

## 2026-09-03 — L1 LANDED: idl-rs `76b640a`, idl1-app `f6f84f6` + `662d48e`

Task 16 review: CLEAN (1 Minor, tracked below). Landing per R19 item 7:

- **idl-rs** `main ← wave1-l1-store` as merge commit `76b640a` (24 lane
  commits). Only conflict: `Cargo.lock`. Resolved by taking `main`'s lock
  and running `cargo metadata` (re-resolves and rewrites the lock, no
  compilation). Union check (`lock_union_check.sh`): merged = union of both
  sides minus exactly seven older duplicates cargo unified — `futures-*`
  0.3.32→0.3.34 and `log` 0.4.33→0.4.34, both semver-compatible bumps L4
  had already taken — and **no** package version present on neither side.
  Reviewed pins unchanged: parquet/arrow 59.3.0, rusqlite 0.40.2, reqwest
  0.13.4, btleplug 0.13.0, tokio 1.53.1. (Refinement of R19's rule: "equals
  the union" must tolerate semver-compatible unification of a crate both
  sides carry at different patch versions; the invariant that matters is
  no `+` lines.)
- **idl1-app** `main ← wave1-l1-store` as merge commit `f6f84f6`
  (SPEC §15/§16.3/§18 rewrite, CHANGELOG, TASKS; fast-forwardable since
  `main` had been merged in first), then `662d48e` bumps the submodule
  pointer to `76b640a`.
- **Post-merge gate on `main`** (shared checkout, alone, jobs=4): `cargo test
  -p idl-rs -p idl-rs-cli --no-run` then the run with `--test-threads=4` —
  doubles as the shared target-dir seed for L3/L2. Result recorded below
  when it finishes.
- **Tracked Minor (Task 16 review):** `core/tests/real_session_odr_validation.rs`
  gates on *any* IMU (`imu_index_of`) but then `.expect()`s `imu0` — a
  session with only IMU1/IMU2 enabled would panic instead of skipping.
  Owner: whoever next touches that test (L10's SPEC verification pass is
  the natural point); fix is to pick the first present IMU by index.
- **Worktrees:** L3 created from the merged `main` in both repos
  (`idl-rs-worktrees/wave1-l3-workbook`, `idl1-app-worktrees/wave1-l3-workbook`,
  submodule wired via `local-wave1`). L1's two worktrees retired after the
  post-merge gate finishes (the idl-rs one carries a multi-GB local
  `target/`; deleting it during the build is needless disk contention).
- **Sequencing:** L3 before L2 (lead call, Isaac may override): they cannot
  run concurrently under R13; L3 has no external inputs while L2's real FIT
  archive is outstanding; L3 unblocks L5's workbook commands and L6.

**Cost if wrong:** Low — the merge is a merge commit (revertable as a
unit); the lock check is recorded; both lane branches are kept.

---

## 2026-09-03 — R13 addendum: post-merge seed compile OOM-killed at 4 jobs; two more rules

The first post-merge `cargo test -p idl-rs -p idl-rs-cli --no-run` on
`main` (shared checkout, the shared target-dir seed) was killed by the
harness for low system memory while compiling the arrow graph at
`jobs = 4`. Nothing else was building. Two contributors, both now fixed:

1. **`jobs = 4` is still too many for this machine** when arrow/parquet
   crates compile concurrently. `%USERPROFILE%\.cargo\config.toml` is now
   `jobs = 2`. Slower, but a build that finishes beats one that is killed
   two-thirds through.
2. **Idle subagents — stopped, but not the memory lever I first thought.**
   Eleven finished L1 implementers/reviewers were still registered as
   idle teammates; all stopped (`TaskStop`). *Correction on measurement:*
   they ran **in-process** (`in_process_teammate`), so stopping them freed
   negligible RAM — the eight `claude` processes (~1.6 GB) seen in the
   process list are Isaac's other Claude Code sessions plus this one, not
   the teammates. Stopping finished teammates stays the rule (hygiene,
   no stale agents to mis-address), but the machine's memory pressure is
   the OEM `ServiceShell` (1.7 GB), VS Code, browsers, and the other
   sessions — none of which this run controls. Hence rule 1 is the real
   fix.

The compile resumes incrementally (it had reached `arrow-cast`/`arrow-ord`);
retried at 2 jobs.

**Cost if wrong:** none — both are strictly less load.

*Outcome:* **post-merge gate on `main` GREEN — 691 lib + 1 integration +
51 CLI passed, 0 failed, 1 pre-existing ignore** (`--test-threads=4`,
shared checkout, shared target-dir). The test run recompiled the crates
downstream of the kill point (`arrow-ord` → … → `idl-rs` → `idl-rs-cli`,
11 min at 2 jobs) — the OOM kill had left those artifacts without
fingerprints; upstream crates stayed fresh, and a background-vs-foreground
env comparison showed no cargo-relevant differences, so this was one-time
recovery, not fingerprint drift. A repeat `--no-run` then finished in
0.41 s: **the shared target-dir is warm** for L3/L2 (they recompile only
their own workspace crate plus any new deps).

*Cleanup:* L1's two worktrees removed (`git worktree remove --force`;
branches kept, merged). Superseded local `target/` dirs deleted: the shared
checkout's (3.0 GB, now redirected to the shared dir) and the L5
worktree's (2.3 GB, same). ~8.8 GB reclaimed with the L1 worktree's own
3.5 GB.

---

## 2026-09-03 — L3 Task 1 dispatched; one ruling

L3 (`wave1-l3-workbook`) starts from the merged `main` (`76b640a`). Task 1
(front matter, fence scanning, cell-id assignment — C2 §1–2, spec-during)
dispatched per the plan with one ruling: the plan says "use the workspace's
existing RNG dependency if one exists … if none does, add `rand`" for the
4 random cell-id bytes. **Ruling:** use the existing `uuid` dependency
(`Uuid::new_v4()` yields 16 random bytes; take 4) — no third new crate
alongside `pulldown-cmark` and the YAML parser. Task 1 pins those two
after checking crates.io and records the versions in its commit message
(M0's ecosystem report did not cover Markdown/YAML crates).

**Cost if wrong:** negligible — fewer dependencies, same entropy source
the codebase already trusts for ids.

---

## 2026-09-04 — R20: L3 Tasks 2–5 pre-read adjudicated (delegated pre-read, lead rulings)

Pre-read by an Opus adjudicator: `lanes/l3-workbook/pre-read-tasks2-5.md`
(27 gaps, 15 proposed rulings L3-R1…L3-R15, 1 Isaac question). This
entry does not restate it. Lead decisions:

- **L3-R1 … L3-R15: approved as drafted**, with these notes:
  - L3-R4 (C3 §2 `workbook_*` kinds) is lead-owned; applied when L5's
    workbook-command task is briefed, not now.
  - L3-R7 **widened into a ruling**: a definition or constant named
    `Time` or `Distance` (the two engine-synthesized channels) is
    `ReservedName`. Silent document-wide shadowing of the time axis is
    the exact failure C1's "time is recorded, not assumed" exists to
    prevent. C2 §3.5.A amended post-sign by the lead (this entry is the
    citation). `RESERVED_NAMES` therefore has 15 entries.
  - L3-R8's "a targeted filter that matches nothing is a failed gate"
    is a **standing rule for every lane** from here on.
  - L3-R13 stands **provisionally** pending Isaac's answer to Q1 below;
    Task 5 lands the axis either way.
- **Q1 → Isaac (physics/product, not derivable):** the DSP functions
  (`integrate`, `differentiate`, `butter`, `fft`, `declip`) and the lap /
  sector window arithmetic still step by `1/nominal_rate_hz`. On his
  validated session that is 800 Hz against a true 812.348 Hz — ~1.5 %,
  ≈1.8 s of lap-boundary drift over 120 s. Correcting it changes every
  number the math engine has produced (idl0 parity breaks); deferring
  keeps the error. Lead recommendation: correct it in wave 1 as its own
  L3 task after Task 5 — parity with idl0's *bug* is not a rewrite goal,
  and the time model is the rewrite's stated reason to exist.
- **Process:** briefs for Tasks 2–4 are written as files by a Sonnet
  agent from the plan + this ruling set + `brief-task1.md`'s structure;
  a standing reviewer brief (`review-STANDING.md`) likewise. The lead
  reviews the files, not the plan.

**Cost if wrong:** Low on every ruling except the `Time`/`Distance`
reservation (a contract amendment, additive, two names) and Q1, which is
why Q1 is a question.

*Addendum:* briefs `brief-task2.md`/`brief-task3.md`/`brief-task4.md` and
`review-STANDING.md` written by a Sonnet agent; two calls it made itself,
both **approved**: (G3.5) `and`/`or`/`not` stay legal identifiers — no
ruling, no change; (G3.6) Task 3 collects `ConstLine`s and raises only
`DuplicateDefinition`; Task 4's `merge_constants` is the single
`DuplicateConstant`/`ReservedName` enforcement point; `ConstLine` lives in
`workbook/v3/mod.rs`.

---

## 2026-09-04 — Tracked: L3 Task 1 landed (`e018db9`); two C2 gaps for the amendment batch

`pulldown-cmark 0.13.4`, `serde_yaml_ng 0.10.0` (upstream `serde_yaml` is
versioned `0.9.34+deprecated`), `uuid` for cell-id bytes (R20). 14/14 on
`workbook::v3`. Review pending.

Two contract gaps the implementer resolved provisionally, both tracked
for the same C2/C3 amendment batch as L3-R4 (before L5's workbook-command
task): C2 §3.5.A has **no kind** for (a) front-matter YAML that does not
deserialize at all — collapsed into `MissingFrontMatterId` for now; (b) a
malformed `id=` value on a fence — treated as absent (fresh id generated)
for now. Candidate kinds: `InvalidFrontMatter`, `InvalidCellId`. **Owner:
lead**, with L3-R4.

**Cost if wrong:** Low — both interim behaviours are documented in doc
comments and lose no content; (b) can lose a *typo'd* id on save, which
is why it gets a real kind later.

*Review:* CLEAN, 3 Minor (generated-id `seen_ids` check, variant doc
comments, a range-equality comment) → Task 2's Step 0. The reviewer
self-reported running an unauthorised `cargo doc` and killing it at once;
no effect, logged because the standing brief calls the rule absolute.

---

## 2026-09-04 — R21: L3 Tasks 6–9 pre-read adjudicated

Pre-read: `lanes/l3-workbook/pre-read-tasks6-9.md` (26 gaps, rulings
L3-R16…L3-R27, 1 Isaac question). Not restated here. Lead decisions:

- **L3-R16 … L3-R27: approved as drafted**, with:
  - **L3-R18 addition:** because definitions win over session channels, a
    definition named after a base channel that references itself
    (`IMU0_AccelZ = [IMU0_AccelZ] * 9.81`) is a cycle and must surface as
    the leftover `UnknownChannel` error naming the unresolved dependency
    — never an infinite loop or a silent read of the base channel. One
    test required.
  - L3-R25 is provisional against L3-R26 exactly as the pre-read says.
  - **Lead-owned contract batch, to land before L5's workbook-command
    task** (one amendment pass, drafted by a delegated agent): C2 §3.5.A
    kinds `InvalidFrontMatter`, `InvalidCellId` (Task 1), `InvalidTableJson`
    (L3-R19); C3 §2 `workbook_*` kinds (L3-R4, + `workbook_invalid_table_json`);
    C3 §3.4 corrections (L3-R26 a–c); C3 byte path for host channels
    (L3-R23 flag). Owner: lead.
- **Q2 → Isaac (product):** C2 §5.1 gives JS cells `session.name?` but no
  layer records a session *name* — only `rider`, `bike`, `venue_name`,
  `event_name`, `event_session`, `short_comment`, `tag`, and the start
  time. Default taken now, per the pre-read: `name: None` with a
  `// TODO(idl0):` — no display string synthesised in Rust. Isaac can
  name the rule whenever; nothing blocks on it.
- Briefs for Tasks 6–9 written as files by a Sonnet agent, same pattern
  as Tasks 2–4.

**Cost if wrong:** Low — every ruling is inside the lane or an additive
contract amendment; the two product questions (Q1 DSP rate, Q2 session
name) are parked on documented defaults.

---

## 2026-09-04 — Tracked: L3 Task 2 landed (`0215d59` Step 0, `abe6a75`); review pending

Seven `WorkbookErrorKind`s with one constructor each (C2 §3.5.A templates
verbatim), `RESERVED_NAMES: [&str; 15]` (compile-time-enforced count),
callers in `mod.rs`/`cell.rs` rewired to constructors. 23/23 on
`workbook::v3`. Implementer left `front_matter.rs`'s hand-built
`MissingFrontMatterId` message alone (not in the brief's file list) —
reviewer judges against L3-R1; a Step-0 item for Task 3 if flagged.
Contract-delta proposal (R21 batch) being drafted by a Sonnet agent for
the lead to apply.

---

## 2026-09-04 — R22: C2/C3 amendment batch applied; two IPC-shape rulings

Proposal: `lanes/l3-workbook/contract-deltas-proposal.md` (4 amendments,
2 open questions). Applied by a transcriber on the lead's instruction with
these two rulings folded in:

1. **`CellOutput.error` → `errors: IpcError[]`** (empty on success). A
   math cell with two independent structural problems must report both;
   L3-R25's core shape is already plural. All ten `WorkbookErrorKind`s
   gain `IpcErrorKind` variants (`workbook_*`); the five document-fatal /
   new ones are command-level rows in C3 §2, the five wave-1-signed
   per-cell ones (`duplicate_cell_id`, `duplicate_definition`,
   `duplicate_constant`, `invalid_identifier`, `reserved_name`) are listed
   in one row as "per cell only, never a command rejection".
   `CellDefResult.error` stays singular (one definition → at most one
   evaluation error).
2. **Wire `CellDefResult.value` is `HostChannelRef { length: u32, has_t:
   bool }`**, not the full `HostChannel`; sample bytes cross via the binary
   command L5 designs under Amendment D (`tauri::ipc::Response`, CLAUDE.md
   §2). Core's `eval_cells`/`CellDefResult` keep the full `HostChannel`;
   narrowing is `idl-rs-tauri`'s job.

Consequence for L3: `InvalidFrontMatter` and `InvalidCellId` are now real
C2 kinds — Task 7's dispatch adds a Step 0 implementing them in
`front_matter.rs`/`cell.rs` (withdrawing Task 1's interim behaviour) and
Task 2's constructor set grows to nine.

**Cost if wrong:** Low — additive contract text, no shipped consumer;
(1) and (2) are each one field's shape and reversible before L5 writes
against them.

*Task 5 brief addendum (approved):* `store_math_with_times` (L3-R11) must
pass `source_kind = "synthesized"` — `Channel::from_f64_with_times`
(`session/mod.rs:233`) takes it explicitly, and `store::parquet` excludes
channels from `data.parquet` by that exact value (`parquet.rs:253,271`).
Omitting it would leak derived math channels into `data.parquet` (C1
§4.1). Caught by the brief-writer while verifying citations.

---

## 2026-09-04 — Tracked: L3 Task 3 landed (`38fce89` Step 0, `58c3ef9`); one ruling

Math-cell grammar per L3-R5/R6 (hand-written scanners, no `regex`),
`parse_math_cell_body(cell_id, body)`, `ConstLine` in `mod.rs`,
`DuplicateDefinition` only. 38/38 on `workbook::v3`. Review pending.

**Ruling:** `const` lines accept an optional leading `-` on the number
(the implementer had excluded it because the tokenizer emits unary minus
separately). Front matter's unit-suffix regex allows `-?`; a document
where `constants:` accepts `-1.5` but `const offset = -1.5` is an error is
a trap. Unless C2 §3.1's grammar literally forbids a sign (reviewer
checks), the rejection is an Important finding → Task 4's Step 0.

**Cost if wrong:** negligible — one token-pattern match and a test.

---

## 2026-09-04 — R23: L2 Tasks 1–6 pre-read adjudicated; GPS scale, Time synthesis, entry point

Pre-read: `lanes/l2-importers/pre-read-tasks1-6.md` (36 gaps, rulings
L2-R1…L2-R13, 4 questions). Not restated. Lead decisions:

- **L2-R1 … L2-R13: approved as drafted.** L2-R10 (`parquet.rs`
  `<source>_t_recorded_us` from the union of a source's channels' `t_us`)
  and L2-R13 (`store::import::import_file` generalising `import_idl0`,
  incl. fixing G0.6's discarded `import_warnings`) are landed-L1 files —
  **L2 edits them with this ruling as the cross-lane authorisation**
  (CLAUDE.md §7: through the lead). L2-R9: `fitparser` stays 0.9.
- **Q1 — GPS coordinate scale: ×1e7 everywhere, `unit: deg_e7`.** C1 §4.1's
  FIT/GPX row said decimal `deg` under the same column name `.idl0` fills
  at ×1e7, and every landed consumer (`gps.rs`, `laps::distance`,
  `laps::gate_synthesis`, `tracks::detect`; R17) assumes ×1e7. One scale
  for every GPS consumer beats threading unit metadata through four
  modules. C1 §4.1 amended (lead): `GPS_Latitude`/`GPS_Longitude` are
  `deg_e7` for every source; the "always physical" wording gains that one
  named exception. Not Isaac's physics call — a contract-consistency call;
  flagged to him.
- **Q2 — `Time`/`Distance` for FIT/GPX/CSV: fix the synthesizer, not the
  metadata.** `synthesize_base_channels` picks the channel with
  `nominal_rate_hz > 0` today; ruling: when none has a rate, use the
  channel with the most samples (its real `t_us`). Declaring a fake 1 Hz
  would make `channel_kind` lie about an irregular source. Landed L1 file
  (`synthesis.rs`), edited by L2 under this ruling, with a test.
  `Distance` still requires `GPS_SpeedKmh`.
- **Q3 — FIT populates `GPS_EpochMs`** from `record.timestamp` (a UTC
  instant); §15a.2's "no equivalent field" sentence is struck.
- **Q4 — archive:** Tasks 1–6 land on synthetic fixtures (the FIT fixture
  is verified decodable against fitparser 0.9's profile decoder). Task 8
  (speed/heading direct path) and any `fitparser` bump wait for Isaac's
  real FIT/GPX archive. Still wanted.
- L2 runs after L3 (R13: one lane at a time). Briefs written now by a
  Sonnet agent so L2 starts the moment L3 lands.

**Cost if wrong:** Q1 is the one with teeth — it is a contract amendment
narrowing "always physical"; reversible before any FIT/GPX file is
imported for real, and the `unit` metadata records the truth either way.
Q2/Q3 are strictly more information than the drafts.

---

## 2026-09-04 — R24: C2 §3.1 `const_line` number accepts a leading minus

Task 3's review (CLEAN, 2 Minor) confirmed the reviewer's reading: C2
§3.1 tied `number` to the tokenizer's unsigned `Number` literal, so
rejecting `const offset = -1.5` was contract-conformant — and the
contract was wrong: front matter's `"<number> <unit>"` form accepts `-?`,
so the same constant was legal in one place and an error in the other,
with no expression-level escape hatch. C2 §3.1 amended (lead): `number
::= "-"? …`. Implemented as Task 4's Step 0 with the two Minors.
Task 3 landed at `38fce89` + `58c3ef9`.

**Cost if wrong:** negligible — one grammar token, additive.

---

## 2026-09-04 — Tracked: L3 Task 4 landed (`668a483` Step 0, `2d8e4b6`); one ruling

Constants merge per L3-R8/R9/R10 (single enforcement point, 15 reserved
names over both sources), `parse_with_constants`, R24 leading minus.
48/48 on `workbook::v3`, `cargo check -p idl-rs-cli --tests` clean.
Review pending.

**Ruling:** `DuplicateConstant` is reported at the **second occurrence's**
cell. When the first claimant is a front-matter constant, the colliding
`const` line reports at its own `cell_id` — never at `"front-matter"`,
because L3-R25's `eval_cells` drops front-matter-scoped errors (already
fatal or returned separately), which would make this one vanish from the
notebook. The implementer followed `error::duplicate_constant`'s doc
comment literally; the doc comment is wrong and is fixed with it. Task 5's
Step 0 if the reviewer confirms.

**Cost if wrong:** negligible — one `cell_id` choice and a doc comment.

---

## 2026-09-04 — R25: L3 Tasks 10–16 pre-read adjudicated; tile layout v2; contract batch 3

Pre-read: `lanes/l3-workbook/pre-read-tasks10-16.md` (40 gaps, rulings
L3-R28…L3-R42, 2 questions). Not restated. Lead decisions:

- **L3-R28 … L3-R42: approved as drafted.** L3-R28 (`MAX_TIER`,
  `checked_pow` in `chart_decimation.rs` + `session/handle.rs`) and L3-R35
  (`nearest_at_t_us` in `session/handle.rs`) edit landed L1 files —
  **authorised for L3 under this ruling** (CLAUDE.md §7, through the lead).
- **Tile time axis (G10.5) — decided now, not deferred:** C3 §3.5 tile
  layout becomes **version 2**: after the per-column stats section, a
  per-column `t_us: i64 LE` section (`column_count × 8` bytes) carrying
  the recorded time of the first sample in each column's bucket range.
  Exact (no interpolation, no rate assumption), self-describing via
  `column_count`. Task 10 codes v2 directly; L3-R29's "index-space v1,
  doc the precondition" is superseded. `tier` narrowing: request `u32`,
  validated against `MAX_TIER` by L5 before any bytes; header stays `u16`
  and the contract says so.
- **Contract batch 3 (lead-owned, drafted + applied by a Sonnet agent,
  lead commits):** C3 §3.5 (v2 layout, `MAX_TIER` as "the engine's
  configured range", tier narrowing); C3 §3.6 (`SpectrogramParams
  { window_size, hop_size, window, detrend, scaling }`,
  `Histogram2dParams { y_channel, x_bins, y_bins }` replacing
  `Record<string, number>`; a `raster_meta` JSON side-channel with axis
  extents and colour-scale range — L3-R33; C3 open item 6.4 closed); C3
  §3.7 (nearest recorded sample, clamped; `null` only for a channel with
  no samples — Q4); C2 §6 (`_migrate_math` identity map with `identifier`
  and `color` per v2 id, deleted with `_migrate_charts` — L3-R36; the
  phantom `worksheets[].tables[]` struck; `workbook_id` copied only when a
  UUID; version range `1..=SUPPORTED_WORKBOOK_VERSION`). Tasks 10/11 are
  therefore **spec-first**: the batch lands before they are dispatched.
- **Q3 (product, defaulted):** migrate, emit `_migrate_math`, and list
  every unresolved `mathChannelIds` reference and every
  `rowSource: "lapSelection"` table in the report — refusing would be
  worse than telling the truth. Isaac may override; and whether his real
  `.idl0wb` files have app-assigned UUID ids on math channels is worth
  knowing before Task 13 runs on them.
- **Q4 (defaulted):** cursor readouts clamp (the engine's existing rule);
  C3 §3.7's "no sample near" prose amended accordingly.
- Deferrals recorded, not delivered: tier cache (design §4 L3 row);
  Stage 2 chart conversion (L6). CHANGELOG/TASKS wording per L3-R42.

**Cost if wrong:** the v2 tile section is the one with teeth — 8 bytes
per column (8 KB per 1024-column tile) and a layout bump before any
consumer exists; the alternative ships a format that can only be placed
on a time axis by assuming one. Everything else is additive contract
text or lane-internal.

---

## 2026-09-04 — PAUSED (session limits). Resume point.

**State at pause:**
- **L3** branch `wave1-l3-workbook`, HEAD `d0fc17b` (Task 5's Step 0: the
  `DuplicateConstant` cell_id fix). **Task 5 proper is mid-flight and
  uncommitted** in the worktree: 10 files modified (`math/eval.rs`,
  `value.rs`, `resolve.rs`, `vector.rs`, `variance_geom.rs`,
  `tests_ahrs.rs`, `tests_parity.rs`, `session/handle.rs`, `table/eval.rs`,
  `estimate/run.rs`). Do NOT discard. Resume = dispatch an implementer with
  `brief-task5.md` and the instruction: "HEAD `d0fc17b`; the worktree is
  dirty with a partial Task 5 — read the diff, continue from it, finish
  the brief, commit once."
- Tasks 1–4 landed and reviewed CLEAN (Task 4's one Important fixed in
  `d0fc17b`). Briefs on disk: Tasks 1–14 (`brief-task15.md`/`16.md` not
  yet written — the writer was stopped; re-dispatch it for those two only,
  same prompt scope as `R25`'s batch).
- Contracts current through batch 3 (`5431724`): C1 R23, C2 R20/R24/R25,
  C3 R22/R25. L2 briefs 1–6 + standing reviewer brief on disk; L2 starts
  after L3 lands.
- Open for Isaac (all parked on defaults, none blocking): Q1 DSP nominal
  rate (R20), Q2 session name (R21), GPS `deg_e7` (R23), migration report
  policy + cursor clamp (R25), the real FIT/GPX archive (R23 Q4).
- Machine: cargo `jobs = 2` machine-wide; shared target dir warm for
  idl-rs `main` `76b640a`; all subagents stopped.

**Resume order:** finish Task 5 → review → Tasks 6–9 (briefs ready) →
dispatch the writer for briefs 15/16 → Task 14 (spec-first) before 13 →
Tasks 10–16 → L3 lands (pre-merge `main` into the idl1-app L3 branch
first, as R19 did for L1) → L2.

---

## 2026-09-04 — R26: harness tuned for token efficiency

- Agent defs (`~/.claude/agents/`): `adjudicator` fable/xhigh → **opus/high**
  (its pre-reads were only cheap because every dispatch overrode the model);
  `implementer`/`reviewer` high → **medium**; both prompts rewritten to
  carry the standing rules (worktree/HEAD check, targeted tests, no shared
  checkout, no `docs/`, no push, single-line commits) so briefs drop their
  preamble; stale "everything else is Dart" and "run the full test command"
  lines removed; all four return the report lines only — **no separate
  message to the lead** (halves the duplicate notifications).
- `CLAUDE.md` gains §8 Compute rules (R13 in six lines).
- `.claude/settings.json` + `.claude/hooks/deny-heavy-cargo.sh`: PreToolUse
  hook on Bash|PowerShell denying workspace-wide cargo test, `cargo fmt`,
  `tarpaulin`, `doc`, `-j`/`--jobs`, and git push. Matches are anchored to
  the start of a command segment so prose mentions (commit messages,
  heredocs) pass. 13 cases tested from a file; proven live (it denied the
  lead's own probe and, once, this very ledger commit before anchoring).
- Lead runs at medium effort with thinking on; analysis lives in the Opus
  pre-reads.

**Cost if wrong:** none — every change is reversible config; the hook
denies only commands the rules already forbade.

---

## 2026-09-04 — R27: GPS coordinates are decimal degrees (supersedes R23's `deg_e7`)

**Isaac's call**, asked as a pros/cons question and answered on the
principle: *"less messy to just pick the one we want and stick with it,
and the human readable decimal makes the most sense... otherwise we build
a whole UI around a data type that we know needs to change."*

`GPS_Latitude`/`GPS_Longitude` are **physical decimal degrees**,
`unit: deg`, for every source. `.idl0` parse bakes `raw_i32 * 1e-7` (the
baked-in convention already used by `WheelFront`, `HR_RR`); FIT/GPX
importers store their native decimal values unchanged. C1 §4.2's R23
paragraph is marked SUPERSEDED, not deleted.

**Extended by the lead to the two neighbouring columns**, because the
same argument applies verbatim and splitting them would leave `deg_e7`'s
mess in place under different names: `GPS_Altitude` → physical metres
(`raw_i16 * 0.1`, `unit: m`), `GPS_Heading` → physical degrees
(`raw_u16 * 0.01`, `unit: deg`). Untouched: `GPS_SpeedKmh` (already
physical via `scale=0.01` metadata), `GPS_EpochMs`, `GPS_FixQuality`,
`GPS_Satellites` (enum/count, no scale to remove).

Blast radius, all landed L1 code, one task: `parse/` (bake the scales),
`gps.rs`, `laps/distance.rs` (`M_PER_UNIT` reverts to plain `111_320.0`,
the `/1e7` in the mean-latitude `cos` goes), `tracks/`, `laps/gate_*`
(gates in `session.json` are already decimal — R8 — so the conversion at
that boundary disappears entirely, which is the point), `export/fit`
(`to_semicircles`/`haversine_m` drop their `/1e7`). Mostly deletion.
Sequenced **after L3 lands, before L2 Task 4/8** so the importers are
written once against the final unit.

**Cost if wrong:** one task's rework, and it is strictly cheaper now than
after any map/plot UI exists — which is exactly Isaac's reasoning.

## 2026-09-04 — R28: burst/gap integrity runs on every import (TODO, non-blocking)

Isaac: *"we should eventually run that data integrity script during every
import/parse. if it's non blocking and we can just choose our time basis
accordingly, then let's make it a todo and move on."*

The §3.3 seam corrector already computes what a diagnostic would report.
Ruling: it emits counts — frames expected vs seen, gap count, largest
gap, burst-size histogram, effective rate vs header nominal — as
`ImporterWarning`s on `ImportedSession`, never an error, never a refusal
to import. Wave-1 scope is the emission plus a `TODO(idl0):` where a UI
would surface it. The open Q1 (833 Hz configured, 800 Hz in the header,
812.35 Hz measured) is answered by the same numbers when Isaac runs an
import on a real file; no decision waits on it.

**Cost if wrong:** none — warnings only; nothing branches on them.

## 2026-09-04 — R29: `session.json` supersedes `.idl0w`; one file per recording

Isaac: *"so basically the .idl0w is being replaced by session.json? i
actually found it tedious having multiple files for one recording."*
Yes, and the ruling makes it explicit: `.idl0w` is an **import source**
only. At import its metadata (`event_name`, `event_session`, `tag`,
`short_comment`, `rider`, `bike`, `venue_name`, gates) is folded into
`session.json`; the app never writes an `.idl0w` and never requires one
(an `.idl0` imported alone is valid, those fields null). C4's session
directory stays the single unit: blob + `session.json` + `data.parquet`.

Display name (closes R21's Q2): `name = event_session ?? event_name ??
null`. All the raw fields stay individually exposed on the JS `session`
object so a notebook can compose its own.

**Cost if wrong:** naming only; the fields are all still there.

## 2026-09-04 — R30: workbook migration dropped from wave 1

Isaac: *"i don't have many super well developed .idl0wb files. we can
basically start from scratch... you can actually drop a lot of large
tedious migration."* L3 **Task 13 (`migrate_workbook`) is cut**, and Task
14 keeps only its non-migration half. C2 §6 (`_migrate_math`, chart
reference resolution) stays written but unimplemented — the two tasks
carrying the most contract complexity for the fewest real files.

**Cost if wrong:** an old `.idl0wb` has to be re-authored by hand. Isaac
has said there are none worth keeping.

## 2026-09-04 — R31: cursor readout is `null` outside a channel's recorded span

Reverses R25's clamp. Isaac: *"past what ends? if the data stops, it
stops, right?"* Correct — the failure case is a channel that ends early
(HR strap drops at minute 40), where clamping paints a frozen 150 bpm as
if live for the next half hour. `null` when `t_us < first || t_us >
last`; nearest-sample unchanged inside. C3 §3.7 amended.

**Cost if wrong:** one comparison; trivially reversible.

## 2026-09-04 — R32: POV video sync is timecode-derived (tracked, not wave 1)

Isaac: *"i found the timecode to be trustworthy in my test runs, but we
may want to tweak it in the future."* So the HUD/video amendment, when it
is written, specs: one clip per session, a single constant `offset_us`
derived at import from the camera's wall-clock start vs. the session GPS
epoch, stored in `session.json` (recorded, not re-derived), with a manual
nudge in the UI as the correction path. No rate correction — a constant
offset holds. **Out of scope for wave 1**; recorded so the eventual C1/C4
amendment does not have to re-ask.

Also tracked from the same discussion (design §6, drafting queued behind
L3, not blocking): three views over one file — notebook (document order),
graph (React Flow, node positions), HUD (anchored fractional rects over
video) — so front-matter `layout:` is namespaced per view
(`layout: { graph: {...}, hud: {...} }`) from the start. React Flow is
for the graph view only; its canvas-space viewport is wrong for a
frame-anchored HUD. HUD playback scrubs local tiles, never IPC per frame.

**Cost if wrong:** none yet — nothing is implemented against it.

**Tracked (2026-09-04, L3 Task 5, `fd9b30d`):** the implementer briefly ran
`cargo check -p idl-rs-cli --tests` concurrently with the full test run —
two cargo processes at once, against R13. Both finished clean; no harm on
this occasion. It self-reported rather than omitting it, which is the
behaviour we want. Cause: "start it in the background" reads as free when
the other job is also backgrounded. Fix folded into future dispatches:
*wait on the running cargo job before starting any other cargo command,
background or not.* Second occurrence of this class (see the earlier
worktree-concurrency near-miss); if it recurs, the hook grows a lockfile
check.

## 2026-09-04 — R33: `if()` must apply L3-R12 across all three operands

L3 Task 5 reviewed CLEAN (`fd9b30d`, critical=0 important=0 minor=2). One
Minor is a real latent gap, not a style note: `if(cond, t, f)`
(`math/eval.rs:1005-1015`) adopts `cond`'s `t_us` as the output axis
without checking the `t`/`f` operands' own axes. That is exactly the
silent-axis adoption L3-R12 exists to forbid — it just wasn't in Task 5's
named function list, so the reviewer correctly did not fail the task on
it.

Ruling: `if()` runs the same `combine_t_us` fold across all three
operands — equal or empty passes through, a genuine mismatch is the same
typed Runtime error naming both spans. Dispatched as **Step 0 of Task
6**, the pattern Task 5 itself used, with a test for the mismatch case.

The other Minor (four copies of a test-only `synthetic_t_us` helper) is
accepted as-is: private test fns, no silent-drift risk. Hoist it only if
a fifth copy appears.

**Cost if wrong:** small — a wrongly-rejected `if()` over two channels
that happen to differ in axis, which is the case we want rejected anyway.

## 2026-09-04 — R34: cross-session lookup is exclusive; lap error names the lap count

L3 Task 8 reviewed CLEAN (`f7c757b`, 0/0/0). Two judgment calls the
implementer flagged rather than buried, both ruled here.

**(a) `other_session` is exclusive — affirmed, with the validation it
implies.** `channel(name, …, other_session: Some((id, lookup)))` resolves
in `lookup` only, never falling back to the primary session. That is
right: a fallback is exactly how a chart ends up silently plotting the
current session's data under another session's label, and a missing
cross-session channel must fail loudly. But the reviewer found the
consequence: `channel()` never reads the `id` string, so it cannot detect
a caller that wires `(id_A, lookup_B)` — the pairing is trusted. Ruling:
**Task 9's caller owns that validation.** The caller must confirm the
resolved lookup belongs to the requested session id and return
`UnknownChannel` naming the id when it does not. Folded into Task 9 as a
Step 0 with a test.

**(b) `NoLapContext` covers out-of-range too — affirmed, message
improved.** L3-R22's text named only the empty-`main_lap_bounds` case; the
implementer extended the same kind to "lap 7 of a 3-lap session" and
documented it. Correct — inventing a `LapOutOfRange` kind would amend C2
§3.5.B's enum for a case the existing kind describes. The message today
(`channel("X", lap: 7): no lap 7 in this session's lap table`) is honest,
not a "no laps" lie, but it is byte-identical between the two situations
and does not tell the user how many laps exist. Ruling: append the
recorded lap count (`… lap table (3 laps recorded)`; `(no laps recorded)`
when empty). Message-only, no contract change. Also Task 9 Step 0.

**Cost if wrong:** (a) is the expensive one and it is ruled in the safe
direction — a wrongly-rejected cross-session reference is visible, a
wrongly-accepted one is not. (b) is a format string.

## 2026-09-04 — R35: R34(a)'s validation is deferred to wave 2 (doc-only in Task 9)

R34(a) assigned the `other_session` id/lookup pairing check to "Task 9's
caller". The Task 9 implementer stopped and reported that no such caller
exists: `host::channel()` has zero call sites in the tree, Task 9's own
`eval_cells(doc, structural, lookup, lap_ctx)` never touches
cross-session channels, and threading a real `Session` in is L6's job in
wave 2 — as `host.rs`'s own doc comment already says. Worse, the check
isn't implementable where I put it: `ChannelLookup` cannot report its own
session id (only `SessionHandle` knows it), so satisfying R34(a) would
mean either adding a trait method or having the caller pass an id it
already holds — the first is core trait surface invented for a caller
that doesn't exist, the second tests nothing.

Ruling: **the validation is deferred to the wave-2 caller (L6).** Task 9
carries the obligation as documentation only — a paragraph on
`channel()` stating that `other_session`'s `id` is not read and the
pairing is trusted, plus a `// TODO(idl0):` naming L6 as the owner and
recording why the trait can't answer it today. No trait change, no
wrapper, no mock-only test.

**Lead error, worth naming:** R34(a) was written from the review's
description of the code rather than from the code, and asserted a caller
that isn't there — the same failure mode the last three briefs had. The
implementer catching it cost one message; me not catching it would have
cost invented trait surface in `core`. The standing "verify premises,
stop if ambiguous" instruction is doing its job.

R34(b) (lap count in the `NoLapContext` message) is unaffected and
proceeds.

**Cost if wrong:** a wave-2 caller mis-pairs a session id and plots the
wrong session's data. Mitigated by the TODO sitting on the exact function
that would be misused, and by L6 being the only place it can happen.

## 2026-09-04 — R36: Done-when (1) becomes a v3-vs-evaluator parity gate (answers Q5)

Briefs 15 and 16 are written. The writer raised Q5: with Task 13 cut
(R30), the lane's Done-when (1) — "a migrated idl0 workbook evaluates
byte-for-byte against the existing v2 evaluator" — is unprovable, since
`migrate_workbook_text`/`MigrationReport` will never exist in wave 1.

Ruling: **accepted as recommended.** Done-when (1) becomes *"every v3
math-cell value equals a direct `math::evaluate` on the same expression
against the same session, bit-for-bit"*.

The reason this is not a weakening: the original criterion bundled two
different guarantees, and only one was ever Task 15's.
(i) *The evaluator produces idl0's numbers.* Already landed and already
proven, independently of migration, by `core/src/math/tests_parity.rs` —
cases ported from the Dart suite (`app/test/data/
math_channel_evaluator_test.dart`) pinning exact output vectors, plus
delegation parity for the DSP-backed cases.
(ii) *The v3 cell pipeline routes to that evaluator without altering
values.* Untested until now, and exactly what the new Task 15 Step 1
proves.
Migration was only ever the transport that carried v2 expressions into
(ii); with no v2 workbooks worth migrating (R30), hand-written v3 cells
carry them just as well.

Task 16 records the restatement in its appended "Delivered" section
rather than editing the BRIEF header (L3-R42's append-only rule). Both
PROVISIONAL markers in briefs 15/16 are cleared by this ruling; the
dispatch will say so rather than editing the briefs.

Contained decision accepted from the writer: Task 15's tests live in one
new `core/src/workbook/v3/tests_pipeline.rs` (filter
`workbook::v3::tests_pipeline`), since the plan's `workbook/migrate.rs`
target no longer exists and Task 10 owns `tile.rs`.

**Cost if wrong:** a v2-semantics regression that `tests_parity` doesn't
already cover ships unnoticed. Bounded — that suite is the idl0 corpus.

## 2026-09-04 — R37: C2 §2.5's worked example drops `g`; the reserved-name check stands

Task 9's end-of-batch gate surfaced a failing test that predates it:
`workbook::v3::tests::parse_workbook_c2_5_worked_example_parses_id_
version_and_both_cells` fails at `f7c757b` too. The implementer proved it
by stashing its own diff and rerunning the test by name, then committed
its own (clean) work rather than withholding it — correct on both counts.

Cause: a spec-vs-spec conflict, not a code bug. C2 §2.5's worked example
declares `g: 9.80665` in front matter, and §3.5.A's `RESERVED_NAMES`
(extended by R20) reserves `g` as one of the four universal math
constants, so `merge_constants` refuses it as `ReservedName`. §2.5 claims
the example "demonstrably parses under §§2-5 exactly as written". It does
not, and has not since Task 4 landed the check.

Ruling: **the reserved-name check is the correct half and stands** — `[g]`
must always mean standard gravity, and a workbook silently redefining it
is precisely the shadowing R20 widened the list to prevent. The example
is wrong, so the example changes: `g` is dropped from `constants` in C2
§2.5, in design §5's prose form, and from §3.1's bare-number illustration
(now `sag_target: 0.3`). The declaration bought nothing — `g` resolves in
any expression undeclared.

Fix-up task dispatched against the worktree for the test fixture; the
three doc edits are the lead's own (lanes never touch `docs/`).

**Process finding, the more important half.** This test failed for five
consecutive tasks without being caught, because §8's compute rules run
only targeted filters per task and the full suite once per lane at the
merge gate. That trade is still right on a 16 GB machine — but it means a
break outside the current task's filter stays invisible for the whole
lane. Mitigation, not a rule change: the end-of-batch gate moves from
"once at the merge gate" to **once every four tasks**, cheap enough at
~3 min warm and it bounds the blast radius to four tasks instead of
sixteen. First one already effectively run here.

**Cost if wrong:** if `g`-in-front-matter turns out to be a real user
need (local gravity), the fix is to unreserve `g` alone and let a
declaration shadow it — a one-line change to `RESERVED_NAMES` plus a
§3.5.A note. Nothing built since depends on `g` being unshadowable.

**Tracked (2026-09-04, L3 Task 10, `b1a33d4`):** the `MAX_TIER` guard is
`checked_pow` only — it prevents a panic, it does not make an
out-of-range tier return an empty tile. At `tile_index: 0` the saturating
start offset is 0, so bucket 0 still folds real data at tier >
`MAX_TIER`; the brief's "all-NaN tile" assertion only holds at
`tile_index != 0`, and the implementer corrected the test accordingly
(and said so). C3 §3.5 already requires L5 to reject `tier > MAX_TIER`
with `invalid_argument` before calling in, so there is no contract gap —
but that check is **load-bearing, not defensive**: without it a bad tier
yields a plausible-looking tile rather than an error. L5's brief must
quote this line.

**Correction to the tracked note above (same day, after the Task 10
review).** I accepted the implementer's framing that the "all-NaN tile"
guarantee was simply untrue and the test should move to `tile_index: 1`.
The reviewer disagreed and was right: the correct conclusion was that the
*code* was wrong, not the guarantee. `decimate_channel` and
`decimate_tile` now early-return the empty tile for `tier > MAX_TIER`
before any bucket arithmetic, so the guarantee holds at every
`tile_index` including 0 (`1f04286`). Core does not lean on L5's
`invalid_argument` check for this; that check stays, now as defence in
depth rather than the only thing standing between a bad tier and a
plausible-looking tile. The same commit fixes an unguarded `u64` overflow
in `column_sample_range` (saturating products, boundary test past
~4.19M) that neither the implementer nor I spotted.

**Lead note:** this is the second time in one session I ratified an
implementer's reasoning that a review then overturned (the first being
R34(a), caught by the implementer instead). Both were cases of reasoning
from a report rather than from the code. The review-every-task rule is
carrying more weight than the ledger implies, and stays.

## 2026-09-04 — R38: raster colour bounds are resolution-independent

Task 11 review found the divergence I asked it to check for:
`spectrogram_raster_meta` scans `vmin`/`vmax` over the raw `power`
matrix, while `build_spectrogram_raster_bytes` colours pixels from a
nearest-cell-rebinned subset and derives its bounds from that subset.
Under downsampling the two disagree — the lane's own orientation-test
parameters drop the Nyquist row entirely — so the legend a user reads
would not describe the image they see.

Two ways out. **Rejected:** give the meta function `width`/`height` and
rebin (C3 §3.6 already passes both to `fetch_raster_meta`, so this is
available). It would make legend and pixels agree exactly, but it makes
the colour mapping a function of window size: resizing a chart would
visibly re-normalise it, and two charts of the same channel at different
sizes would not be comparable. Colour is data, not layout.

**Ruled:** colour bounds are **resolution-independent** — both the meta
function and the byte builder derive `vmin`/`vmax` from the full raw
matrix, before any rebinning. The builder changes, not the meta. A
consequence to state plainly in the doc comment rather than hide: at low
resolution some extreme cells may not survive rebinning, so the rendered
image can fail to contain a pixel at `vmin` or `vmax`. That is correct
behaviour for a colour scale — the legend describes the mapping, not a
census of what is on screen — and it is the same convention a fixed
axis range gives a line chart. The doc's current claim that the two
"don't differ materially" is false and is replaced by this statement.

Applies to the `histogram2d` pair on the same terms.

**Cost if wrong:** if the resize-stability argument turns out not to
matter and exact legend/pixel identity does, the reversal is to thread
`width`/`height` into the meta functions — the arguments already exist at
the IPC boundary, so it is a core-only change of one signature each.

## 2026-09-04 — R39: `gps_channel_values` stops at a channel's span too

Task 12 reviewed CLEAN. Its one raised item is a real latent hazard in
landed code, correctly left alone as out of scope: `gps_channel_values`
(`handle.rs:500-523`) reaches `nearest_at_t_us` through the still-clamping
`nearest_by_t_us`, and its own pre-existing test
(`gps_channel_values_clamps_to_nearest_past_channel_span`) *asserts* that
a fix time past a channel's recorded span clamps to that channel's last
sample.

That is the same failure R31 was written to prevent, one layer down. The
visible symptom: a GPS trace coloured by a channel that stopped early —
an HR strap that drops at minute 40 — keeps painting the frozen last
value along every remaining metre of track, indistinguishable from real
data. The honest rendering is for the trace to go neutral past that
point.

Ruling: **extend R31's rule to `gps_channel_values`** — a fix time
outside the target channel's recorded `[first, last]` yields no value
(the polyline segment is uncoloured), nearest-sample unchanged inside.
`nearest_at_t_us` itself keeps clamping and stays the shared primitive;
the span check lives at the call site, as it already does in
`cursor_readout`. The existing test is inverted to assert absence and
renamed, deliberately — this is a behaviour change to landed code, made
with eyes open, not a bug fix.

Dispatched as its own small task before the L3 merge gate, not folded
into Task 12 (whose scope L3-R35 fixed at "no v2 behaviour moves or
changes").

**Cost if wrong:** a map trace that used to be fully coloured now has an
uncoloured tail. Visible and instantly reversible — unlike the current
behaviour, whose wrongness is invisible.

---

## 2026-09-04 — L3 LANDED

**idl-rs** `main` = `e0440bb` (merge of `wave1-l3-workbook`, 23 commits,
+5920/-91 across 33 files). **idl1-app** `main` = `04a7f63` (docs merge
`3c93406` + submodule pointer + review records).

Merge gate: **898 passed, 0 failed, 1 ignored** — idl-rs 846, real-session
ODR validation 1, idl-rs-cli 51.

Delivered: workbook v3 parser (front matter, math/table/js cells, cell
ids, constants), cross-cell resolver with fixed-point evaluation, the JS
host surface, per-cell evaluation orchestrator, the `t_us` time axis
threaded through math/table/estimate, tile v2 encoder, spectrogram and
histogram2d rasters with the Turbo colormap, cursor readout, and the
pipeline parity gate. **Not delivered, deliberately:** workbook migration
(Task 13, ruling R30).

Rulings this lane produced: R30–R39, plus L3-R11..R42 in-lane.

**Every task reviewed; three came back NEEDS_FIXES** (Task 10 twice-over:
`MAX_TIER` emptiness + a `u64` overflow; Task 11 across three rounds:
raster legend/pixel divergence, then a regression test that would have
passed against the bug it was written for; Task 16: a mis-attributed
provenance clause). None would have been caught by test counts alone.

**What the lane cost in rework, and why:** six briefs asserted landed
code that did not exist, and two lead rulings (R34(a), the first
`MAX_TIER` note) were written from reports rather than from the code and
had to be corrected. The standing "verify premises, stop if ambiguous"
instruction caught all of them at one message each. Both patterns carry
into L2: briefs cite file:line for claims about existing code, and the
lead reads the code before ruling on it.

**Next:** L2 (importers) — briefs 1–6 on disk, FIT sample available.
R27's GPS decimal-degrees conversion sequences before L2 Tasks 4/8 so the
importers are written once against the final unit.

---

## 2026-09-04 — R40–R45: L5's remaining commands (answers Q1–Q6)

The L5 pre-read wrote briefs for Tasks 8, 11–14 and raised six structural
questions. All six were real gaps between C3 and the code that landed
under it — the contract was written before the engine existed, and this
is where they disagree. Rulings, with the C3 amendments already applied.

**R40 (Q1) — L5 may add the catalog read API to `core`.** L1 landed
`catalog.rs` write/rebuild only; there is no `list_sessions`,
`get_session`, `list_laps`, `list_workbooks`, `list_tracks`, `get_track`
or `SessionSummary` anywhere at `e0440bb`. C3 §3.2's seven commands
cannot wrap nothing, and these queries are bytes-on-disk, so CLAUDE.md §2
puts them in `core`, not in the Tauri crate. New file
`store/catalog_read.rs` so no L1 file is rewritten. Also approved:
`SessionHandle::from_session(Session)`. That one is not a convenience —
the only existing constructor, `from_channels`, **hard-codes
`source_format = Gpx` and blanks `blob_sha256`/`unit`**, which is a
latent bug for every non-GPX session; the new constructor carries the
real values and Task 11's brief must say so. Both are `pub` additions:
`cargo check -p idl-rs-cli --tests` applies.

**R41 (Q2) — `eval_workbook(id, session_id: string | null)`.** C3's
signature supplied neither the channel lookup nor the lap context
`eval_cells` requires, and C2 has no front-matter session binding by
design. The active session is a UI selection, not a property of the file.
`null` evaluates against an empty handle so unbound `[Channel]` refs
surface as per-cell `math_unknown_channel` — one bad reference must not
blank a whole notebook.

**R42 (Q4) — `x_bins`/`y_bins` must equal `width`/`height`.** The landed
histogram encoder builds one bin per pixel and does not rebin, because
rebinning counts misrepresents them. Mismatch is `invalid_argument` with
both pairs in `detail`, not a silent preference. I kept the redundant
fields rather than deleting them: bins < pixels (upsampling a coarse
histogram) is a legitimate future, and keeping them reserves the space
without a later contract change.

**R43 (Q5) — `fetch_tile` gains `column_count`,** validated `1..=4096`.
The per-column region exists so hover costs no IPC at the chart's own
width, and only the frontend knows that width. Request-only; the binary
header already carries the value.

**R44 (Q6) — `save_workbook` gains `based_on_hash`, and C3 §2 gains a
`conflict` kind.** C4 §4's optimistic check is mandatory and
`write_atomic` already implements it; the command had no `H0` to pass.
(Passing `None` was never a silent-clobber option — it errors against an
existing file, so every save of an existing workbook would have failed.)
The pre-read proposed mapping `RenameConflict` to `invalid_argument` and
recording the vocabulary gap; I closed the gap instead. A save conflict
is not a caller error, it is a recoverable condition the UI must present
differently — "this file changed elsewhere, reload?" is not an error
toast. Fifth cross-cutting kind, `detail { expected, found }`. Adding it
before L6 types against the surface is the same argument that moved R27.

**R45 (Q3) — the host-channel byte path defers to wave 2 with L6.** C3
assigns the `HostChannel` binary layout to this task, but its only
consumer is L6's sandboxed iframe, which does not exist. Fixing a wire
format with nothing to validate it against is how you ship a format
nobody can use. `HostChannelRef { length, has_t }` — already C3 §3.4's
JSON representation — is enough for wave 1, plus a `TODO(idl0)`.

C3 amended in five places: §3.4 twice (R41, R44), §3.5 (R43), §3.6 (R42),
§2 (R44's `conflict`). All PROVISIONAL markers in the five L5 briefs are
cleared by these answers; dispatches say so rather than editing briefs.

**Cost if wrong:** R44's new error kind is the only one that widens a
signed vocabulary, and it is additive — an unrecognised kind degrades to
a generic error in any consumer that hasn't been updated. The rest are
signature changes on commands with no callers yet.

## 2026-09-04 — R27 landed; L5 branches rebased onto it

**idl-rs** `main` = `7e10797` (merge of `fix-gps-decimal`); **idl1-app**
`main` = `80102fa`. Gate at the merge: 845 passed / 0 failed (idl-rs, one
fewer than 846 — the deleted `to_deg` test), 51 (idl-rs-cli).

R27 reviewed in two rounds. Round 1: everything substantive clean —
epsilon rescaling complete, `to_deg` auto-scale-detect deleted safely,
parse-side bake matching C1 §4.2 — with one Important on the `.idl0t`
round-trip test, which exercised a single coordinate and so would have
passed even if `/1e7` were later "simplified" to `*1e-7`, the exact
regression that would corrupt track libraries shared with idl0.

Round 2 corrected **me**. I specified the replacement assertion as
write→read→write comparing `i32`; the implementer verified empirically
that this does not discriminate at all — the write side's `.round()`
re-quantises any FP error from a wrong read operator back onto the same
integer, so every value passes either way. It moved the assertion to the
decoded domain value against independently computed ground truth, proved
the table by injecting the `*1e-7` regression and watching it fail
(`50.116299999999995` vs `50.1163`), reverted, and named the four values
that catch it. Reviewer confirmed both halves independently. That is two
bad lead instructions caught inside one task, both by agents reasoning
from the code.

Also from R27, worth keeping: `estimate/run.rs` was dividing GPS_Heading
by 100 on top of the raw centidegree scale. The implementer first called
it a pre-existing bug, the reviewer corrected the framing to "a necessary
consequence of this commit's parse-time bake", and the implementer
accepted the correction rather than defending the stronger claim.

**Boundary added outside R27's stated blast radius, deliberately:** SPEC
§17b.1 fixes the `.idl0t` on-disk format at `deg × 1e7` regardless of the
engine's internal scale. Those DTOs used to be copied verbatim because
both sides were e7; they now convert explicitly (`/1e7` read,
`(x*1e7).round()` write). The SPEC settled it, so no ruling was needed,
but it is the one place R27 touched a format shared with idl0.

**L5 branches brought up to date** (both repos): idl-rs `wave1-l5-tauri`
= `0f79ee6`, idl1-app = `755cc58`. Two merge frictions worth recording:
`Cargo.lock` conflicted between L5's tauri deps and main's L3 deps and
was regenerated from both manifests (verified: both `tauri` and
`pulldown-cmark` present); and a duplicate untracked `.cargo/config.toml`
in the L5 worktree blocked the merge because `main` now **tracks** that
file.

**Tracked, for Isaac, low priority:** `rust/.cargo/config.toml` is
committed and contains a machine-specific absolute `target-dir`
(`C:/Users/isaac/...`). Its own comment acknowledges this and says to
delete it elsewhere, so it is a known trade rather than an oversight —
but it will need handling before CI or a second machine.

**Next:** L5 Task 8 dispatched (catalog read API per R40), then 11 → 12 →
13 → 14.

## 2026-09-05 — R46: `CatalogError` gains a `NotFound` variant

L5 Task 8 landed the catalog read API (idl-rs `9b68c38`, idl1-app
`2b7003a`) and flagged a real ambiguity rather than guessing at it:
`CatalogErrorKind` has only `Io` and `Sql`, so "no such session" was
encoded as `Sql` and mapped to `IpcErrorKind::NotFound`. The consequence
runs the wrong way: a genuine `rusqlite` error from a **corrupt
`catalog.sqlite`** also surfaces as `not_found` on `list_sessions`,
`list_workbooks`, `list_tracks` and `rebuild_catalog`.

That is a lie to the user in the most misleading direction available. "No
sessions found" invites them to re-import or conclude their data is gone;
"internal error" would send them to `rebuild_catalog`, which is exactly
the fix for a corrupt index — and the catalog is *designed* to be
rebuildable ("the catalog is an index — deletable, rebuildable, never
synced"). Encoding corruption as absence hides the one failure the
architecture already has an answer for.

Ruling: add a **`NotFound`** variant to `CatalogErrorKind`. Not-found maps
to `IpcErrorKind::NotFound`; `Sql` maps to `internal`. Additive to a core
error enum, no caller outside this task's own commands, and the cost of
doing it later is a UI built on a misleading error.

**Cost if wrong:** none identified — the variant is additive and the two
conditions are genuinely distinct.

## 2026-09-05 — R47: `eval.rs`'s duplicate-definition panic is a core bug; fix it, don't contain it

L5 Task 11 (idl-rs `8d737fe`, idl1-app `9a154a3`) found that
`core/src/workbook/v3/eval.rs`'s `math_cell_defs` **panics** whenever a
definition name repeats anywhere in a document. `resolve_workbook_defs`
returns a `HashMap` keyed by name alone, so a duplicate collapses to one
entry and whichever cell runs second calls `.expect(...)` on a
already-removed key. It was found empirically — the brief's own required
test panicked — not by reading.

This is a straight violation of CLAUDE.md §5 ("never a crash on bad
data") and it contradicts C2/C3's per-cell `DuplicateDefinition`
semantics, which say a duplicate surfaces on the offending cell and never
rejects the document. A user typing the same name in two cells — an
ordinary editing mistake — currently takes down the process.

The implementer correctly did not touch `workbook/v3/` (out of lane,
CLAUDE.md §7) and instead wrapped the call in `catch_unwind`, degrading
to `internal`. Right call under the constraint it had; wrong thing to
ship.

Ruling, in three parts:
1. **Fix the root cause in `core`.** `resolve_workbook_defs`' output must
   not lose duplicates — key it so each cell's definitions are
   recoverable, and `math_cell_defs` must never `expect` on a key it did
   not put there. The user-visible outcome is C3's stated one: every cell
   returns, the offending cell carries `workbook_duplicate_definition`.
2. **L5 is authorised to make that fix in its own branch.** L3 is closed
   and merged and L5 is the only active lane, so routing this through a
   reopened lane costs more than it protects. This is the lead granting a
   cross-lane exception under §7, recorded here.
3. **Remove the `catch_unwind` once the root cause is fixed.** A
   defensive net around a call that should not panic hides the next bug
   exactly as this one hid — it surfaced only because a test crashed
   loudly. Restore the brief's original assertion (both cells returned,
   offending cell carries the duplicate error) rather than the
   degraded-but-safe one.

**Cost if wrong:** removing the net means a future panic in `eval_cells`
reaches the command boundary. That is the intent — a panic there is a bug
we must see, and the alternative is a silent `internal` that looks like
an I/O failure.

## 2026-09-05 — R48: a new workbook's filename comes from its front-matter `name`, not its id

Task 11's second flag: C3 §3.4's `save_workbook(id, …)` says nothing
about where a *new* file goes, and the implementer synthesised
`<data>/workbooks/<id>.idl1wb`. Reversible and sensible-looking, but it
contradicts C4 §2, which the implementer had not been pointed at:
`workbooks/<file_name>.idl1wb`, where `file_name` is "the user-facing
name, filesystem-sanitised … a display convenience, not identity", with
`-2`, `-3` … appended on collision (SPEC §15.1).

Ruling: on create (`based_on_hash: null`), derive `file_name` from the
markdown's front-matter `name` (C2 §1 requires it), sanitise it per SPEC
§15.1, and apply the collision suffix. The `id` argument identifies the
workbook — it is the front-matter id — and never names the file. A
`workbooks/` directory full of UUIDs is precisely what C4 §2's
display-name rule exists to prevent.

**Cost if wrong:** files land under a name the user didn't choose;
renaming is a supported operation (C4 §6 — id wins over `file_name`), so
recovery is trivial either way.

**Also accepted from Task 11, no ruling needed:** running
`cargo test -p idl-rs-tauri session_source` beyond the brief's named
filter. The brief's Step 1 tests live in a file whose test names don't
contain "workbook", so the named filter compiled them without executing
them — the alternative was shipping Step 1 with zero test executions.
That is the §8 rule working as intended (a filter matching nothing is a
failed gate), and reporting it beat silently obeying the letter.

**Gap to close:** `app/src-tauri/src/lib.rs` gained two `.setup()` lines
that no authorised command in that brief compiles. Task 12's dispatch
adds one `cargo check -p app`, accepted as expensive (it builds the Tauri
graph) and worth it once, overnight, before Task 14 depends on it.

## 2026-09-05 — R49: a duplicated `[Name]` resolves to the first definition in document order

Task 11's review (CLEAN on everything else, including an independently
re-derived R47 fix and a clean one-off `cargo check -p app`) found the
sub-question R47 didn't reach: with a name defined in two cells, a third
cell's `[Name]` reference resolves **order-dependently** — by fixed-point
pass, then document position — with no test pinning it. Narrow, because
it requires an already-invalid document, but genuinely order-dependent
rather than theoretical, so an unrelated edit could silently swing a
reference from one definition to the other.

Two candidate rules. **Rejected:** make a reference to a duplicated name
an error on the referencing cell. It is the more "correct" answer, but it
buries the one signal the user needs — the `DuplicateDefinition` error
naming the actual mistake — under cascading errors in every cell that
merely mentions the name.

**Ruled: first definition in document order wins**, deterministically and
by explicit construction rather than as a side effect of iteration order,
documented on the function and pinned by a test. The decisive argument is
precedent: `merge_constants` already resolves exactly this collision the
same way — "the first declaration of a name wins its table entry, and
every later colliding declaration is reported" (L3-R16/R17). Two
different rules for the same shape of collision in one document format
would be worse than either rule alone.

The user is not left guessing: the duplicate is still reported on the
offending cell, so the document says plainly what is wrong while
references behave predictably.

**Cost if wrong:** a user with a duplicate sees results computed from the
first definition rather than the second, while looking at an error that
names the duplication. Recoverable by reading the error; the alternative
was a value that changes under unrelated edits.

**Minor accepted, with a guard:** the new `sanitize_file_name_stem` does
not special-case Windows reserved device names (`CON`, `PRN`, `NUL`,
`COM1`-`9`, `LPT1`-`9`). The reviewer verified empirically on this
machine (Win 11 22621) that `CON.idl1wb` and even bare `CON` create as
ordinary files, so it is not live here — but the failure mode elsewhere
is an opaque `io` error from `write_atomic` rather than a clear message,
and this string becomes a real filesystem path. Add the guard: a
sanitised stem case-insensitively matching a reserved name falls back the
same way the empty-after-trim case already does.

## 2026-09-05 — R50: L5's TASKS.md line is not ticked; two items are genuinely outstanding

Task 14's review raised a Critical against the documentation, not the
code: `TASKS.md` reads `- [x] L5 Tauri scaffold hardening` with no
qualifier, while the same commit's CHANGELOG admits the on-screen render
was never confirmed. Two things are in fact outstanding:

1. **Task 9 (import commands)** — deferred with L2 by Isaac's own
   prioritisation ("the .fit/.gpx can hold off"), never implemented.
2. **Step 6's visual confirmation** — I overrode the app launch tonight
   because nobody was awake to look at the window. That was the right
   call for the hour, but it does not convert into a completed step.

Ruling: **the line is unticked** and carries what remains, e.g.
`- [ ] L5 Tauri scaffold hardening — Tasks 1-8, 10-14 landed; Task 9
(import commands) deferred with L2; Step 6's on-screen render unconfirmed
(headless byte-level proof only, 2026-09-05).`

The reviewer graded this Critical and I agree with the grade. TASKS.md is
the project's own answer to "what is done", and it is the file a future
reader trusts *instead of* re-deriving state from the code. A tick that
overstates by two items is worse than no tick: it is a wrong answer
delivered confidently, and it would have been discovered by someone
opening the app expecting a chart.

Worth naming that the implementer flagged the tick as a judgment call
rather than making it silently, and separately amended the CHANGELOG to
distinguish "bytes verified" from "screen unconfirmed" when asked. The
honesty was there — it just stopped one file short.

**Also fixing (Minor):** `fetch_tile_column_count_zero_invalid_argument`
asserts only `err.kind`, while the tier test pins `detail`. The command
does build `detail { column_count }`, so a refactor could rename or drop
that field with nothing failing. One assertion.

**Cost if wrong:** none — the line can be ticked the moment Task 9 lands
and a human confirms the render.

---

## 2026-09-05 — L5 LANDED (Tasks 1-8, 10-14; Task 9 deferred)

**idl-rs** `main` = `75589bc`; **idl1-app** `main` = `bfaa888`.
Gate at the merge: idl-rs **860** passed / 0 failed / 1 ignored,
idl-rs-cli **51**, idl-rs-tauri **86**, TS **32**, `tsc` clean,
`cargo check -p app` clean.

Delivered: the `core` catalog read layer L1 never wrote
(`store/catalog_read.rs`) plus C3 §3.2's seven catalog commands; workbook
commands with `watch_workbook` wiring, `SessionHandle::from_session`, and
session loading; cursor readout; spectrogram/histogram2d rasters;
`fetch_tile` with both load-bearing validations; the v2 tile decoder and
typed IPC modules on the TS side; `NotebookPage` minimal render. M0's
`smoke_tile` scaffolding retired.

**Not delivered, deliberately:** Task 9 (import commands), deferred with
L2 on Isaac's prioritisation. **Not verified:** the on-screen render —
byte-level headless proof only (R50).

**The end-to-end proof, on real data:** the CLI imported
`d365a19ae7ef2dc2d087a5887371281f.idl0` into `C:\tmp\idl1-data-l5\data`
(1 session, 1 blob, exit 0), and a temporary ignored test drove the
production `fetch_tile_via` path against that on-disk session:
`IMU2_AccelX`, tier 0, `column_count` 600 → magic `IDLT`, version 2,
sample_count 1024, **20224 bytes** matching `32 + 1024*8 + 600*12 +
600*8` exactly, `sample[0] = (-0.018554688, -0.018554688)` — a real
accelerometer value, not a fixture. The test was deleted before commit
(it hardcoded a gitignored machine-specific path).

**Rulings this lane produced:** R46–R50.

**Two bugs found in already-landed L3 code**, neither by review of L3
itself: `math_cell_defs` panicked whenever a definition name repeated
anywhere in a document (an ordinary editing mistake killed the process),
and the `deps` map had the same bare-name collapse. Both fixed at the
root under a lead-granted cross-lane exception (R47), with the
implementer's `catch_unwind` containment removed rather than shipped.

**The night's recurring failure mode was overstatement, not code.** The
same false claim — that the render was verified — had to be corrected in
three separate places on three successive passes: the CHANGELOG, then
`TASKS.md`'s tick (graded Critical), then the commit subject, which the
lead fixed directly. Each pass found exactly one more. Worth carrying
into L2: when a claim is corrected in one file, grep for it everywhere
before calling it fixed.

**Harness gap closed mid-lane:** the §8 hook denied `cargo test
--workspace` but not a bare `cargo test`, which is workspace-wide in this
virtual manifest. Fixed (`de3cf95`) and regression-tested against the
eight existing rules. The bare run that prompted it turned out to belong
to another session entirely — the implementer produced its command list
and was right; the lead's inference was wrong and is corrected here.

**Machine note:** another of Isaac's sessions ran an
`aarch64-unknown-linux-gnu` cross-compile concurrently for part of the
night; free memory reached ~1.5 GB. No OOM occurred and no gate was
killed, but tasks were told to report a killed gate as *killed* rather
than as pass or fail.

**Next:** L2 (importers) — briefs 1-6 on disk, FIT sample available,
R27's decimal-degree conversion already landed so the importers are
written once against the final unit. L5 Task 9 (import commands) rides
with it.

## 2026-09-05 — L5 Step 6 render confirmed; settings.json BOM trap

Isaac asked for a preview. Lead launched `npm run tauri dev` (cold Tauri graph
build, 8m 01s, 530 crates, free RAM bottomed near 840 MB with nothing else
running) against the L5 import at `C:\tmp\idl1-data-l5`. Window opened;
`NotebookPage` drew the `IMU2_AccelX` tier-0 min/max envelope from the real
session with the footer `IMU2_AccelX — 20224 bytes` (the same byte count the
headless proof produced). Screenshot sent to Isaac. R50's outstanding item 2
is closed; CHANGELOG and TASKS.md updated in the same commit (grep confirmed
no other copy of the "unconfirmed" claim in TASKS/CHANGELOG/docs/app).

**Found on the way:** the `settings.json` the lead wrote on 2026-09-04 at
`%APPDATA%\com.saucyeng.idl1\` carried a UTF-8 BOM (PowerShell `Out-File`
default). `paths::resolve_data_dir` deserialises leniently and would have
silently fallen back to the platform default `<app_data>/data` — an empty
store — so the app would have opened on nothing and the render would have
looked broken for a reason unrelated to the code. Rewritten without the BOM.
**Tracked (not wave 1):** `resolve_data_dir` should strip a leading BOM before
`serde_json::from_str`; a bootstrap file Windows tooling writes by default
should not be a silent no-op. Cheap, one line plus a test; goes with the
first task that touches `rust/tauri/src/paths.rs`.

**Cost if wrong:** none on the render claim — it is now observed, not
inferred. The BOM item, if left, costs a confused user with an empty app and
no error, exactly the failure the lenient parse was meant to avoid.

## 2026-09-05 — R51: L2 briefs refreshed against landed main; five questions ruled

Refresh report: `lanes/l2-importers/brief-refresh-2026-09-05.md` (Opus,
read/write only, no build). 30-odd edits across BRIEF.md, briefs 1–4 and 6,
and the standing reviewer brief; brief 5 needed nothing. The substantive
class of edit was R27: every brief still instructed the ×1e7 / `deg_e7`
storage R23 chose and R27 reversed, including a reviewer bullet that would
have failed correct code. Also fixed: stale hashes/line refs, `fitparser`
0.11→0.9 (L2-R9), the forbidden `--workspace` gate wording, and the
dependency gate (both greps now return 1 — open). Lead read the edit table
and spot-checked the justifications against the cited code; accepted.

Rulings (Q1–Q5 in the report):

- **Q1 → (A).** Core `import_file(data_root, extension, bytes)` stays as
  L2-R13 ruled and keeps refusing `"idl0"`. L5 Task 9's Tauri command does
  the `importer_id` → extension mapping and the `.idl0` → `import_idl0`
  branch. Routing on a file extension is a UI-adjacent decision (CLAUDE.md
  §2); the `.idl0` path has its own landed invariants and tests.
- **Q2 → (A), as a new L2 Task 7.** `core::import::importers() ->
  &'static [ImporterInfo { id, label, extensions }]` is the single table;
  `importer_for_extension` derives from it. Brief to be written after
  Task 3 lands (it needs the real importer set). The existing plan Task 7
  (CHANGELOG/TASKS wrap-up) becomes Task 8.
- **Q3 → (A).** No `idl-rs-tauri` run in Task 6. The implementer reports
  the reach of the `synthesize_base_channels` fallback; the lead decides at
  the merge gate whether to add `cargo test -p idl-rs-tauri session_source`
  once. Rationale: L5's fixtures are fixed-rate, so the new branch should
  not fire in them; building the Tauri graph to prove a no-op is the wrong
  trade on this machine.
- **Q4 → (A) for wave 1; (B) recorded as a deferral.** Task 9's command
  calls `rebuild_catalog` after a successful import and reads the row back
  via `catalog_read::get_session`. Incremental `catalog::insert_session` is
  the eventual answer; `TODO(idl0)` at the call site, tracked in TASKS.md
  when Task 9 lands. "The catalog is an index — rebuildable" is preserved
  by construction.
- **Q5 → (B).** One-line SUPERSEDED banner added to the top of
  `pre-read-tasks1-6.md` (this commit). Two briefs were carrying an
  "ignore that part of the pre-read" instruction; the correction now lives
  in the file that was wrong.

**Cost if wrong:** Q1/Q2 shape `pub` surface in `core` that Task 9 and every
later importer caller build on — but both are additive and both halves are
tested independently, so a later "single entry point" router is a thin
addition, not a rewrite. Q3 risks a behavioural change in `idl-rs-tauri`
reaching the gate untested; bounded by the reporting obligation and a
one-run gate option. Q4(A) costs a full catalog rebuild per import at
wave-1 data sizes — seconds, not minutes.

## 2026-09-05 — R52: L6 notebook plan adjudicated (Q1–Q9)

Plan: `docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md` (Opus,
16 tasks, 8 IPC needs in `runs/2026-09-05/lanes/l6/IPC-NEEDS.md`). Isaac's
2026-09-05 calls in force: Properties + Code editor (D13); React Flow graph
view is wave 3 and re-homes the same Properties form component.

- **Q1 → (a).** Eight npm packages added to `package.json` by a lead shell
  task; `htl` pinned at `1.0.0` (npm `latest`, checked 2026-09-05) and added
  to the M0 ecosystem pins table in the same commit. Dropping `html` would
  silently narrow C2 §5.1.
- **Q2 → (a).** `channel()` returns an array of `{ t, v }` records
  materialised inside the sandbox from the two transferred buffers; C2 §5.3's
  grammar is untouched, C2 §5.1's stated object is amended (filed by L6 Task
  16, applied by the lead). Transfer stays zero-copy; only what Plot iterates
  changes; record count is budget-capped (~2 per pixel column).
- **Q3 → (a).** Cell segmentation for the editor is a narrow TS fence scan,
  non-authoritative; Rust remains the only evaluator. It maps cell id → byte
  range for clicks, which is "pixels or clicks → app/src" (CLAUDE.md §2).
- **Q4 → (a).** `read_workbook(id) → { markdown, hash, path }` is added to
  C3 §3.4 in the wave-2 write-amendment lane. Reading the file through a
  Tauri fs plugin is rejected: it bypasses `<data>` resolution (C4 §1).
- **Q5 → (a).** `eval_workbook` gains an additive
  `lap_context: { main_lap, overlay_laps[] } | null` argument (R41's
  reasoning: the designation is a UI selection, not file content).
- **Q6 → (a).** L6 designs the host-channel byte layout (it is the only
  consumer, R45's missing validator) and files it as a C3 §3.4 amendment; the
  Rust write lane implements it. Fallback if it slips: raw channels via tiles
  only, math-derived host variables wave 3.
- **Q7 → N5 (FFT) in, N6 (1-D histogram) deferred to wave 3.** FFT is a thin
  wrapper over the existing `idl_rs::fft`; the histogram is new binning code.
- **Q8 → (a) for wave 2, escalated to Isaac.** GPS polyline on plain axes; no
  basemap. A user-configured tile URL (option c) would be an explicit,
  off-by-default exception to "no CDN, ever" and is Isaac's product call —
  asked 2026-09-05, non-blocking (the GPS map chart is deferred either way).
- **Q9 → batch.** One lead shell task on `main` before L6/L7 dispatch:
  `App.tsx` Notebook import, `AppState` `activeSessionId` slice (shared with
  L7a), `package.json` per Q1. `vite.config.ts` held until Task 5 reports
  whether the sandbox needs a second build entry.

**Cost if wrong:** Q2 costs one task (Task 7) if Plot turns out to iterate
SoA after all — cheap to check at Task 7's first test. Q3 costs deleting Task
4 for a stub over an IPC call. Q4/Q5/Q6 are additive `pub` surface in the
Rust write lane; their blast radius is that lane. Q1's `htl` pin is a new
dependency with no prior pin — reversible before any cell uses `html`.

## 2026-09-05 — R53: L7 tab plans adjudicated (Data 5, Device 5, Settings 4 questions)

Plans: `docs/superpowers/plans/2026-09-05-idl1-wave2-l7{a-data,b-device,c-settings}-tab.md`
(Opus; 8 + 9 + 6 tasks; 13 IPC needs in `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`,
8 beyond the operating brief's five). The planner confirmed settings, profile
and data-dir override all have landed core logic and need only commands.

**Data (L7a)**
- Q1 → (b): the three `<Tab>Page.tsx` re-export shims stay until all three
  lanes merge; one lead shell task then deletes them and edits `App.tsx`.
- Q2 → (a) wave 2; has-GPS / has-gates catalog columns filed as a wave-3
  C4 §5 + C3 §3.2 amendment.
- Q3 → (a) **now**, shape fixed here: the shell task adds a `selection`
  slice to `state/AppState.tsx` — `{ sessionId: string | null, lapContext:
  { mainLap: number, overlayLaps: number[] } | null }` — mirroring R52 Q5's
  `lap_context` so L6 passes it through to `eval_workbook` unchanged. L7a
  writes it; L6 reads it. Supersedes R52 Q9(iii)'s bare `activeSessionId`.
- Q4 → (a): lap counts and lap tables render "—"/empty honestly; CHANGELOG
  states that no wave-1 import path populates the catalog's lap tables.
  **Escalated to Isaac** as the one item visible on screen. Lap indexing at
  import (L1's gate synthesis/renumbering already in core) is added to the
  Rust track backlog after the write-amendment lane.
- Q5 → sector count only in wave 2; `LapDetail.sectors` element shape is
  pinned in C1 §6 when lap indexing lands, not before.

**Device (L7b)**
- Q1 → **(c) now, (b) later — not (a).** The channel-registry preview's
  `scale = range / 32768` is the wire contract's own formula (SPEC §3), which
  `core::parse` already owns; a second copy in TypeScript is exactly the drift
  the standing reviewer brief calls a finding. Wave 2 shows enable state,
  rate and unit only; `preview_channel_registry(config_json) -> RegistryRow[]`
  (IPC need 12) joins the Rust write-amendment lane and Task 4 widens then.
  Lead's layer call under CLAUDE.md §1/§2: it is physics of the bike.
- Q2 → (a): any positive integer for `analog.sample_rate_hz`; the SPEC §8
  gap is restated, not filled with a guess.
- Q3 → (a) wave 2; "blobs awaiting import" shared slice is a wave-3 shell task.
- Q4 → (a) now; a managed connection + status/control commands (IPC need 13)
  are one piece of work in the Rust lane.
- Q5 → six forms + the add-channel picker is the correct count; the
  operating brief's "seven" counted `factories.dart`. Not a gap.

**Settings (L7c)**
- Q1 → (a) with (c): `localStorage` behind `PrefsBackend` now;
  `get_settings`/`set_settings` in the Rust lane; the swap task does a
  one-time import of the `localStorage` keys into `settings.json` and then
  deletes them, so no preference is silently lost.
- Q2 → (a) now with the provisional status visible in the section itself;
  (b) — L6 exporting its binding table — via a lead shell task after L6 merges.
- Q3 → (a): sync status and pairing live in Settings; L11 may add a sync
  action to the Data tab.
- Q4 → BOM strip in `paths::resolve_data_dir` goes in the Rust write lane
  (already tracked 2026-09-05); "takes effect on restart" stated in the UI.

**Shell task (one, on `main`, before any UI dispatch):** `package.json` gains
`@observablehq/runtime ^6.0.0`, `@observablehq/plot ^0.6.17`,
`@observablehq/inputs ^0.12.0`, `d3 ^7.9.0`, `codemirror ^6.0.2`,
`@codemirror/lang-javascript ^6.2.5`, `@codemirror/lang-markdown ^6.5.2`,
`htl ^1.0.0` (M0 pins table gains the `htl` row); `AppState` gains the
`selection` slice above with a reducer test. `App.tsx` untouched (shims).

**Cost if wrong:** L7b Q1 costs the Device tab a column for one wave —
cheap — versus a wire-format formula living in two languages, which is the
kind of divergence that misleads at the track. L7a Q3's slice shape is
additive; if L6 needs more it is one shell task. L7a Q4 is visible to Isaac
and stated in the CHANGELOG so it is not read as a bug.

## 2026-09-05 — R54: Data tab Track facet dropped for wave 2

L7a Task 3 stopped (CLAUDE.md §1) on a real gap: the brief's Track facet
needs a per-session track linkage, but `SessionSummary` (C3 §3.2) carries
none — it lives only in `SessionDetail.track_visits`, a settle-bound
per-session call that local filtering over the fetched list cannot use.

**Ruling:** drop the Track facet entirely for wave 2 (no options, no counts,
no `trackIds` predicate, no disabled placeholder) — the same treatment as
has-GPS/has-gates under R53 Data Q2. A facet that structurally excludes
every row is a trap, not honesty. Returns with the wave-3 catalog amendment
(C4 §5 + C3 §3.2: a per-session track linkage column on `SessionSummary`),
recorded in the plan's parity gaps and the CHANGELOG. The lap-time facet
keyed off `duration_ms` is confirmed correct.

**Cost if wrong:** one facet missing for one wave; the amendment is the same
one already filed for two other facets, so no extra Rust work is created.

## 2026-09-05 — Tracked note: Device tab IMU defaults come from SPEC §8's worked example

L7b Task 2's `defaultConfig` uses 833 Hz / 32 g / 2000 dps for the IMU
blocks because SPEC §8's prose states no IMU default and only its worked
example carries values. The reviewer flagged it as an arguable CLAUDE.md §1
stop. **Lead ruling:** accepted as the *form's initial state* (disclosed in
the code comment), not as a claim about firmware defaults. 833 Hz matches the
configured rate observed on Isaac's real session; the range values are the
hardware's to confirm. **For Isaac:** confirm the firmware's actual IMU
defaults (rate, accel range, gyro range) so SPEC §8 can state them as
defaults rather than as an example; L7b adjusts `defaults.ts` in one line
if they differ. Non-blocking.

**Cost if wrong:** a new-device config form pre-filled with a value the
firmware would reject — caught at push time by the device, not silently.

## 2026-09-05 — R55: L7 Task 4+ briefs; file picker seam; no free-pin algorithm

Briefs for L7a Tasks 4–8, L7b Tasks 4–9, L7c Tasks 4–6 written against the
committed code (not the plans). Two questions ruled:

- **L7a Task 5 file picker → seam now, dialog plugin later.** No dialog
  plugin exists in the repo; adding `@tauri-apps/plugin-dialog` needs an
  `app/src-tauri` crate + capability change, i.e. a Tauri build. The Data tab
  builds `pickImportFile()` as a seam whose wave-2 implementation is a
  pasted-path input; the plugin (npm + crate + capability) is queued for the
  Rust write-amendment lane and the seam is swapped by a shell task then.
- **L7b Task 7 "free pin" → none.** SPEC §8 fixes no pin numbering scheme,
  so the UI never auto-selects a pin: new channels start unassigned (the
  validator already reports that), and the user picks from the pins the
  declared range allows, unassigned first.

Also from the brief writer: L7b Task 4 is rewritten (not narrowed) as
`previewSources()` — enable/rate/unit only, distinct names so nobody reads
it as IPC need 12 landing early (R53 Device Q1).

**Cost if wrong:** the picker seam costs one swap later; a plugin added now
would cost a Tauri build inside a UI lane, which §4 forbids. The pin ruling
costs one extra click per new channel versus a guessed numbering the
firmware might reject.

## 2026-09-05 — R56: L6 may edit `vite.config.ts` for the sandbox entry (lead-authorised)

L6 Task 5 proved empirically (out-of-tree probe configs, real `vite build`
output inspected) that no avoidance path works for the sandboxed iframe
bundle: `?url` / `new URL(..., import.meta.url)` on a `.ts` module emits the
raw untransformed source as a data URL; the `new Worker(new URL(...))`
special case bundles correctly but cannot yield a script URL without
spawning a worker; a second `build.rollupOptions.input` entry works. So R52
Q9(ii) resolves to: the entry is required.

**Ruling:** because the entry's HTML lives in L6's own directory, the config
change and the file must land together. The lead authorises L6 Task 5 — this
task only — to edit the lead-owned `app/vite.config.ts` with exactly:
`build.rollupOptions.input = { main: "index.html", notebookSandbox:
"src/routes/pages/Notebook/sandbox/index.html" }`, as its own commit citing
R56. Ownership rule (operating brief §2) otherwise unchanged. Proof at the
task gate: one `vite build` showing the sandbox chunk with `d3` and
`@observablehq/*` resolved.

**Cost if wrong:** a second build entry that later moves is a one-line
config edit; the alternative (a shell task on `main` pointing at a file that
does not exist on `main` yet) would break `vite build` on `main` until L6
merges.

## 2026-09-05 — Tracked note: IMU `low_power_mode` vs `high_performance_mode` — SPEC §8 gap

L7b Task 3's validator selects the IMU ODR table from `imu.low_power_mode`
alone; SPEC §8 frames the two flags as one physical toggle but never says
what the firmware does when both are set. **Ruling:** the validator emits a
*warning* (not an error — inventing a winner would be a guess) when both are
true; `isPushable` unaffected. **For Isaac:** state in SPEC §8 whether the
flags are mutually exclusive (then the validator upgrades to an error) or
which wins (then the table selection follows it). Non-blocking.

**Cost if wrong:** a config the firmware silently reinterprets; the warning
makes it visible at push time, which is the most the app can honestly do.

## 2026-09-05 — Tracked note: L6 inline `${…}` prose spans have no host→sandbox trigger yet

L6 Task 5 shipped the sandbox host and cell API; the protocol as committed
has no message type for evaluating C2's inline `${…}` prose spans, so they
are unwired. Deferred to L6 Task 13 (open/evaluate/render the workbook),
which owns how spans are routed. Also carried to Task 13: cell compilation
binds every host variable as an input to every cell (no free-identifier
analysis) and cells cannot yet reference each other by name — both marked
`TODO(idl0)` in `sandbox/main.ts`. Not a contract change; C2 §5 is unaffected.

**Cost if wrong:** prose spans render as literal text until Task 13 — visible,
not silent.

## 2026-09-05 — R57: C3 §3.9 `sync_status` error kinds — the §2 table wins

L7c Task 5's reviewer found C3 internally inconsistent: §3.9's `sync_status`
entry listed `io`, `internal` only, while the §2 kind table lists `sync` as
raised by `sync_status`, `sync_now`, `pair_peer`. **Ruling:** the §2 table is
authoritative; §3.9's entry now reads `io`, `internal`, `sync` (a status query
can fail in the sync layer itself — unreadable pairing store). L7c's
`errors.ts` already maps `sync`, so no code change. L11 implements against
the amended text.

**Cost if wrong:** an extra kind the UI already handles; zero.

## 2026-09-05 — R58: unassigned pins are representable; no pin range is invented

L7b Task 7 stopped (CLAUDE.md §1): `AnalogChannel.adc_pin` and
`DigitalChannel.gpio_pin` are non-optional `number` with no way to say
"unassigned", and neither `DeviceConfig` nor SPEC §8/§3.7 declares a valid
pin range for a picker to enumerate (§3.7 names nets, not numbers).

**Ruling:**
1. Task 7 is authorised to change `config/model.ts` (Task 2's file, same
   lane): `adc_pin: number | null` and `gpio_pin: number | null`, `null` =
   unassigned. Parse: a missing pin key reads as `null` with no `Repair`
   (it is a legal draft state); a present non-integer is a `Repair` as
   today. Serialise: omit the key when `null`. Validator (Task 3's file,
   same authorisation): an unassigned pin is an **error** ("pin unassigned"),
   so `isPushable` is false — a draft channel can never reach the device
   half-configured. Collision check ignores `null`.
2. **No pin range in wave 2.** The picker is a non-negative-integer input,
   collision-checked, starting empty (unassigned). Inventing a range would
   put a hardware guess in the UI. **For Isaac:** SPEC §8 should state the
   valid `adc_pin` and `gpio_pin` value sets (or map them to §3.7's named
   nets); when it does, the input becomes a select and the validator gains
   a range rule — one task, no model change.

**Cost if wrong:** a user can type a pin the hardware lacks and learn at push
time from the device's rejection (C3 `config` kind) — visible, not silent.
The alternative, a guessed range, could exclude a real pin with no recourse.

## 2026-09-05 — Process rule: IPC-driving React effects delegate to a pure, tested driver

Two Criticals reached review within an hour, both in the one place the UI
gate cannot see (rendering is not unit-tested, CLAUDE.md §4): L7a Task 5's
import-queue effect depended on the state it dispatched into, so its own
cleanup cancelled every in-flight import; L6 Task 5 registered host
variables as getters the Observable runtime never unwraps and never
re-primed a rebuilt iframe. Both were caught by reviewers reading the code,
not by any test.

**Rule (operating brief §4, all four UI standing reviewer briefs):** the
decision logic of any effect that starts IPC or `postMessage` work lives in
a pure module with an injected async function and is unit-tested for the
interleavings that matter (dismiss-while-running, stale response, rebuild);
the effect only calls it and never cancels in-flight work because unrelated
state changed. Reviewers trace dependency arrays against dispatches; a
self-cancelling effect is Critical. Fixes for both incidents are follow-up
commits in their lanes, with driver tests.

**Cost if wrong:** more ceremony per effect. Against it: an import feature
that can never complete, shipped green.

## 2026-09-05 — L2 four-task gate: PASS (932)

Per CLAUDE.md §8 the full suite ran after L2 Tasks 1–4 (worktree
`275267e`, clean): `cargo check -p idl-rs-cli --tests` Finished (21 s);
`cargo check -p idl-rs-tauri` Finished (16 m 07 s — cold Tauri graph, only
pre-existing warnings); `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` → idl-rs 880 passed / 0 failed / 1 ignored, integration
`real_session_odr_validation` 1 passed, idl-rs-cli 51 passed, doc-tests 0.
Total 932, no OOM. The gate agent stalled twice waiting on background
command notifications that had already fired; the lead nudged it each time
— gate steps should run in the foreground (told the agent; carried into the
next gate brief). Task 5 (CSV) dispatched on the PASS.

## 2026-09-05 — L7c LANDED (Settings tab, wave 2)

Merged `wave2-l7c-settings` into idl1-app `main` (`--no-ff`). Lane: Tasks
1–6 plus four follow-ups (Task 5 minors, `errors.ts` coverage to 100 %,
how-to copy accuracy, async `PrefsBackend`). Reviews: six, all CLEAN after
follow-ups; the last review held the merge for three factual errors in
how-to copy (push described as WiFi, calibration and a lap-gate editor
described as working) — fixed, and the implementer found two more of the
same class itself (battery level, remote record start/stop). Merge gate on
`main`: `tsc` clean, whole TS suite **98 passed / 0 failed**.

**Shipped:** Profile, Units, Data directory (restart-required, stubbed
get/set), Sync (real `sync_status`/`sync_now`/`pair_peer`, 5 s poll while
visible), Controls (provisional banner), How-tos (every affordance claim
true today or marked not yet available), About (engine version from
AppState). Prefs in `localStorage` behind an async `PrefsBackend`.
**Outstanding for the Rust write lane:** `get_settings`/`set_settings`,
`get_data_dir`/`set_data_dir`, the one-time `localStorage`→`settings.json`
import (R53 Q1), the BOM strip in `resolve_data_dir`. **Parity gaps:** Drive
sync replaced by LAN sync (permanent), firmware/OTA wave 3, licence page
omitted, chart-controls reference provisional until L6 lands. SPEC §27
rewritten (§27.1, §27.8–§27.13), §28 superseded banner. R57 came out of this
lane's review.

**Cost if wrong:** the tab is additive and behind its own directory; a
regression is a revert of one merge commit.

## 2026-09-05 — R59: C3 wave-2 write amendment adjudicated (Q1–Q6, F1–F3)

Draft: `runs/2026-09-05/C3-WAVE2-AMENDMENT-DRAFT.md` (Opus; 17 new commands
+ `eval_workbook` amended; all 21 IPC needs dispositioned; a new §3.10 App
group). Rulings:

- **Q1 → (a).** `save_session_metadata(session_id, fields)` reads
  `session.json`, hashes it, writes via `write_session_json` — last-write-wins
  inside the command, no `conflict` kind, no signature change. Revisit when
  L11 (LAN sync) makes concurrent edits real.
- **Q2 → (a).** Quarantine commands deferred to wave 3 with the repair action
  that would populate `tmp/quarantine/`; nothing implements it today and a
  permanently-empty command does not belong in a signed contract. The Data
  tab's stubs stay.
- **Q3 → (a).** New binary headers pad to natural alignment: `IDLH` 24 bytes,
  `IDLF` 16 bytes, so `Float64Array` views start on 8-byte boundaries. On the
  landed `IDLT` (C3 §3.5): the drafted "latent throw on odd `column_count`"
  does **not** occur — `app/src/ipc/tiles.ts` copies every region through a
  `DataView` into freshly allocated arrays, never views the buffer in place.
  Ruling: `IDLT` unchanged; C3 §3.5 gains one sentence: "regions are not
  alignment-padded; decoders copy, they do not view in place." Any future
  zero-copy tile decoder is a layout-version bump.
- **Q4 → (b).** New cross-cutting kind `device_rejected` with
  `detail { ack: "busy" | "precondition" | "write_not_permitted" |
  "not_implemented" }` for a refused device control transition (SPEC §7.2
  `AckCode`). `config` keeps its one meaning. Additive to §2, C3 §5 respected.
- **Q5 → (a).** `set_data_dir` is the sole writer of the `data_dir` key
  (validates, creates the tree, computes `restart_required`); `set_settings`
  ignores `data_dir` in its argument and echoes the current value. One
  sentence goes on `AppSettings`'s doc comment in the UI when the stub is
  swapped.
- **Q6 → (a).** `device_status` mirrors `idl_transport::ble_status::
  DeviceStatus` field for field (incl. `ota_pending_verify`, `hr`,
  `hr_battery_pct`); IPC need 8's four sourceless fields are dropped.
  **For Isaac:** could the firmware report SD free bytes, GPS fix quality,
  satellite count and battery millivolts in the §7.3 status block? If yes,
  a SPEC §7.3 amendment adds them and the command grows additively.
- **F1–F3 accepted** (`create_workbook` suffixes per C4 §2, `delete_profile`
  → `not_found`, `ProfileLoadReport.skipped` as objects).

**Applied to C3** by a transcriber under this ruling; the write lane (after
L2 Task 8 and L5 Task 9) implements against the amended text, App group
first (core logic already landed).

**Cost if wrong:** Q1 risks a lost edit only under concurrent writers that
do not exist yet. Q3's padding is four bytes per response. Q4 adds a kind
that can never be removed — justified by a UI that must present "device
busy" differently from "bad config". Q6 drops fields no source can fill;
adding them later is additive.

## 2026-09-05 — L7a LANDED (Data tab, wave 2)

Merged `wave2-l7a-data` into idl1-app `main` (`--no-ff`, `4c6f6a1`); the
only conflicts were CHANGELOG.md and TASKS.md bullets against L7c's landing
(kept both; TASKS.md's wave-2 block re-nested so L7a/L7b/L7c are separate
lines). Lane: Tasks 1–8 plus five follow-ups. Reviews: eight, all CLEAN
after follow-ups; two re-reviews. Merge gate on `main`: `tsc` clean, whole
TS suite **204 passed / 0 failed**.

**Shipped:** session list with formatters and sort; local facet filtering
(AND across, OR within, "(none)"); session detail pane joining file-native
and catalog laps honestly (R53 Q4/Q5); tracks view rendering counts only for
C3's unfixed nested shapes; import queue over the real `import_file` behind
the R55 picker seam with a pure, id-addressed driver (the lane's one
Critical, fixed and re-reviewed); metadata editor over a stubbed save;
maintenance actions behind confirmation over stubs and the real
`rebuild_catalog`. Selection writes `AppState.selection` (R53 Q3).
**Outstanding for the Rust write lane:** `save_session_metadata`,
`delete_session`, the dialog plugin (R55), `import_file` itself (L5 Task 9);
quarantine deferred to wave 3 (R59 Q2); track write commands wave 3.
**Parity gaps** as TASKS.md lists them, unabridged. R54 came out of this
lane. **Process lessons this lane produced:** the IPC-effects rule (Task 5's
self-cancelling effect), the never-amend rule, the Windows case-collision
rename (`metadataDraft.ts`).

**Cost if wrong:** additive tab behind its own directory; a regression is a
revert of one merge commit.

## 2026-09-05 — R60: L2 Task 7/8 + L5 Task 9 briefs; import warnings on the wire; L6 rebind orchestrator placement

Brief writer's four questions:
1. **Import warnings cross the IPC boundary.** C3 §3.3 `import_file` now
   resolves with `ImportOutcome { session: SessionSummary, warnings:
   string[] }` (the importer's recovered warnings, incl. truncation), not a
   bare `SessionSummary` — a catalog row must not carry per-import state,
   and dropping the warnings violates CLAUDE.md §5. `app/src/ipc/import.ts`
   and the Data tab's `importDriver` adapt in a lead shell task on `main`
   (both lanes are merged); Task 9 implements the new shape. C3 §3.3 amended
   by the same transcriber pass as R59.
2. **`import_collision` is a new C3 §2 row** (`ImportErrorKind::Collision`:
   re-import of a different blob under an existing session id), R44
   precedent — never fold into `conflict`.
3. **Task-numbering collision.** The deferred FIT/GPX speed/heading follow-on
   that SPEC §15a and the plan call "Task 8" is renamed **"L2 follow-on S/H
   (post-archive)"**. L2 Task 8's scope is widened to include editing
   `docs/IDL0_SPEC.md` §15a in the idl1-app L2 worktree (it is the lane's
   docs task): the rename, the `import_with_hook` residue (killed by L2-R12),
   and the `parse_*`→`import_*` kind-prefix error.
4. **L5 Task 9 runs in the idl-rs L2 worktree/branch** (one repo; needs
   Tasks 6/7's exact signatures). Merges with L2.

**L6 Task 8's obligation 1 (BoundChannel registry → rebind on rebuild):**
nothing yet owns a `SandboxHost` and the cells' viewport/cache state
together. Ruling: that orchestrator is **Task 13's** (open/evaluate/render
owns the notebook lifecycle) — a `host/NotebookSession.ts` holding the
`SandboxHost`, the `TileCache`, and a per-cell registry of bound channels +
viewport, wiring `onChannelsInvalidated` → `rebindChannelsAfterRebuild` →
`setChannelHostVar`. Task 8 is complete as committed (`f143545`).

**Cost if wrong:** (1) changes a wire shape two landed TS files depend on —
one shell task, both call sites known. (3) is prose. The orchestrator
placement is reversible until Task 13 lands.

## 2026-09-05 — Checkpoint: second session-limit cutoff, three tasks resumed

At 13:31 local the account's session limit cut off three implementers
mid-task (L2 Task 6 in the idl-rs worktree; L6 Task 9 and L7b Task 9 in
their idl1-app worktrees). All committed work was intact; each worktree held
coherent uncommitted WIP (L6/L7b believed complete, mid-gate; L2 mid-build).
Resumed at 17:19 with fresh implementers told to inherit, verify and own the
WIP rather than redo it, and to commit the inherited work before merging
`main` so the two stay separate commits. State at the cutoff: idl1-app
`main` `928ef7f` (L7a, L7c and shell tasks 1–3 landed; TS suite 207
passed); idl-rs L2 branch at `227d3f1` (Tasks 2–5 reviewed CLEAN); L6 at
`95d291d` (Tasks 1–8 + fixes); L7b at `7fd009e` (Tasks 1–8 + fixes). No
cargo process was left running. Lesson carried: a cutoff costs nothing when
every task commits per step and the lead snapshots worktree state
immediately; the first resume of the day used the same pattern.

## 2026-09-05 — R61: R23 Q2's synthesizer fallback reaches `SessionHandle::from_channels`

L2 Task 6 landed the Q2 fallback (no channel with a positive rate ⇒ `Time`
from the longest channel's real `t_us`) and the lane gate exposed one
consequence outside the task's file list: `session::handle::tests::
resident_bytes_counts_columns_times_and_math_store` encoded the pre-Q2
exception ("event-only session → no Time", 240 bytes) and now sees the
synthesized `Time` (400 bytes). `SessionHandle::from_channels` calls
`synthesize_base_channels` directly, so — with `session_source::load_session`
— every event-only session loaded through the Tauri path now carries `Time`.
That is the intended Q2 outcome. **Ruling:** the implementer edits that one
test in `handle.rs` in the same commit (assertion and comment restated as
the rule), the gate re-runs, and the reach is recorded here. Not a new
design call.

**Cost if wrong:** none beyond Q2's own; the test now documents the rule.

## 2026-09-05 — L7b LANDED (Device tab, wave 2)

Merged `wave2-l7b-device` into idl1-app `main` (`--no-ff`, `a10b3ea`); no
conflicts (the lane had merged `main` last). Lane: Tasks 1–9 plus seven
follow-ups. Reviews: nine, all CLEAN after follow-ups. Merge gate on `main`:
`tsc` clean, whole TS suite **330 passed / 0 failed** (46 files).

**Shipped:** connection reducer over the real `ble_scan`/`ble_connect`
("last attempt succeeded", R53 Q4); the config model with lenient parse and
Repairs, never silent snapping; the validator (rate tables, pin rules,
R58 nullable pins with "pin unassigned" and non-negative checks, IMU
mode-flag warning); enable/rate/unit sources preview only (R53 Q1 — no wire
arithmetic in TS, swept lane-wide at the gate); channels table with SPEC §3
registry names and a visible "no config loaded" banner; six forms + the
add-channel picker, every control through pure `edit.ts`; in-memory profiles;
validate-then-serialise push over the real `push_config` with the device's
own rejection reason; device files list/download with no import handoff
(R53 Q3); hero card showing "unavailable" for fields the firmware does not
report (R59 Q6). **Outstanding for the Rust write lane:** `device_status`,
`device_control` (+ the new `device_rejected` kind), `pull_config`, profile
persistence, `preview_channel_registry`, a managed connection. **Parity
gaps** per TASKS.md. **For Isaac (SPEC §8):** IMU defaults, mode-flag
exclusivity, valid pin sets, the four firmware status fields.

**Cost if wrong:** additive tab behind its own directory; a regression is a
revert of one merge commit.

## 2026-09-05 — R62: cursor readout debounces on pointer stop, not on the gesture settle

L6 Task 10 hung the cursor readout off Task 8's viewport-settle callback,
as its brief said; the reviewer noted that callback fires only after a
pan/zoom, so a plain hover-and-stop never produces a readout. Design §6 says
"cursor readouts fire once on cursor settle (debounced), never per move" —
cursor settle is its own trigger. **Ruling:** the readout gets its own
`makeSettle` instance keyed to pointer position (default 150 ms, a named
constant with units), with its own sequence for the stale guard; the
viewport settle also refreshes it (the picture moved under a still pointer);
still exactly one IPC per settle, none per move. The brief was wrong, not
the implementer. Fixed in the Task 11 follow-up.

**Cost if wrong:** a second debouncer of the same tested shape; one more
IPC per hover-stop, which is design §6's stated budget.

## 2026-09-05 — R63: L8w write-amendment lane plan adjudicated (3 questions)

Plan: `docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`
(14 tasks; App group first; opens only after L2 + L5 Task 9 merge — gated by
grep). Rulings:

1. **`device_rejected` may be unreachable on the desktop transport.**
   `BtleplugBle::send_command`'s own doc says Windows's `winrtble` backend
   never surfaces SPEC §7.2's ACK byte, only `Ok(())` or a generic `Ble`
   error (L4's known Windows ACK-byte gap, SPEC §14a). Ruling: ship the kind
   as specified and map it wherever the transport *does* surface an
   `AckCode` (mobile plugins, a future desktop backend); never parse error
   text to fake it; `TODO(idl0)` at the transport boundary. The Device tab
   already handles the generic `ble` kind honestly.
2. **`preview_channel_registry` covers the SPEC-fixed subset only** (IMU,
   wheel, pressure, HR channel ids per §5.2); configured analog/digital
   channels have no fixed wire id. **For Isaac:** are generic channel ids
   deterministic from config order (then the preview can compute them), or
   assigned by the firmware at boot (then only the parser knows)?
3. **`fetch_fft` averaging.** C3 names `"none" | "max"`; landed
   `idl_rs::fft::Averaging` has `Mean | Median`. Ruling: extend the core enum
   with `None` and `Max` (physics stays in core, additive), and amend C3's
   union to `"none" | "mean" | "median" | "max"` so nothing landed is hidden
   from the wire. Applied to C3 by the lane's Task 12 as spec-during.

Task 6's managed connection must verify `BtleplugBle` is `Send` behind
`Arc<Mutex<_>>` in `tauri::State` and STOP if not — as the plan says.

**Cost if wrong:** (1) a kind nobody raises on desktop yet — harmless; (2)
a narrower preview than idl0's; (3) two enum variants and a widened union,
both additive.

## 2026-09-05 — Tracked note: math builtin catalog is a hand copy in TS

L6 Task 11's `model/functionCatalog.ts` (69 builtins for the code pane's
highlighting/completion) is a hand-transcribed copy of the catalog Rust owns
in `rust/core/src/math/eval.rs`; the brief forbade reading `rust/` for that
task, so no cross-check exists. **Ruling:** not a wave-2 blocker (it only
affects highlighting and completion, never evaluation), but drift is the
same class of bug R53 Device Q1 was about. Filed for the L8w write lane as
an additive command `list_math_builtins() → { name, arity, unit_rule }[]`
(C3 §3.4); the UI then verifies its local catalog against it once at
startup and logs a mismatch, and later drops the local copy. Added to the
L8w plan's open items by the lead.

**Cost if wrong:** a builtin highlighted wrong or missing from completion
until the command lands; evaluation is unaffected.

## 2026-09-05 — R64: L8w Task 6–14 briefs; overlay laps are same-session; `list_math_builtins` drops `unit_rule`

1. **`eval_workbook`'s `lap_context.overlay_laps` are laps of the same
   session in wave 2.** The brief writer found `MathLapContext.overlay` needs
   a second session's lookup, which C3's `LapContext { main_lap,
   overlay_laps[] }` (R52 Q5) cannot name. Ruling: wave 2 supports overlay
   within the selected session only (idl0's cross-session "compare with" is
   already a deferred parity gap, R53 Data Q4/L7a). `variance_time`/
   `variance_dist` work within-session; a wave-3 amendment adds
   `overlay: { session_id, lap }[]`. C3 §3.4 gains one sentence saying so
   (L8w Task 9, spec-during).
2. **`list_math_builtins` ships `{ name, arity: number[], status }`** —
   `unit_rule` is dropped: no source defines its vocabulary, and shipping a
   free-form placeholder in a signed contract would make the placeholder
   policy. `status` is `"implemented" | "not_implemented"` (C2 §3.3's 63/6
   split, matching L6's catalog). A unit-rule field is a future additive
   amendment once C2 states unit propagation rules per builtin.
3. **`pull_config`: a device-reported config error (0x81 on read) maps to
   the `config` kind** (C3 §2: the device rejected/has no valid config);
   transport failures stay `ble`.
4. **`IDLH` is 24 bytes** (R59 Q3). L6 has not shipped a decoder for
   `fetch_host_channel` (Task 13 stubs it), so nothing conflicts; L6's
   Task 13/16 decoder is written against C3, not the 20-byte filing.
5. Task 8's pressure channels (20/21) emit no preview row until SPEC §8's
   config example states their scale/offset source — added to the Isaac
   list as a sub-item of question 5.

**Cost if wrong:** (1) cross-session variance waits a wave — visible as a
listed gap. (2) one field fewer on an additive command. (3)/(4) contract
readings, reversible in a line.

## 2026-09-05 — L2 LANDED (importers, wave 1) + L5 Task 9 (import commands)

Merged `wave1-l2-importers` into idl-rs `main` (`--no-ff`, `7317992`) and
its docs branch into idl1-app `main`; submodule pointer bumped (`f30df83`).
Lane gate (Task 8, foreground): `cargo check -p idl-rs-cli --tests`
Finished; `cargo check -p idl-rs-tauri` Finished; `cargo test -p idl-rs
-p idl-rs-cli -- --test-threads=4` → idl-rs **899 passed / 0 failed / 1
ignored**, integration 1, idl-rs-cli 51 — **951 total**. Reviews: Tasks 1–7
and L5 Task 9 all CLEAN after follow-ups.

**Shipped:** SPEC §15a; `Importer` trait + typed `ImporterError`; GPX, FIT
(`fitparser` 0.9, epoch offset not double-applied), CSV importers — all
storing GPS as decimal degrees (R27); `store::import::import_file` over the
shared blob/parquet/`session.json` pipeline with warnings preserved (R60),
the post-import hook, the R23 Q2 synthesizer fallback (reach recorded, R61);
the importer registry (R51 Q2); the Tauri `list_importers`/`import_file`
commands returning `ImportOutcome { session, warnings }` with every error
kind mapped (incl. `import_collision`). **Deferred:** the FIT/GPX
speed/heading direct path ("L2 follow-on S/H (post-archive)") until Isaac's
archive; incremental catalog insert (R51 Q4, `TODO(idl0)`).

**Process notes:** Task 8's implementer re-ran the full suite three times
(an output-capture mistake, self-reported; byte-identical results) — the
brief for L8w's gate says `tee`, not rerun. The lane survived two
session-limit cutoffs with no lost work.

**Cost if wrong:** import is now a real end-to-end path from the Data tab;
a regression is a revert of two merge commits and a submodule pointer.

## 2026-09-05 — R65: Properties pane axis-label suggestion uses C1's `unit`, not a quantity table

L6 Task 12 stopped (CLAUDE.md §1): the brief asked for axis labels suggested
from C2 §3.4's unit table keyed by physical quantity, but the form's
`channels` prop is `{ id, label }` and no TS port of a quantity→unit table
exists. **Ruling:** no quantity table in TS — unit *conversion* is a number
the engine owns (CLAUDE.md §2) and is a wave-3 item. `channels` gains
`unit?: string`, C1's per-channel `unit` string as `get_session`'s
`SessionDetail.channels[].unit` reports it; the form suggests the axis label
as `"<label> (<unit>)"` when present and leaves the field editable;
`unitsPreference` is honoured only where the unit string itself differs by
preference (none in wave 2 — documented). Task 13 (which owns the notebook
orchestrator and calls `get_session`) threads the unit through.

**Cost if wrong:** a label suggestion, editable by the user; no number
changes.

## 2026-09-05 — L8w four-task gate (after Task 4): PASS

Foreground, once, from `874fbec`: `cargo test -p idl-rs-tauri` → **130
passed / 0 failed** (1 doc-test ignored, pre-existing); `cargo test -p idl-rs
-p idl-rs-cli -- --test-threads=4` → idl-rs 899 passed / 1 ignored, doctests
1, idl-rs-cli 51. Tasks 1–4 (BOM strip, settings/data-dir, profiles,
`read_workbook`) all on the branch; Tasks 1 and 3 reviewed CLEAN, Task 2's
two test-coverage Importants queued as Task 4's follow-up. Note for brief
writers: `cargo test` filters are substrings of the full test path; this
crate nests tests under `commands::<module>::tests::`, so a filter like
`commands::workbook::read_workbook` matches nothing — name the test-fn
prefix (`read_workbook_via`) or the module (`commands::workbook::`) instead.

## 2026-09-05 — R66: L6 Task 13 landed; js cells must bind to ChartCell (new Task 13b)

Task 13 (three commits: reducer/driver/orchestrator `a61ab5c`, render +
inline spans `8fb068e`, coverage `ae04242`) shipped open/eval/render, the
R60 `NotebookSession` orchestrator (built, tested, but with nothing yet
populating its `BoundChannel` registry), math/table/prose cells and inline
`${…}` spans routed through a new `evalInline` sandbox message. Four
resolved-or-flagged ambiguities, ruled:

1. **js cells render as a plain mount of the sandbox's HTML, not through
   `ChartCell`.** The implementer cut scope rather than guess the binding.
   Ruling: this is M1's core ("Plot charts with real pan/zoom/hover"), so it
   lands in wave 2 as **Task 13b**, before Task 15: for a js cell whose code
   `plotForm.parse`s (form-generated), bind `marks[*].channel` (+ lap scope)
   into `NotebookSession.setBoundChannel`, mount `ChartCell` with the
   per-cell viewport/tile pipeline (Tasks 6–10), and keep the plain mount
   for custom-code cells (`parse === null`). Brief to be written from the
   Task 13 report.
2. **Inline-span errors reuse `cellError` with the span id in the `cellId`
   slot.** Ruling: add a distinct `spanError { spanId, message }` message
   (Task 13b) — one type per meaning, no overloads on an id field.
3. **No workbook picker; the first `listWorkbooks()` result opens.** Ruling:
   acceptable for wave 2 until Task 15 (editor shell) adds a picker over
   `listWorkbooks` as local state; no shared-state slice.
4. **Inline spans re-evaluate on every cell-set/markdown change**, not on
   the Runtime's reactive re-run. Acceptable for wave 2; stated in the code.
   True reactivity is a Task 16 note for the SPEC.

**Cost if wrong:** 13b is one more task in the lane's critical path; without
it wave 2 has no interactive chart, which is the milestone.

## 2026-09-05 — R67: `WorkbookEvent` gains `hash` so the notebook can suppress its own writes

C4 §4 requires self-write suppression on the workbook watcher; C3 §3.4's
landed `WorkbookEvent` carries only `kind` and `cell_ids`, so the UI cannot
tell its own save's event from an external edit (L6 Task 14's brief flagged
it; a heuristic on timing would be a guess). **Ruling:** additive C3 §3.4
amendment — `WorkbookEvent` gains `hash: string`, the `sha256_hex` of the
file's bytes after the change, computed by the Rust watcher with the same
helper `read_workbook`/`save_workbook` use. The UI suppresses an event whose
`hash` equals the hash returned by its own last successful `save_workbook`
(which returns the new hash — confirm; if not, that return is part of the
same amendment). Implemented by L8w as **Task 4b** (watcher, `commands/
workbook.rs`, C3 text spec-during); L6 Task 14 codes the suppression against
the amended shape behind a typed seam that treats a missing `hash` as
"unknown ⇒ reload" until the Rust lands.

**Cost if wrong:** one extra field on an event; without it every own save
triggers a reload and a flash, which is the bug C4 §4 exists to prevent.

## 2026-09-05 — R68: catalog SQL stays in core; the Tauri crate does not depend on rusqlite

L8w Task 5's brief said "do not add a new core pub fn for a single DELETE",
so the implementer put `DELETE FROM sessions` in `tauri/src/commands/
catalog.rs` and added `rusqlite` as a direct dependency of `idl-rs-tauri`.
That contradicts CLAUDE.md §2 (bytes on disk → core; the Tauri crate is thin
glue) — the brief was wrong. **Ruling:** add `pub fn delete_session(conn,
session_id) -> Result<bool, CatalogError>` to `core::store::catalog` (one
statement, cascades documented, tested there), call it from the command, and
drop `rusqlite` from `tauri/Cargo.toml` (`Cargo.lock` follows). Because this
is a `pub` addition in `core`, `cargo check -p idl-rs-cli --tests` runs.
The `map_session_json_error(e, path)` signature change is confirmed (the
path in the message was the lead's own requirement).

**Cost if wrong:** a second SQL surface outside the store would let the
schema drift from its owner; the fix is mechanical.

## 2026-09-05 — R69: cell outputs render inside the sandbox iframe; the host never injects sandbox HTML

L6 Task 13's review found `index.tsx` rendering a js cell's result with
`dangerouslySetInnerHTML` from the sandbox's serialised `cellResult.html`.
That crosses the security boundary design §6 draws: the sandbox iframe has
no `allow-same-origin` precisely so cell code cannot reach the host origin
(which holds Tauri IPC); HTML the sandbox produced, injected into the host
DOM, can carry event-handler attributes that run in the host. Sanitising is
the wrong fix — the design already says where outputs render: "The Runtime,
Inspector, Plot, D3 and Inputs are bundled into the iframe."

**Ruling:**
1. Cell outputs (js results, Plot SVG, Inspector values, inline-span
   values) render **inside the sandbox iframe**, one iframe per notebook,
   in a cell-output list the sandbox owns, keyed by cell id. The host never
   receives output HTML; it receives `cellRendered { cellId, heightPx }`
   (and errors as text) to lay out its frame around each output. `cellResult
   .html` is removed from the protocol.
2. The host keeps what is host-side by design: gestures, the tile cache,
   settle-bound fetch, cursor readout, the Properties/Code panes. During a
   gesture the host posts a `transform { cellId, translateXPx, scaleX }`
   message per frame (same-machine `postMessage`, not Tauri IPC — P3/P4
   hold) and the sandbox applies it as a CSS transform on that cell's Plot;
   on settle the host sends fresh channel data as today.
3. `ChartCell` becomes the host-side frame (gesture layer + orchestration)
   around the iframe-rendered output; its own canvas polyline is retired
   once the sandbox path works.
4. Prose cells: Markdown → HTML is text processing core already owns
   (`pulldown-cmark`); `eval_workbook`'s prose `CellOutput` gains `html`
   with `${…}` spans left as placeholder elements by id (additive C3 §3.4,
   **L8w Task 4c**); the sandbox fills the placeholders. Until it lands,
   prose renders as plain text with the spans filled — stated, not hidden.

Implemented by L6 **Task 13b** (which already owns the js-cell binding) with
the multi-channel case now natural (the cell's own Plot code sees every
bound channel). Task 13's plain-text prose and `dangerouslySetInnerHTML`
are removed there.

**Cost if wrong:** a heavier 13b; the alternative is a hole in the one
security boundary the app has.

**R67 addendum (2026-09-05):** the brief writer found `ExpectedHashSet` already suppresses the app's own saves in Rust before an event is built (existing test). `WorkbookEvent.hash` is therefore defence in depth for the UI (and lets the UI reason about external edits), not a fix to a live Rust gap; the joint self-write test is dropped as unwritable through the real path (ruled in `brief-task4b.md`).

## 2026-09-05 — R70: prose HTML crosses the wire as two fields with a span list; one span scanner

L8w Task 4c's brief writer found (a) C2 §2.4 / the landed `CellDoc` carry
prose as `prose_before`/`prose_after`, so a single `html` field would have
to pick one; (b) core already has a correct, tested `${…}` scanner
(`workbook/v3/js_cell.rs::find_inline_exprs`) with no callers, while the
frontend's `ProseSpan` uses a plain regex that numbers spans differently
inside inline code. **Ruling:** `CellOutput` gains `prose_before_html:
string | null`, `prose_after_html: string | null` (mirroring `CellDoc`) and
`prose_spans: { id, expr }[]` in document order from `find_inline_exprs`,
each rendered span a `<span data-span-id="…">` placeholder. Core's scanner is
the only scanner: L6 Task 13b/15 drop the TS regex once this lands (interim
seam until then). Raw HTML in prose is escaped (pulldown-cmark passes it
through by default — intercepted, hand-escaped, no new dependency). R21's
`CellOutput` doc comment finally matches its struct.

**Cost if wrong:** two fields and a list instead of one string, all
additive; the alternative keeps two scanners that disagree.

## 2026-09-05 — L8w second four-task gate (after Task 4c): PASS

Foreground, once, tee'd, from `c383d4c`: `cargo test -p idl-rs-tauri` →
**149 passed / 0 failed**; `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` → idl-rs 905 passed / 1 ignored, integration 1, cli 51.
Covers Tasks 5, 4b, 6, 4c. Task 4c also corrected its own brief's escaping
pseudocode (pulldown-cmark already escapes `Event::Text`; the hand-rolled
escape double-escaped) — caught by the required test on first run.

## 2026-09-05 — Checkpoint: third session-limit cutoff (10:10pm ET reset)

Cut off mid-flight: `l6-task13b` (its three commits `5706b80`, `ef34b73`,
`6223a66` are on the L6 branch, final gate run unreported), `l8w-review4c`
(no findings written), `l8w-task7` (had not started). No work lost. The
"dev app killed for low memory" notification was the background task
wrapper, not the app: at 10:40pm the `cargo run` → `app.exe` tree from the
6:22pm preview was still alive holding the cargo slot; the lead stopped it
(Isaac's earlier "close the app that's running"). Re-dispatched: 13b
verify-and-report + Task 14 minors, 4c read-only review, Task 7.

## 2026-09-05 — R71: `pull_config` `config` kind is unreachable until transport tags 0x81; transport fix is a follow-on, not Task 7

L8w Task 7 (`a23553a`) found that `read_config` routes every failure,
including the device's "no config file" ack 0x81, through
`idl-transport`'s `ble_error()` helper, so `TransportErrorKind::Config`
(and hence C3's `config` kind, R64.3) is never produced today. The tauri
side already maps it through the blanket `From<TransportError>`; no tauri
code can fix this without matching on message text (forbidden).
**Ruling:** Task 7 lands as pass-through. The transport change (tag the
0x81 ack as `TransportErrorKind::Config` at the point the ack code is
known, one test) is **L8w Task 7b**, in `rust/transport/` only, after
Task 12b and before the lane gate. Shared 10 × 200 ms poll budget for
start/stop logging and WiFi-on is accepted (no distinct figure exists).
The explicit-disconnect ruling from review-task6 landed in the same commit.

**Cost if wrong:** the Device tab shows "BLE error" instead of "no config
on device" for a fresh SD card until 7b lands; nothing is lost.

## 2026-09-05 — R72: the bound-channel registry holds every channel of a js cell, not the first

The 13b fix (`5956185`) sends every bound channel's data to the sandbox but
registers only `channels[0]` with `NotebookSession.setBoundChannel`, so on
gesture settle only the first channel is refetched and a two-channel js
cell desyncs after a pan/zoom — the same class of bug the review graded
Critical, one step later. **Ruling:** the registry is per cell a list of
`BoundChannel`s (`setBoundChannels(cellId, BoundChannel[])`), settle
refetch and rebuild replay iterate it, and the `TODO(idl0)` placed by the
fix is removed. Landed as **L6 Task 13c** before Task 15.

**Cost if wrong:** one small module change now; the alternative ships an
editing surface whose multi-channel cells go silently wrong after the
first zoom.

## 2026-09-05 — R73: `eval_workbook lap_context.overlay_laps` — first entry drives `MathOverlay` until lap indexing lands

L8w Task 9 (`46d6b63`, C3 note `f72a438`) found `MathOverlay` models one
lap window while `overlay_laps: u32[]` can name several. **Ruling:** the
first entry is the overlay window, documented on `load_lap_context`; the
multi-overlay shape (a `Vec<MathOverlay>` or an amended `MathOverlay`) is
decided in the same amendment that ships lap indexing at import (Rust
backlog), because until then `laps[]` is always empty and the path is
unreachable. `session_id: null` with a `lap_context` present ignores the
context silently, consistent with every other session-scoped field.

**Cost if wrong:** a math cell over three overlay laps evaluates one of
them; visible the day lap indexing ships, and fixed in the same amendment.

**R73 note (review-task9, Minor):** the overlay path clones the whole
`SessionHandle` into a fresh `Arc` instead of sharing one; dead code today,
to be fixed by the lap-indexing task that makes it reachable.

## 2026-09-05 — L8w third four-task gate (after Task 10): PASS

Foreground, once, tee'd, from `d06067d`: `cargo test -p idl-rs-tauri` →
**173 passed / 0 failed**; `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` → idl-rs 914 passed / 1 ignored, integration 1, cli 51.
Covers Tasks 7, 8, 9, 10 (+ review-task8 minor `fde52f4`). Task 10 note:
C3 §3.4's "name sanitises to empty → invalid_argument" branch is
unreachable with the shared sanitiser (it falls back to `workbook`); the
check stays as defence, documented, and the C3 text is corrected in Task 14's
wrap-up rather than now.

## 2026-09-05 — R74: `CellList` gains a per-cell frame hook so every cell kind is selectable (L6 Task 15)

Task 15's brief lists `index.tsx` as the only existing file to modify, but
the landed `CellList.tsx` renders math/table/prose inline with no per-cell
hook, so only js cells (rendered through `renderJsCell`) could open the
editor. **Ruling:** option (a) — `CellList` gains one optional wrapper prop,
`frame?: (cell: CellDoc, output: ReactNode) => ReactNode`, identity by
default (existing tests unchanged), applied to every kind; `index.tsx`
passes `CellFrame` through it. Not (b) re-implementing the iteration in
`index.tsx` (orphans Task 13), not (c) js-only selection (contradicts
D13's Code-only editor for non-js cells). A brief's file list is scope
guidance inside the lane's own directory, not a wall; the deviation is
named in the commit message.

**Cost if wrong:** one optional prop on a lane-owned component.

## 2026-09-05 — R75: front matter is serialised by core, never hand-built

review-task10 (Critical): `create_workbook_via` interpolates `name` into a
`format!`-built YAML block, so "Wheel: front" yields an unreadable file and
"Test #1" a silently truncated name. **Ruling:** core owns the inverse of
`parse_front_matter` — `workbook::v3::front_matter::render_front_matter(&FrontMatter) -> String`
(serde_yaml_ng, already a core dependency; `Serialize` on `FrontMatter`),
with a round-trip test through `parse_front_matter` for names containing
`: `, ` #`, quotes, a newline and leading/trailing spaces. `create_workbook`
calls it; no `format!` of YAML anywhere in tauri. Adds core `pub` surface
→ `cargo check -p idl-rs-cli --tests`. Lands as the Task 10 fix commit
before Task 12.

**Cost if wrong:** one serialiser in core; the alternative silently
corrupts user-named workbooks on creation.

**Tracked (L8w Task 11, `a20b41f`):** no TS `IDLH` decoder exists in main
or the L6 branch (L6's IPC-NEEDS N3 filing named a stale 20-byte header).
Lead shell task after L8w merges: add `app/src/ipc/` decoder for the
24-byte layout (copying via DataView, per C3 §3.5) and wire L6's host
channel seam to `fetch_host_channel`.

## 2026-09-06 — L6 Notebook LANDED (merge `e182b0a`); shell task retires page shims

L6 gate from `774066e`: `tsc` clean, whole TS suite **78 files / 590
passed**, `vite build` 843 modules (both entries: main + notebook sandbox;
chunk-size warning informational). Merged `main` into the lane first (R19,
no conflicts), then `--no-ff` into main. Shell task on main: `App.tsx`
imports `routes/pages/{Notebook,Device,Data,Settings}` directly; the four
`*Page.tsx` re-export shims deleted; gate re-run on main, same counts.

review-task16's "Major" (the `editorEcho.ts` doc-comment fix was outside
Task 16's file list and unnamed in the commit) is **overruled**: the lead's
dispatch directed that fix; recorded here instead. Its two Notes (legacy
sections cite removed `§26.x` numbers, incl. the Controls table's `§26.7`)
go to the L10 cross-lane pass. Open from the lane: FFT chart (R52 Q7 ruled
"in", no L6 task built it — wave-2 follow-on L6 Task 17 after L8w lands
`fetch_fft`); the seams listed in `lanes/l6/CONTRACT-AMENDMENTS.md`
swap to real commands in the post-L8w shell tasks. Still not observed:
60 fps pan/zoom on a real session (needs the dev app; Isaac's preview).

**R71 correction (2026-09-06, lead):** Task 7b is withdrawn. Reading
`transport/src/ble_transport.rs` (`send_command` doc, L4): on Windows
btleplug 0.13's `Peripheral::write` returns only `Result<()>`; the SPEC §7.2
ack byte (`0x81` included) never reaches the crate, so no transport code
can tag it `Config` without message-text matching. `config` from
`pull_config` stays unreachable on this platform — same class as
`device_rejected` (R63) — until a BLE stack with ack readback (L9 mobile
plugins). Documented, not built. **Cost if wrong:** unchanged from R71.

## 2026-09-06 — R76: `fetch_fft` `averaging: "none"` means exactly one segment; rate derivation lives in core

review-task12 (two Majors): (1) `Averaging::None` with more than one
segment silently kept the first; (2) `effective_rate_hz_from_t_us` had no
guard, so a degenerate channel produced NaN/Inf bytes. **Ruling:** `none`
requires exactly one segment — more is `invalid_argument` with
`detail: { segments: n }` (the caller asks for a single-segment FFT by
sizing the window to the span); a rate that is not finite and positive,
or a channel with fewer than two samples, is `invalid_argument` before any
FFT runs. The rate derivation (`1e6 / median(Δt_us)`) moves to core
(`idl_rs::fft::effective_rate_hz_from_t_us` or beside the session code
it serves — implementer's call, documented), because it is arithmetic on
sample timestamps and CLAUDE.md §2 outranks the brief's placement. Tests
that exist must be run: the fix's filters cover the `Averaging` arms and
the rate edge cases by name. Lands as the Task 12 fix commit before
Task 13.

**Cost if wrong:** one moved function and two error branches; the
alternative ships silent data loss and NaN spectra.

## 2026-09-06 — L8w fourth four-task gate (after Task 12b): PASS; R64.2 catalog check accepted one-directional

Foreground, once, tee'd, from `7e189a8`: `cargo test -p idl-rs-tauri` →
**188 passed / 0 failed**; `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` → idl-rs 936 passed / 1 ignored, integration 1, cli 51.
Covers Tasks 11, 10-fix, 12, 12b. Task 12b's catalog (69 entries) is
proven ⊆ the real `call_function` dispatch by probing every name through
`math::evaluate` and asserting never `UnknownFunction`; the converse would
need a second name list beside the match — the very copy R64.2 forbids —
so it is not required. A builtin added to `eval.rs` without a catalog row
is caught by the UI's `functionCatalog` verification shell task, not here.

## 2026-09-06 — Checkpoint: C: drive hit 0 bytes free during L8w Task 13's app-crate check

Drive is 459 GB used of ~459 GB (pagefile 36.5 GB, Isaac's Downloads 37.5 GB,
`AppData\Local\Packages` 27.8 GB, `Roaming\Claude` 10.2 GB, idl1-app
`app/src-tauri/target` 12 GB, idl0-app `rust/target` 3.9 GB). The lead
deleted only stale Claude scratchpad directories from finished sessions
(≈2.5 GB, Aug 31–Sep 3) → 5.2 GB free; nothing of Isaac's and no build
directory was touched. Task 13 resumed. **For Isaac:** the machine needs
~20 GB of headroom for Tauri builds; candidates are Downloads, the idl0-app
target directory (rebuildable), and `AppData\Local\Packages`.

## 2026-09-06 — L8w write-amendment lane LANDED (idl-rs `c893ba7`, idl1-app `4bb9cfb` + submodule bump `8fcadc5`)

Lane gate from idl-rs `4207fc7`: `cargo test -p idl-rs-tauri` **189 passed**
(lead ran it at the merge — Task 14 had substituted `cargo check`);
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` idl-rs 943 / 1
ignored, cli 51, doctest 1; `cargo check -p idl-rs-cli --tests` clean.
20 commands added (App 7, catalog writes 2, Device 6, Workbook 4,
`fetch_fft`). Merged into the submodule's `main` (`--no-ff`), then the app
side into idl1-app `main` (CHANGELOG: kept both bullets; the lane bullet's
gate figures corrected to 189/943), submodule pointer bumped. Main TS gate
after `npm install`: 78 files / 590 passed, `tsc` clean. Both L8w worktrees
retired. Next: the post-L8w shell task swapping every UI stub for its real
command, then a Tauri build for Isaac's preview (disk permitting).

## 2026-09-06 — R77: post-L8w shell task rulings (stub swap `d83a14d`…`404d979`)

The shell task (five commits on main, suite 81 files / 625 passed) swapped
every stub that had a one-to-one command and stopped, correctly, at four
seams that need design. Rulings:
1. **Pasted path stays an import path.** The Data import panel keeps its
   tested "paste a path → import" behaviour; the new Browse button opens
   the native dialog beside it (R55's seam). Repurposing the field as the
   dialog's start folder is reverted in the review fix.
2. **Prose HTML renders in the sandbox, never via `dangerouslySetInnerHTML`
   in the host** (R69 holds): the host posts `prose_before_html`/
   `prose_after_html`/`prose_spans` to the sandbox as part of `setCells`;
   the sandbox sets the HTML inside its own document and fills the
   `<span data-span-id>` placeholders from the evaluated spans; before the
   first eval the cell shows its raw prose text (stated fallback). The TS
   regex scanner is deleted then. → **L6 Task 17**.
3. **Host-channel binding** (`fetch_host_channel`): a chart cell whose
   `y` names a workbook definition rather than a session channel fetches
   it on gesture settle through the same run sequencer, budget = the tile
   budget for the viewport width. → **L6 Task 18**. FFT chart (R52 Q7) →
   **L6 Task 19** over `fetch_fft`/`IDLF`.
4. **Device tab live wiring** (`device_status` polled at 1 Hz only while
   the tab is visible and a device is connected; `device_control`
   start/stop logging + WiFi; profiles over `list/save/delete_profile`
   with last-write-wins) → **L7b Task 10**. **Settings persistence** moves
   from localStorage to `get_settings`/`set_settings` behind the existing
   `PrefsBackend` → **L7c Task 8**.

**Cost if wrong:** all four are additive tasks over landed commands; the
shell task shipped nothing wrong, it shipped less.

## 2026-09-06 — R78: follow-on briefs' open questions (runs/2026-09-06/followons/)

**L6 Task 17 (prose) — R77.2 revised.** Q1: prose is document text, not
cell output; R69's boundary exists because *sandbox-produced* HTML is
untrusted. `prose_before_html`/`prose_after_html` are produced by core
(Rust-escaped, R70) and are trusted like any other IPC value, so the
**host renders them** (the one permitted `dangerouslySetInnerHTML`, on
core output only, with a comment saying so) and prose stays selectable,
findable and in the accessibility tree. Span values still come from the
sandbox (`inlineResult`) and are inserted by `textContent` only — never
HTML. Q2: keep `inlineResult` and `spanError`. Q3: a span error shows in
place as text in its span; no banner. The brief's `setProse`/
`layoutProse`/`proseRendered` messages and the five-step replay are
dropped; the TS regex scanner is still deleted and `prose_spans` from
core is the only span list. **Cost if wrong:** if core's escaping ever
regresses, the host renders it — the round-trip escaping test in core
(review-task4c) is the guard.

**L6 Task 18 (host channel).** Q1 (a): definition channels re-fetch on
rebuild; SPEC §26.4's "never re-fetches" clause is amended to say
tile-backed channels are re-derived, definition channels re-fetched.
Q2 (a): a definition-only cell mounts `JsCellFrame`; a mixed cell keeps
`ChartCell`. Q3 (a): `has_t: false` is not bound; the note names it.

**L6 Task 19 (FFT).** Q1 (a): widen C2 §5.3 with an FFT chart production
(chart type + window/hop/window fn/detrend/scaling/averaging in the
document — CLAUDE.md §3, no renderer-only parameters). Task 19 does Steps
1–4 now and stops; the lead drafts the C2 §5.3 amendment; the grammar +
Properties form work is **L6 Task 20**. Q2: its own cell. Q3: the
`JsCellFrame` note slot.

**L7b Task 10 (device live).** Q1 (b): mount scope plus a
`visibilitychange` pause. Q2 (c): after 3 consecutive poll failures show
"link lost?" and keep polling; state unchanged (named constant, comment
says no source fixes it). Q3 (a): explicit Save profile, dirty marker.

**L7c Task 8 (settings).** Q1 (b): `settings.json` wins; only fields still
at engine default are imported from localStorage. Q2 (a): `ui` stays in
localStorage. Q3 (a): a `role="status"` line in the affected section for
migration and `set()` failures.

## 2026-09-06 — R79: C2 §5.3 FFT chart production (draft `runs/2026-09-06/C2-FFT-AMENDMENT-DRAFT.md`) — open questions ruled

Q1 yes: `windowSize`/`hopSize` accept the token `"all"` (whole record;
the only way `averaging: "none"` is expressible without a session-specific
sample count in the document). Q2: one shared pure `spectrumKey(channelId,
fftParams)` for the host variable. Q3: hop in samples (the contract's
unit; the form may display overlap % derived from it). Q4: no grammar
token; a host-side `bin_count` cap with a stated note — a cap is not a
parameter of the picture. Q5: y-label seed "Magnitude (unit)" /
"PSD (unit²/Hz)" per scaling, editable (R65 pattern). Q6: no confirm on
chart-type switch. Q7: one spectrum per cell in wave 2; idl0's multi-trace
overlay is a §26.6 parity gap. The draft is applied to C2 §5.3 as written
with these answers (lead transcription on main); L6 Task 20 implements
grammar + Properties panel after Task 19's Steps 1–4.

**Cost if wrong:** a grammar production is additive; `"all"` is the one
token a later amendment could regret, and it is the honest one.

## 2026-09-06 — Checkpoint: fourth session-limit cutoff (3:03am ET, reset 3:30am)

Cut off: `plan-l6-task20` (not started), `l6-review17` (findings file
present — verdict checked by the lead), `l7b-task10` (WIP on disk in
`wave2-l7b-followon`: `statusPoll/control/profilesSync` + tests,
`DeviceControls.tsx`, `HeroCard`/`ProfileBar`/`connection`/`index`
edits, SPEC §23 mid-rewrite; uncommitted), `l7c-review8` (no findings).
Re-dispatched with inherited state at 6:05am. No work lost.

## 2026-09-06 — R80: L6 Task 20 brief open questions (FFT grammar + Properties panel)

Q1: `x` is required in the FFT arm with a required `type`; Example 5's
omission is an elision (C2 text corrected in Task 20's commit, one line).
Q2: bin cap = 16384, checked against the resolved window before the
fetch and the decoded length after. Q3: three plain sentences in the
note slot, no banner. Q4: `spectrumKey` and the params type live in a
dependency-free module under `plotForm/` importable by both host and
sandbox; nothing under `sandbox/` imports from `ipc/`. Q5: the host
retains the decoded spectrum in a per-cell map and re-pushes it on
rebuild (no re-fetch, no blank) — consistent with R78 Task 18 Q1's
"definition channels re-fetch" only in that both restore state; a
spectrum is small enough to keep. Q6: the first mark's channel survives
a Time → FFT switch.

**Cost if wrong:** constants and conventions, each one line to change.

## 2026-09-06 — L7c Task 8 LANDED (settings persistence; merge into main, suite 83 / 654)

`de6f862` + fix `f9b9189` (unknown engine-nested keys survive write and
migration). Whole TS suite on main after merge: 83 files / 654 passed,
`tsc` clean. Worktree retired.

## 2026-09-06 — L7b Task 10 LANDED (device live wiring; merge into main, suite 86 / 697)

`f1930ca`, review CLEAN. Merged `--no-ff` (CHANGELOG: kept both bullets).
Whole TS suite on main: 86 files / 697 passed, `tsc` clean. Worktree
retired. Remaining wave-2 UI work is L6 Tasks 18–20 in `wave2-l6-followon`.

## 2026-09-06 — Disk: Isaac approved removing build caches

Removed `saucyeng/.cargo-shared-target` (12.3 GB), `idl0-app/rust/target`
(3.9 GB), `idl-rs/target` (1.5 GB) → 16.9 GB free. The app's own
`app/src-tauri/target` kept for the preview build. Question 11 closed.
Wave-3 worktrees cold-compile once; `rust/.cargo/config.toml` still
points them at the shared dir, which cargo recreates.

**Tracked (preview 2026-09-06):** the Notebook opens "the first indexed
workbook" and shows "No workbooks found" otherwise — no New-workbook
action (`create_workbook` exists), no rescan (`rebuild_catalog` exists),
and a workbook file dropped into `workbooks/` is invisible until the
catalog is rebuilt. → **L6 Task 21**: empty state with "New workbook"
and "Rescan", plus a workbook picker when more than one is indexed
(the picker was deferred in R66; both now have their commands).

**Process note (L6 Task 20, 2026-09-06):** the follow-on worktree was cut
before the C2 §5.3 amendment landed on main, so the brief's "already
applied" premise was false in the worktree; the implementer merged main
in (R19) before starting. Rule going forward: a brief that cites an
amendment names its commit hash and the implementer's first step is
`git merge-base --is-ancestor <hash> HEAD` — merge main first if it fails.

## 2026-09-06 — L6 follow-on LANDED (Tasks 17–20); wave 2 UI + Rust work complete

Merged `wave2-l6-followon` (`e63ee2b` prose from core, `4f5099f`
definition binding, `96cdd6f` FFT request/driver, `e7643cb` FFT grammar +
Properties panel; every review CLEAN, Task 20's two Minors cosmetic and
left for L10). Whole TS suite on main: **90 files / 834 passed**, `tsc`
clean. All wave-2 worktrees retired.

Wave-2 gate (operating brief §5): four tabs merged ✔, write lane landed ✔,
UI stubs swapped ✔. Open and tracked: L6 Task 21 (notebook empty state /
New workbook / Rescan / picker); Task 20's Minors and the SPEC `§26.x`
cross-reference cleanup (L10 pass); Isaac questions 1–10 (question 11
closed); 60 fps and end-to-end chart rendering on a real session still
not observed by the lead (preview 2026-09-06: workbook loads, chart cells
blank in the capture with no session selected — awaiting Isaac's look).
Rust backlog unchanged: lap indexing at import; incremental catalog
insert; cross-session overlay amendment; quarantine (wave 3).

## 2026-09-06 — R81: L6 Task 21 brief open questions (notebook empty state / picker)

Q1 (a): rebuild the catalog once per page open only when `list_workbooks`
is empty, show "Looking for workbooks…", re-list. Q2 (a): a Notebook-local
`idl1.notebook.ui.v1` localStorage key with a `// TODO(idl0):` naming the
consolidation into app-wide UI prefs. Q3 (a): the Notebook never writes
`selection`; the "no session selected — choose one in the Data tab" note
stays; (c) a shared default-session resolution in `AppState` is a lead
shell task if Isaac wants a chart without a Data-tab trip. Q4 (a): picker
only above one workbook. Q5 (a): picker disabled while edits are dirty,
with a hint. Q6: Rescan reports `workbooks_indexed` and `duration_ms` only.
Step 1 (the missing "no session" note — the blank cells in the 2026-09-06
preview) and Step 1b (silent `eval_workbook` rejections → typed
`evalError` rendered above the cell list) are confirmed as part of the
task.

**Cost if wrong:** conventions and one conditional each.

## 2026-09-06 — L6 Task 21 LANDED (notebook empty state / picker / no-session note / typed eval errors)

`213b7c3`, review CLEAN, merged `--no-ff`; whole TS suite on main
**93 files / 856 passed**, `tsc` clean. Worktree retired; no wave-2
worktrees remain.

**Tracked (preview 2026-09-06, after Task 21):** prose renders from core's
HTML and the "no session selected" note shows, but only one note is
visible for a two-cell workbook — `JsCellFrame` takes its height from the
sandbox's `cellRendered`, so a frame whose empty Plot reports a tiny
height may clip its own note. Fix: a `minHeight` when a note/error is
present (one style line + test on the pure height decision). Goes with
Task 20's two Minors into the L10 cosmetic pass.

## 2026-09-06 — R82: digest contradictions resolved

`runs/2026-09-06/RULINGS-DIGEST.md` (120 lines) is the file agents read
from now on (operating brief §7.1). Two contradictions it surfaced:
1. **R53 Settings Q1 vs R78 L7c Q1.** R78 stands (`settings.json` wins;
   only engine-default fields import) — the engine file is the durable
   store. R53's "no preference silently lost" is kept by making the loss
   *not silent*: the migration's `role="status"` line must name any field
   skipped because `settings.json` already held a different value.
   → L7c Task 9 (small; with the next Settings change).
2. **R51 Q3** (whether to run `session_source` tests at the L2 gate) is
   moot: every L8w gate ran the whole `idl-rs-tauri` suite (149 → 189
   passed), which includes `session_source::tests`.

## 2026-09-06 — L10 cosmetic pass LANDED (`80e4307`; lead spot-check per §7.4)

Task 20 Minors, `JsCellFrame` min height (96 px, a judgment constant —
no spec number) via pure `resolveJsCellFrameHeightPx` + 4 tests, SPEC
`§26.x` cross-references repointed (the Controls table's reference now
points at §27.10, where that content actually lives). Whole TS suite on
main: 94 files / 860 passed.

## 2026-09-06 — R83: L2b lap-indexing lane (plan `runs/2026-09-06/lanes/l2b-laps/PLAN.md`) — open questions ruled

The lap algorithm, `LapJson`/`SectorJson`/`TrackVisitJson` and the
catalog's `laps`/`lap_summary` indexing already exist in core; the gap is
that `finish_import` writes an empty `laps[]`. Rulings on the plan's
questions: laps live in `session.json` as a stamped cache (C1 §6 already
says so; content-addressing governs derived sample arrays, not this);
`lap_detector_version` is added to C1 §6, additive, no schema bump; on a
re-index that renumbers laps, lap flags that no longer resolve are cleared
(logged in the report, never guessed); `visit_id` is deterministic so a
rescan does not churn a synced file; import re-indexes on the skip plan
only when a stamp is stale; R73's shape becomes `overlay: Vec<MathOverlay>`;
`fetch_fft`'s lap window comes from a `resolve_lap_window` sibling;
`rescan_tracks` belongs in this lane. Eight serial tasks, gates after T4
and T8, worktrees `idl-rs-worktrees/l2b-laps` (submodule repo) and
`idl1-app-worktrees/l2b-laps` (C1/C3 text). Isaac's question 7 stands as
asked; this lane is the answer to "keep going".

**Cost if wrong:** one extra field in C1 and a cleared flag — both
visible, both cheap to revisit.

## 2026-09-06 — L7c Task 9 LANDED (`d8d34a8`, lead spot-check: ~60-line pure change + notice)

Skipped migration fields are named with both values; R53's "no
preference silently lost" holds again. Whole TS suite on main: 94 files /
863 passed.

## 2026-09-06 — R84: `index_session` inserts its own blob row (L2b Task 4)

`sessions.blob_sha256` references `blobs(sha256)` under
`foreign_keys = ON`, and `blob::write_blob` never touches the catalog, so
an incremental `index_session` after import would fail the FK on a
catalog built before the import. **Ruling:** option 1 — `index_session`
verifies/inserts the one `blobs` row for the session's own blob (the same
per-file logic as rebuild step 1, scoped to that hash), in the same
transaction as the `sessions`/`laps`/`lap_summary` rows. "One import
updates one session" means its blob row too. **Cost if wrong:** one
insert-if-missing.

## 2026-09-06 — L2b first four-task gate (after Task 4): PASS

From idl-rs `3be4eb8`: `cargo test -p idl-rs-tauri` **189 passed**;
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` idl-rs 976 / 1
ignored, cli 53. Covers Tasks 1–4 (+ R84). `index_session` treats a
missing `session.json`/`data.parquet` as `NotFound` (it names one session
the caller expects to exist) — accepted.

**Tracked (L2b Task 5):** post-lane TS shell task — `app/src/ipc/catalog.ts`
`LapDetail.sectors: LapSector[]` (`name, start_ms, end_ms, start_time_secs,
end_time_secs`) and `neutral_zone_visits: LapNeutralZoneVisit[]` (`name,
enter_ms, exit_ms`) replacing `unknown[]`; Data tab lap tables consume them.

## 2026-09-06 — R85: `fetch_fft`'s few-sample guards run on the lap window, not the whole channel

review-task6 (Major): a 1–2-sample lap window bypassed R76's guards
because the rate/sample-count check ran on the whole channel before the
slice. **Ruling:** slice first, then run the existing core guards
(`effective_rate_hz_from_t_us`, `check_none_averaging_segments`) on the
window's own `t_us`/sample count — no core change, no new error kind;
`InvalidSampleRate` → `invalid_argument` as today. Tests: 1-sample and
2-sample lap windows ⇒ `invalid_argument`. Lands as the Task 6 fix
commit before Task 8. **Cost if wrong:** one call reordered.

## 2026-09-06 — L2b lap-indexing lane LANDED (idl-rs `81a7db3`; idl1-app merge + submodule bump)

Eight tasks, every review CLEAN after fixes (R84, R85). Lane gate from
`95e11d0`: tauri **211**, idl-rs **983** / 1 ignored, cli **53**. Import
now indexes laps (stamped cache in `session.json`, incremental catalog
`index_session` with its own blob row), `rescan_tracks`/CLI `rescan`,
typed `LapDetail.sectors`/`neutral_zone_visits`, `fetch_fft lap`, and
multi-overlay `MathLapContext` (R73 closed). Worktrees retired. Next: the
TS shell task (`ipc/catalog.ts` types + `rescanTracks`, Data lap tables and
Rescan button, Notebook lap context now live, Task 6's `fetch_fft lap` from
the FFT form).

## 2026-09-06 — R86: L8x Data-tab write commands (plan `runs/2026-09-06/lanes/l8x-data-writes/PLAN.md`) — open questions ruled

Q1 yes: the lane builds the quarantine producer (`verify_data_dir(repair)`
per C4 §7) — no permanently-empty command in a signed contract. Q2 yes:
`"retry"` → `"restore"`. Q3 yes: `TrackDetail` on the wire in decimal
degrees (no ÷1e7 in JS). Q4: one `save_track` with nullable `track_id`.
Q5 yes: write commands return `stale_session_ids`; the user triggers
`rescan_tracks`. Q6: duplicate sector/neutral-zone names allowed (display
labels). Q7 no: the track editor UI stays out (R54); shell tasks stop at
name, venue, delete. Q8: `verify_data_dir` in the App group. Correction
accepted: import is not a quarantine producer (it reads from outside the
data dir); C4 §7 verify-repair is. Worktrees `l8x-data-writes` in both
repos; Task 1 (docs, spec-first) is lead-spot-checked.

**Cost if wrong:** contract text and one enum token; all additive.

## 2026-09-06 — Lap shell task LANDED (review CLEAN; main suite 95 / 885)

Typed lap details on the wire, Data lap tables render sectors/neutral
zones, "Rescan tracks" button + report, FFT `lap` from the selected main
lap, stale "until lap indexing lands" comments removed. Laps are live
end-to-end: import → session.json → catalog → Data tab / Notebook.

## 2026-09-06 — L8x first four-task gate (after Task 4): PASS

From idl-rs `01b0f3f`: tauri **221**, idl-rs **1004** / 1 ignored, cli 53.
`upsert_track` is an `ON CONFLICT DO UPDATE` (a delete+insert would null
`laps.track_id` on every edit — regression test added). A session with no
library-hash stamp is not counted in `stale_session_ids` (never indexed;
import/rescan cover it) — accepted.

**Checkpoint (2026-09-06 ~2:40pm ET):** dev-app relaunch against the L2b
engine built clean but `app.exe` exits at start with `0xc0000142`
(STATUS_DLL_INIT_FAILED) twice — once during a low-memory kill, once with
3.3 GB free while the console session is locked (`LockApp.exe` running).
Not a code failure; the lead stops retrying and hands the preview launch
to Isaac (`npm run tauri dev` from `app/` in his own terminal). Cargo slot
returned to L8x.

## 2026-09-06 — R87: the catalog never indexes workbooks — fixed as L8x Task 5b

Preview after Task 21: "Rescan found 0 workbook(s)" with two `.idl1wb`
files in `workbooks/`. `rebuild_catalog` step 6 is still the L1-era
no-op ("until `.idl1wb` front-matter parsing exists") though core has had
`parse_front_matter` since L3, and `create_workbook`/`save_workbook`
write no catalog row either, so `list_workbooks` is empty after every
restart. **Ruling:** L8x Task 5b (core + tauri, before Task 6): step 6
walks `workbooks/*.idl1wb`, parses front matter, upserts `workbooks`
rows (id, file_name, name, updated_at_ms, size_bytes; a file that fails
to parse is skipped and reported); `create_workbook` and `save_workbook`
upsert the row for their file (a rename keeps the id). Tests: rebuild
indexes two files and skips a malformed one; create then `list_workbooks`
shows it without a rebuild.

**Cost if wrong:** a few rows per rebuild; the alternative is a Notebook
that forgets its workbooks on restart.

## 2026-09-06 — L8x Data-tab write commands LANDED (idl-rs `52efba8`; idl1-app merge + submodule bump)

Eight tasks + 5b (R87), every review CLEAN after the Task 6 test fix.
Lane gate from `6ee31b2`: tauri **245**, idl-rs **1020** / 1 ignored,
cli 53. `save_track`/`delete_track`, `list_quarantine`/
`resolve_quarantine`, `verify_data_dir(repair)`, typed `TrackDetail`,
catalog now indexes workbooks. Worktrees retired. Next: the Data-tab
shell task (five items listed in TASKS.md's L8x entry).

## 2026-09-06 — R88: L11 LAN sync (plan `runs/2026-09-06/lanes/l11-sync/PLAN.md`) — open questions ruled

Sync lives in `idl-transport` under `sync/`; transport gains a
one-directional dependency on core (design §16's open item closed).
No new crates: `axum`/mDNS/`uuid` as pinned, range header parsed by hand.
Plain HTTP with per-peer bearer tokens, no TLS — a stated LAN-only
posture (a cloud relay later brings TLS). Pairing is symmetric
show-a-code via a new `start_pairing` command; QR is the mobile lane's.
Workbook per-cell merge (C2 §7) is in lane (Tasks 4–5). `session.json`:
per-field merge for user-owned fields; the lap cache never merges (C4 §8
item 3 closed). Peers/tokens stored outside `<data>`. `.sync-base/` stays
at C2's path, excluded in C4. Auto-trigger at most once per peer per
60 s, never for an incompatible peer. Twelve serial tasks; Task 1 is
spec-first docs (lead spot-check); loopback two-peer proof is Task 11.
Worktrees `l11-sync` in both repos.

**Cost if wrong:** the security posture is the one to revisit; everything
else is additive contract text.

## 2026-09-06 — Data-tab writes shell task LANDED (review Major fixed; main suite 98 / 924)

Track name/venue edit + delete, real gate/sector/NZ lists, quarantine
Restore/Discard, Verify/Repair, "Rescan N sessions" with per-session
outcomes (`allSettled`; a total failure still resolves with an honest
result string — accepted, noted). The last `NotImplementedError` stubs
in the app are gone.

## 2026-09-06 — R89: `data.parquet` version-pair ordering for sync (L11 Task 3)

C4 §6 says "the side with the newer pair is authoritative" without a
comparator. **Ruling:** lexicographic on the pair — `importer_version`
first, compared as SemVer 2.0.0 (C1 §4.3); only if equal,
`seam_correction_version`, compared by the integer after a leading `v`
(`v1` < `v2`); a value that fails to parse under its rule makes the pair
**incomparable**: neither side is authoritative, nothing is transferred
for that session's `data.parquet`, and the plan carries a warning naming
the session and both pairs. Equal pairs ⇒ no transfer (content is a
function of blob + versions). C4 §6 gets this sentence in L11's next docs
touch (Task 12's sweep) citing R89.

**Cost if wrong:** a stale derived file on one side until the next import
or rescan; never data loss (blobs are the source of truth).

## 2026-09-06 — R90: manifest blobs are named by their CAS path; malformed local files are reported locally, never on the wire

review-task2 (two Majors): (1) `build_manifest` re-hashed every blob and
derived file — **ruling:** the manifest lists a blob by the hash its CAS
path already names (C4 §2; hashes are verified by `verify_data_dir`, not
by every manifest walk); derived files likewise by their path name.
(2) A malformed local file was silently omitted — **ruling:**
`build_manifest` returns `(Manifest, Vec<SkippedEntry { path, reason }>)`;
the skipped list is local-only (the C4 §6 wire shape is unchanged) and
feeds `sync_status`'s warnings; `plan_sync` (Task 3) treats a locally
skipped path as "do not touch": no pull may overwrite it and no push may
claim it, and the plan carries the warning. Fix lands as the Task 2 fix
commit after Task 3 reports.

**Cost if wrong:** one tuple return and a rule in the planner; the
alternative silently repairs-by-overwrite a file the user may want to
inspect.

**Process incident (2026-09-06 4:20pm, lead's error):** after L11 Task 3
reported DONE the lead sent it a follow-up ruling (R90) that resumed it
into the worktree while the Task 2 fix agent had already been dispatched
there — two writers, the fix agent overwrote Task 3's in-progress edit.
Nothing committed was lost. Rule restated: **a message to a reported
agent is a new dispatch**; never send one into a worktree another agent
owns. Task 3 stood down; the fix agent owns R90 in both files.

## 2026-09-06 — R91: `session.json` per-field merge tie rule; `render_workbook`; `InstallContext` (L11 Task 6)

Accepted as ruled: a user-owned field is "changed" when it differs from
its type's zero value (C1 §6's not-set convention); one side changed ⇒
that side; both changed to the same value ⇒ no conflict; both changed
differently ⇒ the side with the newer `session.json` `updated_at_ms` wins,
tie keeps local. `workbook::v3::render_workbook` (WorkbookDoc → text, the
inverse of the parser, round-trips C2 §2.5's worked example) is core's
and the only renderer. `install` takes an `InstallContext` (peer mtime,
claimed versions, peer file name) populated from the manifest the caller
holds. L11 mid gate: idl-rs **1110** / 1 ignored, cli 53. C4 §6 gets the
tie rule in Task 12's sweep.

**Cost if wrong:** the tie rule is one comparison; the renderer is
covered by the round-trip test.

**review-task7 (L11) overruled:** its one "Important" — an "unauthorised"
`cargo check -p idl-rs-tauri` — was requested by the lead's dispatch
(transport is tauri's dependency). Task 7 is CLEAN.

**Tracked (L11 Task 6 fix re-review, Minor):** the `session.json` rederive's
parse-failure fallback reports `Installed` instead of `KeptLocal`; fold
into Task 12's sweep (one enum arm + test).

## 2026-09-06 — R92: UI direction adopted (`runs/2026-09-06/ui/UI-DIRECTION.md`, Isaac's interview, status final)

Adopted as the design input for the styling pass: refinement of idl0's
"quiet field manual" look; dark authored, light allowed later; high fixed
density; Device = launch tab + mobile-first, Notebook = layout budget +
desktop-first; top bar on desktop, bottom bar < 600 px, tab order Device ·
Data · Notebook · Settings; wide = dockable studio columns (library |
maths graph (reserved) | properties | output); mount-and-hide persistence;
command palette scaffold now; **shadcn/ui on Tailwind v4 + Radix**,
components copied into the repo, theme = `tokens.css` only, Plex Mono/Sans
bundled woff2, no CDN, no runtime fetch (the operating brief §2's
"dependencies outside the M0 report are a question" is answered by Isaac
here — cost accepted: Tailwind at build time, Radix + shadcn copies in
the bundle); zero elevation; two radii; the 13 tokens ported unchanged;
charts as chrome with the 8-hue cycle + Turbo; day-one chart
interactions incl. live-speed playback; two output registers; code
collapsed at rest; maps keep live OSM/Esri tiles (network data, not
bundled code). Open questions resolved per the file's recommendations:
surface ladder unchanged until a monitor says otherwise; launch on
Device < 1200 px and on the studio layout above, remembering the last
layout; register default paper on narrow / studio on wide. Device
refinements collected after UI-5.

Execution: the file's lane split UI-1…UI-11 stands, **UI-1→4 serial**
(tokens → primitives → overlays → shell), **UI-5/6/7 concurrent** after
UI-4, then UI-8→11 in the Notebook worktree. Every task's brief maps the
file's illustrative paths onto the real tree (`app/src/routes/pages/…`,
`app/src/state/`, lead-owned files named as shell edits inside the task
with lead review). TypeScript-only lanes; reviews mandatory; the effects
rule holds; `App.tsx`/`state/` edits are in scope for UI-4 only.

**Cost if wrong:** a library choice is the one hard-to-reverse decision;
Isaac made it with the studio-scale growth in view.

## 2026-09-06 — R93: UI lane briefs (`runs/2026-09-06/lanes/ui/`) — open questions ruled

All planner recommendations accepted: an authoring-time `npx shadcn add`
fetch is fine (CLI version pinned, every generated file committed, the
shipped bundle fetches nothing); icons = `lucide-react` at a pinned
version (tree-shaken); skip `tw-animate-css` and strip its classes; copy
the six Plex woff2 files (latin + latin-ext) and drop the npm packages;
hidden routes use the `hidden` attribute + CSS; a hidden sandbox iframe
is accepted for this pass (UI-10 re-measures on show); the remembered
launch layout lives in localStorage; no empty session/lap chips. UI-4
owns the mount-and-hide fix for the Device poll (`composeVisibility`);
UI-5 gates on it. Worktrees `ui-<n>`.

**Cost if wrong:** all reversible in one task each.

## 2026-09-07 — R94: `--accent` collision; the brand token wins

UI-1 found shadcn's own `--accent` (a highlight background) colliding with
the brand `--accent` (alert red `#E63946`, direction file's token table).
**Ruling:** the brand token keeps the name; shadcn's is aliased to
`--shadcn-accent` as UI-1 did. The token table in `UI-DIRECTION.md` is the
vocabulary of this app; a library variable renames, never the design.
UI-2 onward must map shadcn component classes onto `--shadcn-accent`
where the library means "highlight" and onto `--accent` only for
alert/error/destructive. The colour-literal test's broadening to
`rgb()/rgba()/hsl()/hsla()` is accepted.

**Cost if wrong:** one rename across generated components.

**review-ui-1 Important, ruled:** `lucide-react` landed in UI-1 though the
brief deferred it. R93 approved the icon set; UI-2 is its first consumer
and the dependency is pinned and unused, not wrong. **Accepted in place**
(no revert-and-re-add churn); UI-2's brief now owns it. The Minor goes to
UI-2 as well. UI-1 is CLEAN as landed.

## 2026-09-07 — UI-1 LANDED (tokens, fonts, Tailwind v4 + shadcn; main suite 99 / 953)

`6ce9427`, review one Important (ruled: `lucide-react` accepted in place,
UI-2 owns it). Tokens in `app/src/styles/tokens.css` are the only place a
colour literal may appear, enforced by `tokenSheet.test.ts`. Plex woff2
committed (latin + latin-ext subsets); `vite build` output carries no
external font/style URL. Worktree retired.

## 2026-09-07 — UI-2 LANDED (primitives + brand widgets; main suite 101 / 959)

`55ba799`, review CLEAN (two Minors: the latent `TableHeader` name
collision — later tasks alias the brand one as `BrandTableHeader` when
both are imported; four parity gaps assigned: ColorGridPicker/
GroupedChannelList/ModeAwareCheckbox → UI-5, StatusDropdownTrigger →
UI-6). Judgment calls accepted: filled-normal button = `--fg` on `--bg`;
no tooltip arrow (zero-elevation rule makes one awkward). Worktree
retired. **Merge note:** the lead must `npm install` in `app/` after a
merge that adds a dependency — `tsc` fails otherwise on the shared
checkout.

## 2026-09-07 — UI-3 LANDED (overlays + toasts; main suite 103 / 965)

`f6d6140`, review CLEAN. Toaster built but unmounted (UI-4 mounts it).
`next-themes` dropped (dark-only), sonner's vendored shadow neutralised
in `index.css` rather than editing the vendored file. Worktree retired.

## 2026-09-07 — R95: mount-and-hide — which background effects are allowed to keep running

UI-4 reports every page effect now runs from app start rather than per
visit. **Ruling, by cost:**
1. **Device BLE poll** — already fixed by `composeVisibility` (R78 holds).
2. **Notebook sandbox iframe + `watchWorkbook`** — must pause: the iframe
   is a live JS runtime and the watcher an OS handle, both per-notebook.
   → **UI-10** gains the route-visible gate (the same context UI-4 built):
   sandbox torn down / not started while hidden, watcher unsubscribed,
   re-primed on show through the existing rebuild replay (R69 order).
3. **Notebook debounced eval** — gate on the same signal; a hidden
   notebook must not call `eval_workbook`. → UI-10.
4. **Data `listSessions` on mount, Settings prefs migration, Notebook
   `listMathBuiltins`/`listWorkbooks`** — one-shot reads at app start,
   cheap and idempotent; **accepted**, no change.

Also ruled: `lastRoute` in `ColumnPrefs` (one key) accepted; column
min/max width constants accepted as named invented constants; the
TopBar device dot stays unwired until Device's connection state is
lifted into `AppState` — a **UI-5 follow-on**, not a shell task; the
`ColumnFrame` remount when crossing 1200 px is accepted for this pass and
noted for UI-10 (state loss on a resize across the breakpoint only).

**Cost if wrong:** item 2 is the one that matters — a hidden notebook
holding a sandbox and a file watch is a battery and handle leak on a
phone.

## 2026-09-07 — UI-4 LANDED (shell: bars, mount-and-hide, columns, palette, Toaster)

`b86a008`, review CLEAN. `composeVisibility` + the route-visibility
context are the signal UI-5 gates on and UI-10 reuses (R95 item 2).
Worktree retired. Next: UI-5/6/7 concurrently, each its own worktree
from main.

## 2026-09-07 — UI-5 LANDED (Device restyle; review CLEAN)

`1be44e0`. Device refinement list filed as question 12 in
`runs/2026-09-05/QUESTIONS-FOR-ISAAC.md` (the reviewer could not see it
from files — it is there now). Worktree retired.

## 2026-09-07 — UI-7 LANDED (Settings restyle + theme/register prefs; review CLEAN)

`20447e5`. `settings.css` deleted and the token test's exception list is
now empty — a colour literal anywhere outside `tokens.css` fails the
suite. Nine sections (kept `data`, added `firmware`/`theme`) accepted.
Worktree retired.

## 2026-09-07 — UI-7 LANDED (Settings restyle + theme/register prefs; review CLEAN)

`20447e5`, merged with a CHANGELOG conflict resolved keep-both.
`settings.css` deleted and the token test's exception list is now empty —
a colour literal anywhere outside `tokens.css` fails the suite. Nine
sections (kept `data`, added `firmware`/`theme`) accepted. Main suite
110 files / 1015 passed. Worktree retired.

## 2026-09-07 — R96: click-to-deselect on a Data session row is kept (UI-6)

UI-6 added a toggle to `selectSession` (re-clicking the selected row
clears the selection) inside a presentation-only task, without a ruling
or a CHANGELOG line — the reviewer graded the *disclosure*, not the code.
**Ruling: keep it.** It restores idl0's own
`SelectionNotifier.toggleSession` behaviour, and with L6 reading
`AppState.selection` (R53 Data Q3) a user who cannot clear a selection
cannot get the Notebook back to "no session". Fix commit: one CHANGELOG
line naming it as a deliberate parity fix citing R96, and the stale
`SessionRowView` doc comment corrected (review Minor). L7a stays the
slice's only writer; nothing else changes.

**Cost if wrong:** one line to revert; the alternative leaves the app
with no way to deselect.

## 2026-09-07 — UI-6 LANDED (Data restyle; review + R96 fix)

`ee02620` + fix `8be5d06`. Window-level drag-and-drop through Tauri's
webview event feeds the existing import queue; R55's pasted-path import
intact; click-to-deselect kept and disclosed (R96, pure
`nextSelectedSession`). All four tabs are now restyled. Main suite
111 files / **1023 passed**. Worktree retired. Next: UI-8→11 serial in
one Notebook worktree; UI-10 carries R95 item 2 (pause the sandbox,
watcher and eval while the Notebook is hidden).

## 2026-09-07 — R97: chart rendering lives in the sandbox; UI-8's host-side call sites were stale

UI-8 found no host-side `Plot.plot` anywhere: `ChartCell`/`RasterUnderlay`
draw rasters on a raw canvas, and every real chart is the sandbox cell's
own `Plot.plot`. The brief's "apply host-side and in the sandbox" was
written from the design doc, not the code. **Ruling:** correct as landed —
the theme applies where charts are drawn (the sandbox's wrapped `Plot`
global), and `sandbox/main.ts` importing `tokens.css` for its own `:root`
copy is the right seam (CSS variables do not cross an iframe). A missing
chart token throws rather than guessing a hex. `slotStates.ts` stays
unwired until **UI-10** gives the chart cell its empty/error slot render
site; `EmptyReason`'s three members are provisional until then and UI-10
may rename them in the same commit.

**Cost if wrong:** a theme applied in one place instead of two, where the
second place does not exist.

**R97 addendum:** Plot exposes no `textTransform`/`letterSpacing` on text
or axis marks (verified against `docs/vendor/observable-plot/marks/{text,
axis}.md`), so the direction's "uppercase tracked axis titles" is not
implementable without uppercasing tick labels too. Recorded as a real API
limitation in `plotTheme.ts` + CHANGELOG with a test asserting the
omission. If Isaac wants it, the honest route is uppercasing the label
string at authoring time in `plotForm/generate.ts` (tracking still
unavailable) — a UI-10/11 question, not a silent transform.

## 2026-09-07 — R98: UI-10's two ambiguities (editor split persistence; no unwatch command)

1. **Inner editor/output split is not persisted.** `ColumnId` is a closed
   union in shell-owned code UI-10 may not touch. **Accepted as landed.**
   Persisting it is a small **UI-4 follow-on** (widen the union, add the
   two ids, one test) — not worth a cross-lane edit inside a restyle.
2. **`watch_workbook` has no unsubscribe in C3**, so a hidden Notebook
   drops its callback but the Tauri-side watcher lives until the channel
   is dropped. **Ruling:** the inert-callback pattern stands for this
   pass — it satisfies R95's intent (no work, no eval, no sandbox) — and
   the real fix is a contract change: **C3 gains `unwatch_workbook(id)`**
   (or `watch_workbook` returns a handle whose drop stops the watcher),
   filed as an L8-class Rust follow-on with the L11 sweep. Until it
   lands, one OS file watch per opened workbook persists for the app's
   life; note it in `TASKS.md` as a known leak, not a silent one.

**Cost if wrong:** one file handle per workbook opened this session; the
sandbox and eval — the expensive parts — do stop.

## 2026-09-07 — R99: the shared cursor is worksheet state; `index.tsx` is in scope for UI-11

UI-11 found no cross-cell cursor or viewport state: `chartWindows` is
per-cell and each `ChartCell` runs its own `cursorReadoutDriver`. Isaac's
decisions 18 and 27 are explicit that a cursor is shared by every chart
in a worksheet and that playback pans all of them, so scoping the feature
down would ship the label without the thing. **Ruling:** the Notebook
page's own `index.tsx` **is** in scope for UI-11 (it is this lane's
orchestration file, not another page), for exactly one addition: a
worksheet-level cursor/playback state — a cursor time plus a playback
clock — that every mounted `ChartCell` reads and that a playback tick
advances by panning each cell's committed viewport. Constraints:
- The decision logic is a pure tested module (`interaction/`): "given a
  cursor time and each cell's viewport, what does each cell show", and
  the clock with an injected scheduler. `index.tsx` only wires it.
- Per-cell readout drivers stay (R62's 150 ms pointer-stop settle is per
  chart); what is shared is the **cursor time**, not the driver.
- Interaction path stays local (P3/P4): cursor moves and playback ticks
  are host state + `transform` postMessages only; IPC on settle only. If
  panning during playback would fire settle continuously, ship playback
  **paused-on-settle** (pan visually, refetch once when playback stops)
  and report it — do not stream IPC.
- `App.tsx`/`state/AppState.tsx` stay untouched; this is Notebook state.

**Cost if wrong:** one lifted state in one file, in the lane that owns it.

## 2026-09-07 — UI-8…UI-11 LANDED; the UI styling pass is complete

Merged `ui-notebook` (`9b1b9ff` Plot theme + `18955f1` fix, `21f3df8`
CodeMirror theme + `b431aa6` fix, `bc61d8b` notebook frame + R95 pausing,
`a6e66cd` cursor/menu/playback + `bb637df` fix). Main suite **126 files /
1141 passed**, `tsc` clean, `vite build` both entries.

All eleven UI tasks are in: tokens+fonts, primitives, overlays, shell,
Device, Data, Settings, Plot theme, CodeMirror theme, notebook frame,
interaction+playback. Rulings from the pass: R92–R99. Known gaps, all
disclosed: no light palette (decision 5), no React Flow maths graph
(column reserved), no figure export, Plot cannot track/uppercase axis
titles (R97 addendum), `unwatch_workbook` missing from C3 (R98), the
inner editor split unpersisted (UI-4 follow-on), `bracketMatching()` not
wired.

Next: a dev-app preview for Isaac (needs the cargo slot — L11 Task 8
holds it), then L11 Tasks 9–12 and the sync UI.

## 2026-09-07 — L11 Task 8 landed by the lead (`fa3d317`); the task agent was stopped

The Task 8 agent stalled three times waiting on a `run_in_background`
cargo notification that never reached it (once after a completed build
whose exit code its own `tail` pipe masked). Wall clock lost: ~14 h of the
cargo slot. The lead stopped it, ran the filters foreground and committed
its code unchanged: `sync::server` **14 passed**, `sync::` **33 passed**,
`cargo check -p idl-rs-tauri` clean; NUL check 0 on all four files.
Auth uses `route_layer` (with `layer` the fallback is wrapped and an
unknown path answers 401 instead of 404 — both pinned by tests).

**Process rule added:** an agent that reports "waiting for a background
notification" twice is stopped and its work finished by the lead. Cargo is
foreground, always — the brief said so and this is the second lane where
backgrounding it cost hours.

## 2026-09-07 — R100: one shared id validator in core; ids are UUID-shaped, checked everywhere

review-task8 found a **Critical**: `is_valid_id` rejects `/`, `\` and
`..` but not a Windows drive-relative prefix (`C:foo`), and
`PathBuf::join` treats that as drive-relative — so a paired peer could
read or write outside `data_root` on every id-addressed route
(workbooks, sessions, tracks, profiles). The hash routes are safe (64-hex
check). The same weak validation exists at `core/src/store/sync/apply.rs`
call sites.

**Ruling:** one validator, in **core** (`store::sync::ids`), used by both
crates and by every id-addressed path construction:
- an id must match the shape its class actually uses — UUID for workbook/
  track/profile ids, the session-id shape for sessions (state the regex in
  the doc comment); anything else is rejected. Allow-list, not deny-list.
- reject empty, any `/` or `\`, any `..`, any `:`, any control byte, any
  non-ASCII, and anything not matching the class shape.
- after joining, assert the canonicalised result is still inside
  `data_root` (belt and braces — `path.starts_with(root)` on the
  normalised path) and return 404, never 403, so nothing leaks.
Tests: the review's `C:foo` case, `\?\C:\…`, `..\..`, a bare `.`, an
over-long id, a valid UUID, plus one asserting the normalised-path guard
catches anything the shape check misses.

Also from that review, folded into the same fix: `read_body` must use a
real cap (not `usize::MAX`) — the largest legitimate body is a workbook
document, so bound it generously and return 413 above it; the range
overflow case is `Unsatisfiable`, not `Malformed`; and the CHANGELOG
entry plus the lane's full-suite run that the brief required.

**Cost if wrong:** the Critical is a remote read/write outside the data
directory from a paired peer on the same LAN — the highest-severity
finding of the run so far, and it is why the review exists.
