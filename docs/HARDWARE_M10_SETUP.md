# MAX-M10S bring-up and configuration

**Status:** written 2026-09-09 against the datasheet, *before* the hardware
arrived. Everything in §2 marked **[confirm]** is from knowledge of the UBX
protocol rather than from a document I read — check it against the
[M10 SPG 5.10 Interface Description (UBX-21035062)](https://content.u-blox.com/sites/default/files/u-blox-M10-SPG-5.10_InterfaceDescription_UBX-21035062.pdf)
at the bench before writing firmware against it. Configuration-key names and
enum values are the most likely thing to be wrong; the *intent* of each item
is the part worth keeping.

Why this file exists: ruling R136 wants lap distance derived from GPS
Doppler speed rather than from position. That works, but only if the
receiver is set up to report the right things at the right rate, and two of
the fields we want are not in the log today.

---

## 1. The one-paragraph argument

The datasheet spec's **velocity accuracy at 0.05 m/s** and **position at
2 m CEP**. Velocity is ~40× tighter, and 0.05 m/s is only reachable by
Doppler — differencing positions at 2 m CEP would give ±2–3 m/s. So
integrating the receiver's own speed is a far better distance estimate than
anything derived from lat/lon: over a two-minute lap at 5 Hz the random
component integrates down to roughly **±0.25 m**, and even a systematic
0.01 m/s bias only costs ~1.2 m. That is the entire reason for the settings
below.

## 2. Configuration

### 2.1 Rate

| Setting | Value | Why |
|---|---|---|
| `CFG-RATE-MEAS` **[confirm]** | `200` ms | 5 Hz. Datasheet max is 10 Hz multi-GNSS / 18 Hz single, so this is comfortably inside spec. |
| `CFG-RATE-NAV` **[confirm]** | `1` | One nav solution per measurement. |

1 Hz (the default the first prototypes ran at) assumes constant speed
across ~15 m of trail on a fast section. 5 Hz is the right default; 10 Hz is
available if the data turns out to want it, at roughly double the UART load.

### 2.2 Constellations

Leave the default **GPS + Galileo** (with SBAS and QZSS) unless there is a
reason not to: it is the 2 m CEP configuration in the datasheet's own table,
and the module tracks at most three concurrent constellations. Adding BeiDou
is the next thing to try if fixes are poor under canopy.

### 2.3 Messages to enable

Disable **all NMEA output**. At 5 Hz it is pure UART load for data we do not
use, and the UBX messages below carry strictly more.

| Message | Rate | What we need from it |
|---|---|---|
| `UBX-NAV-PVT` | every solution | `gSpeed` (2D ground speed), `velN`/`velE`/`velD`, `sAcc`, `hAcc`, `fixType`, `numSV`, and the UTC fields the wall-clock anchor already uses |
| `UBX-NAV-ODO` | every solution | `distance`, `totalDistance`, `distanceStd` — the receiver's own travelled-distance estimate |

### 2.4 The odometer

The datasheet's firmware-feature table lists an **Odometer**: *"Measure
traveled distance with support for different user profiles."* It has to be
switched on (`CFG-ODO-USE_ODO` **[confirm]**), and it takes a motion profile
— pick the cycling profile if one exists on this firmware, otherwise the
closest **[confirm]**.

This is Doppler integration done inside the receiver, with its own filtering
and its own reported uncertainty (`distanceStd`). Log it **even though we
also integrate speed ourselves**: two independent distance estimates that
should agree, and disagreement is itself a signal about fix quality. It may
turn out to be the better primary source — decide with data, not now.

### 2.5 Dynamic model

The default (Portable) is safe. A bike/automotive-class model constrains
vertical motion in ways that may or may not suit trail riding with real
airtime — **[confirm]** the available enum values on this firmware, and
treat this as something to A/B on real rides rather than set once and
forget. If in doubt, leave it Portable: a wrong constraint here quietly
distorts exactly the vertical component §3 is trying to capture.

### 2.6 UART

5 Hz × (`NAV-PVT` ~100 B + `NAV-ODO` ~28 B) ≈ 700 B/s including framing.
38400 baud is sufficient; **115200 is the safer default** and leaves room
for 10 Hz later.

### 2.7 Persisting it

Write the configuration to both battery-backed RAM and flash so a cold boot
comes up configured **[confirm the layer flags]**. Have the firmware
**re-apply the full configuration on every boot regardless** — a module that
silently reverts to 1 Hz NMEA after a battery pull is a class of bug that
shows up as mysteriously bad data weeks later, not as an error.

---

## 3. What the log must gain

`GPS_FIX` (SPEC §5.6) is a fixed 32-byte record, so adding fields is a wire
format change: SPEC §5.6 table, the record's `payload_len`, the importer,
and a format-version bump. Not free — worth doing in one pass rather than
three.

| Field | Type | Unit | Why |
|---|---|---|---|
| `speed_accuracy` (`sAcc`) | u16 | mm/s | Per-fix speed uncertainty. Lets distance integration weight each sample by `1/sAcc²` (inverse-variance — the standard estimator) instead of hard-gating on `fix_quality`. Under canopy `sAcc` inflates on its own, so bad samples fade out smoothly rather than falling off a threshold cliff. |
| `velocity_down` (`velD`) | i16 | cm/s **[confirm range]** | Vertical velocity. `gSpeed` is 2D, and on steep trails the vertical component is real: `speed3D = hypot(gSpeed, velD)`. Logging it means the choice of 2D vs 3D stays an analysis decision instead of being baked into the recording. |
| `odo_distance` | u32 | m **[confirm]** | The receiver's own travelled distance. |
| `odo_distance_std` | u16 | m **[confirm]** | Its uncertainty — the cross-check's error bar. |

Keep the existing `speed` field as-is (u16, km/h × 100) so old recordings
keep parsing unchanged.

**Also worth confirming in the firmware while you are there:** that `speed`
is copied from a receiver-reported field and is not computed from successive
lat/lon. Everything above assumes the former. The datasheet makes it near
certain — no position-derived speed reaches 0.05 m/s — but it is a
five-minute `grep` and it underwrites the whole approach.

---

## 4. Bench acceptance, before it goes on a bike

1. **Stationary, 10 minutes, clear sky.** `gSpeed` should sit near zero with
   small jitter, and `sAcc` should be small and stable. This is the direct
   confirmation that speed is Doppler: a position-differenced speed would
   wander by metres per second at rest. Isaac has observed near-zero-with-
   jitter on existing hardware, which is already consistent with Doppler.
2. **Stationary, same 10 minutes:** `NAV-ODO`'s `distance` should barely
   grow. If it accumulates hundreds of metres sitting still, the odometer's
   profile or the dynamic model is wrong.
3. **A known loop** — a lap of something you can measure another way. Compare
   three numbers: integrated `gSpeed`, `NAV-ODO` distance, and
   position-derived distance. The first two should agree closely; the third
   should be visibly noisier. If it does not come out that way, stop and
   work out why before building lap alignment on top of it.
4. **Under canopy.** Watch `sAcc` and `numSV` degrade together. This is the
   data that tells us whether inverse-variance weighting is sufficient or
   whether a real gate is needed after all.

Record each of these as a session in the app — they are the fixtures the
distance work gets tested against.
