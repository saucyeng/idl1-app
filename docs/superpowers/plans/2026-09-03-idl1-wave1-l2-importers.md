# idl1 wave-1 L2 — Importers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land FIT, GPX and (trivial) CSV importers producing the canonical `Session`/`Channel` model fixed by contract C1 §2, behind a shared `Importer` trait, plus a post-import materialisation hook extension point. Every format has golden tests against hand-built fixtures.

**Architecture:** A new `rust/core/src/import/` module (crate `idl-rs`, no Tauri/network/async — CLAUDE.md §2). `Importer` is a small trait (`source_format()`, `import(bytes, blob_sha256) -> Result<ImportOutcome, ImporterError>`) implemented once per non-device `SourceFormat`. `.idl0` import (the existing `crate::parse` module plus L1's burst-seam correction) is out of scope — whether/how L1 wires `.idl0` into this same trait is L1's call. `data.parquet`/Arrow writing, catalog insertion, and CLI subcommand wiring are L1's; this plan produces only the in-memory `Session` and its own module's tests.

**Tech Stack:** Rust 2021, `idl-rs` (`rust/core`). New dependencies: `quick-xml` (GPX XML parsing) and `fitparser` (FIT binary parsing, promoted from dev- to a regular dependency). No new dependency for CSV (hand-rolled, comma-split, per §15a.4).

**Spec:** `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §5 ("canonicalise on ingest"), §10 L2 row, D3, D4; `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` §2, §3.4, §4.1 (this plan's only hard dependency); `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md` (fitparser pin); `docs/superpowers/specs/2026-09-02-idl1-inventory.md` (`gpx_parser.dart` semantics, ported in Task 3); `docs/IDL0_SPEC.md` §15a (written in Task 1, spec-first).

---

## Spec placement decision

`docs/IDL0_SPEC.md` has no importer section today — idl0 only ever wrote `.idl0`, so nothing describes converting FIT/GPX/CSV into the canonical model. `docs/IDL0_SPEC.md:1085` is `## 15. Session & File Model` (the `.idl0` parser's model — L1's territory to rewrite when `store/` lands) and `docs/IDL0_SPEC.md:1230` is `## 16. Track Entity` (unrelated: gates, polylines). This plan adds **`## 15a. Non-device Importers (FIT, GPX, CSV)`** as a new section inserted directly between them (after line 1229, before line 1230's `## 16. Track Entity`), renumbering nothing else.

Reasoning: importers are conceptually adjacent to "Session & File Model" (§15) — they are the *other* way a `Session` comes into existence — but §15 itself is scheduled for a full L1 rewrite (it currently describes the FRB-bridge/Dart-era architecture verbatim, copied from idl0's SPEC per CLAUDE.md's "app-side parts describe idl0 and are rewritten lane by lane" rule). Writing into §15 itself would collide with L1's own rewrite of that section. A suffixed `15a` sits next to its natural sibling without touching L1's section, and slots in before §16 (Track Entity) which is unrelated to import. This mirrors how C1 itself is organized as an addendum-shaped contract rather than an inline edit to §15.

**Disposition: spec-first** (CLAUDE.md §6) — §15a is written in Task 1, before any importer code.

---

## Global Constraints

- **Dependency gate (L1).** This plan's own C1 §2 struct definitions are frozen and safe to draft/implement against directly (per the design's "L2 needs L1's landed Session/Channel struct... but C1 §2 already fully fixes that shape" note) — but the actual `rust/core/src/session/mod.rs` file does not contain that shape yet today (verified 2026-09-03: `grep -c "pub t_us: Vec<i64>" rust/core/src/session/mod.rs` → `0`; `grep -c "pub source_format: SourceFormat" rust/core/src/session/mod.rs` → `0`). **Task 2 (and every later Rust-touching task) does not start until both**:
  ```bash
  grep -c "pub t_us: Vec<i64>" rust/core/src/session/mod.rs
  grep -c "pub source_format: SourceFormat" rust/core/src/session/mod.rs
  ```
  **each return at least `1`** — verify before opening a worktree. Task 1 (the SPEC section, prose only, no compilation) has no such dependency and may proceed immediately.
