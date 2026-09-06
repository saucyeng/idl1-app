# L6 Notebook — contract amendments (proposed text for the lead to apply)

Filed by L6 Task 16, the lane's spec-discharge and merge-gate task
(`CLAUDE.md` §6, spec-during). **This lane never edits a contract directly**
(wave-2 operating brief §3) — every entry below is proposed diff-ready text
for `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` or
`...-c3-ipc-surface.md`, for the lead to apply. Status is as this lane found
it by reading `app/src/ipc/workbook.ts` and
`app/src/routes/pages/Notebook/ipcStubs/` at this task's commit — not
assumed from the plan or `IPC-NEEDS.md`, both of which predate several of
these landings.

---

## 1. C2 §5.1 amendment — `channel()`'s return shape (R52 Q2)

**Proposed text.** `channel(name, { lap?, session? })` returns an array of
`{ t: number, v: number }` records — one entry per sample the host
transferred for that variable — not the previously stated
`{ length, t, v }` structure-of-arrays object. C2 §5.3's grammar is
**unchanged**: `x: "t", y: "v"` continue to name the literal fields Plot's
mark options resolve per element, and now resolve correctly against the
new shape (they never resolved against the old one — Plot indexes a string
channel per array element, and `{length, t, v}` is not an array). Nothing
else in C2 §5.1's host-variable list changes.

**Status: landed.** `app/src/routes/pages/Notebook/sandbox/main.ts`'s
`materializeHostVar` (around line 69) converts the two transferred
`Float64Array`s into exactly this shape before binding a channel host
variable; `channelLookup` (line 249) is typed to return
`{ t: number; v: number }[]`. The record count is capped by this tab's own
point budget (§26.3 of the new SPEC section), so materialisation is a few
thousand objects, not the full sample count — the transfer itself stays
zero-copy (two `ArrayBuffer`s in `postMessage`'s transfer list); only what
the sandbox exposes to cell code changed.

**Reference implementation.** `Notebook/sandbox/main.ts:69` (`materializeHostVar`),
`Notebook/sandbox/main.ts:249` (`channelLookup`); the wire encoding is
`Notebook/host/protocol.ts`'s `HostVarPayload` (`{ kind: "channel"; length;
t: ArrayBuffer; v: ArrayBuffer }`) and `channelPayload`.

---

## 2. C3 §3.4 amendment — `read_workbook` (N1, R52 Q4)

**Proposed text (unchanged from `IPC-NEEDS.md`'s N1 — confirmed, not
re-derived):**

```
read_workbook(id_or_path: string) → {
  markdown: string;   // the file's UTF-8 text, verbatim
  hash: string;       // sha256 of those bytes, hex — the `based_on_hash` a later save passes
  path: string;       // absolute path under <data>/workbooks/
}
```
Errors: `not_found`, `io`, `internal` — deliberately not the four
`workbook_*` fatal kinds, since this command returns bytes without parsing
so a document with malformed front matter is still readable in order to be
repaired in the editor.

**Status: still a stub as of this commit.** No `read_workbook` wrapper
exists in `app/src/ipc/workbook.ts` (confirmed by reading the file in
full — it exports `openWorkbook`, `evalWorkbook`, `saveWorkbook`,
`watchWorkbook` only). This lane still calls the typed stub
`Notebook/ipcStubs/readWorkbook.ts`, which throws `NotImplementedError`
unconditionally. (Note for the lead: the L8w ledger's four-task gate entry
2026-09-05 records `read_workbook` as one of four commands landed on the
L8w Rust branch, `commands/workbook.rs`; that branch has not merged to
`main` as of this L6 commit, and cross-lane state does not reach this
worktree — the swap from stub to `app/src/ipc/workbook.ts`'s real wrapper
is a one-import follow-up once L8w merges, not a further amendment.)

---

## 3. C3 §3.4 amendment — `eval_workbook`'s `lap_context` (N4, R52 Q5)

**Proposed text (unchanged from `IPC-NEEDS.md`'s N4 — confirmed):**

```
eval_workbook(
  id: string,
  session_id: string | null,
  lap_context: { main_lap: number | null; overlay_laps: number[] } | null,   // NEW
) → CellOutput[]
```
`main_lap` and every entry of `overlay_laps` are 1-based lap numbers
matching C3 §3.2's `LapSummary.number`. `null` keeps today's behaviour
exactly (`MathLapContext::empty()`) — additive, no existing caller
changes. Errors: unchanged, plus `invalid_argument` when a named lap does
not exist on `session_id` (`detail { lap }`).

**Status: still absent as of this commit.** `app/src/ipc/workbook.ts`'s
`evalWorkbook(id: string, sessionId: string | null): Promise<CellOutput[]>`
takes no third argument. `Notebook/index.tsx` (around line 121-166) reads
`AppState.selection.lapContext` (the R53 Data Q3 slice L7a writes) but the
value is explicitly not threaded anywhere yet — `void lapContext;` with a
`// TODO(idl0): thread lapContext into evalWorkbook's call below once N4
lands` marks the exact call site. The lap table's Main/Overlay designation
and the variance-trace chart both stay parity gaps until this lands (SPEC
§26.6).

---

## 4. C3 §3.4 amendment — the host-channel byte path (N3, R52 Q6)

**Proposed text (the layout this lane designed, restated verbatim from
`IPC-NEEDS.md`'s N3 since C3 has not yet absorbed it):**

```
fetch_host_channel(
  workbook_id: string,
  session_id: string | null,
  def_name: string,        // the C2 §3.1 identifier of one math definition
  budget: number,          // u32, max points; the host's point budget
) → raw bytes via tauri::ipc::Response
```
Errors: `not_found` (unknown workbook or definition), `invalid_argument`
(`budget` outside `1..=65536`), the `math_*` kinds when the definition
itself fails to evaluate, `io`, `internal`.

| Field | Type | Offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLH"` |
| `version` | `u16` | 4 | `1` |
| `flags` | `u16` | 6 | bit 0 = `has_t`; other bits reserved, zero |
| `length` | `u32` | 8 | number of values in `v` |
| `t_length` | `u32` | 12 | number of values in `t`; `0` when the source has no recorded axis |
| `reserved` | `[u8; 4]` | 16 | zero-filled, pads to 20 |

