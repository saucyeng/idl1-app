# Review — notebook-blank (blank Notebook fix)

Commits: `8c856a2` (shell: per-route error boundary), `da9181b` (notebook: dev-server
CORS/preamble fix + sandbox-unavailable fallback), branch `notebook-blank`,
worktree `idl1-app-worktrees\notebook-blank`.

Files touched: `app/src/shell/RouteErrorBoundary.tsx` (new),
`app/src/shell/routeErrorFallback.ts` (new), `app/src/shell/routeErrorFallback.test.ts`
(new), `app/src/shell/RouteHost.tsx`, `app/src/routes/pages/Notebook/host/SandboxHost.ts`,
`app/src/routes/pages/Notebook/index.tsx`, `app/vite.config.ts`, `CHANGELOG.md`.

## Gate

`cd app && npx tsc --noEmit && npx vitest run` — tsc clean, vitest: **129 files /
1193 passed** (matches implementer's report). One `npx vite build` run
afterward (`dist/` deleted first and after inspection): built clean, produced
`dist/index.html` and `dist/src/routes/pages/Notebook/sandbox/index.html`, no
`@react-refresh` script in either, no external font/CDN URL in either. No cargo
run.

## R69 boundary check

- `grep -rn allow-same-origin app/src` → only doc comments (`SandboxHost.ts`,
  `sandbox/index.html`, `sandbox/main.ts`, `README.md`) stating it is *not*
  granted. `iframe.sandbox.add("allow-scripts")` is the only sandbox call
  (`SandboxHost.ts:207`) — unchanged. The isolation boundary is intact.
- `server.cors.origin: [defaultAllowedOrigins, "null"]` only changes which
  `Origin` header the **dev server** answers with CORS headers; it cannot
  grant the sandbox document read access to host state — a null-origin
  document still has no `window.parent` access, no shared storage, and
  `postMessage` is unaffected either way (that channel was already open).
  Reasoned correctly: this widens what the sandbox's **module fetches** can
  succeed at (loading `main.ts` and its graph), not what the sandbox can
  *read* from the host.
- Widening effect on other opaque-origin content: yes, adding the literal
  `"null"` origin means **any** page with a null origin (a `data:` URL, a
  fully sandboxed iframe from an unrelated origin) that a user's browser
  happens to load and that also fetches `http://localhost:1420/...` would
  get the same CORS headers back. On this dev-only server (`server.port:
  1420`, not `host: true` by default — `host: host || false`, so it only
  listens where `TAURI_DEV_HOST` is unset, i.e. localhost) the practical
  exposure is: any locally-running process/page that can reach localhost:1420
  during a `tauri dev` session can now read the dev module graph's source
  (already readable without credentials to anyone on localhost pre-fix, since
  the default Vite dev server has no auth) via a null-origin fetch instead of
  a same-origin one. **Grade: Minor/Note, not Critical** — dev-only, no
  production artifact carries `server.cors`, and the module graph was already
  unauthenticated to any localhost process.

## React-preamble wrapper

- Confirmed against the installed `@vitejs/plugin-react` (`node_modules/
  @vitejs/plugin-react/dist/index.js`): two plugin objects carry
  `transformIndexHtml` — one a bare function, one `{ handler, order: "pre" }`
  — exactly the two shapes `IndexHtmlTransformHook`/`IndexHtmlTransform`
  allow per `vite`'s own `.d.ts`. The wrapper's `typeof hook === "function"`
  branch handles both correctly and preserves `order: "pre"` on the object
  form.
- Main entry unaffected: the guard only returns `undefined` (skip) when
  `ctx.filename` ends with the sandbox's own HTML suffix; every other
  filename (including `index.html`) falls through to `original.call(this,
  html, ctx)`, so Fast Refresh injection for the main app is untouched. Not
  runtime-traced end to end (no dev server was started, per the read-only/no
  extra process rule), but the logic is unambiguous from the source read.
- Version-bump fragility: correctly named in the code's own doc comment
  and in the CHANGELOG ("no per-entry include/exclude … cannot remove tags
  an earlier hook already queued"), but worth stating plainly for the
  record — if a future `@vitejs/plugin-react` release changes this hook's
  shape (e.g., drops `transformIndexHtml` from one of the two plugin
  objects, or moves the preamble injection into a different hook), `hook
  === undefined` on that plugin silently `continue`s past it unwrapped,
  which reintroduces exactly this bug with no error, no warning, no test
  failure. This is not a defect in the landed code — it is an inherent cost
  of monkey-patching a third-party plugin's internals with no upstream
  `exclude` option — but it is a real, silent-regression risk tied to any
  future `npm update` of `@vitejs/plugin-react`, and nothing pins the
  installed version to the wrapper's assumption (no runtime shape assertion
  either). **Minor**, worth a `// TODO(idl0):` or a version-pin note.

## Production check (verified myself, not taken on the implementer's word)

`npx vite build` output inspected directly: `dist/src/routes/pages/Notebook/
sandbox/index.html` has one `<script type="module" crossorigin>` tag and one
`modulepreload`/stylesheet link, no inline `@react-refresh` import — matches
the CHANGELOG's claim built from source-reading rather than a build (the
reviewer did run the build; the implementer's report said they hadn't got a
cargo/Tauri build, which is consistent with the "no cargo" rule for a UI
lane). `server.cors` is a `ServerOptions` field with no `build` counterpart
in Vite's types — confirmed it cannot affect a built artifact.

