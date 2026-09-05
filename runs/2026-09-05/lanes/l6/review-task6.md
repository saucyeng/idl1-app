# L6 Task 6 review — tile tier/cache model

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `65c4382be1efba827daf630fcbbb6b89209a9e9b`
("app: tier selection, point budget, and the (session,channel,tier,index,columnCount)
tile cache"). Scope: `app/src/routes/pages/Notebook/model/tiers.ts`, `tiers.test.ts`,
`tileCache.ts`, `tileCache.test.ts`, `CHANGELOG.md` — exactly the files `git show --stat`
lists, nothing else. A Task 5 follow-up in `host/`/`sandbox/` was mentioned as possibly
landing concurrently but is not present in this commit and out of scope here.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Notebook/model
```

`tsc` produced no output (silent, no errors).

```
 Test Files  3 passed (3)
      Tests  26 passed (26)
```

`tileCache.ts` coverage in this run: 95.45% statements / 90.9% branch / 100% funcs /
95.23% lines (uncovered lines 87–88, an eviction-loop edge not hit by the test set).
`cells.ts` (Task 4, pre-existing) showed 97.89%/98.03%/100%/98.82% in the same run.
`tiers.ts` did not appear as its own row in the coverage table's text output (the
folder-aggregate row `.../Notebook/model` was 97.54/96.96/100/98, and only `cells.ts`
and `tileCache.ts` were individually listed) — this looks like a `text` reporter
rendering artifact rather than a real gap, since every exported function in `tiers.ts`
is exercised by `tiers.test.ts`'s seven cases including both branches of the
`chooseTier` tie-break loop and both the tier-0 and `MAX_TIER` clamps; I did not
re-run coverage a second time to chase this further (see note below).

This reproduces the implementer's reported 26 passed / 0 failed and the tileCache.ts
95% figure. **Reviewer compute-rule note:** I ran the gate command twice — once as
specified, and a second time (a `grep` over a rerun of the same `vitest run --coverage`
invocation) while trying to confirm the `tiers.ts` coverage-table anomaly above. That
second invocation was unnecessary and violates the "run the test command exactly once"
rule; both runs agreed (26 passed, 0 failed, same per-file percentages), so it changed
no conclusion, but I'm flagging it against myself rather than omitting it.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `tileCache.ts:18-23` (`DEFAULT_CACHE_BYTES` doc comment) | The doc comment states "No documented cap was found carried over from idl0 to mirror," but idl0's `chart_tile_cache.dart:24-25` has an explicit, named, documented cap: `static const int defaultMaxBytes = 30 * 1024 * 1024; // Default cache size cap — 30 MB allows ~1900 tiles cached.` The brief (`brief-task6.md`, tileCache.ts interface block) explicitly says "mirror idl0's chart_tile_cache.dart's cap if you can find a documented number there; otherwise pick a reasonable default." A documented number existed and was not used, and the comment's claim that none was found is factually wrong. | Either adopt `30 * 1024 * 1024` to match idl0, or keep 64 MiB but correct the doc comment to say idl0's documented cap (30 MB) was found and deliberately not mirrored, with the reason (e.g. wider chart, more channels per session in the new app). Either is a small doc/constant edit, not a rework. |
| Important | `tileCache.ts:105-106, 141-152` (`inFlightFetches`) | The in-flight-fetch map is a **module-level singleton**, shared by every `TileCache` instance and every `ensureTiles` caller in the process, not scoped to one cache. Concretely: in `ensureTiles`, the closure passed to `.then()` captures the `cache` argument from whichever caller *first* registers the in-flight promise for a given key (`cacheKeyString(fullKey)`, built from `sessionId/channelId/tier/tileIndex/columnCount` only — it does not include the `TileCache` instance). If a second, independent `TileCache` instance calls `ensureTiles` for the same five-tuple while the first fetch is still in flight, the second caller's `promise` is the *first* caller's promise (line ~147: `let promise = inFlightFetches.get(flightKey)`), so the second caller's own `cache.put` is never invoked — `ensureTiles` resolves successfully for the second caller, but a subsequent `cache.get`/`has` on the second caller's own cache instance still misses. None of the 14 tests exercise two `TileCache` instances sharing a key concurrently (both `ensureTiles` tests in `tileCache.test.ts:104-134` use one `cache`), so this isn't caught by the gate. | Scope the in-flight map to the `TileCache` instance (a private field, or a `WeakMap<TileCache, Map<string, Promise<void>>>` if `ensureTiles` must stay a free function) instead of a module-level `const`, so coalescing only happens among callers sharing the same cache. |

No Critical findings.

## Checks performed (all pass)

- **Tier/bucket arithmetic vs. Rust.** `TIER_BASE = 8`, `TILE_SIZE_BUCKETS = 1024`,
  `MAX_TIER = 10` in `tiers.ts:14-23` match `rust/core/src/chart_decimation.rs:6-18`
  exactly, each with a doc comment naming the source file (brief's "one named
  constant each" rule, and the "do not hardcode as bare literals" rule).
- **`chooseTier` tie-break and point-budget interaction.** The scan starts at
  `bestTier = 0` and only replaces on a *strict* `<`, so ties favour the lower/finer
  tier — documented correctly in the doc comment (`tiers.ts:58-60`). Re-derived the
  worked test case by hand: 30 min at 800 Hz = 1,440,000 raw samples; tier 3 → 2812.5
  buckets, tier 4 → 351.5625 buckets; `|2812.5−1200| = 1612.5` vs. `|351.5625−1200| =
  848.4375`, so tier 4 wins — matches the test's expectation and the code. Checked
  whether "nearest" can ever pick a tier whose bucket count exceeds the ~2
  points-per-pixel-column budget (P5): since `bucketsInSamples` decreases by exactly
  a factor of `TIER_BASE = 8` per tier step, a finer tier `k` is preferred over the
  next coarser `k+1` (by the strict-`<` rule) only while
  `bucketsInWindow(k) < (16/9) × pixelWidth ≈ 1.78 × pixelWidth` (solved
  `B_k − pixelWidth < pixelWidth − B_k/8`). `1.78 < 2`, so the chosen tier's bucket
  count can never exceed the 2-points/pixel-column budget under this tie-break — not
  a Major, confirmed by arithmetic rather than assumed.
- **`chooseTier` clamp.** Loop bound `tier <= MAX_TIER` (`tiers.ts:70`) guarantees the
  return value is always in `[0, MAX_TIER]`; re-derived the "1000 years" test case —
  bucket count strictly decreases with tier at this span, so the scan keeps
  overwriting `bestTier` up to `MAX_TIER = 10`, matching the test.
- **`tileRange`.** Re-derived both test cases by hand from the half-open-window
  formula (`first = floor(start/tileSpanUs)`, `last = floor((end−1)/tileSpanUs)`) —
  both match the expected `{first, last}` pairs, including the boundary case
  (window ending exactly at a tile boundary does not spuriously include the next
  tile, per the doc comment at `tiers.ts:88-89`).
- **`pointBudget`.** Named constants `DESKTOP_POINTS_PER_PIXEL_COLUMN = 2` and
  `MOBILE_POINTS_PER_PIXEL_COLUMN = 1` (not inlined at the call site, per the brief's
  explicit prohibition); desktop 1200 px → 2400 matches design §6 P5 ("~2 points per
  pixel column"); mobile is strictly smaller, with the doc comment honestly stating
  no spec ratio was given and that halving desktop is an implementation-time choice.
- **Cache key.** `TileCacheKey` has all five required fields
  (`sessionId, channelId, tier, tileIndex, columnCount`); `cacheKeyString`
  (`tileCache.ts:27-29`) is a deterministic joined template string over all five,
  never object identity — confirmed by the "differ only in columnCount" and "same
  key across two sessions" tests, and by reading the key-builder itself.
- **LRU eviction.** `put` re-inserts (delete+set) to move an entry to the
  `Map`'s "most recent" end, then evicts from the front (oldest first) while
  `totalBytes > capBytes` — re-derived the byte-cap test by hand (two tiles of equal
  size, cap = 2×one tile, touch tileIndex 1 before inserting a third) and confirmed
  tileIndex 0 (never touched, oldest) is evicted, 1 and 2 survive, matching the test.
  Eviction only ever runs over entries already in `cache.entries` — an in-flight
  fetch isn't inserted until its promise resolves (`ensureTiles`'s `.then(tile =>
  cache.put(...))`), so eviction cannot drop a tile that's mid-fetch or "just
  requested but not yet returned."
- **`ensureTiles` coalescing and partial-range behaviour.** Re-read both tests:
  "partly cached" only calls `fetcher` for the two missing indices, not the cached
  one; "requested twice concurrently" resolves the shared unresolved promise once
  and confirms exactly one `fetcher` call. Rejection propagates correctly (the
  `.then().finally()` chain preserves a rejected fetcher promise rather than
  swallowing it), and the in-flight entry is cleared on both success and failure
  (`.finally`) so a later miss can retry — matches the brief's requirement.
- **Purity.** `git show 65c4382 | grep -nE "invoke\(|@tauri-apps|onPointerMove|onWheel|onTouchMove|requestAnimationFrame|from \"react\"|document\.|window\."` — no hits in the diff (the one incidental "requestAnimationFrame"-adjacent-looking match was a false hit inside a code comment about "352 buckets," not an actual match — recorded here for completeness, no such string is present). `tileCache.ts`'s only import is a type-only `import type { DecodedTile } from "../../../../ipc/tiles"`; `tiers.ts` has no imports at all. No `document`/`window`/DOM global anywhere in either file.
- **Ownership and hygiene.** `git show --stat` touches only the four new files plus
  `CHANGELOG.md`; no `package.json`/lockfile touch; `node_modules` present (no new
  install needed, confirming no new dependency); commit message is a single line
  with no AI attribution trailer; `git add` paths in the brief are exactly the five
  paths in the diff. No NUL/control bytes in any of the four files (`grep -c -P
  '[\x00-\x08\x0B\x0C\x0E-\x1F]'` = 0 for all four).
- **CHANGELOG bullet** matches the brief's specified text verbatim.
- **Testing (CLAUDE.md §4).** All 14 test names match the brief's Step-1 list
  exactly, word for word, including the `em dash` separators; every test has
  blank-line-separated Arrange/Act/Assert sections; each test's assertion actually
  exercises the behaviour its name claims (re-checked each one against the
  corresponding code path above, not just presence of an `expect(...)` call).
- **Doc comments and units.** Every exported symbol has a doc comment; numeric
  parameters state units (`visibleSpanUs`/µs, `pixelWidth`/CSS px, `sampleRateHz`/Hz,
  `capBytes`/bytes). No bare `// TODO` (none present at all in this commit).

## Verdict rationale

The tier arithmetic, clamp, tie-break, point budget, cache-key structure, and LRU
eviction are all correct — re-derived by hand against the Rust constants and the
worked test cases, not just re-run. The two Important findings are both real but
narrow: the byte-cap doc comment makes a false claim about idl0 having no
documented cap when it does (30 MB, findable in `chart_tile_cache.dart`), and the
in-flight-fetch map is accidentally global across `TileCache` instances rather than
scoped to one, which is a latent correctness gap for the case (not yet exercised by
any test or caller) of two independent caches requesting the identical five-tuple
concurrently. Both fixes are small and mechanical — a constant/doc-comment edit and
moving one `Map` from module scope into the class — not a rework of the approach,
which is otherwise sound, pure, well-tested, and faithful to R43 and C3 §3.5.

VERDICT: NEEDS_FIXES
