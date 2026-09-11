# Review: chart-port-b2 (R217, tier B second half — map / spectrogram bindings)

**Commits reviewed.** App worktree `main...HEAD` (6 commits: `7a6e835` gps/
trackGeometry binding, `0669f4c` spectrogram binding, `d62374c` docs,
`102991f` C2 §6 lapTable migration correction, `bfd32e1` merge, `44771e9`
map decode-ring fix). No Rust changes.

**Files touched.** `CHANGELOG.md`, `host/{SandboxHost.ts,protocol.ts}` +
new `host/protocolGps.test.ts`, `index.tsx`, `model/{gpsDriver.ts,
rasterCellDriver.ts,jsCellBinding.ts,jsCellCalls.ts}` + new
`model/{gpsDriver,rasterCellDriver,jsCellBindingTierB}.test.ts`,
`plotForm/{generate.ts,parse.ts,gpsKey.ts}` + `plotForm/chartTierB.test.ts`,
`sandbox/main.ts`, C2 spec doc.

**Test command.** Not run — read-only static review per dispatch (owner
reported tsc clean, 2663 vitest passed / 248 files, vite build clean). I
spot-read the new/changed test bodies and the driving code rather than
re-running the gate, and independently verified the C2 §6 migration claim
against the three real `.idl0wb` files under `IDL0/app/dev` (all three carry
byte-identical `lapTable` slots: no track, empty `channelIds`/
`mathChannelIds`, `scope: "auto"`, matching the corrected spec text
exactly).

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `app/src/routes/pages/Notebook/index.tsx:1544-1568` (`onChannelsInvalidated` callback) vs. `index.tsx:1224-1236` (`retainedGpsRef`/`retainedRastersRef` doc comments) | A sandbox rebuild (watchdog stall, or the user's own "Retry" — `host/SandboxHost.ts:499-510`'s `rebuild()`, which unconditionally calls `onChannelsInvalidated()`) replays spectra, histograms and scatter clouds from their retained per-window copies (`pushCombinedSpectrumFor`/`pushCombinedHistogramFor`/`pushCombinedScatterFor`, all called inside this callback) but **never** calls `pushCombinedGpsFor`/`pushRastersFor`. `setGpsHostVar`/`setRasterHostVar` (`SandboxHost.ts:383-431`) post binary payloads directly, bypassing the `lastJsonHostVars` cache that `replayInitAndHostVars` replays on rebuild (only `kind: "json"` vars are cached, per `setHostVar`). So after any rebuild, every map and spectrogram cell's data silently disappears and stays gone — the per-window `bindingIdentity` refs are untouched by a rebuild, so the two new effects (`index.tsx:3131-3260`, `:3261-3410`) see no identity change and never refetch. This directly contradicts the doc comments at `index.tsx:1224-1227` and `:1231-1235`, which state the exact opposite ("so a sandbox rebuild is served from this page's own copies rather than a re-fetch" / "Retained rather than re-fetched on a sandbox rebuild for the same reason") — the first-half review's dominant finding class (doc claims the code does not back up), recurring here. | Add `for (const cellId of retainedGpsRef.current.keys()) pushCombinedGpsFor(cellId);` and the `retainedRastersRef` equivalent to `onChannelsInvalidated`, mirroring the three existing loops; or, if intentionally deferred, strike the "retained ... rather than re-fetched on rebuild" claims from both doc comments and note it as a follow-up. |
| Important | `app/src/routes/pages/Notebook/sandbox/main.ts:139-193` (`rasterDataUrl`) and its call site in `materializeHostVar`'s `"raster"` branch (`:250-270`) | The doc comment claims encoding "never sits on the interaction path (R201)" because it runs once per fetch, not per frame. But `runs/2026-09-10/UI-THREAD-SURVEY.md:35-36` (read by this lane per the brief's required-reading list) already establishes the sandbox iframe is "same-process with the host in Chromium's common case" and flags `materializeHostVar` itself as a main-thread cost needing to move off-thread — this lane adds a synchronous `canvas.toDataURL` PNG encode (up to 2048×1024 px per C2 §5.3's clamp, one per selected window, all inside the same synchronous `postMessage`/`setHostVar` handler at `main.ts:802-803`) into exactly that flagged hot path, without addressing or even citing the survey. CLAUDE.md §3's rule is "work over more than a frame's worth of data leaves the render path" — a multi-window spectrogram's encode can plausibly exceed one frame budget (16 ms) several times over, in the same process the doc comment claims is safe. | Either move the encode off the host-process-shared path (e.g. `OffscreenCanvas` in a worker, or defer via `requestIdleCallback`/chunking), or soften the doc comment to acknowledge the same-process risk the survey already recorded, rather than asserting R201 compliance as settled fact. |
| Minor | `CHANGELOG.md:118-119` | "Only files written by yesterday's build can contain the old spelling [`w`/`h`]" — the `raster_mark` production and its `w`/`h` spelling were both introduced *earlier the same day* (2026-09-11, same revision the correction note at C2 §5.3:2308 says), not "yesterday". Harmless but factually imprecise for a reader checking dates against the spec's own revision history. | Say "today's earlier build" or drop the day reference. |
| Minor | `app/src/routes/pages/Notebook/host/SandboxHost.ts:245-260` (`setHostVar`'s new `scheduleRerender()`) | The doc comment justifies the added `scheduleRerender()` call specifically by `trackGeometry`'s async-arrival case, but the change applies to *every* `kind: "json"` host var (`laps`, `session`, `constants`, …), each of which now schedules an extra rerender it didn't before. Likely harmless (the rerender coalescer should absorb it) but the comment states a narrower justification than the code's actual scope. | Note explicitly that this widens to every JSON host var, or scope the extra rerender to the `trackGeometry` call site instead of `setHostVar` generally, if the broader rerender isn't actually desired for `laps`/`session`/`constants`. |

**Verified clean (no finding).** The `iw`/`ih` self-ruling is correct and
completely consistent: `fx: "w"` facets by window index (C2 §5.3:1700,1685),
so an image mark's own size fields cannot also be named `w`/`h` without
colliding with that facet key and collapsing every window's raster onto one
facet — the lane's stated reasoning matches the spec text verbatim
(`docs/.../2026-09-03-idl1-c2-workbook-v3.md:2308-2315`), and the rename is
applied uniformly across `generate.ts:441-451`, `parse.ts:1553-1571`,
`sandbox/main.ts`'s `RasterRecord`/`materializeHostVar`, and
`chartTierB.test.ts`, with matching doc comments at every site. `gpsKey`'s
and `rasterKey`'s doc comments, previously flagged by the first-half review
as stating present-tense facts nothing called, are now honestly true: both
the host (`jsCellBinding.ts`'s `bindingForMap`/`bindingForSpectrogram`) and
the sandbox (`sandbox/main.ts`'s `gpsLookup`/`rasterLookup`) compute the
same key from the same shared function. `combineGpsWindows`
(`host/protocol.ts:591-655`) is correct: `hasC = series.some(s => s.cs !==
null)`, one all-`NaN` break row (`x,y,t,c,w`) inserted between (not before/
after) each adjacent pair, `w` set to the producing window's index per
point and `NaN` on the break row — matching `combinePairedWindows`'s
documented rule and R127 item 4's reasoning, and `protocolGps.test.ts`
exercises the zero/one/two-window and mixed-colour cases correctly named
and AAA-shaped. `rasterFrame`'s pixel copy (`model/rasterCellDriver.ts:
150-178`) is genuinely necessary and correctly reasoned: `decodeRaster`
(`ipc/rasters.ts:37`) returns a `Uint8ClampedArray` view at a 16-byte offset
into the whole IPC response buffer, so transferring that buffer directly
would both hand the sandbox the IDLR header as leading pixel bytes and
detach a buffer `retainedRastersRef` still needs for later rebuild pushes.
`bindingFor`'s new gps/spectrogram dispatch order (`jsCellBinding.ts:
760-777`) is placed ahead of scatter/histogram/spectrum but cannot shadow
them: `extractGpsCalls`/`extractSpectrogramCalls` match only the literal
identifiers `gps`/`spectrogram` via `findCallSpans`, which none of the other
call names contain as a token, and C2 §5.3's "a cell is exactly one chart
kind" rule (line 1791) means no legitimate cell has both a `gps(...)`/
`spectrogram(...)` call and another kind's data call to shadow.
`unresolvedChannelId`'s matching dispatch-order change is consistent with
`bindingFor`'s. `NOMINAL_CELL_WIDTH_PX = 800` (`jsCellBinding.ts:578-583`)
is defensible: the module is documented and kept pure (no DOM read), the
constant is fixed forever today so including it in `bindingIdentity` never
causes spurious refetches, and the doc comment states the settle-rule
rationale (a live-resize budget would refetch on every drag) rather than
asserting it as a permanent design constraint. The C2 §6 `lapTable`
migration correction (`102991f`) is independently verified against all
three real `.idl0wb` files — byte-identical slot JSON in each, matching the
spec's quoted example exactly — and the CHANGELOG's "still not drawing"
callout for lap progression/lap table is honest and matches the brief's own
escalation (items 3–4 explicitly NOT DONE). Test naming and AAA shape
(`gpsDriver.test.ts`, `rasterCellDriver.test.ts`, `jsCellBindingTierB.test.ts`,
`protocolGps.test.ts`) consistently follow `thing — condition — result`
with blank Arrange/Act/Assert lines.

**Verdict rationale.** The wire shapes, grammar self-correction, key
symmetry and combiner logic for both new chart kinds are careful and
correct, and the lane's escalations (lap progression, lap table evaluator)
and the C2 §6 fix are honestly scoped and independently verified against
real files. But the retained-state doc comments explicitly claim rebuild
safety ("served from this page's own copies rather than a re-fetch") that
the code does not deliver for either new kind — `onChannelsInvalidated`
replays three of five retained caches and silently omits the two this lane
added, which means a map or spectrogram cell goes permanently blank after
any sandbox rebuild. That is a real functional regression path (watchdog
stalls and the user's own Retry button both trigger it) as well as a
spec/code disagreement the same class as the first-half review's dominant
finding, so this needs a fix before merge.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\chart-port-b2\runs\2026-09-11\REVIEW-chart-port-b2.md
COUNTS: critical=1 important=1 minor=2
NOTES: map/spectrogram host vars are never replayed on sandbox rebuild (onChannelsInvalidated omits pushCombinedGpsFor/pushRastersFor), contradicting the retained-ref doc comments' explicit rebuild-safety claim; everything else (iw/ih self-ruling, combineGpsWindows, rasterFrame's copy, bindingFor dispatch order, C2 §6 migration fix verified against real .idl0wb files) checks out clean.
