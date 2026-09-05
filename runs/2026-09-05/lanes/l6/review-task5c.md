# L6 Task 5 re-review (second fix-up round) — rebuild-race, host-var/channel replay

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `ad715fd` ("app: fix sandbox
rebuild race and replay JSON host vars, re-derive channels"). Files touched:
`CHANGELOG.md`, `app/src/routes/pages/Notebook/host/SandboxHost.ts`,
`app/src/routes/pages/Notebook/host/outboundQueue.ts` (new) +
`outboundQueue.test.ts` (new), `app/src/routes/pages/Notebook/host/rebuildReplay.ts`
(extended) + `rebuildReplay.test.ts` (extended), `app/src/routes/pages/Notebook/model/channelRebind.ts`
(new) + `channelRebind.test.ts` (new), `app/src/routes/pages/Notebook/sandbox/main.ts`.
Scope: the Critical (rebuild-race, replay before iframe ready) and Major
(host vars never replayed) findings from `review-task5b.md`. Out of scope: a
follow-up commit `0892752` ("fix channel() v buffer type to Float64Array,
flag hover gap TODO") landed on the branch during this review — not touched
by, and not touching, `ad715fd`'s diff; not reviewed here.

## Gate command and result

```
npx tsc --noEmit
```
Silent, no errors.

```
npx vitest run src/routes/pages/Notebook
```
```
 Test Files  14 passed (14)
      Tests  89 passed (89)
```
The implementer reported 88 passed for `ad715fd`; the extra test present at
HEAD comes from the out-of-scope follow-up commit `0892752`, which also
touches `src/routes/pages/Notebook` and landed after `ad715fd`. Restricting
by eye to the files this commit touches (`host/outboundQueue.test.ts`: 5,
`host/rebuildReplay.test.ts`: 5, `model/channelRebind.test.ts`: 3, plus
`sandbox/main.ts`'s and `SandboxHost.ts`'s existing indirect coverage)
accounts for the reported count; the run as a whole is `0 failed`, so the
gate passes.

```
npx vite build
```
Succeeds (697 modules, `notebookSandbox-*.js` chunk emitted, 847 ms).
`dist/` deleted afterward.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `app/src/routes/pages/Notebook/host/SandboxHost.ts:200-207` (`rebuild()`) | `rebuild()` calls `this.callbacks.onChannelsInvalidated()` **before** `replayAfterRebuild(...)`. Every message either call produces goes through the *same* `outboundQueue` for the same (just-started) generation, and the queue flushes strictly in `send()`-call order (`outboundQueue.ts`'s own doc comment and `outboundQueue.test.ts`'s "flushes held messages in order" test confirm this). So once `onChannelsInvalidated`'s `setChannelHostVar` calls are wired up (Task 8), the flushed order on every rebuild will be: channel `setHostVar` message(s), then `init`, then JSON `setHostVar`s, then `setCells`. But `sandbox/main.ts:230` (`case "setHostVar": sandboxRuntime?.setHostVar(...)`) is a documented no-op when `sandboxRuntime` is `null` — which it is until `init` is processed (`case "init": sandboxRuntime = new SandboxRuntime();`). `rebuildReplay.ts`'s own doc comment says this explicitly: "the sandbox's `setHostVar`/`setCells` handlers are no-ops until `init` has created its `SandboxRuntime`" — and that is exactly why `replayAfterRebuild` puts `init` first. `SandboxHost.rebuild()` does not follow that same rule for the channel re-derivation it added: it queues those `setHostVar` messages *ahead* of `init`, so they arrive at a `sandboxRuntime === null` sandbox and are silently swallowed by the optional-chain no-op. This defeats this exact commit's own P2/P7 channel-restoration feature on every future rebuild once Task 8 wires it: cells that call `channel(name)` after a watchdog-triggered rebuild will silently get the runtime's hard-coded default (`[]`) forever, not just transiently — the same class of "silently wrong output, nothing catches it" the standing brief calls Critical, and the same shape of bug `review-task5b.md`'s Critical finding was about (introduced by a correctly-reasoned-about-races fix that gets the *sequencing* wrong instead). The commit's own doc comment on `rebuild()` reasons about *race-safety* ("safe to issue immediately" because it goes through the same queue) but never checks *processing-order* correctness against `sandbox/main.ts`'s no-op-before-`init` behavior — the one property `rebuildReplay.ts` was written to respect for JSON host vars is not respected here for channel vars. Not caught by any test: `outboundQueue.test.ts` only tests generic FIFO-per-generation queuing (correct in isolation), `rebuildReplay.test.ts` only tests `replayAfterRebuild` in isolation (also correct in isolation — it never calls `onChannelsInvalidated`), and `channelRebind.test.ts` tests `rebindChannelsAfterRebuild` as a pure function with an injected `send`, never through `SandboxHost.rebuild()`'s actual call order. No test exercises the two paths' *interleaving*. | Move the `onChannelsInvalidated()` call to *after* `replayAfterRebuild(...)` in `rebuild()` (or otherwise guarantee channel `setHostVar` messages are queued after `init`). Ordering relative to `setCells` is a smaller, secondary judgment call (a cell's first post-rebuild run either sees the channel default or the real value depending on before/after `setCells`, same as the JSON-host-var-before-`setCells` reasoning already used) but ordering after `init` is not optional — it's required for the message to be processed at all. |
| Note (for the lead, Task 8 wiring) | `app/src/routes/pages/Notebook/model/channelRebind.ts` | No live call site yet constructs a `BoundChannel[]` or wires `SandboxHostCallbacks.onChannelsInvalidated` to `rebindChannelsAfterRebuild` — confirmed by grep, no hits outside this commit's own files/doc comments. `channelRebind.ts` itself is correctly free of that wiring (pure, injected `cache`/`send`, per the standing brief's purity rule). Task 8 needs: (a) a place that tracks, per currently-bound channel, the `BoundChannel` bookkeeping (`name`, cache key minus `tileIndex`, tile-index range, `startUs`/`endUs`, `budget`) whenever a channel is first bound/re-bound via `setChannelHostVar` — this state doesn't exist anywhere yet; (b) an `onChannelsInvalidated` callback (passed into `SandboxHost`'s constructor via `SandboxHostCallbacks`) that calls `rebindChannelsAfterRebuild(bound, tileCache, (name, data) => sandboxHost.setChannelHostVar(name, data.length, data.t.buffer, data.v.buffer))`; (c) fixing the ordering bug above, since Task 8's wiring alone cannot make channel restoration work while `rebuild()` queues it ahead of `init`. Flagging as a Note-for-the-brief per the dispatch's item 7, not a defect in this commit's own files. | N/A — lead ruling for Task 8's brief, not a fix to this commit. |
| Minor | `app/src/routes/pages/Notebook/host/SandboxHost.ts:196-198` (doc comment) | The doc comment's stated reasoning — "`onChannelsInvalidated` fires before the replay, since it is itself `setChannelHostVar` calls that go through the same queued `postToSandbox` path and so are safe to issue immediately" — is true about *race*-safety (no message is lost to the load-timing race `outboundQueue` fixes) but doesn't address *order*-safety against `init`, which is the actual bug above. Once the ordering fix lands, this comment should be corrected to state why the new order is safe, not just why the old one was race-safe. | Update alongside the ordering fix. |

