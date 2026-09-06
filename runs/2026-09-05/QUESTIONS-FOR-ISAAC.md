# Open questions for Isaac (as of 2026-09-05 evening)

None is blocking. Each has a ledger entry in `runs/2026-09-03/decisions.md`;
answer in whatever order suits, and the lead turns each into a one-task change.

## Hardware / firmware facts (SPEC §8 and §7.3)

1. **IMU defaults** — rate (Hz), accel range (g), gyro range (dps) the
   firmware actually boots with. Today the Device tab pre-fills 833 / 32 /
   2000 from SPEC §8's worked example. *(tracked note, "IMU defaults")*
2. **IMU mode flags** — are `low_power_mode` and `high_performance_mode`
   mutually exclusive, or does one win when both are set? Today the validator
   warns; with an answer it becomes an error or a rule. *(tracked note)*
3. **Valid pin sets** — the legal `adc_pin` and `gpio_pin` values (or a map to
   §3.7's named nets). Today the pin input is an unconstrained non-negative
   integer; with an answer it becomes a dropdown and a validator rule. *(R58)*
4. **Status block fields** — can the firmware report SD free bytes, GPS fix
   quality, satellite count and battery millivolts in the §7.3 status block?
   If yes, `device_status` grows additively. *(R59 Q6)*
5. **Generic channel ids** — for configured analog/digital channels, is the
   wire `channel_id` deterministic from config order (the preview can compute
   it) or assigned by the firmware at boot (only the parser knows)? *(R63 Q2)*

## Product calls

6. **GPS map basemap** — wave 2 draws the GPS trace on plain axes (no tile
   server, per "no CDN, ever"). Do you want a user-configured tile URL as an
   explicit off-by-default exception later? *(R52 Q8)*
7. **Lap tables are empty in wave 2** — no wave-1 import path indexes laps;
   the Data tab shows "—" honestly. Lap indexing at import is on the Rust
   backlog after the write-amendment lane. Fine to ship this way, or should it
   move up? *(R53 Data Q4)*

## Data

8. **Real FIT/GPX archive** — the importers landed against synthetic
   fixtures; the FIT/GPX speed/heading direct path ("L2 follow-on S/H") waits
   for real files to validate against. *(R23 Q4, R60)*
9. **Sample rates** — `IMU2_AccelX` measured 791.77 Hz on your real session
   against 833 configured / 800 in the header / 812.3 from seam validation.
   Not blocking; worth knowing which the firmware intends. *(L5 landing)*

5b. **Pressure channels 20/21** — SPEC section 8's config example gives no scale/offset source for them, so the registry preview emits no row for pressure until it does. *(R64.5)*

## 11. Disk headroom (2026-09-06, blocking Tauri builds)

C: reached 0 bytes free during L8w Task 13's app-crate check. The lead
freed ≈2.5 GB of stale Claude scratch only. Tauri builds need ~20 GB of
headroom. Candidates (your call): `Downloads` 37.5 GB,
`AppData\Local\Packages` 27.8 GB, `AppData\Roaming\Claude` 10.2 GB,
`idl0-app\rust\target` 3.9 GB (rebuildable), `pagefile.sys` 36.5 GB
(system-managed). May the lead delete the idl0-app target directory?
Addendum: `saucyeng/.cargo-shared-target` (the wave-2 worktree build cache)
is 12 GB and every wave-2 worktree is now retired; clearing it is safe and
rebuildable but forces cold compiles for wave 3 worktrees (memory cost).
`idl1-app/app/src-tauri/target` is 9.2 GB. The lead will not build the
Tauri preview until ≥10 GB is free — say which of these to clear.
