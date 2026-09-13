# idl-rs command reference

Generated from the one command table (`idl_rs::commands::table`, ruling R230).
Do not edit by hand: run `idl-rs docs cli --out <file>`.

## Grammar

```
idl-rs <noun> <verb> [args] [--flags]
```

**Nouns.** `session`, `workbook`, `track`, `catalog`, `library`, `device`, `docs`

**Verbs.** `list`, `show`, `new`, `check`, `eval`, `set`, `import`, `export`, `scan`, `fold-in`, `index`, `rebuild`, `verify`, `delete`

Verbs added by a later ruling: `set-start` (R229), `set-meta` (R229), `cells` (R229), `data` (R229), `detect` (R229), `laps` (R229), `stale` (R197), `workbook` (R222), `cli` (R230 item 2), `wire` (R236).

## Uniform behaviour

- `--json` on every command. The payload carries `schema_version: 1`, and a failure becomes a typed JSON error on stderr.
- `--data-dir` on every command that works against a data directory, falling back to `IDL1_DATA_DIR`.
- `--dry-run` on every writer.
- Exit `0` on success, `1` on a failed operation, `2` on a usage error.

## `session`

### `idl-rs session list`

List catalogued sessions, most recent first.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--venue` | text | Only sessions whose venue matches, case-insensitively |
| `--track` | text | Only sessions that visited this track id |
| `--since` | integer | Only sessions starting at or after this Unix epoch millisecond |
| `--until` | integer | Only sessions starting at or before this Unix epoch millisecond |
| `--tag` | text | Only sessions carrying this tag, case-insensitively |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::catalog_read::list_sessions + commands::session_ops::filter_sessions`; `--json` emits `SessionSummary[]`.

### `idl-rs session show <id>`

Print one session's metadata, channels and laps.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | text | yes | Session id, as `session list` prints it |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::catalog_read::get_session`; `--json` emits `SessionDetail`.

### `idl-rs session laps <id>`

Print one session's indexed laps.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | text | yes | Session id, as `session list` prints it |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::catalog_read::list_laps`; `--json` emits `LapSummary[]`.

### `idl-rs session set-start <id> <utc-ms>`

Set a session's recording start time by hand.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | text | yes | Session id, as `session list` prints it |
| `utc-ms` | integer | yes | Recording start, Unix epoch milliseconds; must be greater than zero |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::session_json::set_session_start`; `--json` emits `SessionJson`.

### `idl-rs session set-meta <id>`

Set a session's descriptive metadata; omitted fields are left alone.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | text | yes | Session id, as `session list` prints it |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--venue` | text | Venue name |
| `--rider` | text | Rider name |
| `--bike` | text | Bike name |
| `--event` | text | Event name |
| `--event-session` | text | Event session, e.g. `Qualifying 2` |
| `--notes` | text | Long comment |
| `--tag` | text | Tag |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `commands::session_ops::apply_session_meta`; `--json` emits `SessionJson`.

### `idl-rs session import <file>`

Import one log file into the data directory.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Log file to import (`.idl0`, `.fit`, `.gpx`, `.csv`) |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::import::import_file_path`; `--json` emits `ImportReport`.

## `workbook`

### `idl-rs workbook new <file>`

Create a new workbook from a built-in skeleton.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Workbook file to create; refuses to overwrite an existing one |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--template` | `blank`, `session` | Skeleton to write: `blank` is front matter only, `session` adds a math and a table cell (default `blank`) |
| `--session` | text | Session id to reference from the `session` template |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `commands::workbook_ops::new_workbook`; `--json` emits `WorkbookNewReport`.

### `idl-rs workbook check <file>`

Parse a workbook and report every structural problem.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Path to an `.idl0wb` workbook |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--session` | path | Session to evaluate against: an `.idl0` file, or a session id inside --data-dir |
| `--track` | path | `.idl0t` track artifact, required only when a cell is lap-bound |
| `--main-lap` | integer | 1-based lap number that lap-scoped expressions mean; needs --track |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `workbook::v3::parse_workbook`; `--json` emits `WorkbookCheckReport`.

### `idl-rs workbook cells <file>`

List a workbook's cells in document order.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Path to an `.idl0wb` workbook |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `workbook::v3::parse_workbook`; `--json` emits `WorkbookCellSummary[]`.

### `idl-rs workbook eval <file>`

Evaluate a workbook's math and table cells against a session.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Path to an `.idl0wb` workbook |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--session` | path | Session to evaluate against: an `.idl0` file, or a session id inside --data-dir |
| `--track` | path | `.idl0t` track artifact, required only when a cell is lap-bound |
| `--main-lap` | integer | 1-based lap number that lap-scoped expressions mean; needs --track |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `workbook::v3::eval_cells`; `--json` emits `WorkbookEvalReport`.

