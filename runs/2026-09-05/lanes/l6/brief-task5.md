# L6 Task 5 — implementer brief (the sandbox — iframe host and the `postMessage` cell API)

You are the implementer for L6 Task 5 of the idl1 rewrite — the origin-isolated
iframe boundary every `js` cell runs behind: the `postMessage` protocol (pure,
tested), a watchdog (pure, tested), the thin host object that owns the
`<iframe>`, and the sandbox's own bundle entry. TDD for the pure halves, ONE
commit, then report.

## Before anything else: verify Task 4 landed

This task is dispatched after Task 4 (`model/cells.ts`) in the plan's
sequence. Task 4 may not have been dispatched yet.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -5
```

HEAD must be a commit whose message matches
`app: pure cell scan over the C2 §2 fence grammar` (Task 4), and
`app/src/routes/pages/Notebook/model/cells.ts` must exist and be committed.
**If it does not — STOP and report.** Do not implement Task 4 yourself, do
not skip ahead against a stale base, and do not guess at what Task 4 would
have produced. Nothing in this task actually imports `cells.ts`, but working
from the wrong base risks a merge tangle later; this check is cheap insurance
CLAUDE.md §1 asks for before any assumption.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. HEAD must be Task 4's commit (see above), status
  clean.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 5` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 465–553); design §6 in full
  (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`, lines
  140–154 — the sandbox paragraph is quoted below, read the surrounding
  interaction-rules text too); C2 §5.1
  (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`, lines
  558–592 — the host-variable table); `docs/vendor/observable-runtime/runtime-README.md`
  and `docs/vendor/observable-runtime/inspector-README.md` (quoted below
  where load-bearing, read the source for the rest).

## Dependencies: already on `main`, already in this worktree — do not add more

Check first: `cat package.json` in `app/`. All eight packages this lane
needs (`@observablehq/runtime` `^6.0.0`, `@observablehq/plot` `^0.6.17`,
`@observablehq/inputs` `^0.12.0`, `d3` `^7.9.0`, `codemirror` `^6.0.2`,
`@codemirror/lang-javascript` `^6.2.5`, `@codemirror/lang-markdown` `^6.5.2`,
`htl` `^1.0.0`) are already dependencies, added by a lead shell task before
this task was dispatched — confirm this yourself rather than trusting this
brief, since a stale worktree could predate that merge. If any is missing,
**STOP and report** rather than adding it yourself (`package.json` is
lead-owned, operating brief §2). **No new npm dependency beyond these eight.**

## The sandbox boundary (design §6, verbatim, read before writing anything)

> JS cells execute inside an origin-isolated `<iframe sandbox="allow-scripts">`
> (no `allow-same-origin`) that cannot reach Tauri IPC. The Runtime,
> Inspector, Plot, D3 and Inputs are bundled into the iframe. Host ↔ iframe
> is `postMessage` with transferable `ArrayBuffer`s. The cell API is narrow
> and host-mediated: `channel(name, {lap?, session?})`, `laps`, `session`,
> `constants`, `Plot`, `d3`, `Inputs`, `html`. A watchdog pings the iframe; a
> stalled cell (runaway loop) gets the iframe torn down and rebuilt — state
> loss is the cost, and it is per-notebook, not per-app. This is defence
> against bugs and stray agent output, not adversaries.

**`allow-same-origin` must never be added to the `sandbox` attribute.**
Without it, the iframe's realm has no access to `window.__TAURI_INTERNALS__`
even if a cell somehow reached for it — this is the actual security boundary,
not a convention. Adding `allow-same-origin` "to make something easier" is a
Critical-severity regression a reviewer will fail on sight.

