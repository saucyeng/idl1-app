# DRAFT — Video: linked footage, synced playback, then overlays

Status: proposal for Isaac, 2026-10-16. Spec-first, and an architecture
change: it adds a field to `session.json` (C1 §6), a new kind of blob and a
merge rule to sync (C4 §2, §6), and new commands (C3). Nothing is built
until Isaac says yes to §3 and answers §10.

Supersedes design D9 ("video export is sidelined") only for step 1 below.
Steps 2 and 3 get their own specs when step 1 has shipped.

## 1. What Isaac asked for (2026-10-15/16)

- Video **lives with the session's log**. Moving to another device means
  moving the log and the MP4 together, and LAN sync should do that.
- **One step at a time:** synced playback first, then overlays in the app,
  then shareable exported videos. Don't skip steps and bend the
  architecture to get there.
- **Overlays use the same chart cells as the notebook.** No second set of
  overlay-only chart types: that split was one of the reasons for the
  rewrite (design §1, D9).
- **Exporting from the app is fine,** as long as Claude can drive the app,
  take screenshots and check the output itself (§8).
- Later: link the GoPro to the logger so one record button starts both,
  and download GoPro footage inside the app (§9).

## 2. Shape in one paragraph

An MP4 is stored the same way as a log: once, as an immutable blob named by
its SHA-256 (`blobs/sha256/…`). The session's `session.json` lists the
videos linked to it, each with a **sync offset** saying where the video
sits on the session's clock. Linking a video estimates that offset
automatically from the GoPro's own GPS time. The rider can correct it by
lining up one event that is visible in both the video and the data. In the
Notebook, a video panel follows the shared cursor: scrubbing the cursor
seeks the video. While playing, the video drives the cursor, so every chart
moves with the footage.

## 3. Storage and sync (C1 / C4 changes)

### 3.1 The blob

The MP4's bytes go into `blobs/sha256/<2>/<62>` unchanged. C4 already says
a blob's format is recorded by whatever references it, never by the path,
so this needs no new path pattern.

Copying in is streamed (read, hash and write in chunks, never the whole
file in memory), reports progress over a `Channel` (R201), and is
cancellable. A typical GoPro chapter is up to about 4 GB.

### 3.2 `session.json` gains `videos`

```jsonc
"videos": [                              // array, omitted when empty
  {
    "blob_sha256": "…",                  // string, 64 hex — the identity of this entry
    "size_bytes": 0,                     // u64, bytes
    "file_name": "GX010123.MP4",         // string, the name it was linked from (display only)
    "video_codec": "h264",               // "h264" | "hevc" | other: the sample-entry fourcc as text
    "width_px": 0,                       // u32, px
    "height_px": 0,                      // u32, px
    "fps": 0.0,                          // f64, frames/s (nominal)
    "duration_s": 0.0,                   // f64, s
    "offset_s": 0.0,                     // f64, s — session_time_s = video_time_s + offset_s
    "sync_method": "gpmf",               // "gpmf" | "creation_time" | "manual"
    "unlinked": false,                   // bool, omitted when false — a tombstone, see §3.3
    "updated_at_ms": 0                   // i64, UTC ms — when this entry last changed
  }
]
```

`session_time_s` is the session's recording time, t = 0 at the start, the
same clock as `laps[].start_time_secs`. Each GoPro chapter file is its own
entry with its own offset. Chapters are synced one by one, so a gap or a
dropped frame at a chapter boundary can't push later footage out of sync.

### 3.3 Sync rule for `videos`

C4's per-field merge treats a field as one value. For a list of videos,
that would mean two devices that each linked a different video keep only
one of them. Proposed instead:

