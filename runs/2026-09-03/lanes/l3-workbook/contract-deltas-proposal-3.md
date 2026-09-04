# L3 contract-deltas proposal — C3 §3.5–3.7 / C2 §6 amendment batch 3 (lead ruling R25)

Read-only sources: `runs/2026-09-03/decisions.md` (R25, last entry — the
authority for this batch; R22 for style precedent; R13 for compute-load
context), `lanes/l3-workbook/pre-read-tasks10-16.md` (gaps G10.2/G10.5/
G11.5/G11.6/G12.5/G13.1/G13.2/G13.5/G13.6/G13.13, rulings L3-R28, L3-R29
[superseded by R25's v2 tile decision], L3-R33, L3-R35, L3-R36, L3-R38,
L3-R39), the previous batch's proposal
(`lanes/l3-workbook/contract-deltas-proposal.md`, format precedent), landed
code (`rust/core/src/chart_decimation.rs`, `spectrogram.rs`, `fft.rs`,
`workbook/model.rs`), and `docs/legacy/idl0-workbook_format.md`. Produced
for the lead to apply with `Edit`; this lane does not touch the contracts
themselves.

Every `Target` block below quotes the exact current file text (verbatim,
including backticks) so it can be matched by an `Edit` call. Blocks that
contain a nested ```` ```ts ```` or ```` ``` ```` fence are wrapped in five
backticks here so the nested fence doesn't terminate early.

---

## Amendment A — C3 §3.5: tile layout version 2 (time axis + `MAX_TIER`)

### A1 — signature/errors/header: `MAX_TIER`, header `version` → 2, third region named

**Target** (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
`fetch_tile`'s signature through the header table, verbatim):

`````text
**`fetch_tile(session_id: string, channel: string, tier: number, tile_index: number)`**
`tier`: `u32`, `0` = raw (bucket size 1), `k` = bucket size `TIER_BASE.pow(k)`
(`TIER_BASE = 8`, `rust/core/src/chart_decimation.rs`). `tile_index`: `u32`.
Return: raw bytes via `tauri::ipc::Response` (`Result<Response, IpcError>`),
decoded frontend-side into the layout below.
Errors: `not_found` (unknown `session_id` or `channel`), `invalid_argument`
(`tier` outside the engine's configured range), `io`, `internal`.

**Binary layout.** Little-endian throughout. Two regions after a fixed
32-byte header: a **sample region** (the existing bucket min/max pairs —
`decimate_channel`'s output, made self-describing) and a **column region**
(coarser per-pixel-column `min, max, mean` stats, shipped so hover reads
never need IPC — design §6, "Hover reads the per-pixel-column stats shipped
with each tile").

*Header (32 bytes, fixed):*

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLT"` |
| `version` | `u16` | 4 | Layout version, `1` for this contract |
| `tier` | `u16` | 6 | Echoes the request |
| `tile_index` | `u32` | 8 | Echoes the request |
| `sample_count` | `u32` | 12 | Number of `(min, max)` bucket pairs that follow. Today `decimate_channel` always fills `TILE_SIZE_BUCKETS = 1024` (right-edge-padded with NaN); `sample_count` makes the tile self-describing so a shorter final tile or a future tile-size change never requires a layout bump. |
| `column_count` | `u32` | 16 | Number of pixel columns in the stats table that follows. Independent of `sample_count` — chosen by the caller/L3 to match the rendered chart width (design §6 point budget), not tied to the bucket grid. |
| `flags` | `u32` | 20 | Reserved, `0` in this contract — see open question 6.5 |
| `reserved` | `[u8; 8]` | 24 | Zero-filled, reserved |

Header ends at byte offset **32**.
`````

**Delta:**

`````text
**`fetch_tile(session_id: string, channel: string, tier: number, tile_index: number)`**
`tier`: `u32`, `0` = raw (bucket size 1), `k` = bucket size `TIER_BASE.pow(k)`
(`TIER_BASE = 8`, `rust/core/src/chart_decimation.rs`). `tile_index`: `u32`.
Return: raw bytes via `tauri::ipc::Response` (`Result<Response, IpcError>`),
decoded frontend-side into the layout below.
Errors: `not_found` (unknown `session_id` or `channel`), `invalid_argument`
(`tier` outside the engine's configured range), `io`, `internal`.
`MAX_TIER = 10` (`idl_rs::chart_decimation::MAX_TIER`, the largest tier
`k` for which `TIER_BASE.pow(k)` fits `u32` — *added post-sign, 2026-09-04,
lead ruling R25, wave-1 L3*) **is** "the engine's configured range" above:
L5 rejects `tier > MAX_TIER` with `invalid_argument` before producing any
bytes. The request stays `u32`; the header's `tier` field below stays
`u16` — narrowing is safe under that bound (`MAX_TIER = 10` fits a `u16`
with room to spare).

**Binary layout.** Little-endian throughout. Three regions after a fixed
32-byte header: a **sample region** (the existing bucket min/max pairs —
`decimate_channel`'s output, made self-describing), a **column region**
(coarser per-pixel-column `min, max, mean` stats, shipped so hover reads
never need IPC — design §6, "Hover reads the per-pixel-column stats shipped
with each tile"), and a **column time region** (*added post-sign,
2026-09-04, lead ruling R25, wave-1 L3* — see below; places each column on
the session's real time axis, C1 §2/§3.1: "time is recorded, not
assumed").

*Header (32 bytes, fixed):*

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLT"` |
| `version` | `u16` | 4 | Layout version, `2` for this contract — *bumped post-sign, 2026-09-04, lead ruling R25, wave-1 L3, for the new column time region below.* Version 1 (index-space only, no column time region) was never shipped. |
| `tier` | `u16` | 6 | Echoes the request |
| `tile_index` | `u32` | 8 | Echoes the request |
| `sample_count` | `u32` | 12 | Number of `(min, max)` bucket pairs that follow. Today `decimate_channel` always fills `TILE_SIZE_BUCKETS = 1024` (right-edge-padded with NaN); `sample_count` makes the tile self-describing so a shorter final tile or a future tile-size change never requires a layout bump. |
| `column_count` | `u32` | 16 | Number of pixel columns in the stats table that follows, and in the column time region below (same count for both). Independent of `sample_count` — chosen by the caller/L3 to match the rendered chart width (design §6 point budget), not tied to the bucket grid. |
| `flags` | `u32` | 20 | Reserved, `0` in this contract — see open question 6.5 |
| `reserved` | `[u8; 8]` | 24 | Zero-filled, reserved |

Header ends at byte offset **32**.
`````

**Why:** Closes G10.2 (no defined "engine's configured range," `tier`
could overflow/panic before validation) and G10.5 (the tile had no way to
place a column on a real time axis without assuming a uniform rate — the
invariant this lane exists to defend). `MAX_TIER` gives L5 a real symbol
to validate against; the third region gives the frontend an exact,
per-column recorded timestamp instead of `t = index / nominal_rate_hz`.

---

### A2 — column time region body, updated total length, worked example

**Target** (same file, column region formula through the Check line,
verbatim):

`````text
*Column region — offset formula:*
- Start: `column_region_offset = 32 + sample_count*8` (immediately after the sample region).
- Length: `column_region_len = column_count * 12` bytes (3 × `f32` × 4 bytes per column).
- Column `j` (0-indexed, `0 <= j < column_count`): `min` at byte
  `(32 + sample_count*8) + j*12`, `max` at `+4`, `mean` at `+8`.

*Total tile length:* `32 + sample_count*8 + column_count*12` bytes.

**Worked example — tier 3, 512 samples, 256 columns:**
```
header:              offset    0, length 32   → header occupies [0, 32)
sample region:        offset   32, length 512*8    = 4096   → [32, 4128)
column region:         offset 4128, length 256*12   = 3072   → [4128, 7200)
total tile length:     32 + 4096 + 3072 = 7200 bytes
```
Check: `4128 = 32 + 4096` ✓. `7200 = 4128 + 3072` ✓. `7200 = 32 + 4096 + 3072` ✓.
`````

**Delta:**

`````text
*Column region — offset formula:*
- Start: `column_region_offset = 32 + sample_count*8` (immediately after the sample region).
- Length: `column_region_len = column_count * 12` bytes (3 × `f32` × 4 bytes per column).
- Column `j` (0-indexed, `0 <= j < column_count`): `min` at byte
  `(32 + sample_count*8) + j*12`, `max` at `+4`, `mean` at `+8`.

*Column time region — offset formula (added post-sign, 2026-09-04, lead
ruling R25, wave-1 L3):*
- Start: `column_time_region_offset = 32 + sample_count*8 + column_count*12` (immediately after the column region).
- Length: `column_time_region_len = column_count * 8` bytes (`i64` × 8 bytes per column).
- Column `j` (0-indexed, `0 <= j < column_count`): `t_us` at byte
  `(32 + sample_count*8 + column_count*12) + j*8`.
- Value: the recorded `t_us` of the **first sample** in column `j`'s
  bucket range — exact, no interpolation, no `nominal_rate_hz` (C1
  §2/§3.1: "time is recorded, not assumed"). When that bucket range
  contains a sample but every stat in the column region is `NaN` (the
  sample's own value is `NaN`), the column still carries that sample's
  real `t_us`. When the bucket range contains **no** sample at all (past
  the end of the source data, or `column_count` overruns `sample_count`'s
  coverage), the sentinel `i64::MIN` is written instead.

*Total tile length:* `32 + sample_count*8 + column_count*12 + column_count*8`
bytes (added post-sign, 2026-09-04, lead ruling R25, wave-1 L3 — was
`32 + sample_count*8 + column_count*12`).

**Worked example — tier 3, 512 samples, 256 columns:**
```
header:                 offset    0, length 32     → header occupies [0, 32)
sample region:          offset   32, length 512*8  = 4096   → [32, 4128)
column region:          offset 4128, length 256*12 = 3072   → [4128, 7200)
column time region:     offset 7200, length 256*8  = 2048   → [7200, 9248)
total tile length:      32 + 4096 + 3072 + 2048 = 9248 bytes
```
Check: `4128 = 32 + 4096` ✓. `7200 = 4128 + 3072` ✓. `9248 = 7200 + 2048` ✓.
`9248 = 32 + 4096 + 3072 + 2048` ✓.

*Deferred, not part of this contract (added post-sign, 2026-09-04, lead
ruling R25, wave-1 L3):* design §4's L3 row lists a **tier cache**
alongside these tile endpoints. No such cache exists yet — recorded here
so this section is not read as claiming one.
`````

**Why:** Same gap as A1 (G10.5) — the concrete byte layout and worked
arithmetic for the new region, plus recording the tier-cache deferral
(G10.7) so it doesn't read as delivered.

---

## Amendment B — C3 §3.6: typed raster params + `raster_meta`, closes open item 4

### B1 — `fetch_raster` params, new `fetch_raster_meta` command

**Target** (same file, `fetch_raster`'s signature through the start of
"Binary layout.", verbatim):

`````text
**`fetch_raster(session_id: string, channel: string, kind: "spectrogram" | "histogram2d", width: number, height: number, params: Record<string, number>)`**
`width`/`height`: `u16`, output pixel dimensions. `params`: kind-specific
numeric parameters (e.g. `window_size`/`hop_size` for `"spectrogram"`,
`x_channel`/`y_channel` are not numeric so those stay as separate string
args if `kind` needs a second channel — flagged provisional, open question
6.4; the shape here is the interim, typed-but-generic contract).
Return: raw bytes via `tauri::ipc::Response`.
Errors: `not_found`, `invalid_argument` (bad `width`/`height`/`kind`/`params`), `io`, `internal`.

**Binary layout.** Little-endian throughout, header then row-major top-down
pixel data.
`````

**Delta:**

`````text
**`fetch_raster(session_id: string, channel: string, kind: "spectrogram" | "histogram2d", width: number, height: number, params: SpectrogramParams | Histogram2dParams)`**
`width`/`height`: `u16`, output pixel dimensions. `params` is one of the
two typed shapes below, matching `kind` — *replaces the interim
`Record<string, number>` bag, added post-sign 2026-09-04, lead ruling R25,
wave-1 L3, closes open question 6.4*:
```ts
interface SpectrogramParams {
  window_size: number;   // nperseg, samples
  hop_size: number;      // samples; hop = nperseg − noverlap (idl_rs::fft's own noverlap parameter)
  window: "rectangular" | "hann" | "hamming";   // idl_rs::fft::FftWindow, snake_case
  detrend: "none" | "mean" | "linear";          // idl_rs::fft::Detrend, snake_case
  scaling: "magnitude" | "density";             // idl_rs::fft::Scaling, snake_case
}
interface Histogram2dParams {
  y_channel: string;   // the second channel; `channel` above is the x channel
  x_bins: number;       // u32
  y_bins: number;       // u32
}
```
Return: raw bytes via `tauri::ipc::Response`.
Errors: `not_found`, `invalid_argument` (bad `width`/`height`/`kind`/`params`), `io`, `internal`.

**`fetch_raster_meta(session_id: string, channel: string, kind: "spectrogram" | "histogram2d", width: number, height: number, params: SpectrogramParams | Histogram2dParams)`**
*Added post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Same arguments
as `fetch_raster` above — a sibling JSON command, not a variant of the
binary path — so the chart can draw axes and a legend without decoding
pixel bytes to find their extents.
Return:
```ts
interface RasterMeta {
  x_domain: [number, number];
  y_domain: [number, number];
  x_label: string;
  y_label: string;
  scale: { vmin: number; vmax: number; kind: "linear" };
  transparent_zero: boolean;
}
```
Errors: `not_found`, `invalid_argument`, `io`, `internal` (same conditions
as `fetch_raster` above).

**Binary layout.** Little-endian throughout, header then row-major top-down
pixel data. Unchanged by this batch — pixel layout stays at header
`version = 1`; axis extents and the colour scale travel via
`fetch_raster_meta` above, not a header revision.
`````

**Why:** Closes G11.5 (raster shipped no axis extents/colour scale — a
chart cannot draw axes or a legend against raw pixels) and G11.6 (open
item 6.4 assigned the params typing to L3; `Record<string, number>` cannot
carry the three enums `SpectrogramParams` needs or a second channel id).

### B2 — close open question item 4

**Target** (same file, `## 6. Open questions`, item 4, verbatim):

```text
4. **`fetch_raster`'s `params` bag is generic (`Record<string, number>`)
   because the raster kinds' actual parameters aren't fixed anywhere yet**
   (design §4 says only "core computes STFT or 2-D histogram"). A
   `"histogram2d"` raster also plausibly needs a second channel id, which
   isn't a number and doesn't fit `params` as typed here. Assigned: L3 —
   pin `SpectrogramParams { window_size: number; hop_size: number }` and
   `Histogram2dParams { y_channel: string; x_bins: number; y_bins: number }`
   (or similar) before implementation, and revise §3.6 in the same change.
```

**Delta:**

```text
4. **Resolved 2026-09-04 (lead ruling R25, wave-1 L3, contract batch 3).**
   `fetch_raster`'s `params` is now the two typed shapes `SpectrogramParams`
   and `Histogram2dParams` (§3.6), replacing `Record<string, number>` and
   the ad hoc separate-string-arg workaround this item flagged for a second
   channel id. §3.6 also gains a `fetch_raster_meta` sibling command
   carrying axis extents and the colour-scale range, so the raster's pixel
   bytes don't need decoding just to draw axes or a legend.
```

**Why:** The item's own text assigned this exactly to L3, spec-during; B1
does the work, this closes the tracker entry the same way items 3/7/8 in
this section were closed.

---

## Amendment C — C3 §3.7: cursor clamps, ties resolve early

**Target** (same file, `cursor_readout`'s `Return:` block through its
`Errors:` line, verbatim):

`````text
Return:
```ts
interface CursorReadout {
  t_us: number;                          // echoes the request
  values: Record<string, number | null>; // channel_id → interpolated/nearest value, null if the channel has no sample near t_us
}
```
Errors: `not_found` (unknown `session_id`), `invalid_argument` (a channel in
`channels` doesn't exist on this session — reported via `detail.channel`,
the rest of the readout is not partially returned; CLAUDE.md's
"don't block other channels" rule is about math cells, not this: a cursor
readout is one atomic answer for one instant), `io`, `internal`.
`````

**Delta:**

`````text
Return:
```ts
interface CursorReadout {
  t_us: number;                          // echoes the request
  values: Record<string, number | null>; // channel_id → nearest recorded sample by t_us, clamped at both ends — see below
}
```
*Amended post-sign (2026-09-04, lead ruling R25, wave-1 L3, closes open
question Q4).* Each channel's value is the sample **nearest** `t_us` on
that channel's own recorded `t_us` axis, **clamped** at both ends — the
engine's existing nearest-sample rule (`idl_rs::session::handle`). A
cursor past a channel's last sample still reports that last sample, not
`null`. A tie (the cursor sits exactly between two samples) resolves to
the **earlier** sample. `null` only when the channel has no samples at
all, or has no recorded time axis (an empty `t_us` — a scalar or
table-column result, L3-R12/L3-R21). This replaces the original "no
sample **near** `t_us`" wording, which implied an unspecified proximity
bound; there is none.
Errors: `not_found` (unknown `session_id`), `invalid_argument` (a channel in
`channels` doesn't exist on this session — reported via `detail.channel`,
the rest of the readout is not partially returned; CLAUDE.md's
"don't block other channels" rule is about math cells, not this: a cursor
readout is one atomic answer for one instant), `io`, `internal`.
`````

**Why:** Closes G12.5/Q4 — the old wording implied an unspecified
proximity bound; the engine's actual (and now contracted) behaviour is
unconditional clamping, matching `nearest_at_t_us` (L3-R35).

---

## Amendment D — C2 §1/§6/§6.1: `_migrate_math`, CLI shape, id/version rules, report contents

### D1 — §1 container: two transient keys (consequential on D5)

**Target** (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
verbatim, one line):

```text
No other top-level front-matter keys are defined by this contract. §6 defines one **transient, migration-only** key (`_migrate_charts`) that a v3 parser must tolerate (round-trip it unmodified) but never itself produces except via `migrate-workbook`.
```

**Delta:**

```text
No other top-level front-matter keys are defined by this contract. §6 defines two **transient, migration-only** keys (`_migrate_charts`, `_migrate_math` — *the latter added post-sign, 2026-09-04, lead ruling R25, wave-1 L3*) that a v3 parser must tolerate (round-trip them unmodified) but never itself produces except via `migrate-workbook`.
```

**Why:** Consequential on D5 below — the contract stating "one transient
key" would be false the moment `_migrate_math` is added; a parser reading
this section alone must know to tolerate both.

### D2 — Stage 1 heading: CLI invocation shape

**Target** (verbatim):

```text
**Stage 1 — CLI `idl-rs migrate-workbook` (Rust, pure JSON/text
transforms):**

| v2 field | v3 destination | Rule |
```

**Delta:**

```text
**Stage 1 — CLI `idl-rs migrate-workbook` (Rust, pure JSON/text
transforms):**

*Invocation (added post-sign, 2026-09-04, lead ruling R25, wave-1 L3):*
`idl-rs migrate-workbook <INPUT> --output <OUTPUT>` — a positional input
path (the pattern every other subcommand uses) and a **required**
`-o`/`--output` (unlike `export`/`math`, where stdout is a legal sink; a
`.idl1wb` document on stdout would interleave with the migration report
below). The report is written to stdout; a failure uses the CLI's
existing error envelope on stderr.

| v2 field | v3 destination | Rule |
```

**Why:** Closes G13.10 — the plan text, the SPEC draft, and every landed
subcommand each implied a different shape; pinning it here (spec-first)
means Task 13 and Task 14's SPEC text can't disagree.

### D3 — `workbook_id` row: verbatim only when a UUID

**Target** (verbatim, one table row):

```text
| `workbook_id` | front matter `id` | Verbatim. |
```

**Delta:**

```text
| `workbook_id` | front matter `id` | *Amended post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Copied verbatim only when it parses as a UUID; otherwise a fresh `Uuid::new_v4()` is minted and the substitution is recorded in the migration report — a hand-authored v2 file's `workbook_id` is free text (`docs/legacy/idl0-workbook_format.md`), while C2 §1 requires a UUIDv4 `id`. |
```

**Why:** Closes G13.13 — verbatim copy of a non-UUID `workbook_id` would
emit a v3 file that C2 §1's own `MissingFrontMatterId` check rejects.

### D4 — `workbook_version` row: range is `1..=SUPPORTED_WORKBOOK_VERSION`

**Target** (verbatim, one table row):

```text
| `workbook_version` (1 or 2) | front matter `version: 3` | A value the CLI does not recognise (> 2) refuses migration with an error, not a guess. |
```

**Delta:**

```text
| `workbook_version` (absent, 1, or 2) | front matter `version: 3` | *Amended post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Accepted range is `1..=workbook::SUPPORTED_WORKBOOK_VERSION` (the constant, `rust/core/src/workbook/model.rs`, currently `2`) — an absent `workbook_version` defaults to `1`, matching the landed v2 reader's own default, not the legacy doc's stale "current max is 1, a value > 1 throws." A value outside that range refuses migration with an error, not a guess. |
```

**Why:** Closes G13.5 — the legacy doc, the original C2 text, and the
landed `SUPPORTED_WORKBOOK_VERSION = 2` constant gave three different
answers; the engine's constant wins and is now named, not a literal.

### D5 — `.id`/`.color` rows: `_migrate_math` identity map

**Target** (verbatim, one table row):

```text
| `math_channels[].color` | *dropped at this stage* | Not lost — carried forward as a **fallback** stroke source for Stage 2 (below) when a chart references the channel and has no `channelColors` override of its own. |
```

**Delta:**

```text
| `math_channels[].id`, `.color` | front matter transient key `_migrate_math` | *Added post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Written as `_migrate_math: { "<v2 math_channel id>": { "identifier": "<v3 name>", "color": "<v2 color, or null>" } }`, one entry per v2 `math_channels[]` definition, keyed by its v2 `id` (defaulting to `name` when absent — the legacy format's own convention, `docs/legacy/idl0-workbook_format.md`). `identifier` is the migrated v3 identifier a `ChartSlot.mathChannelIds` entry in `_migrate_charts` (below) resolves against in Stage 2; `color` is the same **fallback** stroke source Stage 2's `channelColors` table (below) already describes — neither previously had a defined destination. Deleted by the app in the same Stage-2 pass that deletes `_migrate_charts` (idempotence rule unchanged, below). |
```

**Why:** Closes G13.1 (charts' `mathChannelIds` resolved to nothing —
the migration's largest silent data-loss path) and G13.2 (`.color` had no
defined destination) in one key, per L3-R36.

### D6 — table row: strike the phantom `worksheets[].tables[]`

**Target** (verbatim, one table row):

```text
| `worksheets[].blocks[].content.kind == "table"` (and legacy `worksheets[].tables[]` if present) | one `table` cell per `TableModel` | The JSON is already the v3 shape (§4) — copied verbatim into a fence. |
```

**Delta:**

```text
| `worksheets[].blocks[].content.kind == "table"` | one `table` cell per `TableModel` | The JSON is already the v3 shape (§4) — copied verbatim into a fence. *Corrected post-sign (2026-09-04, lead ruling R25, wave-1 L3): struck "and legacy `worksheets[].tables[]` if present" — no such array exists; the only legacy flat array is `charts` (migrated by the row below), and a table's content lives only at `blocks[].content.table` (`docs/legacy/idl0-workbook_format.md`).* |
```

**Why:** Closes G13.6 — the legacy format has exactly one flat array
(`charts`); an implementer transcribing this row would hunt a path that
was never real.

### D7 — new paragraph: migration report contents and refusal policy

**Target** (verbatim, the last Stage-1 table row through the start of
§6.1):

```text
| `overlay_layouts[]` | *dropped* | D9 — no CLI or app handling, not even transiently. |

### 6.1 Identifier derivation for migrated definition names
```

**Delta:**

```text
| `overlay_layouts[]` | *dropped* | D9 — no CLI or app handling, not even transiently. |

**Migration report and refusal policy** *(added post-sign, 2026-09-04,
lead ruling R25, wave-1 L3).* Beyond the one-line-per-rename warning
already named above, the CLI's migration report additionally lists: every
`mathChannelIds` entry across `_migrate_charts` that has no matching key
in `_migrate_math` (an unresolved chart reference — the migration does not
refuse for this, it tells the truth about what it could not carry); every
dropped `WorksheetBlock` field (`id`, `placement`, `overlayTargetId`,
`overlayOpacity`); and every table block whose `rowSource ==
"lapSelection"`, migrated as an ordinary authored table with an explicit
warning that its live N-lap comparison behaviour is not carried into v3.
None of these three report categories ever refuses the migration —
refusal is reserved for the rules already stated above (an unrecognised
`workbook_version`, a migrated constant colliding with `pi`/`tau`/`e`/`g`);
every other irregularity is reported and migrated through.

### 6.1 Identifier derivation for migrated definition names
```

**Why:** Closes G13.7 (block metadata and `rowSource == "lapSelection"`
dropped with no row and no warning) and Q3 (Isaac's defaulted answer:
migrate and report, don't refuse, on an unresolved chart reference).

---

DELTAS COMPLETE: 12 deltas (A1, A2, B1, B2, C, D1–D7)