`parse()` (Task 3) already established the rule "never `eval`, never `new
Function`, in the host realm." That rule doesn't restrict this task: the
sandbox iframe is a **different realm** from the host, and cell code
legitimately runs inside it through the Observable Runtime's own
`module.variable().define(...)` mechanism — that is what the sandbox is
*for*. Nothing in this task adds `eval`/`new Function` to the **host**
realm, which is the boundary that rule protects.

## The message protocol (from the plan, verbatim — this is the whole cell API surface)

```ts
// host → sandbox
| { type: "init"; runtimeVersion: string }
| { type: "setCells"; cells: { id: string; code: string }[] }
| { type: "setHostVar"; name: string; value: HostVarPayload }
| { type: "ping"; nonce: number }
| { type: "teardown" }
// sandbox → host
| { type: "ready" }
| { type: "pong"; nonce: number }
| { type: "cellResult"; cellId: string; html: string }        // serialized node
| { type: "cellError"; cellId: string; message: string }
| { type: "inlineResult"; spanId: string; text: string }
```

`HostVarPayload` is either a JSON scalar/object (`laps`, `session`,
`constants` from C2 §5.1's table) or
`{ kind: "channel"; length: number; t: ArrayBuffer; v: ArrayBuffer }` whose
two buffers go in `postMessage`'s **transfer list** (performance budget P7 —
"heavy arrays cross as bytes… never a JSON array of numbers"). This task
builds the generic transfer-buffer plumbing; it does **not** need to know
where a channel's bytes come from (that's Task 7's `tileToChannelData`) —
`channelPayload` below takes already-decoded `length`/`t`/`v` and produces
the message plus its transfer list.

**Why the host validates every incoming message and trusts nothing.** The
iframe is origin-isolated but still runs code an agent (or a hand-edited
cell) may have written — the host treats every `postMessage` it receives as
untrusted input, exactly the way a server treats a request body. A malformed
or unrecognised message is **silently rejected**, never thrown: a bug in one
cell's output must not crash the tab.

## The task

**Files:**
- Create: `Notebook/host/protocol.ts`, `Notebook/host/protocol.test.ts`,
  `Notebook/host/SandboxHost.ts`, `Notebook/host/watchdog.ts`,
  `Notebook/host/watchdog.test.ts`, `Notebook/sandbox/main.ts`,
  `Notebook/sandbox/index.html`.
- Modify: nothing shared.

**Interfaces:**
- `protocol.ts` produces the `HostToSandboxMessage`/`SandboxToHostMessage`
  discriminated unions above (name the two directions distinctly — the
  plan's single combined listing is for readability, not a mandate to
  merge them into one type), `HostVarPayload`, and:
  ```ts
  /** Validates a value received via `postMessage` from the (untrusted)
   *  sandbox realm. Named for its caller — the host — not for the
   *  message's own taxonomy: every message it accepts originates in the
   *  sandbox and is bound for the host. Returns false, never throws, on
   *  anything malformed. */
  function isHostMessage(msg: unknown): msg is SandboxToHostMessage;

  /** Builds a `setHostVar` message for a decoded channel plus the
   *  transfer list `postMessage` needs so the two buffers move by
   *  reference, not by copy (P7). `t`/`v` must not be read again by the
   *  caller after this call — they are neutered once transferred. */
  function channelPayload(
    length: number,
    t: ArrayBuffer,
    v: ArrayBuffer
  ): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] };
  ```
  Adjust `channelPayload`'s exact signature only if `name` genuinely needs
  to be a parameter (it does — `setHostVar` needs a variable name; add it as
  the first argument if the shape above is wrong, and say so in your
  report) — the point being tested is that both buffers land in `transfer`
  exactly once, not the precise argument order.
- `watchdog.ts` produces a factory taking **injected** `now()` and `send()`
  (no real timers, no real `Date.now()` inside the pure module — the tests
  must be deterministic without vitest fake timers beyond what they already
  provide). Design the exact shape yourself; it must support: issuing a
  ping (calling the injected `send`), being told a pong arrived (`onPong`),
  and being driven forward in time by the caller (a `tick(nowMs)` method or
  equivalent) so the three tests below are expressible without a real
  `setInterval`. Ping interval `1000` ms, stall timeout `3000` ms — **named
  constants with a `// ms` comment**, not inlined.
- `SandboxHost.ts` is the thin, untested object: creates the `<iframe>`,
  posts messages built from `protocol.ts`, listens for incoming messages and
  runs them through `isHostMessage` before doing anything with them, owns
  one `watchdog` instance, tears down and rebuilds the iframe on
  `onStalled`.
