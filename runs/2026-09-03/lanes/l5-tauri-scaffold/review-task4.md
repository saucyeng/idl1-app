# Review — Task 4: `app/src/ipc/tiles.ts` and `rasters.ts` (real C3 §3.5/§3.6 binary decoders)

**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`, branch `wave1-l5-tauri`, commit `c125576` (on `ea6fa58`), app-repo only, no rust submodule changes (confirmed via `git diff ea6fa58 c125576 --stat`).

## Commands run and results

- `cd app && npm test` →
  ```
  Test Files  3 passed (3)
       Tests  6 passed (6)
  ```
  Files: `src/smoke.test.ts` (pre-existing, 1 test), `src/ipc/tiles.test.ts` (3 tests), `src/ipc/rasters.test.ts` (2 tests). Matches the claimed "3 files/6 tests passing." Reproduced.
- `cd app && npx tsc --noEmit` → no output, exit clean. Reproduced.

## Spec compliance (C3 §3.5 tiles, §3.6 rasters)

Verified field-by-field against the spec tables and both worked examples:

- Tile header (32 bytes): `magic` @0 (`"IDLT"`), `version` @4 u16 (decoded but not asserted/switched-on — see Minor below), `tier` @6 u16, `tile_index` @8 u32, `sample_count` @12 u32, `column_count` @16 u32, `flags`/`reserved` @20/24 unused. All reads little-endian (`true` passed to every `DataView.get*`). Matches spec table exactly.
- Sample region: offset 32, `sampleCount*8`, pair `i`: min @`32+i*8`, max @`+4`. Matches spec formula.
- Column region: offset `32+sampleCount*8`, `columnCount*12`, column `j`: min/max/mean @ `+0/+4/+8`. Matches spec formula.
- Worked example (tier 3, 512 samples, 256 columns) reproduced exactly by the test fixture: `32 + 512*8 + 256*12 = 32+4096+3072 = 7200` bytes, matching C3 §3.5's worked-example check. Test asserts `tier`, `tileIndex`, region lengths, and sampled values (`sampleMin[10]`, `sampleMax[10]`, `columnMean[10]`) — genuinely decodes and checks byte-level output, not just "it compiles."
- Raster header (16 bytes): `magic` @0 (`"IDLR"`), `version` @4 (unused), `width` @6 u16, `height` @8 u16, `format` @10 u16, `reserved` @12 unused. Pixel data @16, `width*height*4` bytes, `Uint8ClampedArray` view with no copy. Matches spec table exactly.
- Worked example (64×32, format 0): fixture builds `16 + 64*32*4 = 8208` bytes, matching C3 §3.6's worked example. Test asserts `width`, `height`, `pixels.length`, and first-pixel RGBA bytes.
- Both decoders throw on: short buffer (below header size), bad magic, (raster) unsupported format, (tile) buffer too short for the declared `sample_count`/`column_count`. All exercised by tests except the "declared counts exceed actual buffer" tile case (present in code, untested — Minor).

`fetchTile`/`fetchRaster` argument shapes (`sessionId`, `channel`, `tier`/`tileIndex` / `kind`, `width`, `height`, `params`) match C3 §3.5/§3.6's command signatures and the named-parameter convention already established by Task 5/M0's `smoke_tile`/`engine_version` (camelCase JS keys, Tauri's default rename to the Rust `snake_case` fn params — C3 §1).

## `fetchEngineVersion` staying in `tiles.ts`

Confirmed as a legitimate, minimal, documented deviation from the plan's literal Step 3 code listing: the plan's own Step 2 text says "leave `fetchEngineVersion`'s import pointing at `./ipc/tiles` for now — it moves to the new `engine.ts` in Task 5," and the shipped code carries a `TODO(idl0):` comment saying exactly that, in the correct `// TODO(idl0):` form. Not scope creep — it is required to keep `App.tsx` building before Task 5 exists. `App.tsx`'s diff is import-path-only as the plan's **Files** section specifies (`fetchEngineVersion` still from `./ipc/tiles`, `fetchSmokeTile` now from `./ipc/_m0_smoke`).

## CHANGELOG line sweep-in (Task 3 → Task 4 commit)

The commit includes two new CHANGELOG bullets: the Task 3 (workbook watcher) bullet and the Task 4 (tiles/rasters) bullet. Text-diffed both against the plan's own CHANGELOG steps (Task 3 Step 3, Task 4 Step 6) — both bullets match the plan's specified text **verbatim**. Task 3's plan only has a rust-submodule commit step (no app-repo commit step of its own), so its app-repo `CHANGELOG.md` edit had nowhere to land except a later app-repo commit; Task 4's `git add -A` swept it in incidentally. This is legitimate Task 3 content, correctly attributed by content (not fabricated or altered by Task 4), not something Task 4 is claiming as its own work — the commit message names only the Task 4 change.

## Commit hygiene

No AI attribution trailer in the commit message (`git log -1 --format=%B` shows only the one-line summary).

## Findings

| Severity | File:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/ipc/_m0_smoke.ts:16` | `fetchSmokeTile` (exported/public) lost its doc comment in the move — the pre-task `tiles.ts` had `/** Fetches n ascending values from the engine over binary IPC. */` on it; the new file only documents `decodeSmokeTile`, violating CLAUDE.md §5 ("doc comment on every public symbol"). Inherited verbatim from the plan's own Step 2 listing, so not an implementer error, but still a real gap in the shipped file. | Add a one-line doc comment above `fetchSmokeTile` (can be copied from the pre-task version). |
| Minor | `app/src/ipc/tiles.ts:35` | `version` header field (offset 4) is decoded nowhere — spec §5 says binary layouts are "versioned by their own `version` header field... the reader switches on it," but the decoder never reads or validates it. Harmless today (only `version=1` exists) and matches the plan's own Step 3 listing verbatim, so not a Task-4-introduced deviation. | When a second tile/raster layout version is added, dispatch on `view.getUint16(4, true)` before assuming the v1 field offsets; flag as a follow-up, not blocking now. |
| Minor | `app/src/ipc/tiles.test.ts` | `columnMax` values are never asserted (only `columnMin.length` and `columnMean[10]` are checked) and the "declared `sample_count`/`column_count` exceeds actual buffer length" throw path (present in `tiles.ts:44`) has no test. Both gaps are already present in the plan's own test listing, not added or removed by the implementer. | Add one assertion on `columnMax[j]` and one test for the truncated-declared-length case, next time this file is touched. |

No Critical or Important findings. Decoders are byte-exact against both C3 worked examples, little-endian throughout, correct field offsets, genuinely exercised by tests (not just type-checked), `npm test` and `tsc --noEmit` both reproduce clean, the `fetchEngineVersion` retention is a documented and minimal deviation, and the swept-in CHANGELOG line is legitimate pre-existing Task 3 content correctly worded.