- **Branch:** `wave1-l2-importers`, in its own worktree (never the shared
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` checkout — that must stay on `main` so
  other lanes' worktrees can branch cleanly off it; L4's Task 1 hit exactly this by checking out
  directly in the shared checkout, corrected post-hoc, see `runs/2026-09-03/decisions.md`). Setup,
  before Task 2 (Task 1 is prose-only, no worktree needed):
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave1-l2-importers "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l2-importers" main
  ```
  Task 1's SPEC/CHANGELOG/TASKS steps need the idl1-app top-level repo too — a matching worktree,
  wired to this one exactly like L1's plan (Task 1 Steps 2) and the M0 precedent:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave1-l2-importers "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l2-importers" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l2-importers"
  git submodule update --init -- rust
  # ^ may print "fatal: remote error: upload-pack: not our ref …" — expected and harmless
  # (origin/GitHub doesn't have this run's unpushed local commits); the next three lines
  # redirect to the actual local worktree and complete the setup correctly regardless
  # (ruling R11, runs/2026-09-03/decisions.md). Do not treat this message as a blocker.
  git -C rust remote add local-wave1 "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l2-importers"
  git -C rust fetch local-wave1 wave1-l2-importers
  git -C rust checkout -B wave1-l2-importers FETCH_HEAD
  ```
- Working directory for every Rust task:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers\core` unless a
  step states otherwise (paths below are relative to `core/` unless prefixed).
- **idl-rs is not rustfmt-formatted** — never run `cargo fmt`. Match surrounding style by hand.
- **No AI attribution trailers** in any commit. **Never `git push`.**
- Doc comment on every public symbol; units on every numeric value; typed errors only (`ImporterError`, never `Err(String)`).
- TDD: Arrange/Act/Assert with blank lines between; Rust tests inline `#[cfg(test)]`; test names `thing — condition — result` (prose in this plan) / `snake_case` (actual Rust identifiers, following this repo's existing convention — see `rust/core/src/parse/mod.rs`'s test names).
- **Lane boundary (CLAUDE.md §7):** this plan touches only `rust/core/src/import/` (new), `rust/core/src/lib.rs` (one `pub mod import;` line), `rust/core/Cargo.toml` (dependency additions), `docs/IDL0_SPEC.md` (§15a), `CHANGELOG.md`, `TASKS.md`. It does not touch `rust/core/src/session/` (L1's), `rust/core/src/parse/` (existing, unmodified), `rust/core/src/export/` (existing, unmodified — Task 4 duplicates a small CRC helper rather than reach into it), `rust/cli/` (CLI wiring for `idl-rs import` is L1's), or any C1/C3/C4 contract file (contracts change only through the lead — this plan raises gaps as Open Questions, never edits a signed contract).
- Every task ends with a commit. Every task touching shipped behaviour is noted for the CHANGELOG/TASKS update in Task 7 (done once, at the end, rather than per-task, matching this lane's single-PR shape).

---

## File Structure

- Modify: `docs/IDL0_SPEC.md` (insert §15a).
- Modify: `rust/core/Cargo.toml` (add `quick-xml`; move `fitparser` from dev- to a regular dependency at the ecosystem pin).
- Modify: `rust/core/src/lib.rs` (add `pub mod import;`).
- Create: `rust/core/src/import/mod.rs` (`Importer` trait, `ImporterError`, `ImportWarning`, `ImportOutcome`, `session_id_from_blob_hash`, `importer_for_extension`).
- Create: `rust/core/src/import/gpx.rs` (`GpxImporter`).
- Create: `rust/core/src/import/fit.rs` (`FitImporter`).
- Create: `rust/core/src/import/csv.rs` (`CsvImporter`).
- Create: `rust/core/src/import/hook.rs` (`PostImportHook`, `NoopPostImportHook`, `import_with_hook`).
- Modify: `CHANGELOG.md`, `TASKS.md` (Task 7).
- Create: `runs/2026-09-03/lanes/l2-importers/BRIEF.md` (written after this plan, by the orchestrator's instructions — not a plan task).

---

### Task 1: SPEC section `docs/IDL0_SPEC.md` §15a (spec-first)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`. No dependency gate (prose only).

**Files:**
- Modify: `docs/IDL0_SPEC.md`

**Interfaces:**
- Produces: the section every later task in this plan implements against, and cites by number in doc comments.

- [ ] **Step 1: Insert §15a**

In `docs/IDL0_SPEC.md`, immediately before the line `## 16. Track Entity` (line 1230 today — confirm with `grep -n "^## 16. Track Entity" docs/IDL0_SPEC.md` first and insert directly above whatever line number that reports), insert:

```markdown
## 15a. Non-device Importers (FIT, GPX, CSV)

Companion to §15 (`.idl0` binary parsing) for the three source formats a
device never wrote. Design doc D3 ("canonicalise on ingest") and D4
("hardware-agnostic... a decade of FIT/GPX is a first-class target; CSV is
low priority") — `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`.
Contract C1 (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`)
fixes the output shape (`Session`/`Channel`, §2) and the time-model rules
(§3.4) every importer in this section obeys; this section is the importer
*behaviour* spec C1 §1 explicitly leaves to the lane.

### 15a.1 The `Importer` trait

`rust/core/src/import/mod.rs` defines one trait, implemented once per
non-device `SourceFormat` (C1 §2): `source_format() -> SourceFormat` and
`import(bytes: &[u8], blob_sha256: &str) -> Result<ImportOutcome,
ImporterError>`. Pure: `bytes` is the caller-already-read, immutable source
blob; `blob_sha256` is the caller-computed SHA-256 hex digest (CAS hashing
is C4's/L1's job, not repeated here). `session_id` (C4 §3: first 16 lowercase
hex characters of `blob_sha256` for non-device sources) is derived by
`session_id_from_blob_hash`, a free function every importer calls —
collision extension (18, 20, ... hex characters, on a real catalog
collision) needs catalog state this pure function does not have, and is
L1's job at catalog-insert time. `.idl0` import (`crate::parse` plus L1's
burst-seam correction, C1 §3.3) does not implement this trait in this
section's scope; whether/how L1 wires it in is L1's call.

`ImportOutcome { session: Session, warnings: Vec<ImportWarning> }`.
`ImporterError` is a typed enum (CLAUDE.md §5 — never `Err(String)`);
variant names are written to fit the `parse_*` kind-vocabulary prefix
contract C3 §2 assigns to importer/parser errors (mirroring
`crate::session::ParseError`'s existing `parse_*` kinds for `.idl0`), but
**C3 §2's kind table does not yet list rows for these new variants** — see
Open Questions.

### 15a.2 FIT import

`FitImporter`, via the `fitparser` crate (ecosystem-report pin `0.11.0`).
Reads every `record` (global message 20) message; ignores every other
message kind (`lap`, `session`, `file_id`, ...) — lap/session metadata is
L1's `session.json` concern (C1 §6), not this importer's.

| FIT field (name, as decoded by `fitparser`) | idl1 channel | Conversion |
|---|---|---|
| `timestamp` (`Value::Timestamp`) | (time axis only) | `fitparser` already applies the FIT-epoch offset (1989-12-31 UTC); `.timestamp()` on the decoded value is UTC epoch **seconds**, matching C1 §3.1's `(fit_timestamp_s + 631065600)` formula with the offset already folded in. |
| `position_lat` / `position_long` (`Value::SInt32`, semicircles) | `GPS_Latitude` / `GPS_Longitude` | `degrees = semicircles × 180 / 2^31` (FIT SDK's documented conversion) |
| `enhanced_altitude` (`Value::Float64`, metres — `fitparser` applies `raw/5 − 500` itself since field 2's scale/offset are non-trivial; the plain `altitude` field is not emitted unless `DecodeOption::KeepCompositeFields` is requested, which this importer does not do) | `GPS_Altitude` | direct (already physical) |
| `heart_rate` (`Value::UInt8`, bpm) | `HR_BPM` | direct |
| `cadence` (`Value::UInt8`, rpm) | `Cadence_RPM` | direct |
| `power` (`Value::UInt16`, watts) | `Power_W` | direct |

Matches C1 §4.1's FIT/GPX-derived column list exactly (`GPS_Latitude`,
`GPS_Longitude`, `GPS_Altitude`, `HR_BPM`, `Cadence_RPM`, `Power_W` — C1's
list also names `GPS_EpochMs`, which FIT has no equivalent field for and so
never populates; GPX populates it, §15a.3). A channel is present in the
output `Session` only when at least one `record` message carries that
field (C1 §4.1 "as applicable") — genuinely per-record: a record missing
`power`, say, contributes no sample to `Power_W` rather than a
zero-filled one, since different `record` messages in one FIT file
commonly carry different subsets of fields.

**Timestamp dedup is record-level, not per-channel.** C1 §3.4 states the
duplicate/non-monotonic drop rule per *channel*; every FIT `record` message
carries exactly one `timestamp` shared by every field on that message (a
FIT protocol invariant), so dropping the whole record when its timestamp
collides with the previous *kept* record is equivalent to the per-channel
rule applied to every one of that record's fields at once — this importer
does it once, at the record level, rather than redundantly per output
channel.

### 15a.3 GPX import

`GpxImporter` — a port of `gpx_parser.dart`
(`app/lib/data/gpx_parser.dart` in idl0-app), via `quick-xml` (pin `0.41.0`
— see Open Questions on provenance). Iterates `<trkpt>` elements; local-name
matching (namespace-prefix-agnostic, matching the Dart parser's approach)
finds `<ele>`, `<time>`, and (regardless of nesting depth under
`<extensions>`) `<hr>`, `<cad>`, `<power>`.

| GPX element | idl1 channel | Notes |
|---|---|---|
| `<trkpt lat lon>` | `GPS_Latitude`, `GPS_Longitude` | decimal degrees, direct (C1 §4.1: `unit: deg`) — **not** scaled ×1e7 as `gpx_parser.dart` did for the old Dart engine's raw-wire convention; C1's non-device row stores physical degrees directly |
| `<ele>` | `GPS_Altitude` | metres; `0.0` when absent (matches Dart) |
| `<time>` | `GPS_EpochMs` | ISO-8601 UTC ms, parsed by a hand-rolled parser (no chrono dependency — GPX's `<time>` shape is fixed and simple); sub-millisecond fractions round to the nearest ms, ties away from zero (C1 §3.4) |
| `<hr>` (namespace-agnostic) | `HR_BPM` | only when at least one point has it |
| `<cad>` | `Cadence_RPM` | only when at least one point has it |
| `<power>` | `Power_W` | only when at least one point has it |

**Not ported from `gpx_parser.dart`:** the derived-when-absent `GPS_SpeedKmh`
(flat-earth speed from consecutive lat/lon/time deltas) and `GPS_Heading`
(derived compass bearing). C1 §4.1's FIT/GPX-derived column list does not
name either channel. See Open Questions — this is flagged as a likely
contract gap, not a deliberate product regression: lap timing and distance
synthesis depend on `GPS_SpeedKmh` per the Dart source's own doc comments.

**Timestamp dedup is trackpoint-level**, for the same reason as FIT's
record-level rule (§15a.2): every idl1 channel a GPX file populates is
sampled at the same `<trkpt>` cadence, so per-channel and per-trackpoint
dedup coincide.

**Missing timestamps.** C1 §3.4 assumes every source sample carries a
parseable recorded timestamp; it does not define behaviour for a GPX file
with none. This importer ports `gpx_parser.dart`'s fallback verbatim:
when **no** trackpoint has a parseable `<time>`, synthesize `i × 1000` ms
from an arbitrary origin (`t0_us = 0` by construction) and surface an
`ImportWarning`; when **some but not all** trackpoints have one, missing
individual points get the same per-index synthesis with their own warning
(a case `gpx_parser.dart` does not encounter — its Dart code pushes a `0`
sentinel per malformed/absent `<time>` without flagging it, which this
importer treats as worth a warning instead, per CLAUDE.md §5). See Open
Questions.

### 15a.4 CSV import (trivial — D4)

`CsvImporter`. **No SPEC, contract, or design-doc text defines a CSV input
shape** — design doc §15 explicitly defers "CSV beyond a trivial
importer." This plan invents the minimal shape design doc's low-priority
framing anticipates, pending lead confirmation (see Open Questions):

```
t_seconds,<channel_1>,<channel_2>,...
0.0,10.0,1.0
1.0,11.0,
2.5,,3.0
```

Comma-separated, **no quoting/escaping** (a real CSV importer, if this
grows beyond hand-built test fixtures, needs a proper crate — out of scope
here). Header row's first column must be literally `t_seconds` (elapsed
seconds, monotonic non-decreasing is not required — each channel column is
deduplicated independently against C1 §3.4's rule); every other header
column names one channel. An empty cell means "no sample for this channel
at this row" (not zero). `t_us[row] = round((t_seconds[row] −
t_seconds[first_row]) × 1e6)`. `Session.timestamp_utc_ms = 0` ("unknown" —
a generic CSV has no wall-clock anchor). `source_kind = "csv"`,
`nominal_rate_hz = 0.0` for every channel (no fixed-rate guarantee is made
by this trivial format).

### 15a.5 Common rules

- **Error kinds.** `ImporterError`'s variants (`FitMalformed`,
  `GpxMalformedXml`, `GpxNoTrackpoints`, `GpxMissingLatLon`,
  `GpxUnparseableLatLon`, `CsvMalformed`, `NotUtf8`) need new `parse_*`-
  prefixed rows in C3 §2's kind vocabulary table before L5 wires
  `import_file` to IPC — not needed for this plan's own Rust-only tests.
  See Open Questions.
- **Post-import materialisation hook.** `rust/core/src/import/hook.rs`
  defines `PostImportHook` (`on_imported(&self, session: &Session)`), a
  no-op default (`NoopPostImportHook`), and `import_with_hook` (runs an
  `Importer` then the hook, on success only) — the extension point design
  doc §5's materialised-derived-channel chain (the iEKF estimator) attaches
  to once L1/L3 build the materialised-channel store. This section ships
  only the shape; wiring a real hook is out of scope here.
- **What is not covered here.** Writing `data.parquet` (C1 §4), catalog
  insertion (C4 §5), CLI subcommand wiring (`idl-rs import`), and the
  `.idl0` importer are L1's.

### 15a.6 Open questions

See `docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`'s Open
Questions section — assigned per item, none unassigned, none blocking this
section's own golden tests.
```

- [ ] **Step 2: Verify placement**

Run: `grep -n "^## 15a\." docs/IDL0_SPEC.md` and `grep -n "^## 16\." docs/IDL0_SPEC.md`
Expected: the `15a` line number is immediately followed (no other `##`-level heading between) by the `16` line.

- [ ] **Step 3: Commit**

```bash
git add docs/IDL0_SPEC.md
git commit -m "docs: IDL0_SPEC §15a — non-device importers (FIT, GPX, CSV)"
```

---

### Task 2: `Importer` trait, `ImporterError`, module skeleton

Working directory: `rust/core`. **Gate check first** (Global Constraints) — do not proceed past Step 1 if either grep returns `0`.

**Files:**
- Create: `rust/core/src/import/mod.rs`
- Modify: `rust/core/src/lib.rs`

**Interfaces:**
- Consumes: `crate::session::{Session, SourceFormat}` (C1 §2, must exist per the gate).
- Produces: `import::{Importer, ImportOutcome, ImportWarning, ImporterError, session_id_from_blob_hash}` — every later task in this plan implements against these.

- [ ] **Step 1: Gate check**

```bash
grep -c "pub t_us: Vec<i64>" src/session/mod.rs
grep -c "pub source_format: SourceFormat" src/session/mod.rs
```
Expected: both `>= 1`. If either is `0`, stop — report to the lead and wait; do not open a worktree.

- [ ] **Step 2: Write `src/import/mod.rs`**

```rust
//! Non-device source importers (FIT, GPX, CSV) producing the canonical
//! [`Session`] model (contract C1 §2). Pure: no I/O beyond bytes the caller
//! already read, no Tauri, no network (CLAUDE.md §2 — this is `core`).
//!
//! Format-specific code runs once, at import (design doc principle
//! "canonicalise on ingest", `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
//! §3) — everything downstream of [`Importer::import`] reads the same
//! [`Session`]/[`Channel`](crate::session::Channel) shape regardless of
//! source. `.idl0` import (`crate::parse` plus L1's burst-seam correction,
//! C1 §3.3) does not implement this trait in this module — see
//! `docs/IDL0_SPEC.md` §15a.1.

pub mod hook;

use crate::session::{Session, SourceFormat};

/// Converts one immutable source blob into the canonical [`Session`] model.
/// One implementation per non-device [`SourceFormat`] (C1 §2,
/// `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`). L1's
/// store writes whatever a conforming implementation returns straight to
/// `data.parquet` (C1 §4) — no format-specific code runs downstream of this.
pub trait Importer {
    /// Which [`SourceFormat`] this importer produces.
    fn source_format(&self) -> SourceFormat;

    /// Parses `bytes` — the exact, immutable content of the source blob, as
    /// read from disk by the caller — into a [`Session`]. `blob_sha256` is
    /// the caller-computed SHA-256 hex digest of `bytes` (CAS hashing is
    /// C4's/L1's job, not repeated here); this function only stamps it onto
    /// [`Session::blob_sha256`] and derives [`Session::session_id`] from it
    /// via [`session_id_from_blob_hash`].
    fn import(&self, bytes: &[u8], blob_sha256: &str) -> Result<ImportOutcome, ImporterError>;
}

/// One [`Importer::import`] call's result: the parsed session plus any
/// non-fatal warnings raised while recovering readable data. Never silently
/// drops a warning-worthy condition and never panics on it either
/// (CLAUDE.md §5).
#[derive(Debug, Clone, PartialEq)]
pub struct ImportOutcome {
    /// The parsed session.
    pub session: Session,
    /// Advisory messages surfaced during import — e.g. a dropped duplicate
    /// timestamp (C1 §3.4). Empty when the source parsed with no concerns.
    pub warnings: Vec<ImportWarning>,
}

/// One non-fatal advisory raised during import. CLAUDE.md §5 — recover what
/// is readable, never crash on bad data, never silently drop it either.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportWarning {
    /// Human-readable text describing what was recovered/dropped and why.
    pub message: String,
}

impl ImportWarning {
    /// Builds a warning with `message`.
    pub fn new(message: impl Into<String>) -> Self {
        ImportWarning { message: message.into() }
    }
}

/// Failures raised while importing a non-device source. Variant names are
/// written to fit the `parse_*` kind-vocabulary prefix contract C3 §2
/// assigns to importer/parser errors (mirroring
/// [`crate::session::ParseError`]'s existing `parse_*` kinds for `.idl0`);
/// C3 §2 does not yet carry rows for these variants — see
/// `docs/IDL0_SPEC.md` §15a.5 and this plan's Open Questions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImporterError {
    /// The FIT byte stream failed CRC validation, has no usable `record`
    /// messages, or `fitparser` otherwise rejected it. Carries `fitparser`'s
    /// message.
    FitMalformed(String),
    /// The GPX document is not well-formed XML.
    GpxMalformedXml(String),
    /// The GPX document has no `<trkpt>` elements.
    GpxNoTrackpoints,
    /// A `<trkpt>` is missing a required `lat` or `lon` attribute.
    GpxMissingLatLon(String),
    /// A `<trkpt>`'s `lat`/`lon` attribute is not a parseable number.
    GpxUnparseableLatLon(String),
    /// The CSV header row is missing, malformed, or has no data rows.
    CsvMalformed(String),
    /// The source bytes could not be read as UTF-8 text (GPX/CSV only —
    /// FIT is binary and never raises this).
    NotUtf8(String),
}

impl std::fmt::Display for ImporterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImporterError::FitMalformed(m) => write!(f, "FitMalformed: {m}"),
            ImporterError::GpxMalformedXml(m) => write!(f, "GpxMalformedXml: {m}"),
            ImporterError::GpxNoTrackpoints => write!(f, "GpxNoTrackpoints"),
            ImporterError::GpxMissingLatLon(m) => write!(f, "GpxMissingLatLon: {m}"),
            ImporterError::GpxUnparseableLatLon(m) => write!(f, "GpxUnparseableLatLon: {m}"),
            ImporterError::CsvMalformed(m) => write!(f, "CsvMalformed: {m}"),
            ImporterError::NotUtf8(m) => write!(f, "NotUtf8: {m}"),
        }
    }
}