- `sandbox/main.ts` is the iframe's own entry: imports `@observablehq/runtime`,
  `@observablehq/inspector`, `@observablehq/plot`, `d3`,
  `@observablehq/inputs`, `htl`; listens for `postMessage` from the host;
  builds one `Runtime` and one `module` per `init`; binds host variables via
  `module.builtin(name, value)` as `setHostVar` messages arrive (the
  Runtime README's own words: "any built-ins must be defined before
  variables are defined, and must not be redefined after" — sequence
  `setHostVar` before `setCells` per cell, or hold cell definition until the
  first batch of host vars has landed, whichever the `init`/`setCells`
  ordering in your protocol makes cleaner); defines each cell in `setCells`
  via `module.variable(observer).define(...)`, where `observer` posts
  `cellResult`/`cellError` back to the host instead of touching the DOM
  directly (`Inspector` renders to a detached element you then serialize,
  or you write a small custom observer — either is fine, document which).
  `sandbox/index.html` is the minimal HTML shell that loads `main.ts` as a
  module script.

**Determine the Vite entry question before writing `sandbox/index.html` for real use.**
`vite.config.ts` (read it — do not edit it) currently declares no
`build.rollupOptions.input` beyond the implicit project-root `index.html`,
so a second HTML page under `Notebook/sandbox/` is **not** picked up by
Vite's default multi-page discovery without a config change. Before
committing, determine concretely whether this lane can avoid touching
`vite.config.ts`:
- If a `?url`-imported bundle (e.g. `import sandboxUrl from "./sandbox/main.ts?url"`,
  or the equivalent worker-style `new URL(..., import.meta.url)` pattern Vite
  handles specially) lets `SandboxHost` load the iframe's JS without a second
  HTML entry — for instance, building the iframe's document from a `srcdoc`
  string with a `<script type="module" src="{url}">` tag — **use that** and
  say so in your report, quoting the exact pattern.
- If neither works and a real `build.rollupOptions.input` addition to
  `vite.config.ts` is unavoidable, **do not edit it.** STOP before writing
  `sandbox/index.html`/`main.ts` any further, and report the exact config
  delta needed (the literal lines to add) as a shell-task request — this is
  ruled Q9(ii): `vite.config.ts` is lead-owned and this lane may not touch
  it, but the lead needs your concrete finding, not a guess, to act on it.
  You may still land Steps 1–3 below (the protocol module and watchdog,
  which need no dependency and no Vite entry) as a partial commit if you hit
  this wall — say explicitly in your report that Steps 4–5 are blocked and
  why.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `protocol.test.ts` (pure — type guards and builders, no DOM):
  - `isHostMessage — every message the sandbox may send — is accepted`
    (one assertion per variant of `SandboxToHostMessage`: `ready`, `pong`,
    `cellResult`, `cellError`, `inlineResult`)
  - `isHostMessage — an object with an unknown type — is rejected`
  - `isHostMessage — a message whose payload fields are the wrong type — is rejected`
    (e.g. `cellResult` with `html` as a number)
  - `channelPayload — a decoded channel — puts both buffers in the transfer list exactly once`

  `watchdog.test.ts` (pure — injected `now()` and `send()`):
  - `watchdog — a pong arrives inside the deadline — does not trip`
  - `watchdog — no pong within the deadline — trips once and calls onStalled`
  - `watchdog — a stall then a rebuild then a pong — resumes pinging without a second trip`

  7 tests total. A/A/A with blank lines between sections; names exactly as
  above.

- [ ] **Step 2: Implement `protocol.ts`**

  Hand-written type guards (no schema-validation library — none of the
  eight approved dependencies is one, and adding a ninth is out of scope).
  `isHostMessage` checks `type` against the closed set of five sandbox→host
  variants and validates every field's `typeof`/shape per variant. Reject
  (return `false`) rather than throw on anything unrecognised.

- [ ] **Step 3: Implement `watchdog.ts`**

  Ping every 1000 ms; a missing pong for 3000 ms trips `onStalled` exactly
  once per stall (it must not re-trip every subsequent tick while still
  stalled — the "resumes… without a second trip" test is the one that
  catches a watchdog that keeps firing). Both intervals named constants with
  a `// ms` unit comment, per design §6.

