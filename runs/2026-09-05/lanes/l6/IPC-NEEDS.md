# L6 Notebook — IPC needs

**Lane:** L6 (Notebook tab) · **Date:** 2026-09-05 · **Plan:**
`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`

Written per wave-2 operating brief §3: C3 is frozen for UI lanes, so a tab
needing a command C3 does not have writes it here (name, args, return shape,
error kinds, C3 §3 group) and builds against a typed stub in its own
directory that throws `not_implemented` until the Rust track lands it. The
lead batches these into one C3 amendment and one Rust lane. **This lane does
not edit C3, `rust/`, or `app/src-tauri/`.**

Stubs live in `app/src/routes/pages/Notebook/ipcStubs/`, one file per need,
each exporting the exact signature below so the swap to the real
`app/src/ipc/` wrapper is an import change and nothing else.

Eight needs. **N1 is a hard blocker for the lane's second half**; N2 exists
only if open question Q3 is ruled one particular way; N7 is explicitly
marked wave 3.

---

## N1 — `read_workbook` (**hard blocker**)

**Group:** C3 §3.4 Workbook · **Blocks:** plan Tasks 13, 14 · **Priority: 1**

```ts
read_workbook(id_or_path: string) → {
  markdown: string;   // the file's UTF-8 text, verbatim
  hash: string;       // sha256 of those bytes, hex — the `based_on_hash` a later save passes
  path: string;       // absolute path under <data>/workbooks/
}
```
**Errors:** `not_found`, `io`, `internal`. Deliberately **not** the four
`workbook_*` fatal kinds — this command returns bytes and does not parse, so
a document whose front matter is malformed must still be readable *in order
to be repaired in the editor*. That is the whole point of separating it from
`open_workbook`.

**Why C3 has no equivalent.** `open_workbook` returns metadata only
(`id`, `name`, `path`, `cell_count`). `eval_workbook` returns evaluated cells,
not source text. `save_workbook(id, markdown, based_on_hash)` defines
`based_on_hash` as "the hash the editor last read" (C3 §3.4, ruling R44) —
and **no command lets the editor read anything**. As specified today, the
notebook can evaluate a workbook it cannot display the source of, and can
never legally save one, because `null` against an existing file errors by
`write_atomic`'s own semantics (R44 says so explicitly).

**Rejected alternative:** reading the file from the frontend through a Tauri
fs plugin. It bypasses the `<data>` resolution C4 §1 owns and the engine's
own view of which workbooks exist, and it would put a second, uncontrolled
reader on a path C4 §4's atomic-write protocol assumes is single-reader.

---

## N2 — `parse_workbook_cells` (**conditional on open question Q3**)

**Group:** C3 §3.4 Workbook · **Blocks:** plan Task 4 · **Priority: 3**

```ts
parse_workbook_cells(id_or_path: string) → ScannedCell[]

interface ScannedCell {
  cell_id: string | null;        // null when the fence carries no id= yet (C2 §2.2)
  kind: "math" | "table" | "js";
  body_start: number;            // byte offset into the document, u32
  body_end: number;              // byte offset, exclusive, u32
  prose_before_start: number;    // byte offset, u32 (C2 §2.4)
  prose_before_end: number;      // byte offset, exclusive, u32
}
```
**Errors:** `not_found`, `io`, `internal`, plus the four document-fatal
`workbook_*` kinds.

**Only needed if the lead rules Q3 against the TypeScript fence scan.** The
plan's Task 4 implements a narrow, non-authoritative scan in pure TS instead,
on the grounds that it reads only fence lines — a grammar C2 §2.2 fixes in
four lines of EBNF — and never parses an expression, YAML, or table JSON.
Rust stays authoritative for evaluation either way. If Q3 goes the other way,
delete Task 4 and stub this.

---

## N3 — `fetch_host_channel` (the host-channel byte path)

**Group:** C3 §3.4 Workbook · **Blocks:** plan Task 13's math→JS binding · **Priority: 2**

```ts
fetch_host_channel(
  workbook_id: string,
  session_id: string | null,
  def_name: string,        // the C2 §3.1 identifier of one math definition
  budget: number,          // u32, max points; the host's point budget (design §6)
) → raw bytes via tauri::ipc::Response
```
**Errors:** `not_found` (unknown workbook or definition), `invalid_argument`
(`budget` outside `1..=65536`), the `math_*` kinds when the definition itself
fails to evaluate, `io`, `internal`.

