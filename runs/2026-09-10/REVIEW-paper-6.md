# Review: L9 paper lane, task 6 — mobile point budget threading

Commit reviewed: `fb66ba0d60f6e1be6821d7c3b7fce08f88cdb35f` (worktree `paper`,
branch `paper`)

Files touched:
- `app/src/routes/pages/Notebook/index.tsx`
- `app/src/routes/pages/Notebook/model/channelBindDriver.ts`
- `app/src/routes/pages/Notebook/model/channelBindDriver.test.ts`

Test command run once from `app/`:
```
npx tsc --noEmit
npx vitest run
```
Result: `tsc --noEmit` produced no output (clean). Vitest: **183 test files
passed (183), 1846 tests passed (1846)** — matches the expected count exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verification notes

1. **Call sites of `pointBudget`.** Only two production call sites exist,
   both in `channelBindDriver.ts` (`:334` inside `runChannelBindWindow`'s
   definition-channel branch, `:404` inside its session-channel branch);
   both now pass `isMobile` instead of a hardcoded `false`. A repo-wide grep
   for `pointBudget(` under `app/src` finds no third call site outside these
   two and `tiers.test.ts`'s direct unit tests. Matches plan §2/§5 task 6
   exactly (`model/channelBindDriver.ts:324` and `:394` in the plan's
   pre-refactor line numbers).

2. **Parameter threading.** `runChannelBindWindow`'s new `isMobile: boolean`
   parameter is inserted directly after `chartWidthPx` and before `dispatch`
   in both the declaration (`channelBindDriver.ts:306-317`) and both of its
   call sites inside `runChannelBind` (`:558`) and `runChannelSettle`
   (`:612`) — argument order matches the declaration at every call. The two
   public entry points, `runChannelBind` and `runChannelSettle`, add
   `isMobile = false` as a genuinely trailing defaulted parameter (last
   parameter of `runChannelBind`; last parameter of `runChannelSettle`,
   after the pre-existing `previousBound = []` default). Every pre-existing
   call site in `channelBindDriver.test.ts` (about two dozen, including the
   race/sequencing tests around lines 813-970) omits the new trailing
   argument and so gets the default `false`, reproducing prior desktop
   behaviour unchanged — confirmed by reading each call site's argument
   list and by the new explicit regression test `"runChannelBind — no
   isMobile argument — the desktop budget, unchanged"`
   (`channelBindDriver.test.ts:419-433`), which asserts `calls === [1280]`,
   i.e. `pointBudget(640, false)`.

3. **`index.tsx`'s three call sites.** `paperActive` (`:796`,
   `= paperViewActive(widthPx)`, the same predicate task 1 built) is passed
   as the trailing `isMobile` argument at all three sites that call
   `runChannelBind`/`runChannelSettle` with a budget-relevant width:
   `:1845` (`runChannelBind`), `:2544` (`runChannelSettle` for the gesture
   cell), `:2590` (`runChannelSettle` for every other bound cell in the
   sibling re-fetch loop). No other value (e.g. a stale placement snapshot
   or a hardcoded flag) is substituted at any of the three.

4. **Test style and strength.** The four new/changed tests
   (`channelBindDriver.test.ts:400-433` for `runChannelBind`,
   `:758-776` for `runChannelSettle`, plus the unchanged-default regression
   test) follow `thing — condition — result` naming and Arrange/Act/Assert
   with blank lines. The two "strictly lower" tests fetch real budgets from
   both `isMobile` branches through the actual `fetchHostChannel` fake and
   assert `mobile[0]` `toBeLessThan` `desktop[0]` — a genuine inequality on
   runtime values, not a restatement of `MOBILE_POINTS_PER_PIXEL_COLUMN` /
   `DESKTOP_POINTS_PER_PIXEL_COLUMN`. Checked the underlying constants
   (`tiers.ts:27,34`: mobile = 1 pt/px column, desktop = 2) and the min/max
   clamp (`MIN_HOST_CHANNEL_BUDGET = 1`, `MAX_HOST_CHANNEL_BUDGET = 65536`)
   confirm neither test's width (640, 100) falls into a clamp that would
   flatten the inequality.

5. **Doc comments.** `runChannelBindWindow`, `runChannelBind`, and
   `runChannelSettle` each gained an `@param isMobile` doc block naming
   `model/paperView.ts`'s `paperViewActive`, ruling R184, what it changes
   (halves `pointBudget`), and why the public entry points default to
   `false` (preserve existing callers' behaviour). Consistent style with
   the surrounding doc comments, units not applicable (boolean flag).

No scope creep: the diff touches exactly the three files plan §5 task 6
names, no unrelated formatting changes visible in the diff context lines.
Commit message is a single line, no AI attribution trailer.

## Verdict rationale

The threading is correct at every call site checked (production and test),
argument order matches declarations throughout, the defaulted trailing
parameter provably preserves every existing caller's behaviour (verified
both by static reading and by the implementer's own regression test), the
paper predicate reaching `index.tsx`'s three call sites is exactly
`paperViewActive(widthPx)` and nothing else, the new tests are real
strict-inequality proofs in house style, and doc comments are present and
accurate. Gate command run once, exactly as specified, with results
matching the expected counts (183 files / 1846 tests, tsc clean). No
deviation from the plan or R184 found.

## Verdict

CLEAN