- [ ] **Step 4: Resolve the Vite-entry question, then implement `SandboxHost.ts` and the sandbox entry**

  See "Determine the Vite entry question" above — do this before writing
  `sandbox/index.html`/`main.ts` for real, not after. Once resolved:
  `<iframe sandbox="allow-scripts">`, never `allow-same-origin`. Cell code
  executes only through the Runtime's own `variable().define(...)` — never
  `eval` in the host realm (the host realm being `SandboxHost.ts`/the app
  shell; the sandbox realm's own `main.ts` running `Plot`/`d3`/user cell
  functions is not "the host realm" and is exactly where this execution is
  supposed to happen).

  Verify `Library`/`Inspector` wiring against
  `docs/vendor/observable-runtime/runtime-README.md` and
  `inspector-README.md` as you write this — the API surface quoted in this
  brief (`module.variable(observer).define(...)`, `module.builtin(name,
  value)`, `Inspector.into(container)`) is copied from those files; read
  them for anything this brief didn't quote.

- [ ] **Step 5: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/host
  ```
  Expected: 7 passed, 0 failed. The iframe itself is rendering — not unit
  tested (CLAUDE.md §4). If Step 4 was blocked on the Vite-entry question,
  report that `protocol.ts`/`watchdog.ts` still pass this gate on their own
  and that `SandboxHost.ts`/`sandbox/` are incomplete pending the shell task.

- [ ] **Step 6: CHANGELOG**

  ```
  - **Sandboxed iframe host (L6 Task 5).** postMessage cell API (host- and sandbox-side message unions, validated on receipt), a watchdog (1000 ms ping / 3000 ms stall), and the sandbox's own Runtime+Plot+d3+Inputs+htl bundle entry. `allow-same-origin` never granted.
  ```
  (Adjust the wording if Step 4 was blocked — say so in the CHANGELOG bullet
  too, e.g. "…; the sandbox entry itself is blocked on a vite.config.ts shell
  task, see the lane's questions.")

- [ ] **Step 7: Commit**

  Explicit paths (adjust the file list if Step 4 was blocked and some files
  weren't written):
  ```
  git add src/routes/pages/Notebook/host/protocol.ts src/routes/pages/Notebook/host/protocol.test.ts src/routes/pages/Notebook/host/SandboxHost.ts src/routes/pages/Notebook/host/watchdog.ts src/routes/pages/Notebook/host/watchdog.test.ts src/routes/pages/Notebook/sandbox/main.ts src/routes/pages/Notebook/sandbox/index.html ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: sandboxed iframe host, postMessage cell API, watchdog
  ```

## Do not

- Do not add `allow-same-origin` to the iframe's `sandbox` attribute, under
  any justification. This is the one absolute rule in this task.
- Do not edit `vite.config.ts`. If you determine it's needed, STOP per the
  "Determine the Vite entry question" section above and report the delta —
  do not apply it yourself even as a "just this once" convenience.
- Do not add a schema-validation library (zod, ajv, etc.) for
  `isHostMessage` — hand-written type guards are the correct-weight tool for
  a five-variant closed union, and `package.json` is lead-owned regardless.
- Do not let the host trust an unvalidated `postMessage` payload anywhere —
  every access to `event.data`'s fields must happen only after
  `isHostMessage` (or an equivalent check) has narrowed the type.
- Do not use real timers (`setTimeout`/`setInterval`/`Date.now()`) inside
  `watchdog.ts` itself — it takes `now()` and `send()` as injected
  dependencies precisely so its tests are deterministic. `SandboxHost.ts` is
  where a real `setInterval` calling the watchdog's `tick` belongs, and that
  file is not unit-tested.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol; `// ms` on both watchdog constants;
`// TODO(idl0):` never bare `// TODO`; A/A/A tests with blank lines between
sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts, expect 7); your finding on the Vite-entry
question (which approach you used, or the exact config delta you're
reporting as blocked, quoted verbatim) — this is the one thing the lead
needs verbatim, not paraphrased; confirmation `allow-same-origin` does not
appear anywhere in the diff (`grep -n "allow-same-origin"` — paste the
negative result); per-step done/deviated; anything ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).
