# L6 Task 5 review — sandboxed iframe host, postMessage cell API, watchdog

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commits under review: `c1d5ab9` (protocol +
watchdog, partial), `19a20eb` (vite.config.ts `notebookSandbox` entry, R56),
`099ec1b` (`SandboxHost.ts`, `sandbox/main.ts`, `sandbox/index.html`,
`observable-shims.d.ts`). Files touched: `CHANGELOG.md`, `app/vite.config.ts`
(R56-authorised), and everything new under
`app/src/routes/pages/Notebook/host/**` and
`app/src/routes/pages/Notebook/sandbox/**`.

Out of scope, present but untracked in the worktree and ignored for this
review per the dispatch: `app/src/routes/pages/Notebook/model/tiers.ts`,
`tiers.test.ts`, `tileCache.ts`, `tileCache.test.ts` (Task 6, mid-flight).

## Gate command and result

```
npx tsc --noEmit
```
Fails only on Task 6's untracked, uncommitted files (`model/tileCache.test.ts`
missing its sibling module, one unused var) — confirmed via `git status
--short` showing those four files as `??`. No error traces to any file this
review is scoped to.

```
npx vitest run --coverage src/routes/pages/Notebook/host
```
```
 Test Files  2 passed (2)
      Tests  7 passed (7)
```
Reproduces the implementer's reported 7 passed / 0 failed.