**Proposed layout** (following the `IDLT`/`IDLR` pattern C3 §3.5/§3.6
establishes — magic, version, little-endian, self-describing lengths):

| Field | Type | Offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLH"` |
| `version` | `u16` | 4 | `1` |
| `flags` | `u16` | 6 | bit 0 = `has_t`; other bits reserved, zero |
| `length` | `u32` | 8 | number of values in `v` |
| `t_length` | `u32` | 12 | number of values in `t`; `0` when the source has no recorded axis |
| `reserved` | `[u8; 4]` | 16 | zero-filled, pads to 20 |

then `t` as `t_length` × `f64` (seconds from session start, matching
`to_host_channel`'s µs→s conversion) at offset 20, then `v` as `length` ×
`f64`. Total `20 + t_length*8 + length*8`.

**Status.** C3 §3.4's "host-channel byte path" note assigns the layout to L5;
ruling R45 deferred it "to wave 2 with L6" because its only consumer is the
sandboxed iframe, which did not exist. Operating brief §3 forbids this lane
from touching `rust/`, so **an owner is needed** — plan open question Q6
recommends L6 designs it (as above) and the wave-2 Rust write lane implements
it. Fallback if the lead disagrees: math cells render their scalar values and
per-definition errors, and only raw session channels (served by `fetch_tile`)
feed JS charts in wave 2.

---

## N4 — `eval_workbook` gains a lap context

**Group:** C3 §3.4 Workbook (amendment to an existing command) · **Blocks:** the lap table, variance traces, four catalog functions · **Priority: 2**

```ts
eval_workbook(
  id: string,
  session_id: string | null,
  lap_context: { main_lap: number | null; overlay_laps: number[] } | null,   // NEW
) → CellOutput[]
```
`main_lap` and every entry of `overlay_laps` are 1-based lap numbers matching
C3 §3.2's `LapSummary.number`. `null` keeps today's behaviour exactly
(`MathLapContext::empty()`), so this is additive and no existing caller
changes.
**Errors:** unchanged, plus `invalid_argument` when a named lap does not exist
on `session_id` (`detail { lap }`).

**Why.** Ruling R41 added `session_id` and stopped there. Six `Implemented`
functions in C2 §3.3's catalog read `MathLapContext` and are unreachable
without this: `current_lap()`, `sector_number()`, `lap_start_time(n)`,
`lap_start_distance(n)`, `variance_time(ch)`, `variance_dist(ch)`. The last
two additionally need idl0's Main/Overlay lap designation, which v3 gives no
home — and per R41's own reasoning it should not have one: the designation is
a UI selection, not a property of the file.

---

## N5 — `fetch_fft`

**Group:** new command, C3 §3.6 Rasters group (it is the other half of the
same DSP surface) · **Blocks:** the FFT chart (a named parity gap) · **Priority: 3**

```ts
fetch_fft(
  session_id: string,
  channel: string,
  lap: number | null,
  params: SpectrogramParams,                       // reuses C3 §3.6's shape verbatim
  averaging: "none" | "mean" | "max" | "median",   // idl0's `Averaging`, cross-segment
) → raw bytes via tauri::ipc::Response
```
Proposed layout: magic `"IDLF"`, `version: u16 = 1`, `bin_count: u32`,
`sample_rate_hz: f32`, then `bin_count` × `f32` magnitudes. Frequency for bin
`k` is `k * sample_rate_hz / (2 * bin_count)` and is derived frontend-side
from the two header fields, so no second array crosses.
**Errors:** `not_found`, `invalid_argument` (bad `params`, unknown lap), `io`,
`internal`.

**Why not JavaScript.** An FFT magnitude spectrum is numbers, and CLAUDE.md §2
puts numbers in Rust. The engine already has it — `idl_rs::fft`, which the
spectrogram raster (C3 §3.6) uses — so this is a thin wrapper, not new DSP.
The math catalog's `fft(ch, window)` is not a substitute: its result is a
bin-indexed channel with no frequency axis attached, so a chart built on it
would have to synthesise the axis in JS.

---

## N6 — `fetch_histogram`

**Group:** new command, C3 §3.6 · **Blocks:** the 1-D histogram chart (a named parity gap) · **Priority: 4**

```ts
fetch_histogram(
  session_id: string,
  channel: string,
  lap: number | null,
  bin_count: number,     // u32, validated 2..=1024
  symmetric: boolean,    // bin over a zero-centred range [-m, m] (idl0's histogramSymmetric)
) → {
  bin_edges: number[];   // bin_count + 1 values, in the channel's own units
  counts: number[];      // bin_count values, u32 each
  total_samples: number; // u32
}
```
JSON, not bytes: at most 1025 numbers, well under the threshold that makes
binary worth it (C3 §1's transport-per-payload-shape rule).
**Errors:** `not_found`, `invalid_argument` (`bin_count` out of range,
unknown lap), `io`, `internal`.

**Why.** Binning is numbers (CLAUDE.md §2). C3 §3.6 has only the **2-D**
`histogram2d` raster; there is no 1-D path. idl0 computed this in Rust too
(`channel_histogram`). The plan recommends deferring this one to wave 3 —
unlike N5 it is genuinely new engine code, not a wrapper.

---

## N7 — `fetch_scatter_points` (**wave 3**)

**Group:** new command, C3 §3.6 · **Blocks:** scatter point-cloud mode · **Priority: 5, wave 3**

```ts
fetch_scatter_points(
  session_id: string,
  x_channel: string,
  y_channel: string,
  color_channel: string | null,
  lap: number | null,
  max_points: number,     // u32, the host's point budget
) → raw bytes via tauri::ipc::Response
```
Proposed layout: magic `"IDLS"`, `version: u16 = 1`, `point_count: u32`,
`has_color: u16`, then interleaved `f32` triples (`x`, `y`, `color`) or pairs
(`x`, `y`) when `has_color == 0`.
**Errors:** `not_found`, `invalid_argument`, `io`, `internal`.

**Deliberately deferred.** The scatter chart's **density** mode — the G-G
diagram's real use — is already served by `fetch_raster` with
`kind: "histogram2d"` (C3 §3.6), which this lane's Task 9 delivers. The
point-cloud mode needs time-aligned sample pairing across two channels at
possibly different rates, which is real engine work for a secondary view.
Recorded here so wave 3 does not rediscover it.

---

## N8 — `create_workbook`

**Group:** C3 §3.4 Workbook · **Blocks:** creating a notebook from the UI · **Priority: 3**

```ts
create_workbook(name: string) → WorkbookHandle   // C3 §3.4's existing shape
```
Mints a UUIDv4 `id`, writes a minimal valid v3 document (front matter with
`id` and `name`, no cells), and returns the handle. Filename derives from the
front-matter `name`, not the id (**ruling R48**).
**Errors:** `invalid_argument` (empty name, or a name that sanitises to an
empty filename), `io` (a file of that name already exists), `internal`.

**Why.** `save_workbook(id, markdown, null)` is documented as the
create-a-new-workbook path, but the `id` argument has to resolve to something
and `save_workbook` lists `not_found` among its errors. R48 additionally
fixes a filename-derivation rule that the frontend has no way to apply
itself. One command closes both gaps.

---

## Summary

| # | Command | Group | Priority | Blocks |
|---|---|---|---|---|
| N1 | `read_workbook` | §3.4 | 1 — hard blocker | Tasks 13, 14 |
| N3 | `fetch_host_channel` | §3.4 | 2 | Task 13 (math→JS) |
| N4 | `eval_workbook` + `lap_context` | §3.4 | 2 | lap table, variance traces |
| N2 | `parse_workbook_cells` | §3.4 | 3 — conditional (Q3) | Task 4 |
| N5 | `fetch_fft` | §3.6 | 3 | FFT chart |
| N8 | `create_workbook` | §3.4 | 3 | new-notebook flow |
| N6 | `fetch_histogram` | §3.6 | 4 | 1-D histogram chart |
| N7 | `fetch_scatter_points` | §3.6 | 5 — wave 3 | scatter point cloud |

**Minimum set for the lane to complete its planned tasks: N1.** N3 and N4
each turn a parity gap into a delivered feature. N2 disappears if open
question Q3 is ruled as the plan recommends. N5–N8 are chart types the plan
already lists as parity gaps and does not depend on.
