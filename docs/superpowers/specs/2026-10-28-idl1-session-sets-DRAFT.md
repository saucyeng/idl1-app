# DRAFT — Session sets: N-to-N analysis in one workbook

**Status:** draft for the lead and Isaac, 2026-10-28. Nothing here is built or ruled. It changes C2 (front
matter, value shapes, tables, JS binding), C3 (one command, `IDLH` v3), C4 (a cache directory) and the CLI
table, so it needs Isaac's yes before code (architecture changes need Isaac).
**Spec discipline (CLAUDE.md §6):** spec-first for every phase in §7. The open questions in §9 each name the
section they would change.
**Code references** are to `idl1-app` `bf0ffd0` and the `rust` submodule at `554d606`.
**Evidence tags:** *verified* = read in code or data; *measured* = timed on this machine today; *estimate* =
computed, with the arithmetic shown. Memory figures marked "memory spec" come from
`2026-10-27-idl1-evaluation-memory-DRAFT.md` (§2.4 measured, §4 estimated).

---

## 0. Summary

**Proposal in three sentences.** A workbook names its sessions in a new front-matter key, `sessions:`, as an
ordered list of named groups ("Day 1", "Day 2"); that set is part of the file, independent of the app's
selection. Every existing definition stays a *per-session* definition, evaluated once per member, one member
at a time, keeping only reduced results (rank 0 and `[lap]`), which are cached on disk under a
content-addressed key; only those small results ever cross between sessions. Tables gain a "one row per
session" row source whose columns read definitions, and (phase 2) the maths gains a `ses` axis with
`per_session(x)`, `mean(x, "ses")` and `mean(x, "ses:group")`, so cross-session reductions are ordinary
definitions.

| | Today | Phase 1 | Phase 2 + memory phases 2–4 |
|---|---|---|---|
| Making the 9-session comparison | 36 CLI runs, 8 literal tables (engine gaps P1-6) | one `eval_session_set` call; every table computed | same, plus day means and day-2 − day-1 as definitions |
| Sessions resident at once | 1 (CLI); all selected windows in the app (§1.4) | 1 | P, from the budget (§4.5) |
| 9 sessions, first open, desktop | (app) likely OOM, §1.4 | ≈ 14–32 s, peak ≈ 3 GB (estimate) | ≈ 4–9 s at P = 4, peak ≈ 2.4–3 GB (estimate) |
| 9 sessions, reopen | full re-evaluation | 0 Parquet decodes, < 0.1 s (estimate) | same |
| IPC for the set | up to ≈ 2,000 `fetch_host_channel_v2` calls (§1.4) | 1 JSON reply, ≈ 30 KB (estimate) | + one `IDLH` v3 fetch per charted set value |
| 100-session season, desktop | not possible | not targeted | cold ≈ 25–60 s at P = 6; warm < 0.5 s (estimate) |

---

## 1. What exists today (verified unless marked)

### 1.1 Per-window evaluation is real, and it is the only multi-session mechanism

- `eval_workbook_v2_via` evaluates the **whole workbook once per window, serially**, each window against its
  own lazy session handle and `MathLapContext` (`rust/tauri/src/commands/workbook.rs:670-727`; the loop is
  `:688-726`). One evaluation sees exactly one window (R117.4; C2 §3.6.9 item 3, C2 line 1278).
- Each window's evaluation is single-flight and kept in `EvalRegistry` under `EvalKey` = SHA-256 of
  (workbook bytes, `session_id`, span, `blob_sha256|importer_version|seam_correction_version` read from the
  `data.parquet` footer, `session.json` bytes, `idl_rs::VERSION`) (`workbook.rs:931-962`,
  `eval_registry.rs:27-48`).
- The registry is an LRU capped at `eval_cache_cap_bytes` = half the session budget
  (`memory.rs:80-82`, wired at `session_cache.rs:298`); the session budget is `min(2 GiB, 25 % of RAM)`
  (`memory.rs:17`, `:65-68`), so **1 GiB on this 16 GB machine**. An evaluation larger than the cap is
  returned but not kept (`eval_registry.rs:194-206`).
- Lap functions number against the session's real laps under any window since `1298624`/`d00bf96`
  (`session_source.rs:457-459`, `:523-550`, `session_laps`).

### 1.2 What crosses IPC

- `eval_workbook_v2` returns JSON `CellOutput[]` per window. A definition's value is only
  `HostChannelRef { length, has_t }` (`workbook.rs:53-63`): **no number crosses here, not even a scalar.**
- Every value, rank 0 included, is fetched as `IDLH` v2 bytes by `fetch_host_channel_v2(workbook_id, window,
  def_name, budget)`, which reads the kept evaluation (`workbook.rs:843-897`). `IDLH` v2 has a 24-byte header,
  one `t` array and one `v` array, and `axis_kind` ∈ {none, time, frequency, lap}
  (`core/src/workbook/v3/host_channel_wire.rs:14-43`; C3 §3.4). It cannot carry rank ≥ 2, a `win` axis, or
  any per-session axis (`app/src/routes/pages/Notebook/model/definitionBind.ts:14-19`).
- A table cell's value is JSON `{ model, results }`, evaluated per window (`workbook.rs:984-1002`).

### 1.3 What the app does with several windows

- The **primary window** is `windows[0]` (`Notebook/index.tsx:526`); every single-session consumer reads
  `primaryOutputs` (`index.tsx:751-756`).
- Since `bf0ffd0`, every math definition is bound by name: **one `fetch_host_channel_v2` per (definition,
  selected window), all started at once** with `Promise.all` (`index.tsx:3914-3970`,
  `definitionBind.ts:111-133`), budget 4,096 points (`index.tsx:345`). A rank-0 value binds **the first
  window's number** (`definitionBind.ts:40-42`, `:74-79`); `${…}` spans show that number.
- Charts overlay windows through `channel()`'s `w` column (C2 §5.1, R127).

### 1.4 Consequence: selecting the nine sessions today (reasoned from code, not run)

1. `eval_workbook_v2` runs 9 evaluations back to back. Each keeps every full-rate value: ≈ 0.6 GB for
   session `103bc2bf…` after memory phase 1 (memory spec §6, phase 1 row), and up to ≈ 0.84 GB for the
   largest member, `9b351991…` (2,376,180 IMU0 samples, 1.40 × `103bc2bf…`'s 1,694,793; estimate by
   proportion). The 1 GiB registry keeps at most one or two of them.
2. The definition-bind effect then starts ≈ 232 × 9 ≈ 2,000 fetches at once. The first fetch for each evicted
   window re-runs that window's evaluation, and those re-runs are concurrent: 7 × ≈ 0.6 GB plus each
   session's decoded channels (≈ 0.63 GB each before memory phase 4, memory spec §1.2) against a 2 GiB cache
   budget and ≈ 5 GB of commit headroom (memory spec §2.4). That is the 2026-10-27 OOM's shape again.
3. Even if it survived, no definition could combine two windows (R117.4), and tables would come back as nine
   separate per-window tables (C3 §3.4 "One derived table per selected window").

