# L6 Task 6 — implementer brief (tile layer — tier selection, cache, point budget, prefetch)

You are the implementer for L6 Task 6 of the idl1 rewrite — the pure model
layer that decides which tile tier to fetch, caches decoded tiles, and caps
how many points a line mark ever renders. TDD, ONE commit, then report.

## Before anything else: verify Task 4 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -10
```

HEAD must descend from a commit `app: pure cell scan over the C2 §2 fence
grammar` (Task 4) — this task's own gate filter (`.../model`) also runs
Task 4's `cells.test.ts`, so if Task 4 is absent the gate's expected count
(below) will be wrong and you'll be building on the wrong base.
**If Task 4's commit is missing — STOP and report.** Do not implement it
yourself.

Also confirm Task 5 (`host/`) landed or is at least not mid-flight in this
worktree — this task adds no import from `host/`, but two dispatches should
never run concurrently in one worktree (ledger precedent, process near-miss
2026-09-03). If HEAD is not a commit you recognise as Task 4 or Task 5's,
stop and report rather than guessing which task you're building on top of.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.** You will read (not build) one Rust
  file for reference — see Step 2.
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 6` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 556–605); C3 §3.5 in full
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  592–687 — the tile binary layout and its `column_count`/`tier` semantics,
  quoted below where load-bearing); `app/src/ipc/tiles.ts` (already read
  into this brief below — the `DecodedTile` shape you consume); design §6's
  interaction rules and point-budget paragraph
  (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`, lines
  148–153).

## Facts you need, already verified against the landed code

**`DecodedTile` (from `app/src/ipc/tiles.ts`, already landed on `main` by
wave-1 L5):**
```ts
export const COLUMN_T_US_EMPTY = -9223372036854775808n; // i64::MIN
export interface DecodedTile {
  version: number;
  tier: number;
  tileIndex: number;
  sampleMin: Float32Array;
  sampleMax: Float32Array;
  columnMin: Float32Array;
  columnMax: Float32Array;
  columnMean: Float32Array;
  columnTUs: BigInt64Array;
}
export async function fetchTile(
  sessionId: string, channel: string, tier: number, tileIndex: number, columnCount: number
): Promise<DecodedTile>;
```
`fetchTile` is the fetcher you take as an **injected dependency** — this
task's modules never import `ipc/tiles.ts` and never call `invoke` directly.

**The tier/bucket constants (`rust/core/src/chart_decimation.rs`, verified
directly in this worktree's `rust/` submodule — read it yourself with `cat`
if you want the full context, not required):**
```rust
pub const TIER_BASE: u32 = 8;
pub const TILE_SIZE_BUCKETS: u32 = 1024;
pub const MAX_TIER: u32 = 10;
```
Bucket size at tier `k` is `TIER_BASE.pow(k)` raw samples; a tile spans
`TILE_SIZE_BUCKETS` buckets. `MAX_TIER = 10` is the contract's own clamp
(C3 §3.5: "L5 rejects `tier > MAX_TIER` with `invalid_argument`") — mirror
both `TIER_BASE` and `TILE_SIZE_BUCKETS` as your own named constants in
`tiers.ts` with a doc comment pointing at `chart_decimation.rs`, per the
plan's own `// TODO(idl0):` note in case they ever need to come from the
engine dynamically instead of being duplicated as literals.

**`column_count` is caller-chosen, not tied to the bucket grid (C3 §3.5,
ruling R43, verbatim):** "`column_count`: Number of pixel columns in the
stats table… Independent of `sample_count` — chosen by the caller/L3 to
match the rendered chart width (design §6 point budget), not tied to the
bucket grid." This is why `columnCount` is part of the cache key below: the
same tile at two chart widths is two different payloads, not two views of
one payload.

## The task

**Files:**
- Create: `Notebook/model/tiers.ts`, `Notebook/model/tiers.test.ts`,
  `Notebook/model/tileCache.ts`, `Notebook/model/tileCache.test.ts`.

**Interfaces:**
- `tiers.ts` produces:
  ```ts
  /** Chooses the coarsest tier whose bucket span still resolves the
   *  requested time window at (approximately) one bucket per pixel.
   *  Clamped to [0, MAX_TIER]. `sampleRateHz` is the channel's own
   *  nominal rate (C1 §2), used to convert the visible span from µs to a
   *  raw-sample count before dividing by pixelWidth. */
  function chooseTier(visibleSpanUs: number, pixelWidth: number, sampleRateHz: number): number;

  /** The inclusive tile-index range covering [visibleStartUs, visibleEndUs)
   *  at the given tier. A tile's sample span is
   *  TILE_SIZE_BUCKETS * TIER_BASE**tier raw samples; converted to µs via
   *  sampleRateHz the same way chooseTier does. */
  function tileRange(
    visibleStartUs: number, visibleEndUs: number, tier: number, sampleRateHz: number
  ): { first: number; last: number };

  /** Maximum points a line mark may render per series, desktop vs. mobile
   *  (design §6's point budget, performance-budget statement P5). Desktop
   *  is 2 per pixel column; mobile is a named, smaller constant — not
   *  "some smaller number" inlined at the call site. */
  function pointBudget(pixelWidth: number, isMobile: boolean): number;
  ```
- `tileCache.ts` produces:
  ```ts
  /** LRU cache keyed (sessionId, channelId, tier, tileIndex, columnCount) —
   *  columnCount is part of the key per ruling R43: the same tile at two
   *  chart widths is two different payloads (C3 §3.5). Byte-tracked
   *  eviction against a cap you choose and document (mirror idl0's
   *  chart_tile_cache.dart's cap if you can find a documented number there;
   *  otherwise pick a reasonable default in bytes and say so in a doc
   *  comment — this is an implementation-time call, not a spec value). */
  class TileCache {
    get(key: TileCacheKey): DecodedTile | undefined;
    put(key: TileCacheKey, tile: DecodedTile): void;
    has(key: TileCacheKey): boolean;
    bytesUsed(): number;
  }

  /** Requests only the tile indices in [first, last] missing from `cache`,
   *  coalescing concurrent requests for the same missing index into one
   *  in-flight fetch (a second caller awaiting the same index gets the
   *  first caller's promise, not a duplicate `fetchTile` call). `fetcher`
   *  is injected — this function never imports ipc/tiles.ts. */
  function ensureTiles(
    cache: TileCache,
    key: Omit<TileCacheKey, "tileIndex">,
    range: { first: number; last: number },
    fetcher: (tileIndex: number) => Promise<DecodedTile>
  ): Promise<void>;
  ```
  Define `TileCacheKey` as a plain object
  `{ sessionId: string; channelId: string; tier: number; tileIndex: number; columnCount: number }`
  and derive your internal string cache key from it deterministically (e.g.
  a joined template string) — do not use object identity as the key.
- Consumes `DecodedTile` from `app/src/ipc/tiles.ts` (type-only import is
  fine; never calls `fetchTile` itself).

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `tiers.test.ts`:
  - `chooseTier — a whole 30-minute session at 800 Hz across 1200 px — picks the tier whose bucket count is nearest the pixel width`
  - `chooseTier — a window narrower than the pixel width in samples — returns tier 0 (raw)`
  - `chooseTier — a span so wide the ideal tier exceeds MAX_TIER — clamps to 10 (C3 §3.5)`
  - `tileRange — a window entirely inside one tile — returns that single index for first and last`
  - `tileRange — a window straddling a tile boundary — returns both indices`
  - `pointBudget — a 1200 px chart on desktop — allows 2400 points`
  - `pointBudget — the same chart on mobile — allows strictly fewer points`

  `tileCache.test.ts`:
  - `TileCache — a tile put then read — is returned and promoted to most-recently-used`
  - `TileCache — two tiles differing only in columnCount — are cached separately (R43)`
  - `TileCache — the same tile key across two sessions — does not collide`
  - `TileCache — puts exceeding the byte cap — evicts the least recently used until under it`
  - `TileCache — a miss — returns undefined without calling the fetcher`
  - `ensureTiles — a range partly cached — requests only the missing indices`
  - `ensureTiles — the same missing index requested twice concurrently — issues one fetch`

  14 tests total. A/A/A with blank lines between sections; names exactly as
  above. For `TileCache`'s byte-accounting tests, build small fake
  `DecodedTile`s with known-length typed arrays so the byte math is exact
  and the test isn't guessing at a real tile's size.

- [ ] **Step 2: Implement both modules**

  `tiers.ts`: bucket size at tier `k` is `TIER_BASE ** k`; `chooseTier`
  picks the tier minimising `|bucketsInWindow(tier) − pixelWidth|` (or an
  equivalent "coarsest tier that still resolves at ~1 bucket/pixel" rule —
  document exactly which criterion you implement, since "nearest" admits
  more than one reasonable tie-break and the test only pins one worked
  case). `tileRange` divides the window's sample-span boundaries by
  `TILE_SIZE_BUCKETS * TIER_BASE**tier` and floors/ceils to get tile
  indices.

  `tileCache.ts`: a `Map`-backed LRU (re-insert on access to move an entry
  to "most recent" — `Map` iteration order is insertion order, which is the
  standard trick) with a running byte total, evicting from the front until
  under the cap after each `put`. `ensureTiles` tracks in-flight fetches in
  a small `Map<string, Promise<DecodedTile>>` keyed the same way, so a
  second concurrent caller for the same missing index awaits the existing
  promise instead of calling `fetcher` again; clear the in-flight entry once
  it resolves (success or failure) so a later miss can retry.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model
  ```
  Expected: 10 (Task 4's `cells.test.ts`, already landed — confirmed above)
  + 14 (this task) = 24 passed, 0 failed. If your actual total differs
  because Task 4 landed with a different test count than 10, say so in your
  report rather than treating the mismatch as your own bug.

- [ ] **Step 4: CHANGELOG**

  ```
  - **Tile tier/cache model (L6 Task 6).** Pure tier selection, point budget (2×pixelWidth desktop), and a byte-tracked (session,channel,tier,index,columnCount) tile LRU with request coalescing.
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/tiers.ts src/routes/pages/Notebook/model/tiers.test.ts src/routes/pages/Notebook/model/tileCache.ts src/routes/pages/Notebook/model/tileCache.test.ts ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: tier selection, point budget, and the (session,channel,tier,index,columnCount) tile cache
  ```

## Do not

- Do not call `fetchTile` (or `invoke` in any form) from `tiers.ts` or
  `tileCache.ts` — both are pure; `ensureTiles`'s `fetcher` parameter is the
  only seam, and it is always injected by the caller (a component in a later
  task), never imported here.
- Do not drop `columnCount` from the cache key "since it's usually the same
  value" — ruling R43 is explicit that it is not tied to the bucket grid and
  two different chart widths produce two different payloads.
- Do not hardcode `TIER_BASE`/`TILE_SIZE_BUCKETS`/`MAX_TIER` as bare numeric
  literals scattered through the file — one named constant each, with a doc
  comment pointing at `rust/core/src/chart_decimation.rs`.
- Do not build or run any cargo command to "double check" the Rust
  constants — reading the file with `cat`/your file tools is sufficient.
- Do not use object identity or a nested `Map`-of-`Map`s keyed on live
  objects for the cache — derive a deterministic string key from the five
  `TileCacheKey` fields so equality is structural, not referential.

## Style / hygiene

Doc comment on every exported symbol, with units where numeric (`visibleSpanUs`
in µs, `pixelWidth` in CSS px, `sampleRateHz` in Hz); `// TODO(idl0):` never
bare `// TODO`; A/A/A tests with blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts, expect 24 unless Task 4's own count
differed — say so); the byte cap you chose for `TileCache` and why;
confirmation `columnCount` is part of the cache key (paste the key-building
line); per-step done/deviated; anything ambiguous you resolved (say how) or
that needs a lead ruling (stop and report instead of guessing — CLAUDE.md
§1).