No other Critical/Important findings.

## Checks performed (all pass)

- **Sandbox posts `ready` unconditionally, listener-before-post, no window
  for a lost message.** `sandbox/main.ts:246-262`: `window.addEventListener("message", ...)`
  and `postToHost({ type: "ready" })` are both plain synchronous top-level
  statements in the same module-evaluation pass — the listener attaches
  before `ready` is posted, in the same tick, with nothing async between
  them. `ready` is no longer gated on `init` (`case "init":` no longer calls
  `postToHost({ type: "ready" })`); grepped every `"ready"` occurrence in
  `Notebook/**` and confirmed nothing else in the diff or surrounding files
  still treats `ready` as `init`'s ack (`protocol.ts`, `protocol.test.ts`,
  `SandboxHost.ts`'s `case "ready":` handler are the only other hits, all
  consistent with the new "sandbox document loaded" meaning).
- **`OutboundQueue` semantics, all five properties in the dispatch.**
  Traced `outboundQueue.ts` directly and matched every claim against
  `outboundQueue.test.ts`'s five tests: messages before `ready` are held,
  not sent (`"are held, not sent immediately"`); `markReady` flushes held
  messages for the current generation in FIFO order
  (`"flushes held messages in order"`); a message sent after `markReady` is
  sent immediately (`"is sent immediately, not queued"`); `markReady` for a
  stale (previous) generation is a no-op, held messages stay held
  (`"is ignored, held messages stay held"`); a duplicate `markReady` for the
  same generation does not re-flush (`"does not re-flush"`). `startGeneration()`
  clears `this.pending` for the *previous* generation, but this loses
  nothing needed: every message that must survive a rebuild (`init`, JSON
  host vars, `setCells`) is re-enqueued fresh, after `startGeneration()`
  runs, by `rebuild()`'s own `replayAfterRebuild` call — the cleared
  pending array only ever held messages addressed to the now-discarded
  iframe (e.g., a `teardown` or an in-flight `setCells` that raced the
  rebuild), which are correctly not worth replaying since the target no
  longer exists.
