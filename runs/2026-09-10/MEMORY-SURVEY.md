# Memory survey — session sample pipeline (read-only, 2026-09-10)

## 1. Import (`import_idl0`/`import_file`)

- Whole-file read, no streaming: `std::fs::read(path)` at
  `rust/tauri/src/commands/import.rs:130` (also `inbox.rs:220`,
  `rust/cli/src/main.rs:1071`) — one `Vec<u8>` sized to the `.idl0` file.
- `import_idl0` (`rust/core/src/store/import.rs:252`) parses first into a
  `Session` of compact `RawColumn`s (`rust/core/src/session/column.rs:21` —
  `I16`/`I32`/`F32` typed, not f64; `materialize` at `column.rs:63` is not
  called here), **then** `blob::write_blob(data_root, bytes)`
  (`import.rs:259`) writes the same raw bytes to the CAS. Raw bytes and the
  parsed compact `Session` are resident **simultaneously** for most of
  import — two copies, comparable size.
- `write_session_parquet_replacing` (`rust/core/src/store/parquet.rs:259`)
  builds an Arrow `RecordBatch` holding **every channel's array at once**
  (`parquet.rs:315-336`), clones the shared `t` axis again into an
  `Int64Array` (`parquet.rs:269`, `Int64Array::from(t.clone())`), then
  serializes the batch into one `buf: Vec<u8>` (`parquet.rs:361-367`) — a
  3rd full-session-sized structure alongside the still-live raw bytes and
  `Session`.
- **Peak resident copies of one channel at import: ~3** (raw bytes → parsed
  `RawColumn` → Arrow array), all channels at once, plus the compressed
  `buf`. **Largest single allocation: the raw-bytes `Vec<u8>`** (≈ file
  size); 3 such allocations concurrent, not amortized per-channel — scales
  linearly with session length.

## 2. Open/read

- `session_source.rs:33` `load_session` calls `read_session_parquet` —
  decodes the **entire `data.parquet` (every channel)** every call. Known
  deferral, flagged in code: `session_source.rs:25-26`,
  `commands/cursor.rs:80-83` ("every call re-reads the whole `data.parquet`
  ... a session/tier cache is design §4's recorded deferral").
- `rust/tauri/src/state.rs` has **no session cache** (no `SessionHandle`/
  `read_session_parquet` in managed state). `fetch_tile`
  (`commands/tiles.rs:32-61`) calls `load_session` (whole file), finds one
  channel, `ch.materialize()`s it, encodes one tile, **discards the other
  N‑1 channels' decoded data**. `cursor_readout_via` (`commands/
  cursor.rs:39-71`) does the same whole-file load per call; `rasters.rs`/
  `workbook.rs` route through the same `load_session`/`load_session_handle`.
- Not unbounded growth (each call's `Session` drops on return) but wasteful
  and repeated: every hover/tile/cursor call re-materializes the whole
  parquet file, spiking a full-file-sized allocation dozens of times a
  minute while panning a 400 MB session.
- **Peak copies at open (one request): 1 full decoded `Session`** (all
  channels) + 1 materialized f64 vec for the requested channel.

## 3. IPC

- `fetch_tile` returns via `tauri::ipc::Response::new(bytes)`
  (`tiles.rs:69-78`) — one small tile buffer, no extra clone beyond §2's
  materialize. `cursor_readout_via` materializes only requested channels
  (`cursor.rs:64`). No stage clones a full-session `Vec` for the IPC
  boundary itself — the waste is upstream.

## 4. App side (`app/src/routes/pages/Notebook`)

- Tile cache (`model/tileCache.ts:16-20,48-110`) is a byte-tracked LRU
  (30 MB default cap), evicts on insert — bounded, fine.
- `combinedChannelDataRef` (`index.tsx:461`, `Map<string,
  CombinedChannelPayload>` keyed `${cellId}::${channelId}`) holds
  **full-resolution `Float64Array` t/v/w** per bound window
  (`model/channelBindDriver.ts:196-202`). Only `.set()` calls exist
  (`index.tsx:1852`, `:2546`) — no `.delete()` anywhere in this file,
  unlike sibling refs (`boundIdentityRef`, `cellRunSequencerRef`,
  `retainedSpectraRef`) cleaned up on cell removal (`index.tsx:1704-1713`,
  `:1936-1939`). Unbounded, only grows across a session's lifetime.

## Duplicates / unbounded retention found

| tag | issue | fix |
|---|---|---|
| core | import holds raw bytes + `Session` + Arrow batch + parquet `buf` concurrently (`import.rs:252-262`, `parquet.rs:259-367`) | drop `bytes` after `write_blob`, before building the Arrow batch |
| core | `t.clone()` into `Int64Array` (`parquet.rs:269`) duplicates the time axis | `Int64Array::from(t)`, consuming |
| tauri | every IPC call fully decodes `data.parquet` (`session_source.rs:33-41`) | add the session/tier cache the code's own TODOs already name |
| app | `combinedChannelDataRef` never evicts (`index.tsx:461,1852,2546`) | delete `${cellId}::${channelId}` on unbind/cell-delete, like `retainedSpectraRef` |

## Failsafe
Stat the `.idl0` size (`std::fs::metadata`) before `std::fs::read` in
`rust/tauri/src/commands/import.rs` (before line 130); compare to a
conservative fraction of available memory (~3 concurrent session-sized
copies at import — e.g. refuse above `free_ram / 6`); return a typed
`IpcError` instead of letting `fs::read`/the Arrow batch OOM. Same check
belongs in `load_session`, sized against `data.parquet`'s metadata.

## Debug profile
`rust/Cargo.toml:18-22` forces `opt-level = 3` for `idl-rs`/deps in dev;
only `debug = "line-tables-only"` differs from release — not the OOM cause,
speed only.
