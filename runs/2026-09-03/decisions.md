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