### `idl-rs workbook data <file> <cell>`

Print one cell's evaluated series or table.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Path to an `.idl0wb` workbook |
| `cell` | text | yes | Cell id, as `workbook cells` prints it |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--session` | path | Session to evaluate against: an `.idl0` file, or a session id inside --data-dir |
| `--track` | path | `.idl0t` track artifact, required only when a cell is lap-bound |
| `--main-lap` | integer | 1-based lap number that lap-scoped expressions mean; needs --track |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `workbook::v3::eval_cells`; `--json` emits `WorkbookCellData`.

### `idl-rs workbook export <file>`

Write a workbook out as Markdown or as evaluated JSON.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `file` | path | yes | Path to an `.idl0wb` workbook |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--out` | path | File to write; stdout when omitted |
| `--format` | `md`, `json` | `md` re-renders the workbook source, `json` writes its evaluated cells (default `md`) |
| `--session` | path | Session to evaluate against: an `.idl0` file, or a session id inside --data-dir |
| `--track` | path | `.idl0t` track artifact, required only when a cell is lap-bound |
| `--main-lap` | integer | 1-based lap number that lap-scoped expressions mean; needs --track |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `workbook::v3::render_workbook`; writes an artifact rather than a payload.

## `track`

### `idl-rs track list`

List the tracks in the library.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::catalog_read::list_tracks`; `--json` emits `TrackSummary[]`.

### `idl-rs track detect <id>`

Re-detect track visits and laps for one session.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | text | yes | Session id, as `session list` prints it |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::lap_index::index_session_laps`; `--json` emits `LapIndexReport`.

## `catalog`

### `idl-rs catalog verify`

Run contract C4 §7's checks against the data directory.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::verify::verify`; `--json` emits `Finding[]`.

### `idl-rs catalog rebuild`

Rebuild the catalog index from the canonical files.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::catalog::rebuild_catalog`; `--json` emits `RebuildReport`.

## `library`

### `idl-rs library fold-in <folder>`

Import every importable file in a folder.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `folder` | path | yes | Folder to fold into the library |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--move` | switch | Delete each source file once its blob has verified in the store |
| `--recursive` | switch | Descend into sub-directories |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::import::import_file_path (per file)`; `--json` emits `FoldInReport`.

### `idl-rs library scan <folder>`

Preview what folding a folder in would import.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `folder` | path | yes | Folder to scan |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--recursive` | switch | Descend into sub-directories |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::scan::scan_folder_with_blob_check`; `--json` emits `ScanReport`.

### `idl-rs library stale`

List sessions whose data.parquet predates this importer version.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::catalog_read::list_stale_sessions`; `--json` emits `StaleSession[]`.

### `idl-rs library index [sessions]`

Detect track visits and laps for sessions whose index is missing or stale.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sessions` | text | no | Session ids to index; with none, every session whose index is stale |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--all` | switch | Consider every session, not only the stale ones |
| `--force` | switch | Recompute even where the stamps are already current |
| `--workers` | integer | Pool width; defaults to physical cores minus one |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::index_job::run_index_job`; `--json` emits `IndexJobReport`.

### `idl-rs library rebuild [sessions]`

Re-import listed sessions from their own blobs.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sessions` | text | no | Session ids to rebuild; mutually exclusive with --all |

| Flag | Value | Meaning |
| --- | --- | --- |
| `--all` | switch | Rebuild every session `library stale` lists |
| `--data-dir` | path | Data directory root (contract C4 §1's <data>); defaults to $IDL1_DATA_DIR |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `store::import::reimport_session`; `--json` emits `RebuildSessionsReport`.

## `docs`

### `idl-rs docs workbook`

Regenerate the workbook reference from the engine's own catalogs.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--out` | path | File to write; overwritten wholesale |
| `--src` | path | Directory of curated Markdown sections |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `docs::render_workbook_reference`; writes an artifact rather than a payload.

### `idl-rs docs cli`

Emit this command table as Markdown, or as JSON with --json.

| Flag | Value | Meaning |
| --- | --- | --- |
| `--out` | path | File to write; stdout when omitted |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `commands::markdown::render_command_reference`; `--json` emits `CommandTable`.

### `idl-rs docs wire`

Regenerate the cross-language wire golden fixtures (ruling R236).

| Flag | Value | Meaning |
| --- | --- | --- |
| `--out` | path | Directory to write the golden `<format>-v<n>.bin`/`.json` pairs into |
| `--dry-run` | switch | Report what would change and write nothing |
| `--json` | switch | Emit the result as JSON on stdout (schema_version 1); errors become typed JSON on stderr |

Calls `wire_golden::build_wire_fixtures`; writes an artifact rather than a payload.