## Error boundary (`8c856a2`)

- Per-route, not one boundary for all: `RouteHost.tsx` wraps each `.map`
  iteration's `content` individually in `<RouteErrorBoundary
  routeLabel={r.label}>`.
- Fallback: `role="alert"`, names the route label, the error's constructor
  name and message, token classes only (`text-fg`, `text-brand-accent`,
  `border-rule`, `text-fg-dim` — all defined in `tokens.css`, confirmed via
  `tokenSheet.test.ts`'s colour-literal sweep, which ran clean in the gate).
- Retry genuinely remounts: React's own error-boundary contract unmounts the
  subtree below the boundary the moment `getDerivedStateFromError`/
  `componentDidCatch` fires (both render-phase and commit-phase/effect
  throws), so re-rendering `children` after `setState({ thrown: null })`
  constructs fresh component instances, not a no-op re-render of the crashed
  tree.
- `describeRouteError` correctly handles `Error`, string, arbitrary object,
  `undefined`/`null`, and never throws itself (try/catch around
  `JSON.stringify`). Tests are A/A/A, named `thing — condition — result`;
  one test (`undefined or null thrown`) combines two assertions without a
  blank-line Arrange/Act split — trivial, not worth a line item.

## Boot timer / SandboxHost (`da9181b`)

- `BOOT_TIMEOUT_MS = 5000` armed in `createIframe()`, cleared at the top of
  every `createIframe()` call before re-arming (no double-fire across
  rebuilds/retries) and cleared again the moment `ready` arrives.
- Route-visibility gating (R95): the effect that constructs `SandboxHost` is
  keyed on `primeState.running` (`Notebook/index.tsx`), which already encodes
  route-visible per R95; its cleanup calls `host.dispose()`, which now also
  clears `bootTimeoutHandle` — so hiding the route while a boot is in flight
  cancels the timer rather than firing it against a torn-down iframe.
- `retry()` calls `rebuild()`, which does `this.iframe.remove()` before
  reassigning `this.iframe = this.createIframe()` — no leaked old iframe.
- **Gap: no test exercises any of the above.** `SandboxHost.ts` has no test
  file at all (before or after this change), but the sibling `watchdog.ts` in
  the same directory extracts its stall-detection timing logic into a pure,
  injected-clock module specifically so it can be unit-tested
  (`watchdog.test.ts`, three cases). The new boot-timeout logic is the
  identical shape of problem (arm on start, clear on success, exactly-once
  fire, re-arm on retry) but is written inline against the real
  `setTimeout`/`clearTimeout` and DOM iframe rather than extracted the same
  way, so none of "fires once after 5s with no ready", "does not fire after
  ready", "re-arms on retry", or "cleared by dispose" is verified by any
  test. This is the load-bearing new behaviour of the whole fix's second
  half. **Important** — not a spec violation, but a real coverage gap on
  exactly the kind of logic (timing/wiring, not UI rendering) CLAUDE.md §4
  says the repo should own and test, and the pattern for testing it already
  exists two files away.

## CHANGELOG / scope

- CHANGELOG entries accurately describe both fixes; the `da9181b` entry
  correctly flags `SandboxHost.tick()`'s watchdog as unwired (matches R106
  addendum / L6 Task 22, not silently re-claimed as fixed here).
- `vite.config.ts` changes go beyond R56's original one-task authorization
  (adding the sandbox entry) by also adding the CORS/preamble logic — but
  the CHANGELOG discloses this as "lead-owned, touched with the lead's
  sign-off," consistent with the dispatch that requested this review. Not a
  silent deviation.
- Both commits are single-line subjects, no AI attribution trailers.
  NUL-byte check: `0` on every touched file.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `app/src/routes/pages/Notebook/host/SandboxHost.ts:204-231,344-356,375-384` | New boot-timeout/retry/rebuild-on-unavailable timing logic has zero test coverage, unlike the sibling `watchdog.ts` module's identical-shape logic in the same directory, which is extracted to a pure injected-clock function specifically so it can be tested. | Extract the boot-timer's decision (arm/clear/fire-once) into a small pure module the same way `watchdog.ts` does, with `now`/`onUnavailable` injected, and add a `*.test.ts` covering: fires once after timeout with no ready, cleared by ready, cleared by dispose, re-armed by retry/rebuild. |
| Minor | `app/vite.config.ts:56-69` | `reactWithoutSandboxPreamble()`'s wrapper depends on `@vitejs/plugin-react`'s current internal plugin/hook shape; a future version bump that changes it degrades **silently** (no error, no test failure) back to injecting the preamble into the sandbox, reintroducing this exact bug. The risk is well-documented in the code's own comments but not guarded against. | Pin `@vitejs/plugin-react`'s version tightly (already likely pinned via lockfile, but note it explicitly here) and/or add a smoke assertion (e.g., a test that calls `reactWithoutSandboxPreamble()` and asserts each plugin still exposes a `transformIndexHtml` of a recognized shape) so a version bump that breaks the assumption fails loudly instead of silently. |
| Minor | `app/vite.config.ts:141` | `server.cors.origin` adding the literal `"null"` string opens CORS to any opaque-origin page fetching this dev server, not just this app's own sandbox iframe. Correctly scoped as narrowly as Vite's `cors.origin` option allows (it is not resource-path-scoped), and low-consequence on a dev-only, unauthenticated, localhost-bound server. | No action required; worth a one-line note in the doc comment that this is a origin-wide (not per-path) allowance, for the next reader who tightens dev-server posture. |

## Verdict rationale

Both commits do exactly what the brief and R106/R106-addendum called for, with
the security-boundary claims (R69) verified from source and from a real
`grep`, not taken on trust, and the production-artifact claim verified from an
actual `vite build` output rather than re-stated from the implementer's report.
No `allow-same-origin` was added anywhere, the CORS widening is real but
narrow in consequence and correctly reasoned about in the commit's own
comments, and the error boundary is a clean, tested, per-route implementation
that genuinely remounts on Retry. The one substantive gap is that the fix's
second, more novel half — a hand-rolled boot timer with retry/rebuild
semantics — ships with no test at all, sitting right next to a sibling module
(`watchdog.ts`) that solves the identical kind of problem in a way that is
tested. That is a real, fixable coverage gap, not a design flaw, so it does
not block landing but should not be waved through silently either.

VERDICT: NEEDS_FIXES
