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
