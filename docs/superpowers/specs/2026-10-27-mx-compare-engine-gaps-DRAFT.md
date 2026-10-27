# DRAFT — Engine gaps found comparing two MX days in Rust only

**Status:** draft for the lead. Nothing here is implemented or assumed ruled (CLAUDE.md §1).
**Source:** 2026-10-27, comparison of MX day 1 (2026-09-19, 5 sessions, `tracks/mx-2026-09-19.idl0t`) with MX day 2
(2026-10-24 Broome-Tioga, 4 sessions, `tracks/228ffacc-….idl0t`). Every number was computed by the `idl-rs` CLI
(debug build of `rust/` at idl-rs `f1e3ddb`, built 2026-10-27) evaluating
`workbooks/mx-compare-2026-09-19-vs-2026-10-24.idl1wb`. No Python. Wherever the analysis needed something
the engine could not do, it stopped and the need is logged here. Findings:
`Documents/sessions/analysis-2026-10-27/findings.md`.

Priorities: **P0** wrong answers (or a crash) · **P1** blocks an analysis · **P2** convenience.

---

## Day-1 gaps (`2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md`): status on 2026-10-27

| Day-1 item | Status | Evidence |
|---|---|---|
| P0-1 IMU `t` was a uniform grid | **Fixed** | Importer 0.3.0 builds `t_us` from corrected stamps (`parse/records.rs:647-670`); `library stale` lists 0 sessions. Physical check on all 9 sessions: fork/swingarm \|a\| while the frame is airborne is 0.15–0.28 g in early *and* late laps (riding level 1.26–1.56 g), including day 1 S5. Direct check impossible, see N8. |
| P0-2 estimators answer without calibration | **Still open, now worse**: see N1, `wheel_travel` panics. |
| P0-3 mixed-rate `where` out of bounds | **Fixed**: now the typed different-rates error naming `resample`. |
| P1-1 `resample` | **Fixed** and used throughout. New hole: N3. |
| P1-2 `mean(x, "t:lap")` | **Still open** ("mean: expected scalar argument, got string"; `percentile` with 3 args: "takes 2 args"). |
| P1-3 lap-table columns can't read definitions | **Not testable from the CLI**: see N7. |
| P1-4 histogram/spectrum/scatter/map over definitions | Not re-tested (app/IPC; this run was CLI only). |
| P1-5 one failing definition blanks its cell (JS) | Not re-tested in the app. CLI side: N9. |
| P1-6 a workbook evaluates one session | **Still open.** This run needed 36 CLI evaluations and 8 literal tables. |
| P1-7 nothing exports a derived channel | **Still open**: text mode still prints "N sample(s)". `--json` works for scalars only (series are full rate, see N7). |
| P2-1 `session import` .idl0 | Not re-tested (imports were forbidden for this run). |
| P2-5 no tables in prose | **Still open** (`Parser::new_ext(…, Options::empty())`, `workbook/v3/prose.rs:96`). |
| P2-8 `workbook eval` has no `--data-dir` | **Still open, and the docs are wrong**: see N6. |
| P2-9 nothing flags clipped channels | **Still open.** Every session of both days clips IMU1 at 16.0 g (102–397 clipped samples per km). Computed by hand in a cell. |
| P3-1 track propose · P3-2 distance stations · P3-3 lateral offset · P3-6 transfer/coherence · P3-8 FIT merge | **Still open**, not needed beyond what is noted below. |
| P3-4 `airborne()` and an events table | **Still open**; it is the biggest analysis blocker: see N10. |
| P3-5 IMU gravity alignment | **Still open**; worked around with session-mean vectors, see N4. |
| P3-7 yaw / `unwrap` | **Still open**; see N11. |

---

## New gaps

### N1 (P0) `wheel_travel("front")` panics on every real three-IMU session

**Needed:** to re-test day-1 P0-2. **Tried:** `max(wheel_travel("front"))` on day 2 S1.
**Got:** `thread 'main' panicked at core\src\estimate\run.rs:642:53: index out of bounds: the len is 1676850 but
the index is 1676850`. That is exit 101: a crash on real data (CLAUDE.md §5). `run.rs:632-643` indexes
`input.imu1.accel[i]` and `input.imu2.accel[i]` by IMU0's sample index `i`. The three IMUs run on their own clocks
(day 2 S1: 1,731,561 / 1,714,015 / 1,676,850 samples), so the lengths never match. Even with equal lengths,
pairing by index ignores recorded time. **Smallest fix:** put IMU1/IMU2 on IMU0's recorded times before the loop
(the `resample` kernel R242 already has), and return a typed error rather than panic on a length mismatch.
Day-1 P0-2 (no calibration → typed error) still applies on top.

### N2 (P0) `where` on a `[lap]` value returns a `[t]` value with lap numbers read as microseconds

