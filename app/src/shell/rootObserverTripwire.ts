/**
 * Pure decision logic for the dev-only "root emptied" tripwire (2026-09-07,
 * root-observer task). Two static readings and one headless-Chrome repro
 * attempt have failed to find what empties the whole app shell — nav bar
 * and every tab's content vanish together a few seconds after launch, with
 * no console error, only a benign `[TAURI] Couldn't find callback id …`
 * warning (see `runs/2026-09-03/decisions.md`, "Shell hardening LANDED"
 * entry). This module decides *whether* a given mutation/measurement counts
 * as the failure and *what* to report; `main.tsx` only wires the three
 * listeners (`MutationObserver`, `beforeunload`/`pagehide`, a slow
 * `setInterval`) and hands their raw browser objects in here. Kept pure and
 * dependency-free so it is unit-testable without a real DOM removal.
 *
 * Every report carries {@link ROOT_OBSERVER_TAG} so `grep`ing a built
 * bundle for the tag proves this module never shipped to production (it is
 * only ever imported behind `import.meta.env.DEV` in `main.tsx`).
 */

/** Grep-able tag prefixing every console line this module's reports produce. */
export const ROOT_OBSERVER_TAG = "[root-observer-tripwire]";

/** One of the three failure shapes this tripwire distinguishes. */
export type RootObserverEventKind = "root-emptied" | "navigation" | "root-collapsed";

/** Fields common to every report, matching what the dispatch asked to see. */
interface RootObserverReportBase {
  /** Always {@link ROOT_OBSERVER_TAG} — present on the object too, not just the console-line prefix, so a copy-pasted report is still identifiable. */
  tag: string;
  /** Which of the three tripwires fired. */
  kind: RootObserverEventKind;
  /** `location.href` at the moment of the event. */
  href: string;
  /** `performance.now()` at the moment of the event — ms since navigation start. */
  msSinceLoad: number;
}

/** Report for a `MutationObserver` firing because `#root` (or `document.body`) was emptied. */
export interface RootEmptiedReport extends RootObserverReportBase {
  kind: "root-emptied";
  /** `new Error("root emptied").stack` captured at the moment of the mutation — the whole point of this tripwire. */
  stack: string;
  /** `nodeName` of every node the triggering mutation batch removed. */
  removedNodeNames: string[];
  /** `document.getElementById("root")?.childElementCount` after the mutation (0 if `#root` itself is gone). */
  rootChildElementCount: number;
  /** `document.body.className` at the moment of the mutation. */
  bodyClassName: string;
}

/** Report for a `beforeunload`/`pagehide` firing — distinguishes a silent navigation from a DOM wipe. */
export interface NavigationReport extends RootObserverReportBase {
  kind: "navigation";
  /** Which of the two navigation events fired. */
  event: "beforeunload" | "pagehide";
  /** `new Error("navigation").stack` captured at the moment of the event, in case something triggered it programmatically. */
  stack: string;
}

/** Report for `#root` surviving but collapsing to zero height while the page is visible. */
export interface RootCollapsedReport extends RootObserverReportBase {
  kind: "root-collapsed";
  /** `document.body.className` at the moment of the check. */
  bodyClassName: string;
}

export type RootObserverReport = RootEmptiedReport | NavigationReport | RootCollapsedReport;

/**
 * Whether a `MutationObserver` batch on `#root`/`document.body` should be
 * treated as "the root emptied": the watched element's current child count
 * is zero *and* at least one mutation in the batch actually removed a node
 * (an observer with `childList: true` also fires for text-only mutations on
 * matched subtrees when `subtree: true` is set, which this ignores).
 *
 * @param mutations - The batch `MutationObserver`'s callback received.
 * @param watchedElement - The element the observer is watching (`#root` or `document.body`), or `null` if it has been removed from the document entirely.
 */
export function isEmptiedByMutations(mutations: MutationRecord[], watchedElement: Element | null): boolean {
  if (watchedElement !== null && watchedElement.childElementCount > 0) {
    return false;
  }
  return mutations.some((mutation) => mutation.removedNodes.length > 0);
}

/**
 * Collects the `nodeName` of every node a mutation batch removed, in order,
 * so the console report names what disappeared (e.g. `["DIV", "NAV"]`).
 *
 * @param mutations - The batch a `MutationObserver` callback received.
 */
export function collectRemovedNodeNames(mutations: MutationRecord[]): string[] {
  const names: string[] = [];
  for (const mutation of mutations) {
    mutation.removedNodes.forEach((node) => names.push(node.nodeName));
  }
  return names;
}

/**
 * Builds the report for a confirmed "root emptied" mutation. Pure — the
 * caller supplies every browser-derived value so this stays testable
 * without a real DOM.
 */
export function buildRootEmptiedReport(args: {
  stack: string;
  removedNodeNames: string[];
  rootChildElementCount: number;
  bodyClassName: string;
  href: string;
  msSinceLoad: number;
}): RootEmptiedReport {
  return { tag: ROOT_OBSERVER_TAG, kind: "root-emptied", ...args };
}

/**
 * Builds the report for a `beforeunload`/`pagehide` event, so a silent
 * navigation is distinguishable in the log from a DOM wipe.
 */
export function buildNavigationReport(args: {
  event: "beforeunload" | "pagehide";
  stack: string;
  href: string;
  msSinceLoad: number;
}): NavigationReport {
  return { tag: ROOT_OBSERVER_TAG, kind: "navigation", ...args };
}

/**
 * Whether `#root` has collapsed to zero height while the page is visible —
 * the third failure shape a `MutationObserver` on `#root`'s children would
 * miss (the element and its subtree can survive intact but render at
 * `0` height, e.g. a collapsed flex/grid ancestor).
 *
 * @param rect - `#root.getBoundingClientRect()` (or an equivalent height-bearing measurement).
 * @param visibilityState - `document.visibilityState` at the moment of the check; a hidden tab collapsing is not this failure.
 */
export function isRootCollapsedWhileVisible(rect: { height: number }, visibilityState: DocumentVisibilityState): boolean {
  return rect.height === 0 && visibilityState === "visible";
}

/**
 * Builds the report for a confirmed zero-height `#root` collapse.
 */
export function buildRootCollapsedReport(args: {
  bodyClassName: string;
  href: string;
  msSinceLoad: number;
}): RootCollapsedReport {
  return { tag: ROOT_OBSERVER_TAG, kind: "root-collapsed", ...args };
}