impl std::error::Error for ImporterError {}

/// Derives `session_id` for a non-device source (C4 §3): the first 16
/// lowercase hex characters of `blob_sha256`. Collision extension (18, 20,
/// ... hex characters, on a real catalog collision) needs catalog state
/// this pure function does not have — L1's job at catalog-insert time.
pub fn session_id_from_blob_hash(blob_sha256: &str) -> String {
    blob_sha256.chars().take(16).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Proves the trait's own shape (object-safety, method signatures)
    /// independently of any real format parser — GPX/FIT/CSV each get their
    /// own golden tests in their own modules (Tasks 3-5).
    struct StubImporter;
    impl Importer for StubImporter {
        fn source_format(&self) -> SourceFormat {
            SourceFormat::Fit
        }
        fn import(&self, bytes: &[u8], blob_sha256: &str) -> Result<ImportOutcome, ImporterError> {
            Ok(ImportOutcome {
                session: Session {
                    session_id: session_id_from_blob_hash(blob_sha256),
                    device_id: None,
                    timestamp_utc_ms: 0,
                    config_checksum: None,
                    source_format: SourceFormat::Fit,
                    blob_sha256: blob_sha256.to_string(),
                    channels: Vec::new(),
                },
                warnings: if bytes.is_empty() {
                    vec![ImportWarning::new("empty input")]
                } else {
                    Vec::new()
                },
            })
        }
    }

    #[test]
    fn session_id_from_blob_hash_takes_first_16_hex_chars() {
        // Arrange
        let hash = "abcdef0123456789fedcba9876543210000000000000000000000000000000";

        // Act
        let id = session_id_from_blob_hash(hash);

        // Assert
        assert_eq!(id, "abcdef0123456789");
        assert_eq!(id.len(), 16);
    }

    #[test]
    fn stub_importer_via_trait_object_produces_session_with_derived_id() {
        // Arrange
        let importer: Box<dyn Importer> = Box::new(StubImporter);
        let hash = "aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa0";

        // Act
        let outcome = importer.import(b"x", hash).unwrap();

        // Assert
        assert_eq!(outcome.session.session_id, "aa00aa00aa00aa00");
        assert_eq!(outcome.session.source_format, SourceFormat::Fit);
        assert!(outcome.warnings.is_empty());
    }

    #[test]
    fn stub_importer_empty_bytes_surfaces_warning_not_error() {
        // Arrange
        let importer = StubImporter;

        // Act
        let outcome = importer.import(b"", "bb".repeat(32).as_str()).unwrap();

        // Assert
        assert_eq!(outcome.warnings.len(), 1);
        assert_eq!(outcome.warnings[0].message, "empty input");
    }
}
```

Note: `pub mod hook;` is declared here but `src/import/hook.rs` does not
exist until Task 6 — this line is added in Task 6, not here. **Do not add
it yet**; Step 2 above deliberately omits it from the file you write now
(the block shown includes it in the doc comment's cross-reference only,
not as a live `pub mod` line — write the file with only the code shown,
which has no `pub mod hook;` line; re-check the block above before saving:
it does not contain `pub mod hook;`). If your copy of the block above does
contain a stray `pub mod hook;` line, delete it before saving — Task 2's
file must compile standalone with only `mod.rs` present.

- [ ] **Step 3: Wire into `lib.rs`**

In `src/lib.rs`, insert `pub mod import;` alphabetically between `pub mod histogram;` and `pub mod integration;`.

- [ ] **Step 4: Build and test**

```bash
cargo build -p idl-rs 2>&1 | tail -30
cargo test -p idl-rs import:: 2>&1 | grep -E "^test |^test result"
```
Expected: `Finished`; three tests `ok`, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/import/mod.rs src/lib.rs
git commit -m "core: Importer trait, ImporterError, session_id_from_blob_hash (C1 §2 skeleton)"
```

---

### Task 3: GPX importer (port of `gpx_parser.dart`)

Working directory: `rust/core`.

**Files:**
- Modify: `Cargo.toml` (add `quick-xml`)
- Modify: `src/import/mod.rs` (add `pub mod gpx;`, add `importer_for_extension`)
- Create: `src/import/gpx.rs`

**Interfaces:**
- Consumes: `super::{ImportOutcome, ImportWarning, Importer, ImporterError, session_id_from_blob_hash}` (Task 2); `crate::session::{Channel, RawColumn, Session, SourceFormat}` (C1 §2).
- Produces: `GpxImporter`; `importer_for_extension("gpx") -> Some(...)`.

- [ ] **Step 1: Add the `quick-xml` dependency**

