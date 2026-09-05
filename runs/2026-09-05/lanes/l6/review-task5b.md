# L6 Task 5 re-review (fix-up) — reactive host variables, rebuild replay

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `8e5b533` ("app: fix Task 5
review — reactive host variables, rebuild replay"). Files touched:
`CHANGELOG.md`, `app/src/routes/pages/Notebook/host/SandboxHost.ts`,
`app/src/routes/pages/Notebook/host/rebuildReplay.ts` (new),
`app/src/routes/pages/Notebook/host/rebuildReplay.test.ts` (new),
`app/src/routes/pages/Notebook/sandbox/hostVariables.ts` (new),
`app/src/routes/pages/Notebook/sandbox/hostVariables.test.ts` (new),
`app/src/routes/pages/Notebook/sandbox/main.ts`,
`app/src/routes/pages/Notebook/sandbox/observable-shims.d.ts`. Scope: the
Critical (`module.builtin` double-wrapping) and Important (rebuild doesn't
resend) findings from `review-task5.md`. Out of scope, per dispatch: a
follow-up tile-cache change under `model/` that may land mid-review — not
touched by, and not touching, this commit's diff.

## Gate command and result

```
npx tsc --noEmit
```
Silent, no errors.

```
npx vitest run src/routes/pages/Notebook/host src/routes/pages/Notebook/sandbox
```
```
 Test Files  4 passed (4)
      Tests  14 passed (14)
```
Reproduces the implementer's reported 14 passed / 0 failed.

```
npx vite build
```
Succeeds (697 modules, `notebookSandbox-*.js` chunk emitted). `dist/` deleted afterward.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `app/src/routes/pages/Notebook/host/SandboxHost.ts:139-147` (`rebuild()`) | `rebuild()` calls `replayAfterRebuild(...)` **synchronously, immediately** after `this.iframe = this.createIframe()` — before the new iframe has navigated to `sandbox/index.html`, run its script, or posted `ready`. `createIframe()` sets `iframe.src` and appends it; navigation (network fetch + parse + module script execution) is asynchronous and takes at least one, usually many, event-loop turns. A `postMessage` call is delivered to whatever document is the *current* active document of that browsing context when the browser's posted-message task actually runs; if the sandbox document hasn't finished loading and calling `window.addEventListener("message", ...)` (`sandbox/main.ts`'s `handleMessage` wiring) by the time that task fires, the event has no listener and is dropped — it is not queued for a listener that attaches later. There is no `iframe.onload`, no wait for the `"ready"` message, and no queuing/retry of the replayed `init`/`setCells` anywhere in `rebuild()`. This is exactly the class of "silently wrong output, nothing catches it" bug the standing review brief calls Critical (`review-STANDING.md` "silently wrong output... belongs here"): the entire point of this commit's Important-finding fix — that a stalled/rebuilt notebook keeps its cells — is a race that, in practice (real navigation timing vs. a same-tick `postMessage`), is very likely to lose both messages on a real rebuild, silently reverting to the exact bug `review-task5.md`'s Important finding described. Not caught by any test because `SandboxHost` is (correctly, per CLAUDE.md §4) not unit-tested, and `rebuildReplay.test.ts` only tests the pure replay-what-was-cached logic, not that `rebuild()` calls it at the right time. | Wait for the new iframe to actually be ready before replaying: either listen once for the sandbox's `"ready"` message (mirroring how `init()`'s own doc comment already describes `ready` as the sandbox-exists signal) and call `replayAfterRebuild` from that handler, or at minimum `iframe.addEventListener("load", ...)` before posting. The existing `onMessage` handler's `case "ready": break;` is the natural hook — replaying from there (once, per rebuild) would fix both the ordering and give a single place to add the host-var re-priming from the next finding. |
| Major | `app/src/routes/pages/Notebook/host/rebuildReplay.ts:16-22`, `SandboxHost.ts:110-127` (`setHostVar`/`setChannelHostVar`) | `RebuildReplayState` only caches `lastInitRuntimeVersion` and `lastCells` — `setHostVar`/`setChannelHostVar` calls are never cached or replayed. After a rebuild, the sandbox's `SandboxRuntime` constructor re-runs and re-binds `laps`/`session`/`constants`/`channel` to their hard-coded defaults (`[]`, `null`, `{}`, an empty-lookup `channelLookup`) — real values previously sent via `setHostVar`/`setChannelHostVar` are gone, and nothing resends them. This is consistent with the dispatch's own note that transferred `ArrayBuffer`s are detached and can't be replayed verbatim (a channel payload specifically can't just be re-posted from the cached message), but the cell-visible consequence is silent: a cell that calls `channel("fork_velocity")` or reads `laps`/`session`/`constants` after a rebuild gets an empty array/`null`/`{}` back — no error, no stale-data indicator, indistinguishable from "no such channel." Design §6 only promises "state loss is the cost" for the *reactive* variable state, not silent-empty data masquerading as valid-but-empty results. Not flagged with a `TODO(idl0)` anywhere in this commit's diff, even though the doc comment on `RebuildReplayState` explicitly reasons about what design §6 does and doesn't cover. | Smallest fix: after replaying `init`/`setCells`, have the host re-request/re-send host vars from whatever owns their source of truth (a task-6/7 wiring concern, not this task's), and in the meantime mark this explicitly with `// TODO(idl0):` on `RebuildReplayState` (or `SandboxHost.rebuild()`) noting host vars are not replayed and cells will see defaults until the caller resends them — so the gap is discoverable rather than silent. The standing brief's 2026-09-05 addendum on IPC-driving effects also names this directly ("Check the driver's tests cover... rebuild re-priming for the sandbox") — this commit adds no such test. |
| Note | `app/src/routes/pages/Notebook/sandbox/hostVariables.ts`, `main.ts` | The `module.builtin()` → `module.variable().define(name, [], () => value)` fix is correct: confirmed against the installed `@observablehq/runtime` source (`module.js`'s `module_resolve` only wraps *builtins* in `constant()`, so a `module.builtin(name, fn)` value is handed to dependents unwrapped and unchanged, which is exactly why the old getter-function was leaking through; `variable.js`'s `variable_define`/`variable_defineImpl` treats a same-`Variable`, same-name re-`.define()` as an in-place redefinition that adds the variable to `runtime._updates`, and `runtime.js`'s `runtime_computeNow` walks `_updates` variables' `_outputs` transitively into the recompute set — so dependents recompute). `bindHostVariables`'s `variables` map correctly reuses the same `Variable` object per name, so redefinition takes the "name unchanged, scope entry unchanged" fast path in `variable_defineImpl` and never touches the `TYPE_DUPLICATE` machinery — no duplicate-variable/"defined more than once" runtime error. `Plot`/`d3`/`Inputs`/`html` are correctly left as plain `module.builtin()` values (they never change post-construction, and are genuine data/namespace values, not getters). No fix needed; recorded so a future reader doesn't re-litigate this. |

No Critical findings beyond the rebuild-ordering one above; no other Important/Major findings.

## Checks performed (all pass)

- **Runtime semantics for host variables (claims 1–4 of the dispatch).**
  Traced `module_resolve`/`module_builtin` in `module.js`, `constant()` in
  `constant.js`, and `variable_define`/`variable_defineImpl` in
  `variable.js`, plus `variable_compute`/`runtime_computeNow` in
  `runtime.js`, against the actual installed
  `app/node_modules/@observablehq/runtime/src/*.js`. Confirmed: (a)
  `module.variable().define(name, [], () => value)` results in
  `definition.apply(...)` returning `value` verbatim at compute time — no
  extra unwrapping needed at the call site, for both plain values and the
  callable `channel` function; (b) redefining the same named `Variable`
  marks it (and transitively its outputs) dirty via `runtime._updates`,
  which `runtime_computeNow` expands through `_outputs` before recomputing,
  so a later `setHostVar` reaches already-resolved dependent cells; (c) the
  `variables` cache in `bindHostVariables` means a repeat bind for the same
  name redefines the same `Variable` object, taking the
  name-and-scope-unchanged fast path in `variable_defineImpl` — no
  `TYPE_DUPLICATE`/"defined more than once" path is ever reached; (d)
  `Plot`/`d3`/`Inputs`/`html` are untouched, still plain `module.builtin()`
  values, correctly not run through the new reactive-binding path since
  they never change.
- **Sandbox boundary.** `iframe.sandbox.add("allow-scripts")` is still the
  only token added anywhere in the diff or the surrounding files; grepped
  `SandboxHost.ts`, `sandbox/index.html`, and `sandbox/main.ts` for
  `allow-same-origin` — every hit is prose confirming it is never granted.
  `new Function` still appears only in `sandbox/main.ts:compileCell`
  (lines 114/116), none in the host realm.
- **`observable-shims.d.ts`.** The new three-argument `Variable.define`
  overload (`define(name, inputs, definition)`) matches the real
  `variable_define`'s `arguments.length` dispatch (3-arg call falls through
  its `switch`'s default, using `name`/`inputs`/`definition` as given) — the
  shim's doc comment's description of "redefines in place, marks dependents
  dirty" is accurate per the traced source, not just asserted.
- **Tests.** All 4 new `hostVariables.test.ts`/`rebuildReplay.test.ts` tests
  (plus the 10 pre-existing) use Arrange/Act/Assert with a blank line
  between sections and names of the form `thing — condition — result`; each
  assertion is tied to what its name claims (e.g. the "registers the data
  itself, not a function" test literally asserts `typeof ... === "function"`
  on the *captured definition function* and `.toBe(value)` on invoking it,
  not just a loose shape check).
- **Ownership and hygiene.** `git show --stat` touches only
  `app/src/routes/pages/Notebook/host/**`, `sandbox/**`, and
  `CHANGELOG.md`; no `package.json`/lockfile touch; single-line commit
  message, no AI attribution trailer; no `cargo` invocation anywhere.
- **CHANGELOG.** The added follow-up sentence on the Task 5 bullet
  accurately names both fixes (`bindHostVariables` reactive binding;
  `replayAfterRebuild` on rebuild) and doesn't overclaim resolution of the
  host-var-replay gap it doesn't actually close.
- **`TODO(idl0)` tagging.** The `channelLookup` `lap`/`session`-scoping gap
  and `setCells`'s redefine-all/every-cell-gets-every-input judgment calls,
  flagged Minor in `review-task5.md`, now both carry `TODO(idl0):` as
  requested.

## Verdict rationale

The Critical finding from `review-task5.md` — host variables reaching cells
as getter functions instead of their values — is genuinely fixed, and fixed
correctly: I traced the claim against the installed Runtime source rather
than trusting the implementer's doc comment, and `module.variable().define()`
does exactly what the fix's own reasoning says it does, including on
redefinition. The Important finding — rebuild losing the notebook's cells —
is fixed in its literal, narrow sense (`replayAfterRebuild` does resend
cached `init`/`setCells` in the right order when called), but the fix
introduces a new, unaddressed timing bug: `rebuild()` fires that replay
before the freshly created iframe has loaded or signalled `ready`, so the
resent messages are likely to be silently dropped by the same race the
original bug exploited, on real rebuild timing. That is a fresh Critical,
not a nitpick, because it defeats the very fix it ships alongside, the same
way the original bug did — silently, with no test catching it. Separately,
host variables (as opposed to cells) are still not replayed after a
rebuild, which the dispatch itself flagged as a foreseeable Major gap;
this commit does not close it and does not mark it `TODO(idl0)`. Both
remaining issues are small, mechanical fixes (wait for `ready` before
replaying; re-request/cache and resend host vars, or at least `TODO`-mark
the gap) against an otherwise-sound architecture, so this is a fix-up
dispatch, not a rework.

VERDICT: FINDINGS 1 Critical, 1 Major, 0 Minor