then `t` as `t_length` × `f64` (seconds from session start) at offset 20,
then `v` as `length` × `f64`. Total `20 + t_length*8 + length*8`.

**Status: unimplemented, and unstubbed.** Neither an `app/src/ipc/`
wrapper nor a `Notebook/ipcStubs/` stub exists for `fetch_host_channel` or
an `IDLH` decoder — confirmed by grep across `app/src` (no hit for
`fetch_host_channel`, `fetchHostChannel`, or `IDLH`). Math-derived host
variables therefore have no call site into JS cells at all in this lane's
landed code, not even a `not_implemented`-throwing seam; this matches
`IPC-NEEDS.md`'s own stated fallback ("math cells render their scalar
values and per-definition errors; only raw session channels feed JS
charts"), which is exactly this lane's delivered wave-2 behaviour. Also
recorded in the ledger (2026-09-05, "Tracked (L8w Task 11)") as a lead
shell task still owed after L8w merges: add the `app/src/ipc/` decoder for
this 24-byte layout (per C3 §3.5's `DataView` convention) and wire it to
`fetch_host_channel` once that command lands.

---

## 5. C3 §3.6 amendment — FFT (N5, R52 Q7 → in)

**Proposed text (unchanged from `IPC-NEEDS.md`'s N5 — confirmed, still
proposed, not yet absorbed by C3):**

```
fetch_fft(
  session_id: string,
  channel: string,
  lap: number | null,
  params: SpectrogramParams,                       // reuses C3 §3.6's shape verbatim
  averaging: "none" | "mean" | "max" | "median",   // idl0's Averaging, cross-segment
) → raw bytes via tauri::ipc::Response
```
Proposed layout: magic `"IDLF"`, `version: u16 = 1`, `bin_count: u32`,
`sample_rate_hz: f32`, then `bin_count` × `f32` magnitudes. Frequency for
bin `k` is `k * sample_rate_hz / (2 * bin_count)`, derived frontend-side
from the two header fields — no second array crosses. Errors: `not_found`,
`invalid_argument` (bad `params`, unknown lap), `io`, `internal`.

**Status: unimplemented and unstubbed.** No `fetch_fft` reference anywhere
in `app/src` (grepped). Ruled "in" for wave 2 (R52 Q7), but this lane's
Task 16 wrap-up finds no Rust write-amendment lane commit for it yet
reflected in this branch's view of `app/src/ipc/`; the FFT chart remains a
listed parity gap (SPEC §26.6) pending this landing. This entry stays
informational-and-still-pending rather than closed.

---

## 6. Already-ruled amendments this lane's landed code confirms — not
   re-filed here

Two amendments the ledger already rules and assigns to the Rust track
(L8w) are **not** restated as new proposals — their text already exists in
the ledger, and re-filing it here would duplicate it. Recorded for
completeness, with this lane's own confirmation of current status against
its landed code:

- **`WorkbookEvent.hash` (R67).** `app/src/ipc/workbook.ts`'s
  `WorkbookEvent` interface (this lane's copy, at this commit) carries
  only `kind`/`cell_ids` — no `hash` field. `Notebook/model/saveFlow.ts`'s
  `isSelfWrite` is coded against the amended shape behind a typed seam
  (`WorkbookEventWithHash`, `hash?: string`) that treats a missing hash as
  "unknown ⇒ reload" (Task 14, CHANGELOG bullet), so this lane needs no
  further change once L8w Task 4b's amendment lands and this branch
  rebases onto it.
- **Prose HTML as two fields + a span list (R70).** `CellOutput` does not
  yet carry `prose_before_html`/`prose_after_html`/`prose_spans` on this
  lane's `app/src/ipc/workbook.ts`. `Notebook/components/ProseSpan.tsx`'s
  `extractInlineSpans` remains the interim TypeScript regex scanner
  (documented as such in its own file doc comment, R70), to be deleted the
  moment L8w Task 4c's fields exist on the wire.

---

## Summary table

| # | Command / field | C2/C3 section | Status at this commit |
|---|---|---|---|
| 1 | `channel()` return shape | C2 §5.1 | **Landed** (sandbox-side, this lane) |
| 2 | `read_workbook` | C3 §3.4 | Stubbed (`NotImplementedError`); landed on the unmerged L8w branch |
| 3 | `eval_workbook` + `lap_context` | C3 §3.4 | Absent; read from `AppState.selection` but not threaded (`TODO(idl0)` marks the call site) |
| 4 | `fetch_host_channel` (`IDLH`) | C3 §3.4 | Unimplemented, unstubbed — no call site exists yet |
| 5 | `fetch_fft` | C3 §3.6 (new) | Unimplemented, unstubbed |
| 6 | `WorkbookEvent.hash`, prose HTML fields | C3 §3.4 | Already ruled (R67, R70); status noted, not re-filed |