`where(lap_number() >= 2, lap_time(), sqrt(-1))` returns 8 values on a time axis `t = [1e-6, 2e-6, …]`, losing
the `[lap]` shape. Consequences:
(a) A nested `where` on two `[lap]` values errors: "cannot combine a [lap] value with a [t] value".
(b) The result cannot be combined with `sector_time(i)` or charted as a lap progression.
(c) A JS cell that draws it on `"t"` would plot lap 3 at 3 µs, which is the wrong answer C2 forbids.
**Workaround used:** product of comparisons `(lap_number() >= 2) * (lap_time() < k) > 0.5` inlined into every
`where`. **Fix:** elementwise builtins (`where`, `abs`, `clip`, ...) carry their argument's axis kind (`[lap]` in,
`[lap]` out). The µs scaling suggests the lap axis goes through the time-axis constructor somewhere.

### N3 (P1) `current_lap()` and `sector_number()` cannot be resampled

`resample(current_lap(), [GPS_SpeedKmh])` → "x has no per-sample time axis". So nothing at GPS, HR or IMU1/IMU2
rate can be windowed by lap, and that is every per-lap speed, HR and wheel metric. **Workaround used:**
`current_lap() + 0 * [Time]`, which does acquire `[Time]`'s axis, then `resample`. **Fix:** give the lap
functions the base channel's time axis (they are documented as "per-sample channels at the session's base
rate"), or a `current_lap(onto)` form.

### N4 (P1) A scalar *definition* is a 0 Hz channel in arithmetic with a channel

`ux = mean([IMU0_AccelX])`, then `[IMU0_GyroX] * [ux]` gives "Cannot "Mul" channels with different sample rates
(806.45 Hz vs 0 Hz)". `[IMU0_GyroX] * mean([IMU0_AccelX])` works, and so does `2 * [ux]`. So projecting any IMU
onto an axis computed in the workbook (gravity vector, lean axis) has to repeat the whole expression inline. The
day-2 suspension cell carries nine copies of `mean(...)`. **Fix:** a rank-0 definition referenced by name
broadcasts like a literal.

### N5 (P0) Per-sample integrals are not restarted at the lap window, contrary to the reference

Under `--main-lap 3`, `last(cumtrapz([GPS_SpeedKmh]))/3.6` = 5165 m (lap ≈ 1900 m), and `first(...)` = 3264 m.
The integral runs from session start, and only the aggregate is windowed. WORKBOOK-REFERENCE "What a window
changes" says "A per-sample function is computed over the samples inside it". An author following the docs gets
session distance labelled as lap distance. **Lead to rule:** either the engine computes per-sample functions
inside the window (filters then differ at window edges, as day-1 P1-3 noted), or the docs say "computed over the
session, then windowed". Today the docs and the engine disagree. This run used `last − first`.

### N6 (P1) `workbook eval/data --session <id>` does not work; nothing maps a session id to its blob

