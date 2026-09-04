# L3 contract-deltas proposal — C2/C3 amendment batch (lead ruling R21)

Read-only source: `runs/2026-09-03/decisions.md` (R20, "Tracked: L3 Task 1
landed", R21), `lanes/l3-workbook/pre-read-tasks2-5.md` (L3-R4),
`lanes/l3-workbook/pre-read-tasks6-9.md` (L3-R19, L3-R23, L3-R26 a–c).
Produced for the lead to apply with `Edit`; this lane does not touch the
contracts themselves. No `questions.md` is named for this dispatch, so —
per the precedent `pre-read-tasks6-9.md` itself sets ("questions and
lead-owned rulings are raised in this file") — the two open items surfaced
while drafting these deltas are appended inline at the bottom of this file,
in the standard question-block template, rather than in a separate file.

Every `Target` block below quotes the exact current file text (verbatim,
including backticks) so it can be matched by an `Edit` call. Blocks that
contain a nested ```` ```ts ```` fence are wrapped in five backticks here so
the nested triple-backtick fence doesn't terminate early.

---

## Amendment A — C2 §3.5.A: three new structural kinds

**Target** (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
the two rows immediately before "**B. Evaluation-time**"):

```text
| `MissingFrontMatterId` | Front matter lacks a well-formed UUIDv4 `id` | `"Workbook front matter is missing a valid 'id'"` |
| `UnsupportedWorkbookVersion` | `version` ≠ `3` | `"Workbook version <n> is not supported (expected 3)"` |
```

**Delta:**

```text
| `InvalidFrontMatter` | *Added post-sign (2026-09-04, lead ruling R21)* — the front-matter YAML block itself fails to parse (a scanning/mapping error before any key, including `id`, can be read) | `"Workbook front matter is not valid YAML: <parser error>"` |
| `MissingFrontMatterId` | Front matter **parses as valid YAML** but lacks a well-formed UUIDv4 `id` (key absent, empty, or not a UUIDv4) — *narrowed post-sign (2026-09-04, lead ruling R21): a front-matter block that isn't valid YAML at all is `InvalidFrontMatter` above, not this kind. Withdraws Task 1's interim collapse of both failure modes into this one kind (`runs/2026-09-03/decisions.md`, "Tracked: L3 Task 1 landed")* | `"Workbook front matter is missing a valid 'id'"` |
| `UnsupportedWorkbookVersion` | `version` ≠ `3` | `"Workbook version <n> is not supported (expected 3)"` |
| `InvalidCellId` | *Added post-sign (2026-09-04, lead ruling R21)* — a fence's `id=` attribute is present but its value does not match `hex8` (§2.2, `/[0-9a-f]{8}/`: exactly 8 lowercase hex characters). Withdraws Task 1's interim behaviour of silently treating a malformed `id=` as absent and generating a fresh replacement id (`runs/2026-09-03/decisions.md`, "Tracked: L3 Task 1 landed") — a typo'd id can no longer be lost silently on save | `"Cell id '<id>' is not a valid identifier — must be 8 lowercase hex characters"` (`<id>` is the fence's literal, malformed `id=` value) |
| `InvalidTableJson` | *Added post-sign (2026-09-04, lead ruling R21)* — a `table` cell's fence body does not deserialize as `TableModel` (§4) | `"Table cell JSON is malformed: <serde_json error text>"` |
```

**Why:** Closes the two gaps Task 1's implementer flagged as provisional
(`runs/2026-09-03/decisions.md`, "Tracked: L3 Task 1 landed": no kind for
unparseable front-matter YAML, no kind for a malformed fence `id=`) and the
gap L3-R19 flagged for `table` cells (`pre-read-tasks6-9.md` G7.1–G7.3: a
plan draft tried to smuggle the error through `message` because no real
`WorkbookErrorKind` variant existed for malformed table JSON).

---

## Amendment B — C3 §2: `workbook_*` kind-vocabulary rows

**Target** (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
the last `import_*` row immediately followed by the first `math_*` row):

```text
| `import_not_utf8` | `ImporterError::NotUtf8` | Import: `import_file` (`.gpx`/`.csv` source, bytes aren't valid UTF-8 — never raised for `.fit`, which is binary) |
| `math_parse` | `MathEvalErrorKind::Parse` | Workbook: `eval_workbook` — surfaced **per cell** in `CellOutput.error`, not as the command's own rejection (CLAUDE.md §5: "missing math channel reference → inline validation error, don't block other channels") |
```

**Delta:**

```text
| `import_not_utf8` | `ImporterError::NotUtf8` | Import: `import_file` (`.gpx`/`.csv` source, bytes aren't valid UTF-8 — never raised for `.fit`, which is binary) |
| `workbook_missing_front_matter_id` | `WorkbookErrorKind::MissingFrontMatterId` | Workbook: `open_workbook`, `eval_workbook` (fatal — no `WorkbookDoc` is constructable without a valid `id`, C2 §3.5.A) |
| `workbook_unsupported_version` | `WorkbookErrorKind::UnsupportedWorkbookVersion` | Workbook: `open_workbook`, `eval_workbook` (fatal — explicit `version` ≠ `3`, C2 §1) |
| `workbook_invalid_front_matter` | `WorkbookErrorKind::InvalidFrontMatter` | Workbook: `open_workbook`, `eval_workbook` (fatal — the front-matter block is not valid YAML, C2 §3.5.A) |
| `workbook_invalid_cell_id` | `WorkbookErrorKind::InvalidCellId` | Workbook: `open_workbook`, `eval_workbook` (fatal — a fence's `id=` value doesn't match `hex8`, C2 §2.2/§3.5.A) |
| `workbook_invalid_table_json` | `WorkbookErrorKind::InvalidTableJson` | Workbook: `eval_workbook` — surfaced **per cell** in `CellOutput.error`, not as the command's own rejection (same per-cell rule as `math_*` above, C2 §3.5.A) |
| `math_parse` | `MathEvalErrorKind::Parse` | Workbook: `eval_workbook` — surfaced **per cell** in `CellOutput.error`, not as the command's own rejection (CLAUDE.md §5: "missing math channel reference → inline validation error, don't block other channels") |
```

Immediately below the table, after the existing `VideoErrorKind` exclusion
paragraph and before the `---` that opens "## 3. Commands", add:

```text
**Added post-sign (2026-09-04, lead ruling R21, wave-1 L3).** The five
`workbook_*` rows above are new: `WorkbookErrorKind`
(`rust/core/src/workbook/v3/error.rs`, C2 §3.5.A) is workbook v3's
parse-time/structural error enum, prefixed `workbook_*` per this section's
own naming rule — matching the `open_workbook`/`eval_workbook` command
names, distinct from `math_*` (`MathEvalErrorKind`, evaluation-time,
unchanged). Only these five of C2 §3.5.A's ten structural kinds get a row
here: `MissingFrontMatterId`, `UnsupportedWorkbookVersion`,
`InvalidFrontMatter` and `InvalidCellId` are document-fatal (no
`WorkbookDoc` at all); `InvalidTableJson` is per-cell but new this batch.
The other five (`DuplicateCellId`, `DuplicateDefinition`,
`DuplicateConstant`, `InvalidIdentifier`, `ReservedName`) were signed with
C2 at wave-1 (R7, "Approved as drafted") with no IPC vocabulary change
requested, and this batch does not revisit that call — see the open
question below on how (or whether) they still need an `IpcErrorKind`
variant to appear inside a per-cell `CellOutput.error`.
```

**Why:** Closes G2.4 (`pre-read-tasks2-5.md`): L5's `open_workbook`/
`eval_workbook` wrapper has no kind for the two errors Task 1 makes fatal,
and — after Amendment A — none of the three new C2 §3.5.A kinds exist in
C3's vocabulary either.

---

## Amendment C — C3 §3.4: prose/table/defs/error corrections

**Target** (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
`open_workbook` through the end of the `eval_workbook` block, verbatim):

`````text
**`open_workbook(id_or_path: string)`**
Return:
```ts
interface WorkbookHandle {
  id: string;
  name: string;
  path: string;
  cell_count: number;   // u32
}
```
Errors: `not_found`, `io`, `internal`.

**`eval_workbook(id: string)`**
Return: `CellOutput[]`, one entry per cell, in document order.
```ts
interface CellOutput {
  cell_id: string;                          // C2 fence-string id
  kind: "math" | "table" | "js" | "prose";
  value: unknown | null;                    // present when evaluation succeeded; shape depends on `kind`
  error: IpcError | null;                    // present when this cell failed; other cells still evaluate
}
```
A per-cell failure (`math_*` kinds) never rejects the command — it appears
in that cell's `error` field. The command itself only rejects for a
condition that makes *no* cell evaluable: an unknown workbook id, or an I/O
failure reading the file.
Errors (command-level): `not_found`, `io`, `internal`.
`````

**Delta:**

`````text
**`open_workbook(id_or_path: string)`**
Return:
```ts
interface WorkbookHandle {
  id: string;
  name: string;
  path: string;
  cell_count: number;   // u32
}
```
Errors: `not_found`, `io`, `internal`, `workbook_missing_front_matter_id`,
`workbook_unsupported_version`, `workbook_invalid_front_matter`,
`workbook_invalid_cell_id` — *added post-sign (2026-09-04, lead ruling
R21)*: opening a document whose front matter or cell ids are malformed
enough that no `WorkbookDoc` can be built now rejects with the specific
`workbook_*` kind (§2) instead of failing some other, less informative way.

**`eval_workbook(id: string)`**
Return: `CellOutput[]`, one entry per cell, in document order.
```ts
interface CellOutput {
  cell_id: string;                          // C2 fence-string id
  kind: "math" | "table" | "js";             // "prose" removed — added post-sign (2026-09-04, lead ruling R21): prose has no fence id (C2 §2.1) and never gets its own CellOutput entry; it travels as prose_before/prose_after (C2 §2.4) on the fenced cell it's attached to
  value: unknown | null;                     // present when evaluation succeeded; shape depends on `kind` — see the `table` note below
  defs: CellDefResult[];                     // added post-sign (2026-09-04, lead ruling R21) — math cells only: one entry per definition (C2 §5.1's "one JS host variable per math definition"), in def_line source order; empty for table/js cells
  error: IpcError | null;                    // present when this cell failed; other cells still evaluate. `kind` may now be a structural (`workbook_*`) or an evaluation (`math_*`) kind — see §2
}

// Added post-sign (2026-09-04, lead ruling R21).
interface CellDefResult {
  name: string;
  label: string | null;
  value: HostChannel | null;   // PROVISIONAL — see open question 2 below (heavy-array-over-JSON tension with CLAUDE.md §2)
  error: IpcError | null;      // math_* kind only — a structural problem on this definition (e.g. ReservedName) keeps it out of `defs` entirely and is reported, if anywhere, on the cell's own `error` above (see open question 1 below)
}
```
A `table` cell's `value` on success is
`{ model: TableModel, results: CellResult[][] }` (added post-sign,
2026-09-04, lead ruling R21) — `model` is the parsed `TableModel` (§4) and
`results` is `idl_rs::table::eval::evaluate_table`'s `Vec<Vec<CellResult>>`
grid verbatim (`CellResult = { value: number | null, error: string | null
}`), indexed `results[r][c]` exactly as C2 §4's `cells[r][c]`. This closes
the gap where a successful table cell and a silently-skipped one
serialized identically (`value: null` either way).

A per-cell failure (`math_*` or `workbook_*` kind) never rejects the
command — it appears in that cell's `error` field, or in a specific
definition's own `defs[i].error` for a per-definition evaluation problem.
The command itself only rejects for a condition that makes *no* cell
evaluable: an unknown workbook id, an I/O failure reading the file, or —
added post-sign — a document-fatal structural problem (`workbook_missing_
front_matter_id`, `workbook_unsupported_version`, `workbook_invalid_front_
matter`, `workbook_invalid_cell_id`, §2) that means no `WorkbookDoc` exists
to produce any `CellOutput` at all.
Errors (command-level): `not_found`, `io`, `internal`,
`workbook_missing_front_matter_id`, `workbook_unsupported_version`,
`workbook_invalid_front_matter`, `workbook_invalid_cell_id`.
`````

**Why:** (a) closes G9.2 (`pre-read-tasks6-9.md`) — C3 carried a `"prose"`
kind neither C2 nor landed `CellKindToken` (`v3/cell.rs`) ever produced;
(b) closes G9.4 — a successful table cell and a skipped one were
indistinguishable; (c) closes G9.1 — structural errors had no delivery
path into `CellOutput` at all; (d) closes G9.3 and mirrors L3-R25's Rust
shape (`CellDefResult`/`CellEvalResult`) so per-definition addressing
(C2 §5.1) has somewhere to live while `CellOutput` stays one entry per
cell, matching this section's own literal "one entry per cell, in document
order."

---

## Amendment D — C3: host-channel byte path (open item, owner L5)

**Target** (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
insert as a new paragraph immediately before `### 3.5 Tiles (L3)`, i.e.
directly after the `watch_workbook` block's closing line):

```text
Errors (on the initial `Promise` only): `not_found`, `io`, `internal`.

### 3.5 Tiles (L3)
```

**Delta:**

```text
Errors (on the initial `Promise` only): `not_found`, `io`, `internal`.

**Host-channel byte path — open item, owner L5 (added post-sign,
2026-09-04, lead ruling R21).** `CellDefResult.value` above and C2 §5.1's
per-definition JS host variables both carry a `HostChannel`
(`{length, t, v}`, `idl_rs::workbook::v3::to_host_channel`, L3): **full,
undecimated** arrays — `t` is `t_us[i] as f64 / 1e6` over the source's
recorded axis, and is **empty** when the source has no recorded axis (a
scalar or table-column result, C1's "time is recorded, not assumed").
Decimating a `HostChannel` to the current tile budget before it reaches
the sandboxed iframe is the **host's** job (L5/L6, design §6) — it is not
something `to_host_channel` does, and it is **not** represented in
`CellOutput`'s JSON: `HostChannel`'s `t`/`v` arrays are exactly the heavy,
per-sample data CLAUDE.md §2 requires to cross IPC as raw bytes, never
JSON, so `CellDefResult.value`'s actual wire representation cannot be the
full `{length, t, v}` object serialized as JSON numbers (see open question
2 below). **This contract does not specify that byte layout.** It is
assigned to L5's workbook-command task to design, following the
`tauri::ipc::Response` pattern §3.5/§3.6 already establish for
tiles/rasters (magic/version header, little-endian, self-describing
lengths) — a new contract revision (§5) when L5 writes it, not invented
here.

### 3.5 Tiles (L3)
```

**Why:** Closes G8.7 (`pre-read-tasks6-9.md`): nothing in C3 said how a
host channel's bytes cross IPC, and L3-R23 explicitly flagged this
lead-owned rather than have L3 invent the layout unilaterally.

---

## Open questions

### Q1 — Do the five wave-1-signed structural kinds need an `IpcErrorKind` variant at all, given `CellOutput.error: IpcError`?
- **Where:** C3 §2 (Amendment B's note) / C3 §3.4 (Amendment C's `error`/`defs[i].error` fields)
- **Context:** `IpcError.kind` is typed `IpcErrorKind`, a closed `#[serde(rename_all = "snake_case")]` Rust enum (C3 §2) — every value it ever holds must be a variant. `CellOutput.error: IpcError | null` is that same type. L3-R4 (approved R20) says `DuplicateCellId`/`DuplicateDefinition`/`DuplicateConstant`/`InvalidIdentifier`/`ReservedName` "ride inside per-cell error lists and need no command-level kind" — but if they can ever populate `CellOutput.error.kind`, they need *some* enum representation, closed-enum or not. This batch does not say which: either `IpcErrorKind` quietly gains five more variants that just never appear in §2's "command rejection" table, or `CellOutput.error`'s `kind` is populated from `WorkbookErrorKind`'s own snake_case spelling through a path that isn't literally the shared `IpcErrorKind` enum. Also unresolved: `CellOutput.error` is singular, but L3-R25's core shape is `CellEvalResult.errors: Vec<CellError>` (plural) — if a math cell has two independent structural problems on two different `def_line`s, singular `error` can only report one.
- **Blast radius:** structural
- **Recommended answer:** Keep `CellOutput.error` singular as drafted above (least churn against the already-signed C3 §3.4 text); when a cell has more than one structural problem, `error` reports the first in document/def_line order (cheap, reversible tiebreak — no shipped consumer yet). Give `IpcErrorKind` matching variants for all five (`workbook_duplicate_cell_id`, `workbook_duplicate_definition`, `workbook_duplicate_constant`, `workbook_invalid_identifier`, `workbook_reserved_name`) so `CellOutput.error.kind` is always a real, serializable `IpcErrorKind` value — but leave them out of §2's "Raised by (command group)" table, since (per L3-R4/R7) no *command* ever rejects with them, only `eval_workbook`'s per-cell `CellOutput.error` ever does, and that's already covered by `eval_workbook`'s "per cell" note.
- **Proceeded on:** Wrote Amendment C's `error`/`defs[i].error` fields exactly as the brief specified (singular `error`, `defs[i].error: MathEvalError`-only) without resolving this; Amendment B's note names the gap explicitly rather than asserting a mechanism.
- **Affected outputs:** This file's Amendment B closing paragraph and Amendment C's `CellOutput`/`CellDefResult` interfaces — mark **PROVISIONAL** pending this answer.
- **Your answer:** ______________________________________________

### Q2 — What does `CellDefResult.value` actually serialize as, given `HostChannel`'s arrays can't cross IPC as JSON?
- **Where:** C3 §3.4 (Amendment C, `CellDefResult.value`) / C3 host-channel byte path note (Amendment D)
- **Context:** L3-R25's Rust shape (`pre-read-tasks6-9.md`) types `CellDefResult.value: Option<HostChannel>`, and the brief for this batch asked `CellOutput`'s `defs` to mirror that shape verbatim. But `HostChannel.t`/`.v` are full per-sample `f64` arrays — exactly the heavy-array case CLAUDE.md §2 forbids crossing IPC as JSON — and Amendment D (per this batch's own brief) says decimation/byte-transfer for host channels is undesigned, assigned to L5. If `eval_workbook`'s actual JSON response embeds `HostChannel`'s arrays verbatim under `defs[i].value`, every workbook evaluation ships full sample arrays as JSON numbers, the exact thing §1's transport rule exists to prevent.
- **Blast radius:** structural
- **Recommended answer:** `CellDefResult.value` in the **IPC/JSON** `CellOutput` shape is not the full `HostChannel` — narrow it to a light success marker (e.g. `{ length: number, has_t: boolean }`, or a `HostChannelRef`/handle L5 defines), and have the actual sample bytes fetched by whichever binary command L5 designs per Amendment D (plausibly keyed by `cell_id` + definition `name`, analogous to `fetch_tile`). The **core** Rust `eval_cells`/`CellDefResult` (L3-R25, not itself IPC-facing) keeps the full `HostChannel` — narrowing to the wire shape is `idl-rs-tauri`'s (L5's) job, the same layering CLAUDE.md §2 already states ("Rust = numbers... heavy arrays cross IPC as raw bytes").
- **Proceeded on:** Wrote Amendment C's `CellDefResult.value: HostChannel | null` literally, per the instruction to mirror L3-R25's Rust shape, and marked it PROVISIONAL rather than substituting the narrower shape myself (narrowing it would itself be a structural call this lane isn't positioned to make unilaterally).
- **Affected outputs:** This file's Amendment C `CellDefResult` interface — mark **PROVISIONAL** pending this answer.
- **Your answer:** ______________________________________________

---

DELTAS COMPLETE: 4 amendments
