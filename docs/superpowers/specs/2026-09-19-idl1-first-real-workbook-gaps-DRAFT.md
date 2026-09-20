# DRAFT — What the first real-data workbook asked of the engine, CLI and app

**Status:** draft for the lead to rule on. Nothing here is implemented. Spec-first: each
item names the contract it touches and the questions that must be answered before a lane
is cut (CLAUDE.md §1 — none of the open questions below has been assumed).

**Source:** 2026-09-19, one motocross day (five `.idl0` sessions, 3× IMU ≈ 800 Hz, GPS 1 Hz,
HR) analysed end to end and authored as `workbooks/mx-day-2026-09-19.idl1wb` in the
library, with track `tracks/mx-2026-09-19.idl0t` (point-to-point, 8 sector gates). Where
the workbook language or the app could not do something, the analysis was done in Python
(`Documents/sessions/analysis-2026-09-19/`) and the result written into the workbook as
literal tables. Every item below is one of those places. Evidence is reproducible from
that folder and from the CLI/IPC calls quoted.

Priorities: **P0** wrong numbers, silently · **P1** blocks an ordinary analysis ·
**P2** friction · **P3** promote a script into the product.

---

## P0-1  The row time `t` of IMU samples is a uniform grid, not the recorded time

**Observed.** For IMU rows `data.parquet`'s `t` diverges from the cleaned hardware stamp
`imuN_t_recorded_us`: up to 7 s (IMU0) and 26 s (IMU1) by the end of a 49-minute session.
The three IMUs cross-correlate at zero only on `t`; on their own `t_recorded` they align
to 25 ms for the whole session (frame↔fork +25 ms, fork↔swingarm ≈ wheelbase / speed).
IMU0's real logging dropouts (0.8–6.8 s, ≈ 23 s per session) appear in `t_recorded` and
not in `t`.

**Cause (read, not run).** `parse/records.rs:615-617` builds `t_us[slot] = t0 + slot *
period_us[i]` — index × one per-IMU `effective_period_us` — while `t_recorded_us` carries
the seam-corrected stamp (`records.rs:618-620`). Lap slicing and GPS resampling read
`t_us` only (`session/handle.rs:135,146,697-718`).

**Contract.** C1 §3.1: "`t_us[i] = corrected_timestamp_us[i] − t0_us`"; §3.5 invariant 4:
"`nominal_rate_hz` never derives a sample's time, anywhere". This is a violation, and of
the principle *Time is recorded, not assumed*.

**Effect.** Every IMU-derived value that is windowed by lap, put on the map, or compared
between IMUs is wrong late in a session. In this analysis it inverted a finding: on `t`,
landings looked simultaneous and front-heavy and session 5 looked like it rolled its
jumps; on `t_recorded`, landings are rear-first by 60–120 ms and the jumps grew all day.

**Proposed.** `t_us` for a kept IMU slot = its corrected stamp − `t0`. Gap/pad slots keep
the grid value (C1 §3.3, ruled). Importer version bumps; `library rebuild` re-derives.

**Open questions.** (a) Must `t` stay strictly monotone per source when a corrected stamp
steps back by less than one period? (b) 0.5–0.9 % of rows are pad slots whose
`t_recorded == t`; should `t_recorded_us` be null there instead of a placeholder that
looks like a measurement? (c) Are dropouts of seconds expected from the firmware, or is
that its own bug (SD stalls)? They are 1.5 % of the day.

## P0-2  Estimator builtins answer without a calibration, and answer nonsense

`wheel_travel`, `wheel_velocity`, `attitude`, `body_accel` evaluated (2.5 min in the debug
CLI) to front travel −473…+514 mm, median pitch 51°, roll p05 −95°, longitudinal ±3 g. The
frame IMU on this bike is pitched 57° from the axis the estimator assumes; no
`session calibrate` had been run. **Proposed:** with no calibration bound to the session's
bike, these builtins return a typed error naming the missing calibration, never a series.
**Open:** where the calibration lives (bike profile? `session.json` snapshot?) and what
"bound" means for a session recorded before the calibration existed.

## P0-3  `where(sector_number() == n, [1 Hz channel], 0)` indexes out of bounds

"Sample index 160939 out of bounds (length 1576)". A mixed-rate `where` takes the
condition's index into the value's array. Same family as P1-1; at minimum it must be the
typed different-rates error the arithmetic operators already give.

---

## P1-1  No way to combine two channels recorded at different rates