`--help` and CLI-REFERENCE say `--session` takes "an `.idl0` file, or a session id inside --data-dir". But
`workbook eval` rejects `--data-dir` ("unexpected argument"), and with `IDL1_DATA_DIR` set, an id gives "The
system cannot find the file specified". A `sessions/<id>` folder gives "Access is denied". `session_context` calls
`SessionHandle::from_path`, which reads `.idl0` bytes only. **Workaround used:** `session show --json` →
`blob_sha256`, then `blobs/sha256/<2>/<62>`, re-parsed on every evaluation. The CLI re-detects laps from `--track`
and never reads the catalogued laps. **Fix:** resolve an id through the data dir and open its `data.parquet`
(the app's lazy handle), with laps from `session.json`. Add `--data-dir` to every `workbook` verb.

### N7 (P1) The CLI cannot show a table, and cannot show values without dumping full-rate series

`workbook eval` prints counts only. `workbook data <cell>` prints one cell, and any `[t]` definition in that
cell comes out at full rate in JSON (1.7 M values each). This run needed four extra output-only cells
(`o_x = [x]`) to get scalars out. `workbook data` on a `rowSource: "windowLaps"` table returns `"series": []`,
and `eval` reports "0 value(s)" for tables. So lap tables (and day-1 P1-3) cannot be checked from the CLI at all.
**Fix:** `workbook eval --values` printing every rank-0 result and `[lap]` value as `name value unit`. Also make
`workbook data` evaluate tables (one row per detected lap, `--main-lap` for authored rows). Together with
day-1 P1-7 (`--format csv --rate HZ`).

### N8 (P1) No way to read a channel's own sample times from the maths

There is no builtin for "the recorded time of each sample of `x`", nor its rate, nor `imuN_t_recorded_us`. This
blocked a direct P0-1 check (`t` against `t_recorded`, per IMU) and a GPS-interval check (done here from the
values of `GPS_EpochMs`). IMU0's rate came from `count([Time]) / (last([Time]) − first([Time]))` = 808.2–808.4 Hz,
against a nominal 806.45 Hz. **Proposed:** `time(x)` → `[t]` on x's axis, unit s (session time); `rate(x)` →
scalar Hz (median of 1/Δt); `t_recorded(x)` → `[t]`, unit s, NaN inside gaps.

### N9 (P2) A definition that depends on a failed one reports "Channel '[x]' not in this session"

The real error is on `x`; the dependent's message sends the author looking for a missing channel.
**Fix:** "depends on `x`, which failed: <x's error>".

### N10 (P1) No events: jump analysis stops at duration classes

**Needed:** per-flight take-off/landing time, duration, position along the lap, take-off speed, distance, pitch
change, and per-wheel touchdown order (day-1 P3-4), then jump-type classification (single, double, triple,
tabletop, step-up) from distance and pitch. **Tried:** a trailing `mean([air], N)` window is entirely airborne
only after N samples of flight. Its rising edges count flights longer than 0.25 / 0.5 / 0.75 / 1.0 s. That gives
flights per km by duration class, air per km and mean flight, which is what the workbook reports. It cannot say
*which* jump, *where*, or how far, so classification is impossible. Rising edges of the raw flag count 150–365
"take-offs" per lap, which is chatter, so a debounce is needed too. **Smallest addition:**
`events(cond, min_s, merge_s)` → an `[event]`-shaped value with `start`, `end`, `duration` (s). Event
reductions `at_start(x)`, `at_end(x)`, `over(x, "mean"|"max"|"integral")` read any `[t]` channel by recorded
time. A `"events"` table `rowSource` beside `"windowLaps"`. With `lap_distance()` (N12), `at_start(lap_distance())`
places each jump on the lap.

### N11 (P1) No GPS-only lateral acceleration (`unwrap` absent)

Lateral grip was computed from the frame gyro about its gravity vector × GPS speed, with a lean correction that
assumes a coordinated turn. The independent check (GPS speed × d(heading)/dt) needs `unwrap(x, period)` for
`GPS_Heading`. **Proposed:** `unwrap(ch, period=360)` → `[t]`, unit as `ch`. Without it the grip figures are
single-source estimates.

### N12 (P2) No lap distance or track geometry from the engine

There is no `track show` (reference length, gate positions along the line) and no `lap_distance()` channel.
Lap length here is Doppler speed integrated over the riding window divided by laps (1252–1273 m and 1885–1896 m).
**Proposed:** `idl-rs track show <id> --json` with `reference_length_m` and each gate's `station_m`, and
`lap_distance()` → `[t]`, m, from projecting position onto the reference polyline (overlaps day-1 P3-2).

### N13 (P2) No NaN literal; masking an aggregate is undocumented

`0/0` is a "Division by zero" error. `sqrt(-1)` yields NaN, and every aggregate tried (`mean median min max std
count percentile sum`) silently skips NaN. That skipping is the only way to restrict an aggregate to a mask (laps
2+, speed > 15 km/h). It works, but nothing documents it and nothing says a mask was applied. **Proposed:** a
`nan` constant, plus `mask(x, cond)` → x with NaN where cond is false. Document NaN-skipping on every aggregate.

### N14 (P2) Window lengths are in samples, rolling windows are trailing, and neither is documented

`rms(x, w)` / `mean(x, w)` take `w` in samples, so day 1 hard-coded `793`/`778` and day 2 `806.4516` as rates.
The window is trailing (measured: a step at t = 100 s reads 0.24 at t = 100.03 s with `w = 100`). Trailing
matters for event logic and for comparing with day-1's centred numpy windows. **Proposed:** accept a duration
(`mean(x, "0.25 s")`) and say "trailing" in the reference.

### N15 (P2) No boolean operators

`and`/`or` are absent; conditions are combined by multiplying 0/1 comparisons or nesting `where`. With N2 that
nesting fails on `[lap]` values. **Proposed:** `&`, `|`, `!` on 0/1 values (or `and`/`or`/`not`).

### N16 (P2) No gravity/mounting vectors per session (day-1 P3-5, still open)

The comparison relies on each IMU's session-mean acceleration as its "up" vector. Frame tilt came out
57.5–59.1 deg on all nine sessions, so the mounting is stable, but every workbook has to rebuild it.
**Proposed:** as day-1 P3-5, `vertical("imu1")` from the importer's still period.

---

## What the engine could not do at all in this comparison

- Per-jump table, jump positions, jump types (N10).
- Per-lap IMU, GPS and HR values across a session, beyond lap and sector times (day-1 P1-2, N3). Fatigue was
  therefore measured as early-laps against late-laps windows, not as a per-lap trend.
- Any number spanning two sessions: improvement %, day-to-day ratios (day-1 P1-6). Those were hand-subtracted
  from engine outputs and labelled so in the workbook.
- A map of where on the track grip, roughness or jumps happen, per day side by side (P1-4 app, P1-6).
- Line and corner-speed analysis as on day 1 (P3-2, P3-3): not attempted.

## Suggested order

N1 (crash) → N2 and N5 (silent wrong shapes/values) → N6 + N7 (make the CLI usable on a library) → N3 + N4 +
day-1 P1-2 (one theme: lap windows over any channel) → N10 (events) → N8, N11, N12 → the P2s.
