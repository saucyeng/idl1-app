/**
 * Pure "should the notebook's background work be running, and does it need
 * a re-prime" decision for R95 items 2/3 (2026-09-07 decisions log): while
 * the Notebook route is not visible (the window hidden, or another tab
 * active under mount-and-hide — `shell/routeVisibility.tsx`'s
 * `useRouteVisible`), the sandbox iframe, the `watchWorkbook` subscription
 * and the debounced `eval_workbook` call all stop — each is a live handle
 * (a JS runtime, an OS file watch, a network request) a hidden notebook has
 * no reason to hold open. `index.tsx` reads this module rather than the
 * route-visible boolean directly, so both halves of the decision — "should
 * we be running" and "does becoming visible again need a re-prime" — live
 * in one pure, tested place instead of being re-derived ad hoc at each of
 * the three call sites.
 */

/** Whether the notebook's background work (sandbox, watcher, debounced
 *  eval) should be running right now. A straight passthrough of the
 *  route-visible signal today; named so every call site states *why* it
 *  reads visibility rather than re-deriving the rule, and so a future
 *  qualifier has one place to land.
 *
 * @param routeVisible - `shell/routeVisibility.tsx`'s composed visibility
 *  for the Notebook route (window visible AND Notebook the active route).
 */
export function sandboxShouldRun(routeVisible: boolean): boolean {
  return routeVisible;
}

/** Tracks whether background work is running and how many times it has
 *  (re)started — `primeEpoch` is what a freshly (re)constructed
 *  `SandboxHost` needs replayed into it. */
export interface SandboxPrimeState {
  /** Whether background work should be running right now. */
  readonly running: boolean;
  /** Bumped on every transition into `running`. `index.tsx` includes this
   *  in the dependency array of every effect that must resend its state
   *  into a freshly (re)constructed `SandboxHost` — the same effects that
   *  already populate a first-mounted one (R69's replay order — init, then
   *  JSON host vars, then bound channels, then `setCells` — falls out of
   *  those effects' existing declaration order, reused rather than
   *  duplicated into a second replay path). */
  readonly primeEpoch: number;
}

/**
 * The lifecycle state to seed `useState` with, given the route's visibility
 * at first render — mount-and-hide (R93) means the Notebook page mounts at
 * app start regardless of which tab is initially active, so this is not
 * always `{running: false, primeEpoch: 0}`: a notebook that mounts already
 * visible needs its first prime counted too.
 *
 * @param routeVisible - The Notebook route's composed visibility at mount.
 */
export function initialSandboxPrimeState(routeVisible: boolean): SandboxPrimeState {
  return { running: routeVisible, primeEpoch: routeVisible ? 1 : 0 };
}

/**
 * Applies a new route-visible reading to `prev`. A hidden → visible
 * transition bumps `primeEpoch` (background work is restarting and needs a
 * re-prime); a visible → hidden transition only flips `running` off — there
 * is nothing to replay on the way *to* hidden; no change at all returns
 * `prev` unchanged (by reference), so a caller can skip a `setState` call
 * when nothing happened.
 *
 * @param prev - The lifecycle state before this visibility reading.
 * @param routeVisible - The Notebook route's composed visibility now.
 */
export function nextSandboxPrimeState(prev: SandboxPrimeState, routeVisible: boolean): SandboxPrimeState {
  const running = sandboxShouldRun(routeVisible);
  if (running === prev.running) return prev;
  return { running, primeEpoch: running ? prev.primeEpoch + 1 : prev.primeEpoch };
}