`[front_rms] / [rear_rms]` → "Cannot Div channels with different sample rates (793 vs
778 Hz). Use resample()" and `resample` is "not implemented". With three IMUs on three
clocks this rules out the first thing a suspension workbook wants: front against rear.
Scalars work; series do not. **Proposed:** implement `resample(ch, onto)` (C2 §3.3 already
reserves the name) on recorded time. **Open:** interpolation rule (linear? hold for
indicator channels?), and whether binary operators should resample implicitly onto the
left operand — the explicit form is safer and is what the error already suggests.

## P1-2  Per-lap reduction `mean(x, "t:lap")` is documented and unimplemented

`WORKBOOK-REFERENCE.md` §"Per-lap values", C2 §3.6.6 and the app's own error hint
(`lapDriver.ts:131`) all tell the author to write it; the engine says "mean: expected
scalar argument, got string". `percentile` rejects a third argument outright. Nothing
per-lap except `lap_time()`/`sector_time(i)` can reach a lap-progression chart.
**Proposed:** implement the `"t:lap"` reduction for every aggregate (`mean rms std median
sum count min max percentile first last`). Docs already describe the behaviour.

## P1-3  Lap-table columns cannot read math definitions, and cannot filter

In a `windowLaps` table, `mean([airborne])` → "Channel '[airborne]' not in this session";
inlining the definition instead → "butter: … Nyquist (0 Hz for a 0 Hz sample rate)". The
row window loses the channel's sample rate, and the table evaluator does not see the
workbook's definitions. The reference's own example column is `max([Fork travel])`, which
only works because it is a raw channel. **Proposed:** table templates resolve `[name]`
through the same scope as a math cell (definitions first, then session channels), and a
row window carries rate and recorded time. **Open:** evaluation order/cost — evaluate the
definition once per session and slice, or per row? (Filters differ at window edges.)

## P1-4  Histogram, spectrum, scatter and map colour-by only accept raw channels

`fetch_histogram` / `fetch_fft_v2` take `{window, channel, params}` — no workbook id — and
answer `not_found` for a definition; the UI then says the definition "failed to evaluate"
although its math cell is green. `gps(colourBy)` takes a workbook id but a definition
colour-by drew nothing. The reference's examples (`histogram("fork_velocity", …)`,
`scatter("accel_lat", "accel_long", …)`) are all definitions. **Proposed:** C3 change —
these four commands take `workbookId` and resolve like `fetch_host_channel_v2`.
**Open:** caching key for a derived channel (definition text hash + session + importer
version, per *sync outputs only when content-addressed*).

## P1-5  One failing definition blanks its whole math cell for JavaScript

`speed_delta = lap_delta_time(...)` (no overlay chosen) made `lap_time_s` and every other
name in the cell "not defined" in `js` cells. C2 §2 says an error is per definition.
After moving it to its own cell, `lap_time_s` (a `[lap]` value) is still "not defined" in
the lap-progression cell — needs its own look.

## P1-6  A workbook evaluates one session; the unit of analysis was a day

Everything comparative here — session medians, sector gains, corner speeds by session,
line choice within session — had to be literals. The reference lists cross-session as
"not here yet". **Proposed (smallest useful step):** an authored `table` whose rows carry
`context: {sessionId, lapNumber}` already parses; make the app resolve such rows against
other sessions, and let a row context name a whole session (no lap). **Open:** the full
selection-side design is the lead's; this only asks that authored row contexts work.

## P1-7  Nothing can be exported from a derived channel

`workbook data` text mode prints "N sample(s)" only; `--json` at full rate allocated
512 MB and died. There is no CSV/Parquet path for a definition. **Proposed:**
`workbook data --format csv|parquet --decimate N|--rate HZ`, streaming. This is what makes
the engine usable from Python/agents instead of re-implementing it (this run re-derived
`butter`, airborne, RMS in numpy to get numbers out).

---

## P2  Friction

1. `session import <x.idl0>` → "no importer covers file extension idl0"; its own
   `--dry-run` says "would import … as idl0". The deprecated `import` works.
2. A file dropped into `workbooks/` or `tracks/` is invisible until `catalog rebuild`
   (48 s on 165 sessions); the CLI cannot rebuild while the app holds `catalog.sqlite`
   ("rename … Access is denied"), so an import from the CLI with the app open half-fails.
   *The workbook is a file* wants a directory watch, or at least list-by-scan for these two.
3. Tracks can only be authored in the app. This run wrote `.idl0t` by hand. See P3-1.
4. Sectors are named by the gate that closes them and the last one is auto-named `S9`;
   a gate list cannot name the final sector. **Open:** name sectors, not gates?
5. `table` cells: literals are numbers only and the row `id` is the only label — there is
   no text cell and no column unit. Prose has no tables (`pulldown-cmark` runs with
   `Options::empty()`), so any small table of words has nowhere to go.