```
npx vite build
```
Succeeds (696 modules). `dist/src/routes/pages/Notebook/sandbox/index.html`
exists, its `<script type="module">` points at a hashed
`notebookSandbox-*.js` chunk; grepping that chunk for bare `d3`/`@observablehq`
specifiers returns nothing (fully bundled). `dist/` deleted afterward.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Critical | `app/src/routes/pages/Notebook/sandbox/main.ts:104-133` (`SandboxRuntime` constructor and `setHostVar`) | Every host variable (`laps`, `session`, `constants`, `channel`, and any name added later via `setHostVar`) is registered as `module.builtin(name, () => this.hostVars.get(name))` — an *extra* wrapping arrow function around the actual value/getter. The installed `@observablehq/runtime` source (`node_modules/@observablehq/runtime/src/module.js`'s `module_resolve`, which does `variable.define(name, constant(this._builtins.get(name)))`, and `constant.js`'s `constant(x) = () => x`) never invokes a `module.builtin()`-registered value even if it is itself a function — it hands the stored reference to dependent cells unchanged. (The README sentence the code cites — "if a builtin is defined as a function, it will be invoked lazily" — is real, but it describes `new Runtime(builtins)`'s constructor-supplied builtins (`runtime.js`, where `builtins[name]` is used directly as the implicit variable's `_definition` and is therefore actually invoked); it does not describe `module.builtin()`.) Consequence: a cell reading the bare identifier `laps`/`session`/`constants` receives a zero-arg getter *function*, not the array/object; `channel("fork_velocity")` calls that zero-arg function with an ignored argument and gets back `channelLookup` itself (a function), not channel data. Every js cell that touches any C2 §5.1 host variable receives the wrong value — this is the primary purpose of the whole task and it is silently broken (no throw, no lint, nothing catches it; `SandboxHost.ts`/`sandbox/` are explicitly untested per CLAUDE.md §4, which is why this survived the gate). | Register builtins as the value cell code actually calls/reads, matching the runtime README's own `FileAttachment` example: `module.builtin("channel", (name, opts) => this.channelLookup(name, opts))` (a genuinely callable function, no extra indirection) and, for `laps`/`session`/`constants`/generic vars, either bind the *current* value directly at each `setHostVar` and accept the runtime's "must not be redefined after variables are defined" caution (may require re-`setCells`ing after any host-var change, since already-resolved dependents won't see a later `module.builtin()` call for the same name), or hold cell definition until the first batch of host vars has landed, per the brief's own suggested ordering. Needs a design decision, not just a one-line patch, since the update-after-cells-are-defined case interacts with the redefinition caution. |
| Important | `app/src/routes/pages/Notebook/host/SandboxHost.ts:132-136` (`rebuild()`) | On watchdog stall, `rebuild()` tears down the iframe and creates a fresh, empty one but never resends `init`, the accumulated `setHostVar`s, or `setCells` — `SandboxHost` keeps no record of what it last sent. Nothing signals the (not-yet-built) caller that a rebuild happened either, so there is no hook by which cells could be resent. Design §6 states "a stalled cell... gets the iframe torn down and rebuilt — state loss is the cost" — implying reactive/variable *state* is lost, not the notebook's cell definitions themselves (otherwise a stall would silently blank the whole notebook, not just cost some recomputation). As written, a stall permanently empties the sandbox until something outside this class re-sends everything, and nothing does. Not flagged with a `TODO(idl0)`. | Either have `SandboxHost` cache the last `init`/`setHostVar`/`setCells` payloads and replay them once the rebuilt iframe posts `ready`, or add an explicit `onRebuilt` callback so a later wiring task can resend from its own cell-state model — and mark whichever is deferred with `TODO(idl0)`. |
| Minor | `app/src/routes/pages/Notebook/sandbox/main.ts:150-159` (`channelLookup` doc comment), `:187-189` (`setCells` doc comment) | The dispatch asked that each of the implementer's judgment calls (bare-name `channel()` lookup ignoring `lap`/`session`, every host var bound as input to every cell, `setCells` redefine-all, the custom Observer) be "documented with `TODO(idl0)` where deferred." Only the free-identifier-analysis gap in `compileCell` (line ~104) actually carries a `TODO(idl0)` tag; the others are explained in ordinary doc-comment prose without the tag, even though `lap`/`session` scoping and per-cell input pruning are both genuinely deferred work, not settled design. | Add `TODO(idl0):` to the `channelLookup` and per-cell-input-set comments so a future search for deferred work finds them; no functional change needed. |
| Minor | `app/src/routes/pages/Notebook/sandbox/main.ts` (whole file), `app/src/routes/pages/Notebook/host/SandboxHost.ts:31-32,67-68` | The `inlineResult` message and its `onInlineResult` callback are fully wired on the host side, but nothing in `sandbox/main.ts` ever evaluates a `${…}` inline span or posts `inlineResult` back — the feature is a complete no-op, with no comment anywhere acknowledging it isn't implemented yet. Not a scope violation (the brief's Steps 1–5 don't ask for inline-span evaluation in this task), but it's an unmarked gap in an otherwise-carefully-annotated file. | A one-line comment near `handleMessage`/the message union noting inline `${…}` evaluation isn't wired yet and which task owns it would match this file's otherwise thorough documentation. |

No Critical findings beyond the one above; no other Important findings.

## Checks performed (all pass)

- **Security boundary.** `iframe.sandbox.add("allow-scripts")` is the only
  token ever added; grepped all three commits' diffs for
  `allow-same-origin`/`allow-top-navigation`/`allow-forms` — every hit is
  prose/comment confirming it is *never* granted, none is an actual
  attribute value. `sandbox/main.ts` imports nothing from `@tauri-apps/*` or
  `app/src/ipc/` (grepped). `new Function` appears only in
  `sandbox/main.ts:compileCell` (the sandbox realm, where the brief
  explicitly allows it); zero occurrences in `SandboxHost.ts` or `protocol.ts`
  (the host realm).
- **Untrusted-input validation.** `SandboxHost`'s `onMessage` checks
  `event.source === this.iframe.contentWindow` and `isHostMessage(event.data)`
  before touching any field; `isHostMessage` is a closed five-variant switch
  that rejects unknown `type`s and wrong-typed fields, returns `false`, never
  throws. The reverse direction (sandbox trusting `window.parent`) is
  intentionally unchecked-by-shape per the code's own comment, which the
  design's untrusted-input rule doesn't require (that rule is about the host
  receiving from the sandbox, not the other way).
- **Transfer semantics.** `channelPayload`'s test asserts both buffers land
  in `transfer` exactly once and are the same references embedded in the
  message; `SandboxHost.setChannelHostVar` forwards `channelPayload`'s
  `transfer` array unchanged into `postMessage`'s third argument.
- **`channel()` return shape (R52 Q2).** `materializeHostVar` turns a
  `channel` payload's two `ArrayBuffer`s into an array of `{t, v}` records
  in the sandbox, matching the ruling (SoA object deferred, C2 §5.1 pending
  amendment) — confirmed against `runs/2026-09-03/decisions.md`'s R52 text.
- **Watchdog logic.** Hand-traced all three tests against `createWatchdog`'s
  `tick`/`onPong` implementation; ping fires every `PING_INTERVAL_MS` (1000),
  a stall trips `onStalled` exactly once at 3000 ms of no pong and does not
  re-trip on subsequent ticks while still stalled, and a `onPong` after a
  trip clears `stalled` so a later stall (past a fresh 3000 ms window) would
  trip again — matches "resumes pinging without a second trip." Both
  constants are named with `// ms` comments (design §6's own requirement).
  No real timer inside `watchdog.ts`.
- **Vite entry (R56).** `vite.config.ts`'s diff is exactly the ruling's text:
  `build.rollupOptions.input = { main: "index.html", notebookSandbox:
  "src/routes/pages/Notebook/sandbox/index.html" }`, as its own commit citing
  R56. `vite build` (run once, `dist/` deleted after) confirms the sandbox
  chunk bundles `d3`/`@observablehq/*`/`htl` with no bare specifiers left,
  and `SandboxHost.ts`'s `SANDBOX_PATH` resolution claim
  (`BASE_URL + "src/routes/pages/Notebook/sandbox/index.html"`) matches the
  real build output path.
- **`observable-shims.d.ts`.** Declares only the `@observablehq/runtime`
  members actually used (`Variable.define`/`.delete`, `Module.variable`/
  `.builtin`, `Runtime` constructor/`.module`) plus an untyped ambient module
  for `@observablehq/inputs` (used only as an opaque namespace, never called
  from this file) — no blanket `any` widening of a type that already exists
  in `@observablehq/plot`/`d3`/`htl`, both of which ship their own types and
  get no shim here.
- **No CDN, no new dependency.** `git show --stat` on all three commits
  touches no `package.json`/lockfile; every import in `sandbox/main.ts`
  resolves to one of the eight already-approved packages.
- **Ownership.** All three commits touch only
  `app/src/routes/pages/Notebook/host/**`,
  `app/src/routes/pages/Notebook/sandbox/**`, `CHANGELOG.md`, and (Task-5-only,
  per R56) `app/vite.config.ts` with exactly the authorised delta. Nothing in
  `rust/`, `App.tsx`, `package.json`, or any other worktree.
- **Hygiene.** All three commit messages are single lines with no AI
  attribution trailer; `git add` paths are explicit (checked against
  `git show --stat`); no `cargo` invocation anywhere; CHANGELOG bullet
  accurately reflects the final (unblocked) state, distinct from the earlier
  partial-commit bullet it replaces.
- **Tests.** All 7 tests use A/A/A structure with blank lines between
  sections (the `protocol.test.ts` multi-assertion tests read as one
  Arrange/Act/Assert group each, matching the brief's "one assertion per
  variant" instruction) and match the brief's exact names.
- **Doc comments and units.** Every exported symbol in `protocol.ts`,
  `watchdog.ts`, and `SandboxHost.ts` carries a doc comment; both watchdog
  constants carry `// ms`.

## Verdict rationale

The protocol design, the watchdog's pure logic, the sandbox attribute, the
untrusted-input validation, the transfer-list plumbing, and the resolved
Vite-entry question are all correct and well-documented — this is real,
careful work and the seven tests genuinely exercise what they claim. But the
one piece of this task that makes host variables reach cell code at all —
`module.builtin()` registration in `sandbox/main.ts` — is built on a
misreading of the Observable Runtime's actual behaviour (confirmed by
reading the installed source, not just the README): every host variable a
cell can see (`laps`, `session`, `constants`, `channel`, and any future
`setHostVar` name) resolves to a getter function instead of its value. This
is silently wrong output in the exact sense the standing brief calls
Critical, and it defeats this task's whole point, even though nothing in the
gate catches it (the sandbox is intentionally untested per CLAUDE.md §4). The
fix is mechanical — stop double-wrapping the builtin values — but choosing
the right update strategy for host vars that change after cells are already
defined needs a real decision, not a blind unwrap; combined with the
rebuild-doesn't-resend-cells gap, this is a fix-up dispatch, not a full
redo, since the surrounding architecture (protocol, watchdog, sandbox
boundary, Vite wiring) is sound.

VERDICT: NEEDS_FIXES
