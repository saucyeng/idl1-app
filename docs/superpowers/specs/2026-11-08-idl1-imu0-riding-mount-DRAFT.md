# IMU0 mount from riding data (DRAFT)

Status: **spec-first draft**, 2026-11-08. A tweak to the shipped estimator
(`rust/core/src/estimate/`), not the kinematic-chain rewrite
(`2026-09-15-idl1-kinematic-chain-estimator-DRAFT.md`). Approved in principle by
Isaac 2026-11-08 ("maybe not a rewrite, just tweaking to make it work better");
§6 is open.

## 1. Problem

`BikeGeometry::reference_bike().imu0.mount` is a pure 180° yaw (sensor X-rear,
Y-right, Z-up). Any real mount tilt is absorbed instead into the *initial chassis
attitude* (`orient::initial_attitude`, from the first stationary window). The
chassis frame therefore stays glued to the sensor axes:

- `attitude("roll")` is rotation about the sensor's own X axis, not the bike's roll
  axis. The moto's IMU0 is tilted 56–58° about Y (measured on all 13 MX sessions),
  so moto roll is mostly yaw; the GT Force's is tilted 11.6°, so its roll carries
  sin 11.6° ≈ 0.2 of the yaw rate.
- The first stationary window is often the bike on its stand, so a 5–10° parked lean
  is baked into the initial state.

Independent measurements on 2026-11-08 (`walden-2026-11-07-track.idl1wb`,
`hang-off-lower-broken-bomber.idl1wb`) derived the axes from riding data and got
consistent results on both bikes, which is the method below.

## 2. The change

A new step in `estimate::orient`, run once per session before the IEKF:

**(M-1) Riding mask.** IMU0 samples with GPS speed (resampled onto IMU0) above
15 km/h.

**(M-2) Up.** Mean IMU0 specific force over the mask, normalised: `u`. Second pass:
recompute over the mask restricted to straight-line riding, |v · (ω·u)| / g < 0.1,
so an asymmetric track (more left than right turns) does not tilt `u`.

**(M-3) Forward.** The reference mount's chassis +X mapped into the sensor frame,
`f₀ = M₀⁻¹ x̂`, with its `u` component removed and normalised: `c`. Its sign `s` is
the sign of the correlation, over the straight-line mask, between `c · a_lp` (1.5 Hz)
and the GPS longitudinal acceleration (speed low-passed at 0.4 Hz after resampling,
NaN samples zeroed first), so `f = s c`.

**(M-4) Mount.** `left = u × f`; the sensor→chassis mount is the rotation whose rows
are `(f, left, u)`. Mount yaw about `u` is not fitted here: measured lateral-to-GPS
cross-talk was 0.01–0.14 on the five rides above.

**(M-5) Gates.** Use the riding mount only when the straight-line mask holds at least
30 s, |correlation| ≥ 0.1, and `u` is within 80° of the reference mount's +Z.
Otherwise keep `reference_bike().imu0.mount` (today's behaviour) and record the
reason in the estimator diagnostics.

The initial attitude is still fitted from the first stationary window, now in a
chassis frame whose +Z is the riding "up", so a parked lean shows up as a
recoverable initial roll instead of a permanent frame error.

## 3. Interfaces

- `orient::fit_imu0_mount_from_riding(accel, gyro, speed_on_imu0, t, coarse) -> MountFit`
  (`MountFit { mount, straight_s, corr, used: bool, reason }`). Pure; std only.
- `EstimatorInput` already carries GPS; `run_with_trace` calls the fit before the
  stationary-window step when `EstimatorConfig::riding_mount` is true (default true).
- No contract change (C1–C4): the mount is derived per session, never stored.
  Estimator outputs are already derived, so their values change; the engine version
  identity (TASKS) should bump with it.

## 4. Tests (inline `#[cfg(test)]`)

- `riding mount — synthetic IMU tilted 57° about Y, riding with braking — recovers the
  tilt within 0.5° and the forward sign`.
- `riding mount — forward reversed in the synthetic data — sign flips`.
- `riding mount — under 30 s straight riding — falls back to the reference mount`.
- `riding mount — kickstand-lean opening window — chassis up unaffected`.
- `attitude roll — synthetic coordinated turn on a 57°-tilted IMU — roll matches the
  truth within 1°` (today this fails: it reads mostly yaw).

## 5. Validation on real data

On Walden 2026-11-07 motos 2–4 and Lower Broken Bomber (`173461a2`, 5784–5834 s):
estimator roll against (a) the gyro-only roll pinned to gravity on straights
(script kept with the analysis) and (b) atan(lateral g) − accelerometer hang-off.
Pass: median |difference| under 1.5° in corners over 0.3 g.

## 6. Open: the unsprung mounts and wheel travel (Isaac)

`imu1`/`imu2` mounts in `reference_bike()` were baked against the *old* IMU0 chassis
frame (the GT Force's IMU0 up, tilted 11.6°). Changing IMU0's mount moves the chassis
frame by Δ = M₀,new · M₀,old⁻¹. Two options:

- **A.** Rotate the unsprung mounts by the same Δ, so the IMU0–IMU1–IMU2 relative
  geometry is unchanged. The lever arms and fork/steer axes are written for a level
  chassis, so they become *more* correct. Wheel-travel values on the GT Force shift and
  have to be re-checked against the 11/4–11/5 workbooks.
- **B.** Apply the riding mount only where attitude is read out, leaving wheel travel
  bit-identical. This is a bypass around the estimator's own frame, and is not
  recommended.

On the moto, both options leave wheel travel using the GT Force's geometry (lever
arms, axle path, travel), which is wrong for that bike either way. That is the
per-bike geometry question, out of scope here.
