# Camera IMU: sync by motion, and the camera's motion as ride channels (DRAFT)

2026-11-23. Approved by Isaac the same day ("yup sounds good") after the
helmet-cam look at Waterllama. Extends the video spec
(`2026-10-16-idl1-video-DRAFT.md`): §4.3's "possible refinement" (sync by the
camera's accelerometer) and "camera IMU as data", which §4.3 said would get
its own spec. This is it.

## 1. Why

- Isaac's camera is a HERO11 Black Mini: no GPS, so GPMF has no UTC anchor
  and every clip syncs from the container's creation time. On both 11/21
  clips that was 1.1 s late (about 26 frames). The fix was a Python
  cross-correlation of the camera's `ACCL` against the pods
  (`agent-gaps.md`, 2026-11-14 and 2026-11-23).
- The camera records its own motion: `ACCL` and `GYRO` at about 200 Hz,
  `GRAV` (the gravity direction in the camera's frame) at the video's frame
  rate. On a helmet that is the rider's head. The 11/21 look found the body
  passing 57 % of 1–4 Hz frame vibration to the head and 6 % of 30–80 Hz,
  head yaw leading bike yaw by about 150 ms, and head tilt of 10° (median).
  None of that can be a workbook today: the camera's IMU is not a channel.

## 2. Sync by motion (`core`, `idl_rs::video::sync`)

A new `SyncMethod::Imu` (`"imu"` in `session.json`, C1 §6 `videos[].sync_method`).

- **When:** after the existing estimate (GPMF UTC, else creation time), on
  link and on re-estimate. Never over a manual offset (video spec §4.3: a
  manual offset is replaced only by an explicit re-estimate, which may then
  land on `imu`).
- **How:** the camera's accelerometer magnitude and each logger pod's
  accelerometer magnitude (`IMU<n>_AccelX/Y/Z`, low-g) are put on one 200 Hz
  grid over the clip's span, high-passed (minus a 1 s moving mean), rectified
  and smoothed over 0.1 s: a vibration envelope. The camera's envelope is
  slid against each pod's over ±3 s of the anchor estimate in 5 ms steps;
  each pod gives the lag of its best normalised correlation.
- **Accepted when** at least two pods agree within 0.25 s and the median of
  their best correlations is ≥ 0.3, or, on a logger with one pod, that pod
  alone reaches 0.4. The offset is the anchor's plus the
  median lag. Otherwise the anchor's estimate stands, unchanged.
- **Confidence** reported: the median correlation.
- On 11/21: GX010179 −1.08 s (pods within 0.05 s), GX010177 −1.105 s (within
  0.15 s), r 0.43–0.51. The engine's own estimate for GX010177 (2026-11-23):
  offset 7466.470 s, 10 ms from the Python one, in 9 s.

Pure function in `core` over slices (camera samples, pod samples, anchor
offset); the library reads the blob and `data.parquet` and calls it.

## 3. The camera's motion as channels

### 3.1 Parsing (`core`, `idl_rs::video::gpmf`)

`parse_camera_imu(samples) -> CameraImu`, beside `parse_gpmf`:

| Stream | Unit on disk | Channel unit | Channels |
|---|---|---|---|
| `ACCL` | m/s², ÷ `SCAL` | g (÷ 9.80665) | `Cam_AccelX`, `Cam_AccelY`, `Cam_AccelZ` |
| `GYRO` | rad/s, ÷ `SCAL` | deg/s | `Cam_GyroX`, `Cam_GyroY`, `Cam_GyroZ` |
| `GRAV` | unit vector, ÷ `SCAL` | (none) | `Cam_GravX`, `Cam_GravY`, `Cam_GravZ` |

- **Axes:** the camera's own, as GoPro names them. A stream's `ORIN` string
  (e.g. `"ZXY"`) says which camera axis each stored column is; upper case is
  the axis, lower case its negative. No `ORIN` means the columns are X, Y, Z.
- **Time:** a payload's N rows spread evenly over its `gpmd` sample's span
  on the video clock (`[t_k, t_k+1)`; the last reuses the previous span), the
  same rule `parse_gpmf` already uses for GPS rows. Session time is video time
  plus the link's `offset_s` (C1 §6).
- Other streams (`CORI`, `IORI`, exposure, white balance, wind, scene, face)
  are not channels in this step.

### 3.2 Storage (`library`)

Camera channels are a function of (video blob, offset, parser version), not of
the logger's blob, so they cannot live in `data.parquet` (design principle:
`data.parquet` is a function of (blob, importer version)). They go where the
physics solver's outputs go: `sessions/<id>/derived/<hash>.parquet` (C1 §5),
`derived_kind` `"camera"`, content-addressed by the video's sha256 and the
config `{ "video_sha256", "offset_s", "stream", "parser" }`. Two files per
linked clip: one for `ACCL` + `GYRO` (one time axis), one for `GRAV`.

- **Written** on link, on a changed offset (manual or re-estimated), and
  lazily when a ride is opened and a live linked clip on this device has no
  current file (a clip linked before this step, or synced from another
  device: the files are derived, so sync may or may not carry them).
- **Replaced:** writing a clip's files deletes that clip's other `"camera"`
  files (an old offset). Unlinking deletes them.
- **Read** by the same merge as the solver's outputs
  (`idl_library::estimated`): every `"camera"` file's channels are handed to
  the session under their stored names. Two clips that overlap (rare: one
  camera) merge newest-first like solves.
- A ride with no blob on this device simply has no camera channels.

### 3.3 What a reader sees

`[Cam_AccelX]` etc. in maths cells, charts and overlay readouts, sampled at
the camera's rate on the ride's clock, present only over each linked clip's
span. `channels` lists them; `C1` is unchanged apart from §5's new
`derived_kind` and §6's new `sync_method` value.

## 4. Not in this step

- Head orientation as angles (`CORI` quaternions), or head-relative-to-bike
  angles: needs the bike's lean from the solver (#6).
- A notebook template for helmet analysis; the Python look (`helmet.py`) is
  the sketch for it.
- Chest or bar mounts: nothing here assumes the helmet, but nothing labels
  the mount either.

## 5. Contract changes

- C1 §5: `derived_kind` `"camera"`.
- C1 §6: `videos[].sync_method` gains `"imu"`.
- C3 §3.12: `link_video` / `reestimate_video_offset` may return `sync_method`
  `"imu"`; no signature change.