In `Cargo.toml`, under `[dependencies]`, add:
```toml
quick-xml = "0.41.0"
```
(Provenance: not from the M0 ecosystem-verification report — that report does not cover an XML crate. Confirmed already present, resolved, at exactly this version in this workspace's own `Cargo.lock` as a transitive dependency (`plist` → `quick-xml 0.41.0`), so this pin adds no new resolution, only promotes an already-resolved version to a direct dependency. See Open Questions — flagged for lead confirmation, not blocking.)

- [ ] **Step 2: Write `src/import/gpx.rs`**

```rust
//! GPX (`.gpx`) import — port of the Dart `GpxParser`
//! (`app/lib/data/gpx_parser.dart`, idl0-app). Channel mapping and
//! derivation rules are documented in `docs/IDL0_SPEC.md` §15a.3.

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use crate::session::{Channel, RawColumn, Session, SourceFormat};

use super::{ImportOutcome, ImportWarning, Importer, ImporterError};

/// Imports Garmin/Strava-style `.gpx` track exports.
pub struct GpxImporter;

/// One `<trkpt>`'s raw field values, `None` when the element/attribute was
/// absent. Mirrors the Dart parser's per-point extraction.
#[derive(Debug, Clone, Default)]
struct TrkPt {
    lat_deg: Option<f64>,
    lon_deg: Option<f64>,
    ele_m: Option<f64>,
    time_utc_ms: Option<i64>,
    hr_bpm: Option<f64>,
    cadence_rpm: Option<f64>,
    power_w: Option<f64>,
}

impl Importer for GpxImporter {
    fn source_format(&self) -> SourceFormat {
        SourceFormat::Gpx
    }

    fn import(&self, bytes: &[u8], blob_sha256: &str) -> Result<ImportOutcome, ImporterError> {
        let text = std::str::from_utf8(bytes).map_err(|e| ImporterError::NotUtf8(e.to_string()))?;
        let mut trkpts = parse_trkpts(text)?;
        if trkpts.is_empty() {
            return Err(ImporterError::GpxNoTrackpoints);
        }

        let mut warnings = Vec::new();

        // C1 §3.4's rule assumes every point has a timestamp; this fallback
        // (synthesize 1 Hz from an arbitrary origin, ported from
        // gpx_parser.dart) covers the case it does not define — §15a.3.
        for (i, p) in trkpts.iter_mut().enumerate() {
            if p.time_utc_ms.is_none() {
                p.time_utc_ms = Some(i as i64 * 1000);
                warnings.push(ImportWarning::new(format!(
                    "GPX trackpoint {i} has no parseable <time> — synthesized"
                )));
            }
        }

        let first_utc_ms = trkpts[0].time_utc_ms.unwrap();
        let mut kept_t_us: Vec<i64> = Vec::with_capacity(trkpts.len());
        let mut kept_idx: Vec<usize> = Vec::with_capacity(trkpts.len());
        let mut last_kept_t_us: Option<i64> = None;
        for (i, p) in trkpts.iter().enumerate() {
            let t_us = (p.time_utc_ms.unwrap() - first_utc_ms) * 1000;
            if let Some(last) = last_kept_t_us {
                if t_us <= last {
                    warnings.push(ImportWarning::new(format!(
                        "dropped GPX trackpoint {i}: duplicate/non-monotonic timestamp"
                    )));
                    continue;
                }
            }
            last_kept_t_us = Some(t_us);
            kept_t_us.push(t_us);
            kept_idx.push(i);
        }

        let mut channels = Vec::new();
        push_channel(&mut channels, "GPS_Latitude", &kept_t_us, &kept_idx, &trkpts, |p| p.lat_deg);
        push_channel(&mut channels, "GPS_Longitude", &kept_t_us, &kept_idx, &trkpts, |p| p.lon_deg);
        push_channel(&mut channels, "GPS_Altitude", &kept_t_us, &kept_idx, &trkpts, |p| Some(p.ele_m.unwrap_or(0.0)));
        push_channel(&mut channels, "GPS_EpochMs", &kept_t_us, &kept_idx, &trkpts, |p| p.time_utc_ms.map(|v| v as f64));
        if trkpts.iter().any(|p| p.hr_bpm.is_some()) {
            push_channel(&mut channels, "HR_BPM", &kept_t_us, &kept_idx, &trkpts, |p| p.hr_bpm);
        }
        if trkpts.iter().any(|p| p.cadence_rpm.is_some()) {
            push_channel(&mut channels, "Cadence_RPM", &kept_t_us, &kept_idx, &trkpts, |p| p.cadence_rpm);
        }
        if trkpts.iter().any(|p| p.power_w.is_some()) {
            push_channel(&mut channels, "Power_W", &kept_t_us, &kept_idx, &trkpts, |p| p.power_w);
        }

        let session = Session {
            session_id: super::session_id_from_blob_hash(blob_sha256),
            device_id: None,
            timestamp_utc_ms: first_utc_ms,
            config_checksum: None,
            source_format: SourceFormat::Gpx,
            blob_sha256: blob_sha256.to_string(),
            channels,
        };

        Ok(ImportOutcome { session, warnings })
    }
}

/// Builds one channel from the kept `(t_us, trkpt index)` pairs; a missing
/// value defaults to `0.0` (matches `gpx_parser.dart`'s per-point default).
fn push_channel(
    channels: &mut Vec<Channel>,
    channel_id: &str,
    kept_t_us: &[i64],
    kept_idx: &[usize],
    trkpts: &[TrkPt],
    f: impl Fn(&TrkPt) -> Option<f64>,
) {
    let values: Vec<f64> = kept_idx.iter().map(|&i| f(&trkpts[i]).unwrap_or(0.0)).collect();
    channels.push(Channel {
        channel_id: channel_id.to_string(),
        t_us: kept_t_us.to_vec(),
        nominal_rate_hz: 0.0,
        column: RawColumn::F64(values),
        source_kind: "gpx".to_string(),
        gaps: Vec::new(),
    });
}

/// Streams `text` once, collecting every `<trkpt>` into a [`TrkPt`].
/// Namespace-prefix-agnostic local-name matching (`quick_xml`'s
/// `local_name()`), matching the Dart parser's approach.
fn parse_trkpts(text: &str) -> Result<Vec<TrkPt>, ImporterError> {
    let mut reader = Reader::from_str(text);
    {
        let cfg = reader.config_mut();
        cfg.trim_text_start = true;
        cfg.trim_text_end = true;
    }

    let mut trkpts = Vec::new();
    let mut in_trkpt = false;
    let mut current = TrkPt::default();
    let mut path: Vec<String> = Vec::new();

    loop {
        let event = reader.read_event().map_err(|e| ImporterError::GpxMalformedXml(e.to_string()))?;
        match event {
            Event::Eof => break,
            Event::Start(e) => {
                let local = local_str(&e);
                if local == "trkpt" {
                    in_trkpt = true;
                    current = TrkPt::default();
                    read_lat_lon(&e, &mut current)?;
                } else if in_trkpt {
                    path.push(local);
                }
            }
            Event::Empty(e) => {
                if local_str(&e) == "trkpt" {
                    return Err(ImporterError::GpxMissingLatLon(
                        "<trkpt/> has no children and cannot carry a timestamp".to_string(),
                    ));
                }
            }
            Event::Text(t) => {
                if in_trkpt {
                    if let Some(field) = path.last().cloned() {
                        let decoded = t.decode().map_err(|e| ImporterError::GpxMalformedXml(e.to_string()))?;
                        assign_field(&mut current, &field, decoded.trim());
                    }
                }
            }
            Event::End(e) => {
                let local = local_str(&e);
                if local == "trkpt" {
                    in_trkpt = false;
                    trkpts.push(current.clone());
                } else if in_trkpt && path.last().map(|s| s.as_str()) == Some(local.as_str()) {
                    path.pop();
                }
            }
            _ => {}
        }
    }

    Ok(trkpts)
}

fn local_str(e: &BytesStart) -> String {
    String::from_utf8_lossy(e.local_name().as_ref()).into_owned()
}

fn read_lat_lon(e: &BytesStart, out: &mut TrkPt) -> Result<(), ImporterError> {
    for attr in e.attributes() {
        let attr = attr.map_err(|err| ImporterError::GpxMalformedXml(err.to_string()))?;
        let key = String::from_utf8_lossy(attr.key.as_ref()).into_owned();
        if key == "lat" || key == "lon" {
            let val = attr
                .unescape_value()
                .map_err(|err| ImporterError::GpxMalformedXml(err.to_string()))?
                .into_owned();
            let parsed = val
                .trim()
                .parse::<f64>()
                .map_err(|_| ImporterError::GpxUnparseableLatLon(format!("{key}=\"{val}\"")))?;
            if key == "lat" {
                out.lat_deg = Some(parsed);
            } else {
                out.lon_deg = Some(parsed);
            }
        }
    }
    if out.lat_deg.is_none() || out.lon_deg.is_none() {
        return Err(ImporterError::GpxMissingLatLon(
            "<trkpt> missing required lat/lon attribute".to_string(),
        ));
    }
    Ok(())
}

fn assign_field(p: &mut TrkPt, field: &str, text: &str) {
    match field {
        "ele" => p.ele_m = text.parse().ok(),
        "time" => p.time_utc_ms = parse_iso8601_utc_ms(text),
        "hr" => p.hr_bpm = text.parse().ok(),
        "cad" => p.cadence_rpm = text.parse().ok(),
        "power" => p.power_w = text.parse().ok(),
        _ => {}
    }
}

/// Parses a GPX `<time>` value (`YYYY-MM-DDTHH:MM:SS[.fraction]Z`, always
/// UTC per the GPX schema) into UTC milliseconds since the Unix epoch,
/// rounding any sub-millisecond fraction to the nearest millisecond, ties
/// away from zero (C1 §3.4). `None` if the string does not match this shape.
fn parse_iso8601_utc_ms(s: &str) -> Option<i64> {
    let s = s.trim().strip_suffix('Z')?;
    let (date, time) = s.split_once('T')?;
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: i64 = date_parts.next()?.parse().ok()?;
    let day: i64 = date_parts.next()?.parse().ok()?;

    let (hms, frac) = match time.split_once('.') {
        Some((hms, frac)) => (hms, Some(frac)),
        None => (time, None),
    };
    let mut time_parts = hms.split(':');
    let hour: i64 = time_parts.next()?.parse().ok()?;
    let minute: i64 = time_parts.next()?.parse().ok()?;
    let second: i64 = time_parts.next()?.parse().ok()?;

    let days = days_since_epoch(year, month, day)?;
    let mut ms = ((days * 24 + hour) * 60 + minute) * 60_000 + second * 1000;

    if let Some(frac) = frac {
        let digits: Vec<u32> = frac.chars().filter_map(|c| c.to_digit(10)).collect();
        let ms_frac: i64 = digits
            .iter()
            .take(3)
            .enumerate()
            .map(|(i, &d)| d as i64 * 10i64.pow(2 - i as u32))
            .sum();
        let round_up = digits.get(3).map(|&d| d >= 5).unwrap_or(false);
        ms += ms_frac + if round_up { 1 } else { 0 };
    }

    Some(ms)
}

/// Days from the Unix epoch (1970-01-01) to `year-month-day`, proleptic
/// Gregorian — Howard Hinnant's "days from civil" algorithm (public domain,
/// howardhinnant.github.io/date_algorithms.html).
fn days_since_epoch(year: i64, month: i64, day: i64) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = (month + 9) % 12; // [0, 11], Mar=0 .. Feb=11
    let doy = (153 * mp + 2) / 5 + day - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    Some(era * 146097 + doe - 719468)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOLDEN_GPX: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="idl1-golden-fixture" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>Golden Loop</name></metadata>
  <trk><trkseg>
    <trkpt lat="45.0" lon="-90.0">
      <ele>1500.0</ele>
      <time>2026-06-01T12:00:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="45.001" lon="-90.001">
      <ele>1501.0</ele>
      <time>2026-06-01T12:00:01Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>142</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="45.002" lon="-90.002">
      <ele>1502.0</ele>
      <time>2026-06-01T12:00:01Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>145</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="45.003" lon="-90.003">
      <time>2026-06-01T12:00:03Z</time>
    </trkpt>
  </trkseg></trk>
</gpx>"#;

    #[test]
    fn gpx_importer_golden_fixture_maps_channels_and_drops_duplicate_timestamp() {
        // Arrange / Act
        let outcome = GpxImporter.import(GOLDEN_GPX.as_bytes(), &"aa".repeat(32)).unwrap();

        // Assert — one warning for the dropped duplicate trackpoint.
        assert_eq!(outcome.warnings.len(), 1);
        assert!(outcome.warnings[0].message.contains("trackpoint 2"));

        // Assert — three kept samples, t_us = [0, 1_000_000, 3_000_000].
        let lat = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Latitude").unwrap();
        assert_eq!(lat.t_us, vec![0, 1_000_000, 3_000_000]);
        assert_eq!(lat.materialize(), vec![45.0, 45.001, 45.003]);

        let lon = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Longitude").unwrap();
        assert_eq!(lon.materialize(), vec![-90.0, -90.001, -90.003]);

        // Assert — row 3 has no <ele>: defaults to 0.0.
        let alt = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Altitude").unwrap();
        assert_eq!(alt.materialize(), vec![1500.0, 1501.0, 0.0]);

        // Assert — row 3 has no <hr> extension: defaults to 0.0.
        let hr = outcome.session.channels.iter().find(|c| c.channel_id == "HR_BPM").unwrap();
        assert_eq!(hr.materialize(), vec![140.0, 142.0, 0.0]);

        // Assert — no <cad>/<power> anywhere: channels absent entirely.
        assert!(outcome.session.channels.iter().all(|c| c.channel_id != "Cadence_RPM"));
        assert!(outcome.session.channels.iter().all(|c| c.channel_id != "Power_W"));

        assert_eq!(outcome.session.source_format, SourceFormat::Gpx);
        assert_eq!(outcome.session.device_id, None);
        assert_eq!(outcome.session.config_checksum, None);
        assert_eq!(outcome.session.session_id.len(), 16);
    }

    #[test]
    fn gpx_importer_no_trackpoints_returns_typed_error() {
        // Arrange
        let gpx = r#"<gpx><trk><trkseg></trkseg></trk></gpx>"#;

        // Act
        let result = GpxImporter.import(gpx.as_bytes(), &"bb".repeat(32));

        // Assert
        assert_eq!(result, Err(ImporterError::GpxNoTrackpoints));
    }

    #[test]
    fn gpx_importer_missing_lat_returns_typed_error() {
        // Arrange
        let gpx = r#"<gpx><trk><trkseg><trkpt lon="1.0"><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>"#;

        // Act
        let result = GpxImporter.import(gpx.as_bytes(), &"cc".repeat(32));

        // Assert
        assert!(matches!(result, Err(ImporterError::GpxMissingLatLon(_))));
    }

    #[test]
    fn gpx_importer_malformed_xml_returns_typed_error() {
        // Arrange
        let gpx = "<gpx><trk>";

        // Act
        let result = GpxImporter.import(gpx.as_bytes(), &"dd".repeat(32));

        // Assert
        assert!(matches!(result, Err(ImporterError::GpxMalformedXml(_))));
    }

    #[test]
    fn gpx_importer_no_timestamps_at_all_synthesizes_and_warns() {
        // Arrange
        let gpx = r#"<gpx><trk><trkseg><trkpt lat="1.0" lon="2.0"><ele>10.0</ele></trkpt><trkpt lat="1.1" lon="2.1"><ele>11.0</ele></trkpt></trkseg></trk></gpx>"#;

        // Act
        let outcome = GpxImporter.import(gpx.as_bytes(), &"ee".repeat(32)).unwrap();

        // Assert
        assert_eq!(outcome.warnings.len(), 2); // one per synthesized point
        let lat = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Latitude").unwrap();
        assert_eq!(lat.t_us, vec![0, 1000]);
    }

    #[test]
    fn parse_iso8601_utc_ms_at_the_year_2000_anchor_matches_known_epoch() {
        // Arrange — 2000-01-01T00:00:00Z is a widely-verified 946684800 s.

        // Act
        let ms = parse_iso8601_utc_ms("2000-01-01T00:00:00Z");

        // Assert
        assert_eq!(ms, Some(946_684_800_000));
    }

    #[test]
    fn parse_iso8601_utc_ms_rounds_subsecond_fraction_ties_away_from_zero() {
        // Arrange — .1235 s → 123 ms plus a 4th-digit-5 round-up to 124 ms.

        // Act
        let ms = parse_iso8601_utc_ms("2000-01-01T00:00:00.1235Z");

        // Assert
        assert_eq!(ms, Some(946_684_800_124));
    }
}
```

- [ ] **Step 3: Wire `gpx` into `import/mod.rs`**

In `src/import/mod.rs`, add `pub mod gpx;` directly above the existing `pub mod hook;`... **wait**: `hook` does not exist yet (Task 6). Add just:
```rust
pub mod gpx;
```
as the first line of the module list (before the `use crate::session::...` line). Then, directly below `session_id_from_blob_hash`'s closing brace and before the `#[cfg(test)]` block, add:
```rust

/// Selects an importer by lowercase file extension (without the dot).
/// `None` for anything this module does not (yet) cover — the caller
/// (CLI/L1 store) decides how to report an unrecognised extension.
pub fn importer_for_extension(ext: &str) -> Option<Box<dyn Importer>> {
    match ext {
        "gpx" => Some(Box::new(gpx::GpxImporter)),
        _ => None,
    }
}
```

- [ ] **Step 4: Build and test**

```bash
cargo build -p idl-rs 2>&1 | tail -40
```
Expected: `Finished`. If `quick-xml`'s API in the code above does not match `0.41.0`'s actual signatures, fix exactly the mismatched call (the crate is vendored at `~/.cargo/registry/src/*/quick-xml-0.41.0/src/` for reference — `Reader::from_str`, `.config_mut()` → `Config { trim_text_start, trim_text_end, .. }`, `.read_event()`, `BytesStart::local_name()`/`.attributes()`, `Attribute::unescape_value()`, `BytesText::decode()` are the exact APIs this code was written against, confirmed directly from that source).

```bash
cargo test -p idl-rs import::gpx:: 2>&1 | grep -E "^test |^test result"
```
Expected: seven tests `ok`, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml src/import/mod.rs src/import/gpx.rs
git commit -m "core: GpxImporter — port of gpx_parser.dart onto C1's Session/Channel model"
```

---

### Task 4: FIT importer (`fitparser` 0.11.0)

Working directory: `rust/core`.

**Files:**
- Modify: `Cargo.toml` (promote `fitparser` from dev- to a regular dependency at the ecosystem pin)
- Modify: `src/import/mod.rs` (add `pub mod fit;`, extend `importer_for_extension`)
- Create: `src/import/fit.rs`

**Interfaces:**
- Consumes: `fitparser::{from_bytes, Value, profile::MesgNum}`.
- Produces: `FitImporter`; `importer_for_extension("fit") -> Some(...)`.

- [ ] **Step 1: Promote the `fitparser` dependency to the ecosystem pin**

In `Cargo.toml`: delete `fitparser = "0.9"` from `[dev-dependencies]`; add under `[dependencies]`:
```toml
fitparser = "0.11.0"
```

- [ ] **Step 2: Confirm the existing FIT export tests still build against 0.11.0**

```bash
cargo build -p idl-rs 2>&1 | tail -40
cargo test -p idl-rs export::fit:: 2>&1 | grep -E "^test |^test result|FAILED"
```
Expected: `Finished`; every `export::fit` test still `ok`. This module (`rust/core/src/export/fit/mod.rs`) uses `fitparser::from_bytes`, `.kind()`, `MesgNum::Record`/`MesgNum::Lap`, `.fields()`, `.name()` — the same surface this task's importer uses; a 0.9→0.11 API break here would surface as a compile error. If it does, fix only the mismatched call in `export/fit/mod.rs` (do not touch its logic) and re-run; this file is outside this plan's lane ownership (Global Constraints), so keep the fix to the minimum needed to compile.

- [ ] **Step 3: Write `src/import/fit.rs`**

```rust
//! FIT (Garmin/Wahoo/etc.) `.fit` activity import, via the `fitparser`
//! crate (ecosystem-report pin `0.11.0`). Channel mapping and the
//! record-level duplicate/non-monotonic-timestamp rule are documented in
//! `docs/IDL0_SPEC.md` §15a.2.
//!
//! **Why record-level, not literally per-channel, deduplication.** C1 §3.4
//! states the drop rule per *channel*; every FIT `record` message carries
//! exactly one `timestamp` field shared by every other field on that same
//! message (a FIT protocol invariant), so dropping a whole record when its
//! timestamp collides is equivalent to dropping the same sample from every
//! channel independently — this module does it once, at the record level.

use crate::session::{Channel, RawColumn, Session, SourceFormat};

use super::{ImportOutcome, ImportWarning, Importer, ImporterError};

/// Imports Garmin/Wahoo-style `.fit` activity files.
pub struct FitImporter;

/// One `record` message's fields this importer understands, `None` when the
/// field was absent from that particular message (FIT records commonly omit
/// fields — e.g. an indoor-trainer file has no `position_lat`/`position_long`).
#[derive(Debug, Clone, Default)]
struct FitRecord {
    timestamp_utc_s: Option<i64>,
    lat_deg: Option<f64>,
    lon_deg: Option<f64>,
    altitude_m: Option<f64>,
    hr_bpm: Option<f64>,
    cadence_rpm: Option<f64>,
    power_w: Option<f64>,
}

/// Converts FIT position semicircles (`i32`) to decimal degrees:
/// `degrees = semicircles × 180 / 2^31` (the FIT SDK's documented formula).
fn semicircles_to_deg(raw: i32) -> f64 {
    raw as f64 * (180.0 / 2_147_483_648.0)
}

/// Widens any numeric `fitparser::Value` to `f64`; `None` for non-numeric
/// variants (should not occur for the fields this importer reads).
fn numeric_value(v: &fitparser::Value) -> Option<f64> {
    match v {
        fitparser::Value::UInt8(x) => Some(*x as f64),
        fitparser::Value::UInt16(x) => Some(*x as f64),
        fitparser::Value::SInt32(x) => Some(*x as f64),
        fitparser::Value::UInt32(x) => Some(*x as f64),
        fitparser::Value::Float32(x) => Some(*x as f64),
        fitparser::Value::Float64(x) => Some(*x),
        _ => None,
    }
}

impl Importer for FitImporter {
    fn source_format(&self) -> SourceFormat {
        SourceFormat::Fit
    }

    fn import(&self, bytes: &[u8], blob_sha256: &str) -> Result<ImportOutcome, ImporterError> {
        let data = fitparser::from_bytes(bytes).map_err(|e| ImporterError::FitMalformed(e.to_string()))?;

        let mut records: Vec<FitRecord> = Vec::new();
        for d in data.iter().filter(|d| d.kind() == fitparser::profile::MesgNum::Record) {
            let mut r = FitRecord::default();
            for field in d.fields() {
                match field.name() {
                    "timestamp" => {
                        if let fitparser::Value::Timestamp(dt) = field.value() {
                            r.timestamp_utc_s = Some(dt.timestamp());
                        }
                    }
                    "position_lat" => {
                        if let fitparser::Value::SInt32(v) = field.value() {
                            r.lat_deg = Some(semicircles_to_deg(*v));
                        }
                    }
                    "position_long" => {
                        if let fitparser::Value::SInt32(v) = field.value() {
                            r.lon_deg = Some(semicircles_to_deg(*v));
                        }
                    }
                    "enhanced_altitude" => r.altitude_m = numeric_value(field.value()),
                    "heart_rate" => r.hr_bpm = numeric_value(field.value()),
                    "cadence" => r.cadence_rpm = numeric_value(field.value()),
                    "power" => r.power_w = numeric_value(field.value()),
                    _ => {}
                }
            }
            records.push(r);
        }

        // A record with no timestamp cannot be placed on the time axis —
        // recover what's readable rather than failing the whole import
        // (CLAUDE.md §5).
        records.retain(|r| r.timestamp_utc_s.is_some());
        if records.is_empty() {
            return Err(ImporterError::FitMalformed(
                "no `record` message carries a timestamp".to_string(),
            ));
        }

        let first_utc_s = records[0].timestamp_utc_s.unwrap();
        let mut warnings = Vec::new();
        let mut kept: Vec<(usize, i64)> = Vec::with_capacity(records.len());
        let mut last_kept_t_us: Option<i64> = None;
        for (i, r) in records.iter().enumerate() {
            let t_us = (r.timestamp_utc_s.unwrap() - first_utc_s) * 1_000_000;
            if let Some(last) = last_kept_t_us {
                if t_us <= last {
                    warnings.push(ImportWarning::new(format!(
                        "dropped FIT record {i}: duplicate/non-monotonic timestamp"
                    )));
                    continue;
                }
            }
            last_kept_t_us = Some(t_us);
            kept.push((i, t_us));
        }

        let mut channels = Vec::new();
        push_channel(&mut channels, "GPS_Latitude", &kept, &records, |r| r.lat_deg);
        push_channel(&mut channels, "GPS_Longitude", &kept, &records, |r| r.lon_deg);
        push_channel(&mut channels, "GPS_Altitude", &kept, &records, |r| r.altitude_m);
        push_channel(&mut channels, "HR_BPM", &kept, &records, |r| r.hr_bpm);
        push_channel(&mut channels, "Cadence_RPM", &kept, &records, |r| r.cadence_rpm);
        push_channel(&mut channels, "Power_W", &kept, &records, |r| r.power_w);

        let session = Session {
            session_id: super::session_id_from_blob_hash(blob_sha256),
            device_id: None,
            timestamp_utc_ms: first_utc_s * 1000,
            config_checksum: None,
            source_format: SourceFormat::Fit,
            blob_sha256: blob_sha256.to_string(),
            channels,
        };

        Ok(ImportOutcome { session, warnings })
    }
}

/// Builds one channel from `kept` (record index, t_us) pairs, taking only
/// the records where `f` returns `Some` — genuinely per-record independence
/// (C1 §3.4): a record missing `power`, say, contributes no sample to
/// `Power_W` rather than a zero-filled one. A channel absent from every
/// record is omitted entirely (C1 §4.1 "as applicable").
fn push_channel(
    channels: &mut Vec<Channel>,
    channel_id: &str,
    kept: &[(usize, i64)],
    records: &[FitRecord],
    f: impl Fn(&FitRecord) -> Option<f64>,
) {
    let mut t_us = Vec::new();
    let mut values = Vec::new();
    for &(i, t) in kept {
        if let Some(v) = f(&records[i]) {
            t_us.push(t);
            values.push(v);
        }
    }
    if values.is_empty() {
        return;
    }
    channels.push(Channel {
        channel_id: channel_id.to_string(),
        t_us,
        nominal_rate_hz: 0.0,
        column: RawColumn::F64(values),
        source_kind: "fit".to_string(),
        gaps: Vec::new(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// FIT CRC-16, the same table-driven algorithm as
    /// `crate::export::fit::encoder::crc16` — duplicated here (that module
    /// is private to `export::fit`, and this plan's lane does not touch
    /// `export/` — CLAUDE.md §7) rather than reached into.
    fn fit_crc16(data: &[u8]) -> u16 {
        const TABLE: [u16; 16] = [
            0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800,
            0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
        ];
        let mut crc: u16 = 0;
        for &byte in data {
            let tmp = TABLE[(crc & 0xF) as usize];
            crc = (crc >> 4) & 0x0FFF;
            crc = crc ^ tmp ^ TABLE[(byte & 0xF) as usize];
            let tmp = TABLE[(crc & 0xF) as usize];
            crc = (crc >> 4) & 0x0FFF;
            crc = crc ^ tmp ^ TABLE[((byte >> 4) & 0xF) as usize];
        }
        crc
    }

    /// One `record` message's raw field values, in definition order:
    /// timestamp (FIT-epoch seconds), lat/lon (semicircles), altitude (raw,
    /// `physical = raw/5 − 500`), heart_rate, cadence, power.
    struct RawRecord {
        timestamp: u32,
        lat: i32,
        lon: i32,
        altitude_raw: u16,
        hr: u8,
        cadence: u8,
        power: u16,
    }

    /// Builds a minimal, valid `.fit` byte sequence: a 14-byte file header,
    /// one `record` (global msg 20) definition message, one data message
    /// per `rows` entry, and the trailing file CRC.
    fn build_fit_fixture(rows: &[RawRecord]) -> Vec<u8> {
        let mut body = Vec::new();
        body.push(0x40); // definition, local_type 0
        body.push(0x00); // reserved
        body.push(0x00); // architecture: little-endian
        body.extend_from_slice(&20u16.to_le_bytes()); // global_mesg_num = record
        body.push(7); // field count
        for &(num, size, base) in &[
            (253u8, 4u8, 0x86u8), // timestamp: uint32
            (0, 4, 0x85),          // position_lat: sint32
            (1, 4, 0x85),          // position_long: sint32
            (2, 2, 0x84),          // altitude: uint16
            (3, 1, 0x02),          // heart_rate: uint8
            (4, 1, 0x02),          // cadence: uint8
            (7, 2, 0x84),          // power: uint16
        ] {
            body.push(num);
            body.push(size);
            body.push(base);
        }
        for row in rows {
            body.push(0x00); // data message, local_type 0
            body.extend_from_slice(&row.timestamp.to_le_bytes());
            body.extend_from_slice(&row.lat.to_le_bytes());
            body.extend_from_slice(&row.lon.to_le_bytes());
            body.extend_from_slice(&row.altitude_raw.to_le_bytes());
            body.push(row.hr);
            body.push(row.cadence);
            body.extend_from_slice(&row.power.to_le_bytes());
        }

        let mut out = Vec::with_capacity(14 + body.len() + 2);
        out.push(14); // header size
        out.push(0x20); // protocol version 2.0
        out.extend_from_slice(&2100u16.to_le_bytes()); // profile version
        out.extend_from_slice(&(body.len() as u32).to_le_bytes()); // data size
        out.extend_from_slice(b".FIT");
        let header_crc = fit_crc16(&out[0..12]);
        out.extend_from_slice(&header_crc.to_le_bytes());
        out.extend_from_slice(&body);
        let file_crc = fit_crc16(&out);
        out.extend_from_slice(&file_crc.to_le_bytes());
        out
    }

    fn golden_rows() -> Vec<RawRecord> {
        const T0: u32 = 1_000_000_000;
        vec![
            RawRecord { timestamp: T0, lat: 536_870_912, lon: -1_073_741_824, altitude_raw: 10_000, hr: 140, cadence: 80, power: 200 },
            RawRecord { timestamp: T0 + 1, lat: 268_435_456, lon: -536_870_912, altitude_raw: 10_005, hr: 142, cadence: 82, power: 205 },
            RawRecord { timestamp: T0 + 1, lat: 0, lon: 0, altitude_raw: 10_010, hr: 145, cadence: 85, power: 210 }, // duplicate — dropped
            RawRecord { timestamp: T0 + 3, lat: 134_217_728, lon: 0, altitude_raw: 10_020, hr: 148, cadence: 88, power: 215 },
        ]
    }

    #[test]
    fn fit_importer_golden_fixture_maps_channels_and_drops_duplicate_timestamp() {
        // Arrange
        let bytes = build_fit_fixture(&golden_rows());

        // Act
        let outcome = FitImporter.import(&bytes, &"aa".repeat(32)).unwrap();

        // Assert — one warning for the dropped duplicate record.
        assert_eq!(outcome.warnings.len(), 1);
        assert!(outcome.warnings[0].message.contains("record 2"));

        // Assert — three kept samples per channel, t_us = [0, 1_000_000, 3_000_000].
        let lat = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Latitude").unwrap();
        assert_eq!(lat.t_us, vec![0, 1_000_000, 3_000_000]);
        assert_eq!(lat.materialize(), vec![45.0, 22.5, 11.25]);

        let lon = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Longitude").unwrap();
        assert_eq!(lon.materialize(), vec![-90.0, -45.0, 0.0]);

        let alt = outcome.session.channels.iter().find(|c| c.channel_id == "GPS_Altitude").unwrap();
        assert_eq!(alt.materialize(), vec![1500.0, 1501.0, 1504.0]);

        let hr = outcome.session.channels.iter().find(|c| c.channel_id == "HR_BPM").unwrap();
        assert_eq!(hr.materialize(), vec![140.0, 142.0, 148.0]);

        let cad = outcome.session.channels.iter().find(|c| c.channel_id == "Cadence_RPM").unwrap();
        assert_eq!(cad.materialize(), vec![80.0, 82.0, 88.0]);

        let pw = outcome.session.channels.iter().find(|c| c.channel_id == "Power_W").unwrap();
        assert_eq!(pw.materialize(), vec![200.0, 205.0, 215.0]);

        assert_eq!(outcome.session.source_format, SourceFormat::Fit);
        assert_eq!(outcome.session.device_id, None);
        assert_eq!(outcome.session.config_checksum, None);
        assert_eq!(outcome.session.session_id.len(), 16);
    }

    #[test]
    fn fit_importer_malformed_bytes_returns_typed_error() {
        // Arrange
        let bytes = b"not a fit file";

        // Act
        let result = FitImporter.import(bytes, &"bb".repeat(32));

        // Assert
        assert!(matches!(result, Err(ImporterError::FitMalformed(_))));
    }

    #[test]
    fn semicircles_to_deg_quarter_circle_is_45_degrees() {
        // Arrange / Act / Assert
        assert_eq!(semicircles_to_deg(536_870_912), 45.0);
    }
}
```

- [ ] **Step 4: Wire `fit` into `import/mod.rs`**

In `src/import/mod.rs`: add `pub mod fit;` next to `pub mod gpx;`. In `importer_for_extension`, add a `"fit"` arm:
```rust
pub fn importer_for_extension(ext: &str) -> Option<Box<dyn Importer>> {
    match ext {
        "gpx" => Some(Box::new(gpx::GpxImporter)),
        "fit" => Some(Box::new(fit::FitImporter)),
        _ => None,
    }
}
```

- [ ] **Step 5: Build and test**

```bash
cargo build -p idl-rs 2>&1 | tail -40
```
Expected: `Finished`. If `fitparser` 0.11.0's field names/types for `record` message fields differ from what this code assumes (verified here against the locally-cached `0.9.0` source only — `~/.cargo/registry/src/*/fitparser-0.9.0/src/profile/decode.rs`, field numbers 0/1/2/3/4/7/253 — 0.11.0 was not available to inspect locally), fix exactly the mismatched `match` arm in `fit.rs` against the actual 0.11.0 docs (`cargo doc -p idl-rs --no-deps --open`, or docs.rs/fitparser/0.11.0) and re-run.

```bash
cargo test -p idl-rs import::fit:: 2>&1 | grep -E "^test |^test result"
```
Expected: three tests `ok`, `0 failed`.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml src/import/mod.rs src/import/fit.rs
git commit -m "core: FitImporter — fitparser 0.11.0, record-level dedup, C1 §4.1 channel mapping"
```

---

### Task 5: CSV importer (trivial, D4)

Working directory: `rust/core`.

**Files:**
- Modify: `src/import/mod.rs` (add `pub mod csv;`, extend `importer_for_extension`)
- Create: `src/import/csv.rs`

**Interfaces:**
- Produces: `CsvImporter`; `importer_for_extension("csv") -> Some(...)`.

- [ ] **Step 1: Write `src/import/csv.rs`**

```rust
//! Trivial CSV import (design doc D4 — low priority; §15 "CSV beyond a
//! trivial importer" is explicitly deferred). The input shape here is this
//! plan's own minimal definition — no SPEC/contract fixes a CSV shape; see
//! `docs/IDL0_SPEC.md` §15a.4 and this plan's Open Questions.

use crate::session::{Channel, RawColumn, Session, SourceFormat};

use super::{ImportOutcome, ImportWarning, Importer, ImporterError};

/// Imports the trivial CSV shape documented in `docs/IDL0_SPEC.md` §15a.4:
/// header `t_seconds,<channel>,...`, comma-separated, no quoting/escaping,
/// an empty cell meaning "no sample for this channel at this row."
pub struct CsvImporter;

impl Importer for CsvImporter {
    fn source_format(&self) -> SourceFormat {
        SourceFormat::Csv
    }

    fn import(&self, bytes: &[u8], blob_sha256: &str) -> Result<ImportOutcome, ImporterError> {
        let text = std::str::from_utf8(bytes).map_err(|e| ImporterError::NotUtf8(e.to_string()))?;
        let mut lines = text.lines().filter(|l| !l.trim().is_empty());

        let header = lines.next().ok_or_else(|| ImporterError::CsvMalformed("empty file".to_string()))?;
        let columns: Vec<&str> = header.split(',').map(|c| c.trim()).collect();
        if columns.len() < 2 || columns[0] != "t_seconds" {
            return Err(ImporterError::CsvMalformed(
                "header must be \"t_seconds,<channel>,...\" with at least one channel column".to_string(),
            ));
        }
        let channel_names = &columns[1..];

        let mut per_channel: Vec<Vec<(i64, f64)>> = vec![Vec::new(); channel_names.len()];
        let mut warnings = Vec::new();
        let mut first_t_seconds: Option<f64> = None;

        for (row_idx, line) in lines.enumerate() {
            let cells: Vec<&str> = line.split(',').collect();
            if cells.len() != columns.len() {
                return Err(ImporterError::CsvMalformed(format!(
                    "row {row_idx} has {} cells, expected {}",
                    cells.len(),
                    columns.len()
                )));
            }
            let t_seconds: f64 = cells[0].trim().parse().map_err(|_| {
                ImporterError::CsvMalformed(format!("row {row_idx}: unparseable t_seconds \"{}\"", cells[0]))
            })?;
            let first = *first_t_seconds.get_or_insert(t_seconds);
            let t_us = ((t_seconds - first) * 1_000_000.0).round() as i64;

            for (ci, cell) in cells[1..].iter().enumerate() {
                let cell = cell.trim();
                if cell.is_empty() {
                    continue;
                }
                let value: f64 = cell.parse().map_err(|_| {
                    ImporterError::CsvMalformed(format!(
                        "row {row_idx}, column \"{}\": unparseable value \"{cell}\"",
                        channel_names[ci]
                    ))
                })?;
                let series = &mut per_channel[ci];
                if let Some(&(last_t, _)) = series.last() {
                    if t_us <= last_t {
                        warnings.push(ImportWarning::new(format!(
                            "dropped CSV row {row_idx}, column \"{}\": duplicate/non-monotonic t_seconds",
                            channel_names[ci]
                        )));
                        continue;
                    }
                }
                series.push((t_us, value));
            }
        }

        if first_t_seconds.is_none() {
            return Err(ImporterError::CsvMalformed("no data rows".to_string()));
        }

        let mut channels = Vec::new();
        for (name, series) in channel_names.iter().zip(per_channel.into_iter()) {
            if series.is_empty() {
                continue;
            }
            let (t_us, values): (Vec<i64>, Vec<f64>) = series.into_iter().unzip();
            channels.push(Channel {
                channel_id: name.to_string(),
                t_us,
                nominal_rate_hz: 0.0,
                column: RawColumn::F64(values),
                source_kind: "csv".to_string(),
                gaps: Vec::new(),
            });
        }
        if channels.is_empty() {
            return Err(ImporterError::CsvMalformed("no channel had any parseable sample".to_string()));
        }

        let session = Session {
            session_id: super::session_id_from_blob_hash(blob_sha256),
            device_id: None,
            timestamp_utc_ms: 0,
            config_checksum: None,
            source_format: SourceFormat::Csv,
            blob_sha256: blob_sha256.to_string(),
            channels,
        };

        Ok(ImportOutcome { session, warnings })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_importer_golden_fixture_maps_columns_and_drops_duplicate_row() {
        // Arrange — column "b" is empty (no sample) on the last row.
        let csv = "t_seconds,a,b\n0.0,10.0,1.0\n1.0,11.0,2.0\n1.0,12.0,3.0\n2.5,13.0,\n";

        // Act
        let outcome = CsvImporter.import(csv.as_bytes(), &"cc".repeat(32)).unwrap();

        // Assert — two warnings: column "a" and column "b" both hit the
        // duplicate t_seconds=1.0 row independently.
        assert_eq!(outcome.warnings.len(), 2);

        let a = outcome.session.channels.iter().find(|c| c.channel_id == "a").unwrap();
        assert_eq!(a.t_us, vec![0, 1_000_000, 2_500_000]);
        assert_eq!(a.materialize(), vec![10.0, 11.0, 13.0]);

        let b = outcome.session.channels.iter().find(|c| c.channel_id == "b").unwrap();
        assert_eq!(b.t_us, vec![0, 1_000_000]);
        assert_eq!(b.materialize(), vec![1.0, 2.0]);

        assert_eq!(outcome.session.timestamp_utc_ms, 0);
        assert_eq!(outcome.session.source_format, SourceFormat::Csv);
        assert_eq!(outcome.session.device_id, None);
    }

    #[test]
    fn csv_importer_missing_header_returns_typed_error() {
        // Arrange
        let csv = "not,a,valid,header\n1,2,3,4\n";

        // Act
        let result = CsvImporter.import(csv.as_bytes(), &"dd".repeat(32));

        // Assert
        assert!(matches!(result, Err(ImporterError::CsvMalformed(_))));
    }

    #[test]
    fn csv_importer_no_data_rows_returns_typed_error() {
        // Arrange
        let csv = "t_seconds,a\n";

        // Act
        let result = CsvImporter.import(csv.as_bytes(), &"ee".repeat(32));

        // Assert
        assert!(matches!(result, Err(ImporterError::CsvMalformed(_))));
    }
}
```

- [ ] **Step 2: Wire `csv` into `import/mod.rs`**

In `src/import/mod.rs`: add `pub mod csv;` next to `pub mod fit;`/`pub mod gpx;`. Extend `importer_for_extension`:
```rust
pub fn importer_for_extension(ext: &str) -> Option<Box<dyn Importer>> {
    match ext {
        "gpx" => Some(Box::new(gpx::GpxImporter)),
        "fit" => Some(Box::new(fit::FitImporter)),
        "csv" => Some(Box::new(csv::CsvImporter)),
        _ => None,
    }
}
```

- [ ] **Step 3: Build and test**

```bash
cargo build -p idl-rs 2>&1 | tail -20
cargo test -p idl-rs import:: 2>&1 | grep -E "^test result"
```
Expected: `Finished`; every `import::` test-result line shows `0 failed`.

- [ ] **Step 4: Commit**

```bash
git add src/import/mod.rs src/import/csv.rs
git commit -m "core: CsvImporter — trivial t_seconds+channel-columns shape (D4, low priority)"
```

---

### Task 6: Post-import materialisation hook

Working directory: `rust/core`.

**Files:**
- Modify: `src/import/mod.rs` (add `pub mod hook;`)
- Create: `src/import/hook.rs`

**Interfaces:**
- Produces: `hook::{PostImportHook, NoopPostImportHook, import_with_hook}`.

- [ ] **Step 1: Write `src/import/hook.rs`**

```rust
//! Post-import materialisation hook (design doc §5's "materialised derived
//! channels" extension point,
//! `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`). This module
//! ships only the hook's shape — the real estimator wiring (the iEKF chain)
//! is L1/L3's, once the materialised-channel store exists. See
//! `docs/IDL0_SPEC.md` §15a.5 and this plan's Open Questions.

use crate::session::Session;

/// Runs once, immediately after a successful [`super::Importer::import`],
/// with the freshly produced [`Session`]. The extension point L1's store
/// (or the CLI) uses to trigger materialised-channel computation without
/// `import` itself depending on the estimator crate.
pub trait PostImportHook {
    /// Called with the imported `session`. Must not panic on ordinary bad
    /// data (CLAUDE.md §5) — there is no channel back to the caller for a
    /// hook-raised problem today; see Open Questions.
    fn on_imported(&self, session: &Session);
}

/// The hook that does nothing — the default until L1/L3 wire a real one.
pub struct NoopPostImportHook;

impl PostImportHook for NoopPostImportHook {
    fn on_imported(&self, _session: &Session) {}
}

/// Runs `importer.import(..)`, then `hook.on_imported` on success. The one
/// call site the CLI `import` subcommand (L1) and, later, the C3
/// `import_file` command both use, so the hook never needs re-wiring per
/// call site.
pub fn import_with_hook<I: super::Importer>(
    importer: &I,
    bytes: &[u8],
    blob_sha256: &str,
    hook: &dyn PostImportHook,
) -> Result<super::ImportOutcome, super::ImporterError> {
    let outcome = importer.import(bytes, blob_sha256)?;
    hook.on_imported(&outcome.session);
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::gpx::GpxImporter;
    use crate::session::SourceFormat;
    use std::cell::Cell;

    struct CountingHook<'a> {
        count: &'a Cell<u32>,
    }
    impl<'a> PostImportHook for CountingHook<'a> {
        fn on_imported(&self, _session: &Session) {
            self.count.set(self.count.get() + 1);
        }
    }

    const MINIMAL_GPX: &str = r#"<gpx><trk><trkseg><trkpt lat="1.0" lon="2.0"><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="1.1" lon="2.1"><time>2026-01-01T00:00:01Z</time></trkpt></trkseg></trk></gpx>"#;

    #[test]
    fn import_with_hook_calls_hook_exactly_once_on_success() {
        // Arrange
        let count = Cell::new(0);
        let hook = CountingHook { count: &count };

        // Act
        let outcome = import_with_hook(&GpxImporter, MINIMAL_GPX.as_bytes(), &"ee".repeat(32), &hook).unwrap();

        // Assert
        assert_eq!(count.get(), 1);
        assert!(!outcome.session.channels.is_empty());
    }

    #[test]
    fn import_with_hook_does_not_call_hook_on_failure() {
        // Arrange
        let count = Cell::new(0);
        let hook = CountingHook { count: &count };

        // Act
        let result = import_with_hook(&GpxImporter, b"not gpx", &"ff".repeat(32), &hook);

        // Assert
        assert!(result.is_err());
        assert_eq!(count.get(), 0);
    }

    #[test]
    fn noop_post_import_hook_runs_without_panicking() {
        // Arrange
        let session = Session {
            session_id: String::new(),
            device_id: None,
            timestamp_utc_ms: 0,
            config_checksum: None,
            source_format: SourceFormat::Csv,
            blob_sha256: String::new(),
            channels: Vec::new(),
        };

        // Act / Assert — exists only to prove the trait has a working
        // zero-cost default implementer.
        NoopPostImportHook.on_imported(&session);
    }
}
```

- [ ] **Step 2: Wire `hook` into `import/mod.rs`**

In `src/import/mod.rs`, add `pub mod hook;` alongside the other `pub mod` lines (`csv`, `fit`, `gpx`, `hook` — alphabetical).

- [ ] **Step 3: Build and test**

```bash
cargo build -p idl-rs 2>&1 | tail -20
cargo test -p idl-rs import:: 2>&1 | grep -E "^test result"
```
Expected: `Finished`; `0 failed` on every line.

- [ ] **Step 4: Full workspace check**

```bash
cargo test --workspace 2>&1 | grep -E "^test result|FAILED|^error"
```
Expected: every `test result:` line `0 failed`; no `error` lines (confirms Tasks 2-6 have not broken any other crate/module).

- [ ] **Step 5: Commit**

```bash
git add src/import/mod.rs src/import/hook.rs
git commit -m "core: post-import materialisation hook shape (design doc §5 extension point)"
```

---

### Task 7: CHANGELOG, TASKS, wrap-up

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`.

**Files:**
- Modify: `CHANGELOG.md`, `TASKS.md`

- [ ] **Step 1: Update `CHANGELOG.md`**

Directly under `## [Unreleased]` / `### Added` (or create the `### Added` heading under `[Unreleased]` if the most recent entry there is a different heading), insert:
```markdown

- **L2 importers (wave 1, <date>).** `GpxImporter` (port of
  `gpx_parser.dart`), `FitImporter` (`fitparser` 0.11.0), `CsvImporter`
  (trivial, D4) behind a shared `Importer` trait producing C1 §2's
  `Session`/`Channel` model; a post-import materialisation hook shape.
  `docs/IDL0_SPEC.md` §15a. Golden tests against hand-built FIT/GPX/CSV
  fixtures — no real device archive used yet (see plan's Open Questions).
```

- [ ] **Step 2: Tick `TASKS.md`**

Change `- [ ] L2 importers` (under `## Wave 1 (after M0)`) to `- [x] L2 importers`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md TASKS.md
git commit -m "docs: L2 importers complete — CHANGELOG, TASKS"
```

---

## Open questions

Every item has a stated default already adopted in the body text above; none blocks the tasks in this plan (each note says which task, if any, it would affect once resolved).

1. **RULED (2026-09-03, lead ruling R7).** `GPS_SpeedKmh`/`GPS_Heading` are now in C1 §4.1's FIT/GPX-derived column row (added post-sign, same ruling). This plan's own Tasks 3-4 implement neither yet — add **Task 8: FIT/GPX `GPS_SpeedKmh`/`GPS_Heading` mapping**, executed before this lane is considered done, using exactly the mapping this open question already specified: FIT's `speed`/`enhanced_speed` fields (m/s, ×3.6 for km/h) and `heading`/`course` if present; GPX's `<speed>`/`<course>` elements when present, else port `gpx_parser.dart`'s `_deriveSpeedKmh`/`_deriveHeading` fallback verbatim (great-circle distance ÷ time between consecutive fixes). TDD per this plan's own convention (Arrange/Act/Assert, `thing — condition — result` names), golden-tested against the same hand-built fixtures Tasks 3-4 already use, extended with speed/heading values.
2. **GPX file with no `<time>` on any/some trackpoints.** C1 §3.4 assumes every sample has a parseable recorded timestamp; it does not define this case. This plan ports `gpx_parser.dart`'s whole-file fallback (synthesize 1 Hz from an arbitrary origin) and extends the same idea per-point for a partially-timestamped file (with its own warning — Dart silently zero-fills instead). **Assigned: lead** — confirm or replace before this behaviour is treated as final (Task 3 already implements and tests it).
3. **RULED (2026-09-03, lead ruling R7) — resolved.** C3 §2 now carries `import_fit_malformed`/`import_gpx_malformed_xml`/`import_gpx_no_trackpoints`/`import_gpx_missing_lat_lon`/`import_gpx_unparseable_lat_lon`/`import_csv_malformed`/`import_not_utf8`, one row per `ImporterError` variant, `import_*`-prefixed per C3 §2's own naming rule (its own domain, distinct from `parse_*`). L5's `import_file` wrapper maps `ImporterError` → these kinds directly, no gap remains.
4. **RULED (2026-09-03, lead ruling R7) — approved as drafted.** `quick-xml` 0.41.0, resolved from this workspace's own `Cargo.lock`, stands as the pin. Low risk: transitively already resolved and building in this workspace, not a fresh unverified guess.
5. **RULED (2026-09-03, lead ruling R7) — approved as drafted.** The invented CSV shape (§15a.4) stands as the working format; D4 already marks CSV as low priority, "when in Rome" — revisit only if a real CSV source with a different shape shows up.
6. **`PostImportHook`'s real signature** (error handling? async? ordering relative to catalog insert?) is provisional — Task 6 ships the shape only; the real materialisation wiring is L1/L3's once the derived-channel store exists (design doc §5). **Assigned: L1/L3.**
7. **Isaac's real FIT/GPX archive location** — needed to extend golden-test coverage beyond the hand-built fixtures in Tasks 3-4; not blocking, since C1 §3.4's rules are fully specified and testable synthetically (same pattern as C1 §8 item 8's treatment of the missing real `.idl0` session for L1). **Assigned: Isaac.**
8. **`fitparser` 0.11.0's exact `record`-message field-decoding behaviour** (field names, which fields get "enhanced" composite substitution, base types) was verified against the locally-cached `0.9.0` source only — 0.11.0 was not available to inspect in this environment. Task 4 Step 5 includes a compile-and-fix verification step against the real pinned version. **Assigned: L2 implementer, at Task 4.**
9. **`.idl0`'s own `Importer` trait implementation** (wrapping `crate::parse` + L1's burst-seam correction) is explicitly out of scope for this plan — whether/how L1 wires `.idl0` into this same trait, and where that implementation lives, is L1's call. **Assigned: L1.**
10. **`session_id` collision extension** (C4 §3: 16→18→20 hex characters on a real catalog collision) is deliberately not implemented by `session_id_from_blob_hash` — it needs catalog state this pure function does not have. **Assigned: L1**, at catalog-insert time.

---

## Self-review

**Spec coverage (design §10 L2 row):** FIT (`fitparser`) → Task 4; GPX (port of `gpx_parser.dart`) → Task 3; CSV → Task 5; `Importer` trait producing the canonical model → Task 2; post-import materialisation hook → Task 6. "Done when" (design §10): golden tests per format → Tasks 3-5's `#[cfg(test)]` modules; "Isaac's FIT/GPX archive imports" is partially this plan's (the importers exist and are tested) and partially L1's (CLI wiring, out of this lane's directory) — see Open Questions item 7 and item 9.

**Placeholder scan:** the only `<…>` tokens are `<date>` (Task 7, the day the step runs) — no TBD/TODO/"decide later" anywhere in code or SPEC text.

**Type consistency:** `Importer`/`ImportOutcome`/`ImportWarning`/`ImporterError`/`session_id_from_blob_hash` defined Task 2, used by every later task; `importer_for_extension` introduced Task 3 (gpx-only), extended Tasks 4-5 (fit, csv); `PostImportHook`/`NoopPostImportHook`/`import_with_hook` defined and self-tested Task 6, depends on `GpxImporter` (Task 3) only for its own test fixture, not for its own logic (generic over `I: Importer`).

**Lane boundary check:** every file this plan creates or modifies is listed in File Structure and Global Constraints' lane-boundary bullet; `rust/core/src/export/fit/` is read (Task 4 Step 2, to confirm it still builds against the bumped `fitparser` pin) but never modified.