- **Union by `blob_sha256`.** A video linked on either side ends up on both.
- **The same entry on both sides:** the newer `updated_at_ms` wins as a
  whole entry. This is how a manual offset made on the phone reaches the
  computer. An exact tie keeps the local copy (C4's R91 convention).
- **Unlinking leaves a tombstone** (`"unlinked": true`). Without one, the
  union would bring an unlinked video straight back from the other device.

The blob itself syncs like any other blob: the receiver pulls hashes it
lacks. Range requests are already resumable (C4 §6), which matters at 4 GB.

### 3.4 Not in this step

No transcoding, no thumbnails or preview proxies, no audio extraction. A
video that the webview can't play is reported as such (§5.5), not
converted.

## 4. Linking and the sync offset (`core`)

### 4.1 Linking

- **From a session:** an "Add video" action on the session (Data tab, and
  the Notebook's video panel when it is empty) opens a file picker. More
  than one file can be picked.
- **Drop or inbox:** an MP4 dropped on the app, or placed in `<data>/inbox/`,
  is matched to sessions by time. If exactly one session overlaps, it is
  linked to that one. If several overlap, the user picks. If none
  overlaps, the link is refused with a typed error naming both time
  ranges. The inbox follows its existing rules (C4 §2): delete on success,
  move to `failed/` on failure.
- A file picked from an SD card is copied, never moved.

### 4.2 Reading the container

The idl0 ISO-BMFF walker and GPMF parser are recovered from idl-rs tag
`idl0-video-export` (`core/src/video/{mp4box,gpmf,sync}.rs`) into `core`,
with two changes:

1. **Seek-based reads.** idl0's `read_info_path` does `std::fs::read` on the
   whole file. That is a 4 GB allocation per chapter, which this machine
   can't afford (R13). The port walks boxes with `Seek` and reads only
   `moov` and the `gpmd` samples.
2. **Codec reporting.** Read the video track's `stsd` fourcc
   (`avc1`/`hvc1`/`hev1`) into `video_codec`, so an unplayable file is
   flagged at link time, not when it fails to play.

### 4.3 Estimating the offset

In order of preference, as idl0 did (IDL0_SPEC §33.3):

1. **`gpmf`:** the GoPro's GPS time (`GPSU`), set against the session's
   GPS-anchored clock. This needs GoPro GPS on.
2. **`creation_time`:** the container's creation time. Coarse: GoPros
   often write local time rather than UTC, and camera clocks drift.
3. **Neither:** link as `manual` at the rough start and ask the user to
   align it.

A manual offset is never overwritten automatically. Re-estimating happens
only when the user asks.

**Possible refinement, not in step 1:** GoPro records its own
accelerometer and gyro in GPMF (`ACCL`/`GYRO`, about 200 Hz).
Cross-correlating those against the logger's IMU around the GPS estimate
could align video and data to within about a frame, automatically, with no
manual bump. It is physics, so it belongs in `core`. See §10 item 7.

**Camera IMU as data (Isaac, 2026-10-16: "incredible data for making the
rider observable").** The same `ACCL`/`GYRO` streams, once synced, could
become session channels: the motion of a helmet- or chest-mounted camera
is the rider's motion. That would be a GPMF importer feeding channels with
their own hardware timestamps, mapped through the video's offset. It is a
separate feature with its own spec, and depends on item 7's probe showing
the streams are there.

### 4.4 Commands (C3 additions, all `async` with progress)

- `link_video(session_id, path, on_progress)` → the new `videos[]` entry,
  or a typed error (unreadable container, no overlap, I/O).
- `match_videos(paths)` → for each file, the sessions it overlaps (drop
  and inbox flow).
- `set_video_offset(session_id, blob_sha256, offset_s)` → sets
  `sync_method: manual`.
- `reestimate_video_offset(session_id, blob_sha256)`.
- `unlink_video(session_id, blob_sha256)`.

## 5. Synced playback (step 1, `app/src`)

### 5.1 Getting bytes to the `<video>` element

The webview plays from a URL, and blobs have no extension. Proposed: a
custom URI scheme, `idl1-video://<sha256>`. It answers HTTP `Range`
requests (seeking needs them) with `Content-Type: video/mp4`, serves only
blobs linked from some session's `videos`, and reads with `std::fs`
straight from the blob path. No video bytes cross IPC. See §10 item 5 for
which crate owns the handler.

### 5.2 The panel

A video panel in the Notebook page shows the **primary window's**
session's video at the cursor. When the cursor is in a gap between
chapters, or outside the footage, the panel says so and shows no picture.
With several windows selected (lap comparison), the panel follows the
primary window, matching playback today (R134 item 6). Two videos side by
side for lap-vs-lap comparison is a later idea, not this step.

### 5.3 Who drives the clock

- **While playing, the video drives the clock.** The browser decodes and
  presents frames on its own schedule. Running the cursor from
  `requestAnimationFrame` and asking the video to keep up would let the
  two drift and stutter. `requestVideoFrameCallback` gives each presented
  frame's media time, which becomes session time and then the cursor.
  `interaction/playback.ts` gains an injected clock source: the
  `requestAnimationFrame` clock when there is no video at the cursor, the
  video's clock when there is. Playback speed sets `playbackRate`.
- **While paused, the cursor drives the video.** Pinning or dragging the
  cursor seeks the video, using `fastSeek` while dragging and an exact seek
  when the drag settles. Hover does **not** seek: seeking a 4K stream at
  pointer rate is janky (§10 item 6).
- The cursor bus carries a window-elapsed offset (R131 Q2).
  `cursorTimeInWindow` turns it into session time, and the offset turns
  session time into video time. No new time base is introduced.

### 5.4 Aligning by hand

An **Align** action:
1. Pause the video on a visible event, such as the hard compression at
   the start.
2. Pin the cursor on that event in a chart.
3. Press Align.

The offset becomes (cursor session time − video time) and `sync_method`
becomes `manual`. The rider can then nudge by ±1 frame or ±10 ms.

### 5.5 Codecs

WebView2 on Windows plays H.264. It plays HEVC only when Windows' HEVC
Video Extensions are installed. Android WebView depends on the phone. When
a video fails to play, the panel names the codec and suggests the GoPro's
"Most Compatible" (H.264) setting. Transcoding is out of scope (§3.4).

## 6. Overlays in the app (step 2, sketch only, own spec later)

- An overlay is a **layout**: a canvas size, a video slot, and slots that
  place existing cells by id, in a stacking order. A classic overlay is
  the video full-frame with cells above it. A 9:16 reel is the video in a
  band with cells around it. Same cells, same `channel()` data, no
  overlay-only chart vocabulary.
- The layout must live in the workbook, so the export in step 3 renders
  from the file and an agent can edit it (design §8). That is a C2 change,
  decided in the step 2 spec.
- **The one new mechanism:** cells that show a value *at the cursor*, such
  as a gauge, a g-g dot or a speed readout. They need the cursor time
  inside the cell at video frame rate. Today the cursor line is drawn by
  the app, outside the cells (R134 item 8). Likely shape: a throttled
  `cursor` host variable, with scrolling traces drawn once and moved
  rather than redrawn (idl0 rationale, 2026-07-29, "scrolling is
  translation").
- An **overlay theme** (transparent background, larger high-contrast
  text) is CSS tokens, not chart parameters ("no renderer-only
  parameters").

## 7. Export (step 3, sketch only, own spec later)

From the app. The webview renders each frame's cells to SVG; Rust
rasterises (`resvg`) and pipes frames to ffmpeg, which composites them over
the source video. ffmpeg ships with the app as a Tauri sidecar ("offline
first means bundled"). WebCodecs in the webview is the alternative to
weigh then. Not decided here.

## 8. Letting Claude drive the app (tooling, can go first)

Not a contract change. It is wanted before step 3, and it is useful right
away for every UI task.

- A dev-only launch script sets
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`
  before starting the dev build. It is never set in release builds, and
  the port is bound to localhost.
- A small Playwright script (`chromium.connectOverCDP`) attaches to the
  running app. It can click, run JS, read the console and save
  screenshots. That gives a project `run` skill, so a lane can open a
  session, pin the cursor, play and screenshot the result.
- For export (step 3): extract frames from the exported MP4 with ffmpeg
  and inspect them.
- Android later, through `adb` forwarding of the WebView's DevTools socket.

## 9. GoPro linked to the logger (later)

The logger already connects out to a BLE heart-rate sensor while it is
connected to the phone, and Isaac believes it can hold a few more
connections. So it can likely control a GoPro too. Open GoPro's BLE API
supports:

- Pairing once (camera in pairing mode), then reconnecting automatically.
- Starting and stopping recording: one record button starts both.
- **Setting the camera's date and time.** The logger can set the GoPro's
  clock from its own GPS time, so every clip's timestamps already agree
  with the log.
- Reading status: recording, battery, card space.

If the logger writes "camera started/stopped" markers into the log, sync
gets an exact anchor even with GoPro GPS off. That is a log-format change,
so it is Isaac's call when this step comes. Downloading footage goes over
Wi-Fi (the GoPro's own access point, or Camera on Home Network), using its
HTTP media API from `idl1-transport`, beside the logger download.

Unknowns to check in `idl1-firmware` before committing: RAM per
connection, whether phone + HR + GoPro fit at once, and how the GoPro's BLE
behaves while the camera sleeps.

## 10. Decisions and open questions

Decided 2026-10-16 (Isaac):

1. **Sync rule (§3.3):** yes, as written.
3. **Phone:** videos do **not** sync to the phone by default. Sending one
   to the phone on request is allowed, but not designed yet.
4. **Where the video lives in the UI:** in the workbook. "We just think of
   video overlays as a type of workbook." This replaces §5.2's app panel.
   Exactly how is open, see item 8.
5. **Handler placement:** left to the lead. Taken: the request logic is a
   function in `idl-rs-tauri`, registered on the builder in
   `app/src-tauri`.
6. **Hover:** the video follows pin, drag and play, not hover.
7. **IMU sync:** "see if it's possible." Isaac's HERO11 Mini shows no IMU
   data today. The only sample in the repo (`gopro app example.mp4`) is a
   GoPro Quik app export holding one H.264 track and no telemetry track, so
   it can't answer this. Next: probe a raw file from the SD card.

Also from Isaac: idl0's sync "worked very well, pretty much to the frame."
Sources disagree on whether the HERO11 Mini has GPS (most say no). If it
has none, `gpmf` sync (§4.3) can't run on it. Which camera and method gave
idl0's frame-accurate sync is item 9.

Decided 2026-10-16, second round (Isaac):

2. **Unlinking:** the unlink prompt offers "also delete the video file
   (4.1 GB)", ticked by default when no other session links it. Deleting
   is per device: the tombstone syncs, the file deletion does not.
8. **Video in the workbook: both.** Step 1 adds a `video` cell that any
   notebook can hold, showing the session's video at the cursor. Step 2
   adds the overlay workbook, whose front matter declares a canvas with
   cells placed on it. Both are C2 changes, specified in their own steps.
   §5.2's panel becomes the `video` cell; its behaviour (primary window,
   gaps, clock) is unchanged.
9. **idl0's frame-accurate sync** was with the HERO11 Mini, within a
   couple of frames. Isaac's guess is that the camera clock is set from
   the phone. No idl0 workspace under `Documents/sessions` holds a
   `videos[]` link, so the method idl0 used can't be read back. Point to
   check: `mvhd` creation time is whole seconds, so if the Mini has no
   GPS, frame-level agreement needs another sub-second time source in the
   file (or was a lucky or nudged offset). The raw-file probe (item 7)
   answers both questions at once.

Decided 2026-10-16, third round (Isaac): "just use the architecture from
idl0 for now." Step 1 ports idl0's estimator unchanged (GPMF GPS time,
else creation time, else manual), including its refusal of a video whose
span misses the session. Item 7's probe no longer blocks anything. It
informs a later refinement (IMU sync, camera IMU as channels) once Isaac
copies a raw SD-card clip into the repo.

**Step 1 contract edits, written 2026-10-16:** C1 §6 `videos`; C2 §2.1
`video` cell; C3 §3.12 commands, URI scheme and error kinds; C4 §2 inbox
and §6 merge, video blobs, mobile and repair rules. These replace §5.2's
"panel" with the `video` cell. Open: none.