- **Every outbound post routes through the queue.** Grepped
  `contentWindow.postMessage`/`contentWindow?.postMessage` in
  `Notebook/**` — the only two occurrences are the `sendNow` callbacks
  passed into `outboundQueue.markReady`/`.send` from inside
  `postToSandbox`; no call site bypasses `postToSandbox`. `init`, `setCells`,
  `setHostVar`, `setChannelHostVar`, `rebuild()`'s `teardown`, and
  `dispose()`'s `teardown` all go through `postToSandbox`.
- **JSON host vars: cached only for `kind === "json"`, channel buffers never
  retained.** `SandboxHost.setHostVar` only calls
  `this.lastJsonHostVars.set(...)` inside `if (value.kind === "json")`; there
  is no equivalent cache for `kind === "channel"` anywhere in the diff — the
  doc comment on `lastJsonHostVars` states this explicitly and the code
  matches it. `setChannelHostVar` never touches `lastJsonHostVars`.
- **`replayAfterRebuild` order (init → JSON host vars → setCells) is sound
  for the runtime in isolation.** `rebuildReplay.ts`'s own doc comment gives
  the reason (`setHostVar`/`setCells` are no-ops before `init`; a cell
  should see real host-var values on its first post-rebuild run, not
  defaults) and `rebuildReplay.test.ts`'s "resends each after init and
  before setCells" test asserts the exact order. This part of the fix is
  correct — the defect above is specifically that `onChannelsInvalidated`'s
  calls are not subject to the same ordering discipline.