6. Prose renders headings and list items as plain lines in Output view (no heading
   weight, bullets dropped).
7. No distance axis (R136). The ruling stands for charts; the analysis still needed
   distance-domain *tables* (time per 50 m, corner windows). P3-2 gives that without a
   distance x-axis.
8. `workbook eval`/`check` take `--session <file>` but no `--data-dir`; `table eval` rejects
   `.idl1wb`. The banner "function reference is out of date with the engine (5
   mismatches)" shows on every workbook in the current build.
9. Unsprung IMUs are configured ±16 g and saturate on every landing (three-axis magnitude
   27.7 g = all axes clipped). Device profile default, not engine — but `declip` exists
   and nothing flags a clipped channel in the UI. **Proposed:** a `clipped_fraction`
   field in channel metadata at import, surfaced in the channel list.

---

## P3  Scripts from this run worth promoting

Each was a few dozen lines of numpy; each is physics of the bike or bytes on disk → `core`,
with a CLI verb, per the decision rule.

1. **`idl-rs track propose <session…>`** — reference line and gates from laps themselves.
   Averages laps onto a 1 m centreline (spline through fixes, monotone nearest-point
   projection, iterate ×3), computes curvature, proposes sector gates on straights
   (|κ| small, ≥ 16 m clearance from any other leg, gate half-width = clearance − 6 m),
   and finds where out/in-laps join and leave the line, from which it proposes either a
   circuit gate or a point-to-point pair that loses no laps. Output `.idl0t`. **Open:**
   thresholds above are this track's; they need a second and third venue before ruling.
2. **Distance-domain lap tables (`core::laps::stations`).** Per lap: time and Doppler speed
   at 5 m stations along the track's reference polyline. Everything in the workbook's
   "where the time moved" section is sums over station ranges: corner windows (entry /
   apex / exit speed, brake point), time per 50 m, fast-third vs slow-third behaviour.
   Exposed as `[lap]`-shaped builtins — `segment_time(s0, s1)`, `min_speed(s0, s1)`,
   `speed_at(s)` — it needs no distance chart axis, so R136 is untouched.
3. **Line offset (`lateral_offset()`).** Signed distance from the reference polyline, from
   fixes rebuilt as a cubic Hermite through position *and* Doppler velocity (1 Hz GPS
   becomes usable: ≈ 1 m lap-to-lap). Gave the inside/outside analysis. `[t]`-shaped;
   with (2), `offset_at(s)` is `[lap]`-shaped.
4. **`airborne()` and a jump table.** Frame |a| (axes low-passed 12 Hz *before* the norm,
   else vibration rectifies) < 0.45 g for ≥ 0.25 s → events with take-off position, air
   time, distance, take-off speed, pitch change, per-wheel touchdown time. A `table` row
   source `"events"` alongside `"windowLaps"` is the natural home. **Open:** thresholds
   as builtin arguments with these defaults?
5. **IMU gravity alignment at import.** Each IMU's up-vector from the still period before
   the first movement; forward from the plane containing up and the mounting prior. Stored
   in `session.json`, exposed as `vertical("imu1")`, `longitudinal("imu0")`. Today the
   workbook carries three hand-measured vectors as literals, valid for one day's mounting.
   Overlaps M6.3 calibration — **open:** is this the zero-effort fallback when no
   held-in-the-air calibration exists, or does it confuse the story?
6. **Transmissibility.** `transfer(out, in)` → `[f]` magnitude and `coherence(out, in)`;
   wheel→frame on this data crosses 1.0 at ≈ 1.7 Hz and is 0.15 (front) / 0.02 (rear) at
   12 Hz. Needs P1-1's common time base. Speed-binned spectra (`welch` over a `where`
   mask, or a `by:` argument) gave the "rougher with speed, equally at both ends" result.
7. **Yaw-moment diagram.** Lean-corrected yaw rate ψ̇ = ω_z / √(1 − (v·ω_z/g)²) (slope 1.00
   against GPS heading rate), lateral g = v·ψ̇, yaw acceleration = dψ̇/dt; scatter of the
   two is a measured Milliken diagram. Wants `unwrap` (absent) for the GPS check, P1-1,
   and scatter over definitions (P1-4).
8. **`idl-rs fit --merge <sessions…>`** — one activity for a day, timer stop/start events
   at the gaps so pit time is paused. Done here with `fit_tool` from the per-session files.

## Suggested order

P0-1 first: it changes numbers everywhere and invalidates every derived artifact. Then
P1-4 + P1-3 + P1-5 (one theme: *a definition is a channel everywhere*), P1-2, P1-1. P3-2
and P3-3 are the largest analytical gain per line of code. P0-2 is a one-day guard.