**N-to-N must not be built on the selection path.** That path is right for what it was designed for:
overlaying a few windows on a chart.

### 1.5 Pieces this design reuses

| Piece | Where | Status |
|---|---|---|
| Lazy, projected channel reads from `data.parquet` | `core/src/store/parquet.rs:1375` (`read_channel`), `:1756` (`open_session_lazy`) | landed |
| Parallel, budget-bounded per-session job in **core** (private rayon pool, `DecodeBudget`, cancel flag) | `core/src/store/index_job.rs:68-74`, `:405-422` | landed (precedent for §4.5) |
| Multi-session table evaluation (`handles[]`, `row_handles[]`) | `core/src/table/eval.rs:363-438` | landed, unused across sessions |
| Value shapes: `win` axis, `"t:win"`, rank ≥ 2 | C2 §3.6 (lines 886, 1103-1150) | **designed, not implemented** (C2 line 823, R233: `t` and `lap` only, rank ≤ 1; `ValueAxis` is `{Time, Lap}`, `core/src/math/value.rs:22-31`) |
| `mean(x, "t:lap")` | C2 §3.6.3 | not implemented (engine gaps P1-2) |
| Table formulas reading definitions | — | **not possible**: a table cell resolves `[Name]` against the session's channels only (`core/src/table/eval.rs:154-172`); engine gaps P1-3 |
| Planner, liveness, demand set, admission, result cache | memory spec §4.2.B, F, G | drafted; phases 2–6 not built |
| `catalog.sqlite` `lap_summary` (design §5's "season search never opens Parquet") | catalog | table exists, **0 rows** in the library (verified) |

### 1.6 The data (verified from the files)

| Item | Value |
|---|---|
| Library | 169 sessions: 164 `.idl0` (53.3 h) and 5 GPX (15.7 h); `data.parquet` total 8,385 MB; median 21.3 MB, p90 135.5 MB, max 577.1 MB |
| The nine sessions | `data.parquet` 98.7–181.2 MB each, **1,206.5 MB** together; 35 columns; 3.66–7.03 M union rows (45.4 M together); 4–8 row groups |
| IMU0 samples per session | 1,236,346 – 2,376,180 (15.34 M together); IMU1/IMU2 within 3 % of IMU0; GPS 1,529–2,939 fixes |
| Compressed bytes the workbook's channels occupy | 18 IMU columns 49.2–88.5 MB per session (604 MB for nine); union `t` 9.6–17.8 MB (117 MB for nine) |
| Parquet footer | **4.8–9.3 MB per session** (60.1 MB for nine), because each IMU column repeats its source's `gaps` JSON (memory spec §2.1) |
| Decode speed (pyarrow 25.0.1, one thread, the 17 columns the workbook reads incl. `t`) | **measured:** 0.54 s for `103bc2bf…`; 4.97 s for all nine warm, 6.48 s on the first pass; 2,816 MB of Arrow arrays for nine. A proxy for arrow-rs, not idl-rs. |
| `idl_rs::VERSION` | `"0.1.0"` (`core/src/lib.rs:56`, `core/Cargo.toml:3`), unchanged since the repo split (`2657e07`). §4.3 and Q4 depend on this. |

### 1.7 The motivating workbook

`workbooks/mx-compare-2026-09-19-vs-2026-10-24.idl1wb`: 232 definitions in 11 math cells, 9 table cells
holding only `literal` values, 7 js cells. Its §10 table names the nine session ids. Of the nine tables, seven
are "one row per session, one column per session-level scalar" (`c0270001`, `-03`, `-08`, `-0b`, `-0d`, `-0f`,
`-10`). Two are transposed per day (`c0270006`: rows = day-1 sectors, columns = day-1 sessions plus "Best
pass S5"; `c0270007` likewise for day 2). Every number in every table is a rank-0 value of a definition that
already exists (`o_*`, `m0`–`m8`, `b0`–`b8`). None of them needs a cross-session reduction. The cross-session
numbers live in the prose ("123.3 → 106.2 s", "about 14 % each day") and were subtracted by hand.

---

## 2. The model

### 2.1 Three things that must stay separate

| | Lives in | Survives restart | Changes when | Used for |
|---|---|---|---|---|
| **Selection** (windows, R115/R117) | app memory (C1 §6.1, R41) | no | the user clicks | which session the per-session charts and `${…}` show; chart overlays |
| **Session set** (new) | the workbook file | yes, and syncs with it | the file is edited | which sessions the workbook's cross-session tables, charts and maths cover |
| **Library content** | `<data>/sessions/*` | yes | import, pull, drop (library tiers) | whether a member can be computed here |

A set-level result is a function of the file and the library only, never of the selection. That is
"the workbook is a file; the app is a live viewer of it" applied to N sessions: a table of nine sessions must
not change when someone clicks a tenth.

### 2.2 Writing a set (C2 §1 amendment)

A new optional top-level front-matter key, `sessions` (Q1 weighs a fenced cell instead):

```yaml
sessions:
  - group: Day 1 (19 Sep)
    members:
      - { id: 388740a19b3c013e0ec66d276c001d04, label: D1 S1 }
      - { id: ed9a4fa1b3f1b88533c1bfd6bdb8bd7a, label: D1 S2 }
      # …
  - group: Day 2 (24 Oct)
    members:
      - { id: 1a5d2cdbb0efddfd9a1796d83fe00351, label: D2 S1 }
      # …
```

Rules:

- Groups are ordered and named; group names are unique. Members are ordered and are whole sessions
  (span = session, C1 §6.1). A set with no `group` keys is one unnamed group.
- A session id appears at most once in the set (structural error `workbook_duplicate_set_member`, routed
  like other front-matter errors). Groups do not overlap in this revision (§8, R-6).
- `label` is optional display text; the default is `session.json`'s `event_session` when non-empty, else the
  first 8 hex digits of the id.
- One set per workbook in this revision (§8, R-6). Query-defined sets ("every session at Broome-Tioga,
  grouped by day") are phase 3 (§7).
- **Merge (C2 §7.1 amendment):** per group by name; within a group, members merge as a three-way set against
  the last-synced base (added on one side carries, removed on one side carries); order conflicts keep local.
  No conflict note, as for `graph`.
- Older builds preserve the key untouched (R135), so the file round-trips. They evaluate nothing new.

### 2.3 Relation to the selection

- With a set declared and nothing selected, the app selects the first member (span = session) as the primary
  window, so per-session cells have something to show.
- Clicking a row of a session table selects that member as the primary window. "Use selection as set" in the
  Data tab writes the selected sessions into `sessions:` as one group (an ordinary file edit).
- Per-session cells (today's math cells, charts, `${…}`) keep showing the primary window. Set-level cells
  (§3, §5) ignore the selection.

### 2.4 Is "per day" an axis?

Yes, but a derived one. The member axis is `ses` (one entry per member, set order). Grouping is a reduction
that **replaces** `ses` by `group`, exactly as `"t:lap"` replaces `t` by `lap` in C2 §3.6.3. A "day" is
whatever the author put in a group in phase 1. Grouping by a session property (local date, venue, bike) is the
phase-3 query form.

---

## 3. Maths semantics (phase 2)

### 3.1 Two levels, inferred

- A **session-level** definition is every definition that exists today. It is evaluated once per member, over
  that member's whole session, with that member's laps (exactly `load_window_context_from` with
  `span = session`, `session_source.rs:523-550`). Its shape is today's: `[]`, `[t]`, `[lap]`.
- A **set-level** definition is one whose expression calls `per_session(…)`, uses a `"ses…"` axis string, or
  references a set-level definition. The engine infers the level from the expression; nothing is annotated.
  A set-level definition is evaluated once per set.
- A set-level expression may not name a stored channel (`[IMU0_AccelX]`): that is a `ShapeMismatch`
  "`[IMU0_AccelX]` is per session; reduce it in a session-level definition, then `per_session(...)` it".

### 3.2 New axis kinds (C2 §3.6.1 amendment)

| `kind` | Written | Coordinates | Produced by |
|---|---|---|---|
| `session` | `ses` | member index into the set (0-based), with a descriptor `{session_id, label, group, start_utc_ms}` per entry | `per_session(x)` |
| `group` | `group` | group index (0-based) with its name; `at(x, "group", "Day 2")` selects by name, as `at(x, "c", "roll")` does for named components | a `"ses:group"` reduction |

`origin` (C2 §3.6.2) for both is the set's identity: the canonical text of `sessions:` after resolution. Two
`[ses]` values from the same workbook are always compatible.

**`win` is untouched.** It stays reserved and unimplemented (C2 §3.6.9 item 3). Q2 argues for keeping the two
axes distinct.

### 3.3 The lift: `per_session(x)`

`per_session(x)` takes a session-level expression `x` of shape `S` and returns the stacked value of shape
`[ses] ++ S`.

- `S` must contain no `t` axis. Lifting a full-rate value is a `ShapeMismatch`:
  "`per_session` needs a reduced value; `[f_bump]` is [t] — reduce it first (`rms`, `mean`, `p`, …)". **This
  rule is what makes streaming possible**: everything that crosses sessions is small by construction
  (§4.1). `[f]` (spectra) is excluded too in this revision, since frequency axes differ per session unless
  their parameters match.
- `S = []` gives `[ses]`. `S = [lap]` gives `[ses,lap]`, **NaN-padded** to the largest lap count in the set,
  because sessions have different lap counts. Every aggregate already skips NaN (engine gaps N13), so
  `median(per_session([lt]), "lap")` is each member's median lap.
- A member whose value failed is a typed per-member error, not NaN (§3.6).

`per_session` is the **only** lift. Reductions over `"ses"` do not lift their argument themselves: one way to
write it, and the error names the fix.

### 3.4 Reductions and selection over the new axes

Every C2 §3.6.3 reduction (`mean sum min max std rms median count first last p`) accepts:

| Form | Accepts | Returns |
|---|---|---|
| `mean(x, "ses")` | a shape carrying `ses` | that shape without `ses`. `[ses] → []`, `[ses,lap] → [lap]` (mean lap time by lap number across the set) |
| `mean(x, "ses:group")` | as above | `ses` **replaced** by `group`. `[ses] → [group]`, `[ses,lap] → [group,lap]` |
| `mean(x, "lap")` | a shape carrying `lap` | `[ses,lap] → [ses]` |
| `at(x, "group", "Day 2")`, `at(x, "ses", "<session id or label>")` | as C2 §3.6.3's `at` | that shape minus the axis |

Elementwise rules are C2 §3.6.2 rules 1 and 2 unchanged: a scalar combines with anything, equal shapes combine.
`[ses]` with `[group]` is a `ShapeMismatch` (no implicit broadcast). The "value against its group mean"
operator (`expand(x, "group:ses")`) is deferred until an analysis needs it.

### 3.5 The comparison workbook's prose, as definitions

```math
med_s   = per_session([med])                                  # shape: [ses] label: Median flying lap
day_med = median([med_s], "ses:group")                        # shape: [group]
gain    = 100 * (1 - last([med_s], "ses:group") / first([med_s], "ses:group"))   # shape: [group] unit: %
d2_vs_d1_slow_pct = at(mean(per_session([slow_pct]), "ses:group"), "group", "Day 2 (24 Oct)")
                  - at(mean(per_session([slow_pct]), "ses:group"), "group", "Day 1 (19 Sep)")   # unit: %
lt_s    = per_session([lt])                                   # shape: [ses,lap]
```

"About 14 % each day" becomes `${gain.v[0].toFixed(1)} %` and `${gain.v[1].toFixed(1)} %`, computed, not
typed.

### 3.6 NaN, errors and missing members

Three different things, never conflated:

- **NaN**: a legitimate value (no flying laps). Skipped by aggregates, as today.
- **Error**: the member's definition failed (`math_*`). A set-level reduction over it fails with
  "`med` failed on D2 S3: <its error>" (the N9 fix, applied across sessions).
- **Missing**: the member's data is not on this device and no cached result exists (§4.7). A set-level
  reduction over a missing member is **unavailable**, naming the missing members, per Q3's recommendation.
  Per-session rows still show what this device has.

---

## 4. Evaluation architecture

### 4.1 Map, then combine

```
for each member m (in parallel, P at a time, §4.5):
    demand_m = session-level definitions the set needs (§4.2)
    hits     = cache lookups for demand_m under m's keys (§4.3)        -- no Parquet opened on a full hit
    residual = demand_m minus hits, closed over dependencies
    if residual reads no channel: evaluate from session.json alone    -- laps and sectors only
    else: decode only the channels residual reads (projection), evaluate residual,
          keep rank-0 and [lap] results, drop every full-rate buffer
    store results in the cache, release m's memory, report progress
combine: set-level definitions and set tables over the member results (microseconds)
```

The invariant: **at most P members' full-rate data exist at once, and nothing that leaves a member is larger
than a `[lap]` vector.** Memory never grows with the size of the set.

### 4.2 Demand

The demand set is computed statically in core from the parsed document:

- every session-level definition named inside a `per_session(…)` (phase 2);
- every definition a session-row table column reads (§5.1), phase 1;
- nothing else. Charts and `${…}` over session-level values are served by today's per-window path for the
  primary window only.

Closure = demand plus transitive `[ref]` dependencies, from the DAG `resolve.rs` already builds (memory spec
§4.2.B). For the comparison workbook, a table of lap statistics only (`c0270001`'s first four columns) has a
closure that reads **no channel at all**: `lap_time()`, `lap_number()` and `sector_time(i)` come from
`session.json`. Those columns cost one 45 KB JSON read per member (`103bc2bf…/session.json` is 45,753 B).

### 4.3 Keys and the result cache

**Phase 1 key (whole-maths, per member):**

```
MemberKey = sha256( "idl1-member-v1"
                  ‖ maths text      (every math definition line and the constants, canonical order;
                                     plus every session-row table column template)
                  ‖ data identity   (blob_sha256, importer_version, seam_correction_version)
                  ‖ laps identity   (session.json laps[] with sectors, and lap_detector_version)
                  ‖ engine identity (Q4) )
result row key = sha256(MemberKey ‖ name)
```

Prose, js cells, chart code and `graph` positions are not in the key, so editing them recomputes nothing.
Editing any definition recomputes every member in phase 1.

**Phase 2 key (per definition closure)**, as memory spec §4.2.A's "later refinement":
`DefKey(d, m) = sha256(closure text of d ‖ constants it reads ‖ data identity(m) ‖ laps identity(m) only if
the closure calls a lap builtin ‖ engine identity)`. Editing one definition then invalidates only its
dependents, on every member.

**Where data identity comes from.** Today `evaluation_key` reads it from the `data.parquet` footer
(`workbook.rs:941-946`). At 4.8–9.3 MB a footer (§1.6), a warm 100-session lookup would read ≈ 700 MB of
footers just to compute keys (estimate: 100 × ≈ 7 MB). The set evaluator reads identity from
`catalog.sqlite`'s `sessions` row (`blob_sha256`, `importer_version`, `seam_correction_version` are columns
there, verified), falling back to the footer when the catalog has no row. The catalog stays an index: it is
derived from the footer and rebuildable.

**Engine identity (Q4).** `idl_rs::VERSION` is `0.1.0` and has never changed (§1.6). A persisted cache keyed
by it would serve pre-fix numbers after every engine fix, the lap-window fix of 2026-10-27 included, which
changes `current_lap()` values. Phase 1 therefore keys by the build's git commit, stamped at build time; a
build without one does not use the disk cache. Q4 asks whether a maths-semantics version should replace it
before results sync.

**Cache format (C4 amendment).** `<data>/cache/eval/results.sqlite` (memory spec Q2 answered: a local cache,
keyed by inputs, sync optional and off by default):

```sql
CREATE TABLE results (
  key          BLOB PRIMARY KEY,   -- 32-byte sha256 (§4.3)
  session_id   TEXT NOT NULL,
  name         TEXT NOT NULL,      -- definition name, or "table:<cell id>:<column id>"
  shape        TEXT NOT NULL,      -- "[]" or "[lap]"
  unit_json    TEXT NOT NULL,      -- C3 UnitLabel
  payload      BLOB,               -- f64 little-endian; for [lap], lap numbers then values
  error_json   TEXT,               -- a deterministic math_* error; decode and memory errors are never stored
  last_used_ms INTEGER NOT NULL
);
CREATE INDEX results_by_session ON results(session_id);
```

- One file rather than one file per result: 300 sessions × ≈ 200 results would be ≈ 60,000 small files
  (estimate).
- Size: ≈ 200 rank-0/`[lap]` results × ≈ 100–300 B ≈ 20–60 KB per member, so 300 sessions ≈ 6–18 MB
  (estimate). Pruned by `last_used_ms` above 256 MiB.
- Deletable at any time, like the catalog. Never in the sync manifest in phases 1–2. Phase 3 adds optional
  sync: rows are content-addressed, so merging is a union with no conflicts.
- Rows are written per member, in that member's own transaction, so a cancelled run keeps what it finished
  (`index_job`'s rule, `index_job.rs:12-15`).

### 4.4 Memory per member in flight

`E_m = I_m + F_m + T_m` (memory spec §4.1). For a set evaluation `F_m` drops the chart-retained values, since
set evaluation retains no full-rate value at all (memory spec §4.1 counts 54 MB of them).

| | `103bc2bf…` (1.69 M IMU0 samples) | `9b351991…` (2.38 M, largest member) | Basis |
|---|---|---|---|
| Phase 1 (memory phase 1 only, landed) | inputs ≈ 0.37 GB (`read_channel`'s 18 B/sample × 12 IMU channels) + values ≈ 0.6 GB ≈ **1.0 GB** | ≈ **1.4 GB** | memory spec §1.3, §6 phase 1; × 1.40 by sample count |
| Phase 2 (with memory phases 2 and 4) | I ≈ 82 MB + F ≈ 95 MB + T ≈ 55–95 MB ≈ **0.25–0.3 GB** | ≈ **0.35–0.42 GB** | memory spec §4.1 table, minus 54 MB chart-retained |

All estimates. The phase-1 figure assumes the set evaluator decodes through its own source rather than the
app's `SessionCache`, so the focus session's cached channels are not evicted by eight other sessions and the
eight are freed when their member finishes (§6.2).

### 4.5 Parallelism

- `P = min(workers, ⌊B_free / E_max⌋)`, `E_max` the planner's estimate for the largest pending member
  (memory spec §5). Phase 1 runs `P = 1`.
- The runner lives in **core** beside `store::index_job`, which already runs per-session work on a private
  rayon pool with a byte budget and a cancel flag (`index_job.rs:405-422`, `:68-74`). The caller passes the
  worker count and a `MemoryBudget` (memory spec §4.2.G). Q8 asks whether that placement is right.
- Results are combined in set order, so a parallel run is bit-identical to a serial one.

### 4.6 Incremental re-evaluation

| Change | Phase 1 | Phase 2 |
|---|---|---|
| Prose, js, chart code, `graph`, set labels | nothing recomputed | nothing |
| Member added to the set | that member only | that member only |
| Member removed / reordered / regrouped | combine only (µs) | combine only |
| One definition edited | every member, whole maths | that definition's dependents only; lap-only closures from `session.json` alone |
| One session's laps re-detected | that member | that member's lap-dependent results |
| Importer or seam version bump | members lazily, as opened | same |
| Engine build changes | every member (Q4) | depends on Q4 |

Superseded runs are cancelled at member boundaries when a newer workbook revision starts a run.

### 4.7 Members not on this device (library tiers)

Under the tiers draft every library has every session's `session.json`; only content is selective.

| Member state | What happens |
|---|---|
| Data here | computed, or served from the cache |
| Data not here, cached result here | served from the cache; the row is marked "cached (data on <library>)" |
| Data not here, no cached result, closure needs no channel | computed from `session.json` alone (lap and sector statistics) |
| Data not here, no cached result, closure needs channels | **missing**: "on <library>" with **Get** (tiers phase 2), named in every set-level reduction over it (§3.6) |
| No `session.json` either | `not_found` on that member |

For a cached result to be usable for a member whose data is absent, the device needs that member's data
identity without the footer: phase 3 adds `blob_sha256`, `importer_version` and `seam_correction_version` to
the tiers draft's `GET /idl1/v1/library` session summary, and to the catalog's content-absent rows.

### 4.8 Numbers

All estimates unless marked. Per-member CPU in a release build ≈ 1–3 s (memory spec §5's estimate) plus
decode ≈ 0.55 s (measured pyarrow proxy, §1.6), so 1.5–3.5 s for a `103bc2bf…`-sized member.

**The nine-session comparison** (15.34 M IMU0 samples, 9.05 × `103bc2bf…`):

| | Desktop, this machine (12 cores, 16 GB) | Phone (8 GB Android assumed, 2–3 × slower per core) |
|---|---|---|
| Phase 1, cold | P = 1: 9 × 1.5–3.5 s ≈ **14–32 s**; peak ≈ 1.0 GB app baseline + 0.63 GB focus cache + 1.4 GB largest member ≈ **3.0 GB** | not targeted (1.4 GB members) |
| Phase 2, cold | P = 4: ≈ **4–9 s**; peak ≈ 1.0 + 4 × 0.3–0.42 ≈ **2.2–2.7 GB** | P = 2 (B ≈ 1–1.5 GB): ≈ 15–50 s, if the data is on the phone |
| Reopen, all cached | 9 × ≈ 25 lookups, **< 0.1 s**, 0 decodes | same |
| Phone with synced results (phase 3) | — | **< 1 s**, no `data.parquet` needed |
| Compressed bytes read, cold | ≈ 520 MB (⅔ of the 604 MB IMU columns, since 12 of 18 are read, + 117 MB `t`) | same |

**A 100-session season** (assumed sized like these nine: ≈ 1.7 M IMU0 samples each):

| | Desktop | Phone |
|---|---|---|
| Cold | P = 6 (B ≈ 3 GB free): 100 × 1.5–3.5 s / 6 ≈ **25–60 s**; I/O ≈ 5.8 GB compressed, 3–6 s on NVMe but ≈ 40–60 s from a USB disk at 100–150 MB/s (a Main backup drive, tiers draft) | holds ≈ 20 sessions (60-day Field window); with synced results the other 80 still show |
| Warm | ≈ 100 × 200 lookups ≈ **< 0.5 s** | same |
| One definition edited (phase 2) | lap-only closure ≈ 100 × 1 ms; a 3-channel IMU closure ≈ 100 × 0.3 s / 6 ≈ **5 s** | proportionally slower |
| Memory | ≤ P × E_max + results (≈ 2 MB for 100 members) — independent of S | ≤ 2 × 0.42 GB |
| Cross-session values | `[ses]` 100 × 8 B; `[ses,lap]` 100 × 40 laps × 8 B = 32 KB | same |

What this rules out: a season query must never require P × S. Today's per-window design would need
S evaluations' worth of memory to compute one cross-session number, if it could compute it at all.

---

## 5. Tables, charts, inline values

### 5.1 Tables (C2 §4 amendment)

- `rowSource: "sessions"`: one row per set member, in set order; rows carry `group` so the app draws a group
  header. `rowGroup: "<group name>"` (optional) restricts rows to one group. The row id is the session id;
  `RowContext` becomes `{ sessionId }` (no lap).
- In a session row, a column `template` is a **session-level expression evaluated in that row's session**, and
  `[name]` resolves to a workbook definition first, then a stored channel: the same resolution a math cell
  uses (the overlay in `resolve.rs:174`, `:202-211`). The result must be rank 0; anything else is a cell
  error "reduce to a single number". Each template is compiled as an anonymous session-level definition, so
  it is demanded, streamed and cached like any other (§4.2, §4.3). This also closes engine gaps P1-3 for
  session rows.
- `rowSource: "groups"` (phase 2): one row per group; a template is a set-level expression restricted to that
  group's members (`median(per_session([med]), "ses")` reads that group's median).
- Authored rows and `"windowLaps"` are unchanged. A table's evaluation for a set does not depend on the
  selection.

How the nine literal tables map (Appendix A has the rewrite): the seven session-row tables become
`rowSource: "sessions"` with templates such as `[o_n_fly]`, `[best]`, `[med]`, `100 * [sd] / [med]`. The two
sector tables are transposed today (sessions as columns). In phase 1 they become session-row tables
filtered with `rowGroup`, sectors as columns (`[m0]` … `[m8]`), plus a one-row table for the "Best pass"
column. Whether to add a display-only `transpose: true` is left to the app lane; it changes no maths.

### 5.2 IPC (C3 amendments)

**New command (phase 1):**

```
eval_session_set(workbook_id: string, on_progress: Channel<SetProgress>) -> SessionSetResult      async
```

```ts
interface SessionSetResult {
  set_key: string;                                    // sha256 hex of the resolved set + maths text
  groups: { name: string }[];
  members: {
    session_id: string; label: string; group: number; start_utc_ms: number | null;
    status: "computed" | "cached" | "cached_data_elsewhere" | "missing" | "not_found" | "error";
    where?: string;                                   // library name holding the data, when missing
    error?: IpcError;                                 // status "error": decode or memory failure for this member
  }[];
  tables: { cell_id: string; model: TableModel; results: CellResult[][] }[];   // planned rows, as today
  defs: { name: string; shape: string; unit: UnitLabel; error?: IpcError }[];  // phase 2: set-level defs
}
interface SetProgress { done: number; total: number; session_id: string; phase: "cached" | "decoding" | "evaluating" }
```

- Small by construction: the comparison workbook's tables are ≈ 9 × 9 × ≤ 10 numbers ≈ 700 values ≈ 30 KB of
  JSON (estimate). Tables already cross as JSON today (`workbook.rs:1001`). No full-rate value is involved.
- Errors: command-level `not_found`/`io`/workbook structural kinds as `eval_workbook_v2`; `resource_exhausted`
  only if one member's estimate exceeds `B_max` (memory spec §4.2.G); everything per member is in `members`.
- Cancellation: a newer call for the same workbook supersedes the running one at the next member boundary.

**`IDLH` v3 for shaped values (phase 2).** Rank-0 and rank-1 `t`/`f`/`lap` payloads stay **byte-identical
version 2**, so nothing landed changes. Version 3 is emitted only for a value with a member axis or rank ≥ 2:

| Offset | Field | Version 3 |
|---|---|---|
| 0 | `magic` | `"IDLH"` |
| 4 | `version` | `3` |
| 6 | `flags` | bit 0 `has_t` = 0; **bit 1 `shaped` = 1** |
| 8 | `length` | number of `f64` in `v` = product of the axis lengths |
| 12 | `t_length` | 0 |
| 16 | `axis_kind` | `0xFFFF` = "see the axis table" |
| 18 | `rank` | `u8`; then 5 reserved zero bytes |
| 24 | axis table | `rank` × 8 B: `{ kind: u16, has_coords: u16, len: u32 }`; kinds 1 time, 2 frequency, 3 lap, 4 session, 5 group, 6 window (reserved), 7 component, 8 index |
| … | coords | for each axis with `has_coords = 1`, `len` × `f64`, in axis order (lap numbers for `lap`; none for `ses`/`group`) |
| … | `v` | `length` × `f64`, row-major (last axis contiguous); NaN marks padding |

Member labels and group names are not in the bytes; they come from `SessionSetResult.members`/`groups`.
The app decoder accepts 2 and 3. Changing the encoder regenerates `docs wire` in the same commit (CLAUDE.md §6).

**New fetch (phase 2):** `fetch_set_value(workbook_id, def_name) -> IDLH` reads a set-level value (or a
`per_session` value) from the kept set result; it never evaluates. One call per set value a js cell or span
names, not one per (definition, window).

**Additive, phase 1, not set-specific:** `CellDefResult.value` gains `scalar: number | null` for rank-0
values. That removes ≈ 195 `fetch_host_channel_v2` calls per window from §1.3's bind pass (195 of the
comparison workbook's 232 definitions are reduced values, memory spec §2.2).

### 5.3 Binding to JS (C2 §3.6.5 amendment)

A value with a member axis binds as a **long-format** column table, one column per axis plus `v`, which
Plot consumes directly:

| Shape | Binds |
|---|---|
| `[ses]` | `{ length, ses, g, v }`, `g` = the member's group index |
| `[group]` | `{ length, group, v }` |
| `[ses,lap]` | `{ length, ses, g, lap, v }`, padding rows dropped |
| `[group,lap]` | `{ length, group, lap, v }` |
| set-level `[]` | the bare number |

Non-enumerable properties, as `windows`/`unit` are today: `.members` (`{sessionId, label, group,
startUtcMs}[]`), `.groups` (`{name}[]`), `.unit`, `.unitState`.

```js
Plot.plot({
  x: { label: "Session", tickFormat: (i) => med_s.members[i].label },
  y: { label: "Median flying lap (s)" },
  color: { legend: true, tickFormat: (g) => med_s.groups[g].name },
  marks: [Plot.dot(med_s, { x: "ses", y: "v", fill: "g" })]
})
```

### 5.4 Inline `${…}` with several sessions

- A **session-level** rank-0 value keeps today's rule: the primary window's number (`definitionBind.ts:40-42`).
  C2 §5.2 states it, and the span gets a quiet "for <primary label>" marker when more than one window is
  selected, so a reader can tell.
- A **set-level** rank-0 value is one number whatever is selected. Prose that compares sessions should use
  set-level definitions (§3.5).

---

## 6. CLI parity and layers

### 6.1 CLI (C6 amendment)

- `--data-dir` on every `workbook` verb (gap N6). `--session <id>` resolves through it: lazy
  `open_session_lazy` on `data.parquet` (`parquet.rs:1756`) with laps from `session.json`, built by the same
  core function the app uses (`load_window_context_from`'s logic moves to core, §6.2). A `.idl0` path still
  works as today (`cli/src/main.rs:1407-1413`). `--track` becomes an optional lap re-detection override.
- `workbook eval <file> --data-dir D` on a workbook with `sessions:` evaluates the set and prints each
  session table as text (group headers, units), then a member status summary. `--json` prints
  `SessionSetResult`.
- `workbook eval --values` prints every rank-0 and `[lap]` value as `name  value  unit`, per member (gap N7).
- `--session` is repeatable: an ad-hoc one-group set for a workbook without `sessions:`.
- `--jobs N` (phase 2; default from the budget), `--no-cache`. Progress on stderr.
- `workbook data <table cell>` prints that table's rows (gap N7).
- Regenerate `docs cli` in the same commit (CLAUDE.md §6).

### 6.2 Layer placement (CLAUDE.md §2)

| Piece | Layer |
|---|---|
| `sessions:` parse/render/merge, set resolution, demand set, member evaluation, `per_session`, `ses`/`group` axes and reductions, set tables, combine, member keys | `rust/core` (`workbook::v3::set`, `math`, `table`) |
| Window-to-`MathLapContext` resolution for `span = session` (today `tauri/src/session_source.rs:523-550`) | moves to `rust/core` so the CLI and app share it (CLI parity) |
| Result cache file (`results.sqlite`), identity from the catalog | `rust/core` (`store`, `std::fs` + rusqlite, as `catalog.rs`) |
| Member runner (private pool, budget, cancel) | `rust/core`, beside `store::index_job` (Q8) |
| `IDLH` v3 encoder | `rust/core` (`workbook::v3::host_channel_wire`) |
| `eval_session_set`, `fetch_set_value`, progress channel, supersession, budget implementation | `rust/tauri` |
| CLI flags, text rendering | `rust/cli` |
| Set editor (Data tab "use selection as set"), session tables with group headers and status, focus-on-click, `IDLH` v3 decoder, long-format binding | `app/src` |

The set evaluator does **not** go through `SessionCache` or `EvalRegistry`: each member decodes through its own
`ChannelSource` and frees it when done. The focus session's per-window evaluation stays where it is, so set
evaluation never evicts what the user is looking at.

---

## 7. Phases

### Phase 1 — the comparison workbook computes its own tables

- **Ships:** `sessions:` front matter; `rowSource: "sessions"` and `rowGroup`; table templates that read
  definitions in the row's session; demand-restricted member evaluation (only the closure of the table
  columns; full-rate values dropped at member end); serial run (P = 1); `results.sqlite` with the phase-1
  whole-maths key and a build-commit engine identity; `eval_session_set`; `CellDefResult.value.scalar`; app
  session tables with group headers, member status and focus on click; CLI `--data-dir`, id resolution,
  `--values`, set tables (N6, N7).
- **Contract changes:** C2 §1 (`sessions`), §4 (`rowSource: "sessions"`, `rowGroup`, `RowContext.sessionId`
  without a lap, `[name]` resolution in table templates), §7.1 (merge of `sessions`); C3 §3.4
  (`eval_session_set`, `scalar`); C4 §2 and §6 (`cache/eval/`, never synced); C6 (CLI flags).
- **Depends on:** memory phase 1 (landed). Not on memory phases 2–6 (Q7).
- **Acceptance:** the comparison workbook rewritten per Appendix A shows the nine tables computed, matching
  today's literals to their printed precision, on desktop; the CLI prints the same tables.
- **Tests** (Rust inline, `thing — condition — result`):
  - core: `member evaluation — a session-row table over a workbook with full-rate definitions — only rank-0
    and [lap] results survive the member` (per-thread counting allocator, memory spec §6);
  - core: `member key — prose, js or graph edited — key unchanged`; `— a definition edited — key changes`;
    `— session.json long_comment edited — key unchanged`; `— a lap bound edited — key changes`;
  - core: `session-row table — template [med] over two synthetic sessions — each row is its own session's med`;
  - core: `session-row table — rowGroup names the second group — only its members, in set order`;
  - core: `demand — a table of lap statistics only — no channel is opened` (reader hook counter);
  - core: `result cache — reopen with every member cached — zero data.parquet opens`;
    `— a refused decode — not stored`; `— a math error — stored and served again`;
  - core: `sessions front matter — duplicate member — workbook_duplicate_set_member`;
    `— round-trip — bytes unchanged`; `merge — member added on one side, removed on the other — both apply`;
  - tauri: `eval_session_set_via — three-member fixture — members evaluate one at a time and the session cache
    holds no member's channels afterwards`; `— superseded by a newer call — stops at a member boundary`;
    `— one member's data.parquet absent — status missing, the other rows computed`;
  - cli: `workbook eval — set workbook with --data-dir — prints each session table`;
    `— --session <id> --data-dir — reads data.parquet lazily and laps from session.json`;
  - app (vitest, pure modules): session-table row model (group headers, status chips), `SessionSetResult`
    decoding.
- **Risks:** the app's peak ≈ 3.0 GB for the largest member (§4.8) leaves ≈ 1.8 GB of the ≈ 5 GB commit headroom
  measured on 2026-10-27. Cold open ≈ 14–32 s. Any definition edit recomputes every member. Session sets are
  explicit lists only.

### Phase 2 — cross-session maths and speed

- **Ships:** `ses` and `group` axes; `per_session`; `"ses"`/`"ses:group"`/`"lap"` reductions; `at` over
  `group`/`ses`; NaN-padded `[ses,lap]`; set-level definitions and `rowSource: "groups"`; per-closure keys;
  parallel members from the budget; `IDLH` v3 and `fetch_set_value`; long-format JS binding; set-level `${…}`.
- **Contract changes:** C2 §3.6.1–§3.6.6 (axes, `per_session`, shapes, binding; rank-2 limited to
  `[ses,lap]` and `[group,lap]`), `ShapeMismatch` messages for lifting `[t]`/`[f]` and for channels at set
  level; C3 §3.4 (`IDLH` v3, `fetch_set_value`, `SessionSetResult.defs`); builtin catalog regeneration
  (`docs workbook`, `--json`).
- **Depends on:** memory phases 2 (planner, liveness, demand) and 3 (admission), which the parallel runner
  needs; engine gaps P1-2 (`"t:lap"`) is independent but its `[lap]` results become per-session inputs.
- **Tests:** `per_session — [lap] values with 12 and 9 laps — [ses,lap] padded with NaN to 12`;
  `per_session — a [t] argument — ShapeMismatch naming a reduction`; `mean — "ses:group" over two groups —
  one value per group in group order`; `at — group by name — the named group's value`; `set level — a stored
  channel named — ShapeMismatch`; `runner — 4 workers and 1 worker — bit-identical results`; `runner — budget
  fits 2 of 8 — peak ≤ 2 × E_max + 10 %`; `DefKey — one definition edited — only its dependents recompute`
  (evaluation counter); `IDLH v3 — [ses,lap] — golden bytes` (`wire_golden.rs` precedent).
- **Risks:** rank-2 is the first rank ≥ 2 the engine carries; keeping it to member × lap avoids the general
  case. The planner is a prerequisite.

### Phase 3 — season scale and phones

- **Ships:** query sets (`sessions: { query: {…}, group_by: … }`), resolved from `session.json` metadata,
  which every library has under the tiers draft; optional sync of `results.sqlite` rows (memory spec Q2's
  setting; Q5 on the Field default); data identity for content-absent sessions in the library summary
  (§4.7); computing metadata-only closures on a phone; a maths-semantics engine identity if Q4 says so;
  `--jobs` CLI runs over hundreds of sessions; memory phase 4 (cache shape, projection, row-group pruning).
- **Contract changes:** C2 §1 (query form), C4 §6 (`eval` sync class, union merge), library-tiers endpoint
  fields.
- **Open before it starts:** what "day" means for `group_by` (local date needs a time zone that is the same on
  every device); multiple orthogonal groupings (§8, R-6).
- **Tests:** `query set — two devices with the same metadata — identical membership`;
  `synced results — phone without data.parquet — table rows served, status cached_data_elsewhere`;
  `season run — 50 synthetic sessions, budget fits 2 — peak ≤ 2 × E_max + 10 %, results equal to serial`.

**Out of scope for all three:** cross-session full-rate maths (ghost-lap deltas, speed-trace differences by
distance). They need two members' `[t]` values aligned on distance, at `2 × E` (memory spec §5), and a
`lap_distance()` (engine gaps N12). Overlaying windows on a chart stays the selection's job.

---

## 8. Rejected alternatives

- **R-1 Evaluate a set as N selected windows** (`eval_workbook_v2` with N windows). Results depend on clicks,
  not the file; maths cannot cross windows (R117.4); every window keeps a full evaluation and the bind pass
  re-evaluates evicted ones concurrently (§1.4). It is the wrong unit: a window is a span to look at, a member
  is a session to summarise.
- **R-2 Concatenate the sessions into one virtual session** (one long `[t]`). Breaks "time is recorded": two
  sessions' clocks are unrelated. Filters (`butter`'s `filtfilt`) and integrals would bleed across the seam.
  Memory grows with N.
- **R-3 Allow `[ses,t]`** (stack full-rate series). 9 × 1.7 M × 8 B = 122 MB per stacked value (estimate), each
  with nine different time axes, and nothing in the comparison needs it. The no-`t` rule in §3.3 is what keeps
  every set-level value small and the evaluation streamable.
- **R-4 Reuse `win` for sessions.** `win` indexes the selection: ephemeral, ordered by clicks, repeatable
  (two laps of one session are two windows, C1 §6.1). A member is persistent, unique per session and grouped.
  One axis for both would make a file's table depend on the selection (Q2).
- **R-5 Compute the cross-session numbers in JS** from per-window values. Violates "Rust = numbers"; the CLI
  could not reproduce them; and it still needs every window evaluated at once.
- **R-6 Several sets per workbook, overlapping groups, query sets in phase 1.** Each adds an identity question
  (which set does `"ses"` mean? does a session counted twice weigh twice in a day mean?) that the comparison
  does not need. The extension is `"ses:group@name"`, compatible with this design.
- **R-7 Persist full-rate per-session outputs** (`derived/*.parquet` for workbook definitions). 37 values ×
  1.7 M × 8 B ≈ 0.5 GB per session (memory spec §2.2), which costs more to store and sync than to recompute
  (memory spec §4.2.F).
- **R-8 Use `catalog.sqlite`'s `lap_summary` as the cross-session store.** Fixed min/max/mean per stored
  channel per lap; cannot hold a workbook definition; the catalog is never synced. The result cache is the
  general form; `lap_summary` can be filled from it later.
- **R-9 A SQL engine over Parquet** (DataFusion, DuckDB) for set queries. The workbook's semantics (filters,
  recorded-time alignment, lap context, NaN rules) live in our evaluator; a second engine would be a second
  semantics, a large mobile binary, and still need our evaluator for the per-session maths.
- **R-10 One cache file per result** (`cache/eval/<hash>`). ≈ 60,000 files at 300 sessions (estimate); slow
  on Android storage and in sync manifests.

---

## 9. Open questions for Isaac

### Rulings (Isaac, 2026-10-28)

These supersede the recommendations below wherever they differ.

- **Q1:** front-matter key ("probably the header").
- **Q2:** new `ses` and `group` axes; `win` stays reserved and unimplemented.
- **Q3:** **partial, flagged** (overrides the recommendation): a set-level reduction is computed over the
  members present on this device, and the result carries a warning naming each missing member with an
  offer to fetch it. Reason: a missing member may be unfetchable, or the user may mean to import a different
  session in its place.
- **Q4:** the recommendation ("whatever works"). Separately, the `idl_rs::VERSION` / importer-version hole
  (§10) is to be fixed now, ahead of this work, under its own proposal.
- **Q5:** **no** (overrides the recommendation): set results do not sync, on any device class, for now.
  Phones show "on <library>" for members they lack. Revisit later; not in any phase here.
- **Q6:** yes. Isaac: this was the original design (tables see definitions) and was lost somewhere; find
  where, and restore it.
- **Q7:** run in parallel. Memory phases 2–3 proceed as their own lane; session-set phase 1 proceeds now on
  the parts that do not depend on them (front matter, `rowSource: "sessions"`, Q6, the results cache, the
  CLI gaps N6/N7), runs members serially, and adopts memory phase 2's budget/admission API when it lands.
- **Q8:** core, like `index_job`.

Each changes the design. Recommendations are what the draft proceeds on.

**Q1 — Where does a session set live: a front-matter key or a `sessions` cell?**
*Where:* §2.2; C2 §1, §2.1, §7. *Context:* front matter is document-level config like `constants`, preserved
by older builds (R135), merged per key; it needs a new merge rule and is not drawn in the document. A fenced
` ```sessions ` cell gets cell-granular merge for free, could render as the member table the workbook already
writes by hand (its §10), and could later allow several sets; but a new cell kind touches the parser, editor,
graph view, CodeMirror mode and C2 §7.2. *Recommendation:* front matter, one set per workbook; the app shows
the set as a panel.

**Q2 — A new `ses` axis with an explicit `per_session(x)` lift, or reuse `win`?**
*Where:* §3.2–§3.4; C2 §3.6.1, §3.6.9. *Recommendation:* new `ses` and `group` axes; `win` stays reserved and
unimplemented; `per_session` is the only lift.

**Q3 — A set-level reduction with a member that cannot be computed here: unavailable, or computed over the
members that are present and flagged?**
*Where:* §3.6, §4.7. *Context:* a day mean over 3 of 4 sessions is a different number that can end up in
prose. *Recommendation:* unavailable, naming the missing members, with Get; session rows still show what is
here.

**Q4 — What identifies the engine in a persisted result's key?**
*Where:* §4.3. *Context:* `idl_rs::VERSION` is `0.1.0` and never changes, so it cannot invalidate anything (the
same hole applies to D6's derived-file hashes, which also use it). A git commit is safe but changes with every
nightly, so desktop recomputes after each update (≈ 25–60 s for 100 sessions) and a phone on another build
cannot use the desktop's synced results. A maths-semantics version is bumped only when numbers change, and is
enforced by CI (a diff under `core/src/math`, `workbook/v3`, `filters`, `statistics`, `laps` fails unless the
constant changes). *Recommendation:* commit hash in phases 1–2 (local cache only); the semantics version plus CI
gate before results sync in phase 3.

**Q5 — Should a Field device (phone) sync set results by default?**
*Where:* §4.7, phase 3. *Context:* you answered memory-spec Q2 "sync is a setting, off by default". A phone
holds about 60 days of data, so without synced results a season table on the phone is mostly "on <library>".
Results are a few KB per session. *Recommendation:* on by default for Field libraries only; off elsewhere.

**Q6 — Do table templates resolve `[name]` to definitions first, then channels?**
*Where:* §5.1; C2 §4. *Context:* today a table cell sees channels only (`table/eval.rs:154-172`); a math cell
sees earlier definitions over channels. *Recommendation:* the math-cell rule in every table, for every row
source, which also closes engine gaps P1-3.

**Q7 — Ship phase 1 on today's memory code, or after memory phases 2–3?**
*Where:* §7. *Context:* phase 1 runs serially at ≈ 3.0 GB app peak (estimate) with no admission control;
waiting gives ≈ 2.2–2.7 GB at P = 4 and the budget guarantee, but delays the comparison workbook by two
memory phases. *Recommendation:* ship phase 1 now, serial, admitting each member against the existing byte
budget; memory phases 2–3 before phase 2.

**Q8 — Does the member runner (thread pool, budget, cancellation) belong in core?**
*Where:* §4.5, §6.2. *Context:* `store::index_job` is the precedent in core; the alternative is core exposing
only `evaluate_member` and `combine`, with tauri and the CLI each owning a pool. *Recommendation:* core, like
`index_job`, so the app and CLI cannot schedule differently.

---

## 10. Incidental findings

- **Selecting nine sessions in the Notebook today is likely to exhaust memory** (§1.4). The EvalRegistry
  keeps ≤ 1 GiB (`memory.rs:80-82`) while `bf0ffd0`'s bind pass fetches every definition for every window at
  once (`index.tsx:3950-3970`). Worth a guard before anyone tries it: bind rank-0 values from
  `CellDefResult.value.scalar` (§5.2) and limit concurrent per-window fetches.
- **`idl_rs::VERSION` never changes** (§1.6, Q4), so `EvalKey` and D6's derived-file hashes do not see engine
  changes. Harmless while results live only in memory; wrong once anything persists.
- **Every key computation reads a 4.8–9.3 MB footer** (`workbook.rs:941-946`). Fine for one session; ≈ 700 MB
  for a 100-session warm query (§4.3). The catalog already holds the three fields.
- **`lap_summary` is empty in the library** (0 rows), so design §5's "season search never opens Parquet" has
  nothing behind it yet.

---

## Appendix A — the comparison workbook in phase 1

Front matter gains §2.2's `sessions:` with the nine ids from its §10 table, labels `D1 S1` … `D2 S4`. Table
`c0270001` becomes:

```table id=c0270001
{"rowSource":"sessions",
 "columns":[{"id":"c0","name":"Flying laps","template":"[n_fly]"},
            {"id":"c1","name":"Best lap s","template":"[best]"},
            {"id":"c2","name":"Median lap s","template":"[med]"},
            {"id":"c3","name":"SD s","template":"[sd]"},
            {"id":"c4","name":"Best - SOB s","template":"[o_sob_gap]"},
            {"id":"c5","name":"Lap m","template":"[lap_len]"},
            {"id":"c6","name":"Mean km/h","template":"[v_mean]"},
            {"id":"c7","name":"Top km/h","template":"[v_top]"},
            {"id":"c8","name":"Mean HR","template":"[hr_mean]"},
            {"id":"c9","name":"HR>170 %","template":"[hr_170]"}],
 "rows":[],"cells":[]}
```

`c0270003`, `-08`, `-0b`, `-0d`, `-0f` and `-10` follow the same pattern from the `o_*` definitions their
columns were copied from. `c0270006` becomes `{"rowSource":"sessions","rowGroup":"Day 1 (19 Sep)"}` with
columns `[m0]` … `[m8]`, plus a second small table with `rowSource: "sessions"` filtered to D1 S5 and
columns `[b0]` … `[b8]` for "Best pass"; `c0270007` likewise for day 2 (8 sectors). The `c00000a1`–`a4`
collector cells (`o_x = [x]`) become unnecessary for the tables and can stay for the CLI's `--values`.
Phase 2 then replaces the hand-subtracted prose numbers with §3.5's definitions.