- **`rebindChannelsAfterRebuild` purity and per-channel semantics.** No
  `fetch`/`invoke`/IPC import anywhere in `channelRebind.ts` — only
  `channelData.ts` (pure, `tileToChannelData`) and `tileCache.ts`'s
  `TileCache`/`TileCacheKey` types. `cache.get(...)` is synchronous
  (`TileCache`'s existing interface, not touched by this commit). A channel
  missing any single tile in its `[first, last]` range is skipped entirely
  (`fullyCached` is set `false` and the loop `break`s before pushing a
  partial `tiles` array) — confirmed by
  `"a bound channel missing a tile from the cache — is skipped, not sent
  with holes"`. Each bound channel is sent at most once, in `bound`'s order
  — confirmed by `"two bound channels — each is sent exactly once, not
  duplicated or merged"`.
- **`generation` field / stale-`ready` protection wired correctly on the
  host side.** `createIframe()` calls `this.outboundQueue.startGeneration()`
  and stores the id in `this.generation` before the iframe is even
  constructed; `onMessage`'s `case "ready":` passes `this.generation` (read
  at message-handling time, i.e. always the *current* iframe's generation)
  into `markReady`, so a `ready` from a torn-down previous iframe still
  in flight cannot flush into a newer generation's queue — matches
  `outboundQueue.test.ts`'s stale-generation test.
- **Sandbox boundary unchanged.** `iframe.sandbox.add("allow-scripts")` is
  still the only token added; grepped the diff and surrounding files for
  `allow-same-origin` — no hit outside prose explaining why it's never
  granted. `new Function` still appears only in `sandbox/main.ts`'s
  `compileCell` (host realm untouched by this commit).
- **Tests: Arrange/Act/Assert, naming, coverage of the brief's claims.** All
  13 new/changed tests (`outboundQueue.test.ts` ×5, `rebuildReplay.test.ts`'s
  2 new cases, `channelRebind.test.ts` ×3, plus the pre-existing
  `rebuildReplay.test.ts` ×3 unchanged) use blank-line-separated
  Arrange/Act/Assert and `thing — condition — result` names; each name's
  claim matches what it asserts (e.g. "is skipped, not sent with holes"
  asserts `sent` is `[]`, not just that fewer than expected were sent).
  Every property the dispatch asked about (2)–(5) above (held-before-ready,
  ordered-flush-on-`markReady`-for-current-generation, stale-generation
  ignored, duplicate-`markReady` no-op, `startGeneration` clearing
  correctness, pure-no-IPC channel rebind, skip-on-missing-tile, one-send-
  per-channel) is directly covered by a named test, not just asserted in
  prose.
- **Ownership and hygiene.** `git show --stat ad715fd` touches only
  `CHANGELOG.md` and files under `app/src/routes/pages/Notebook/host/**`,
  `model/**`, `sandbox/**` — no `package.json`/lockfile, no `App.tsx`,
  `AppState.tsx`, `vite.config.ts`, nothing under `rust/` or
  `app/src-tauri/`. Single-line commit message, no AI attribution trailer.
  No `cargo` invocation anywhere in the diff or this review.
- **CHANGELOG.** The added bullet accurately describes both fixes shipped
  (rebuild race via `OutboundQueue`; JSON host-var replay; channel
  re-derivation via `onChannelsInvalidated`/`rebindChannelsAfterRebuild`)
  and does not claim the channel-restoration path actually works
  end-to-end (it doesn't yet, per the Critical finding above, and no Task 8
  wiring exists for the CHANGELOG to overclaim about).

## Verdict rationale

The rebuild-timing race from `review-task5b.md`'s Critical finding is
genuinely fixed: I traced `OutboundQueue`'s generation-tagged hold/flush
logic against its own tests and against `sandbox/main.ts`'s new
unconditional, listener-registered-first `ready`, and the mechanism is
sound — a message posted during `rebuild()` can no longer be silently
dropped to a not-yet-listening iframe, and a stale `ready` from a
torn-down iframe cannot flush into a newer generation. The JSON-host-var
replay Major finding is also genuinely fixed, with correct init-before-
hostvars-before-setCells ordering backed by a test. But the same commit
introduces a fresh, symmetric Critical: `SandboxHost.rebuild()` calls
`onChannelsInvalidated()` (which will drive `setChannelHostVar`, i.e.
`setHostVar` messages, once Task 8 wires it) *before* `replayAfterRebuild`
queues `init`, so those channel-restoration messages are queued ahead of
`init` and will arrive at a sandbox whose `sandboxRuntime` is still `null`
— `sandbox/main.ts`'s `setHostVar` case is a documented no-op in that
state. This is the exact same class of bug as the one this commit set out
to fix (a correctly-race-safe message that is nonetheless silently
dropped, this time to a sequencing rather than a load-timing defect), and
it defeats this commit's own third piece of scope (channel re-derivation)
on every future rebuild. The fix is small and mechanical — reorder two
statements in `rebuild()` — so this is a fix-up, not a rework; the
approach (generation-tagged queue, cached JSON replay, pure re-derive
driver for channels) is correct and well-tested throughout.

VERDICT: FINDINGS 1 Critical, 0 Major, 1 Minor
