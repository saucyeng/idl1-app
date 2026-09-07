import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GlobalErrorBanner from "./shell/GlobalErrorBanner";
import { RootErrorBoundary } from "./shell/RootErrorBoundary";
import {
  buildNavigationReport,
  buildRootCollapsedReport,
  buildRootEmptiedReport,
  collectRemovedNodeNames,
  isEmptiedByMutations,
  isRootCollapsedWhileVisible,
  ROOT_OBSERVER_TAG,
} from "./shell/rootObserverTripwire";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);

// `GlobalErrorBanner` is a genuinely separate React root over its own DOM
// node (a sibling of `#root`, appended here rather than declared in
// `index.html` since it exists purely to survive whatever happens to the
// node above it) — not a child of `#root`'s tree and not a portal into it.
// See `shell/GlobalErrorBanner.tsx`'s doc comment for why: the app root
// above can unmount its entire tree (a render/commit throw with no
// boundary above it, or `RootErrorBoundary` itself replacing it with a
// fallback) without taking this one down, so a failure that class of event
// itself causes still has somewhere to report.
const globalErrorBannerContainer = document.createElement("div");
globalErrorBannerContainer.id = "global-error-banner-root";
document.body.appendChild(globalErrorBannerContainer);
ReactDOM.createRoot(globalErrorBannerContainer).render(<GlobalErrorBanner />);

// Dev-only tripwire for the still-unexplained "blackout": the whole shell
// (nav bar, every tab's content) vanishes a few seconds after launch with
// no console error, only a benign `[TAURI] Couldn't find callback id …`
// warning (see `runs/2026-09-03/decisions.md`, "Shell hardening LANDED"
// entry, 2026-09-07). Two static readings and a headless-Chrome repro
// attempt found nothing; this instruments Isaac's own Tauri window instead.
// `import.meta.env.DEV` is stripped by Vite's dead-code elimination in a
// production build, so none of this — including `rootObserverTripwire`'s
// decision logic — reaches `dist/`. Decision logic lives in
// `shell/rootObserverTripwire.ts`; this block is just the three listeners.
if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  const loadTime = performance.now();

  const reportRootEmptied = (mutations: MutationRecord[], watchedElement: Element | null) => {
    if (!isEmptiedByMutations(mutations, watchedElement)) {
      return;
    }
    const report = buildRootEmptiedReport({
      stack: new Error("root emptied").stack ?? "(no stack available)",
      removedNodeNames: collectRemovedNodeNames(mutations),
      rootChildElementCount: document.getElementById("root")?.childElementCount ?? 0,
      bodyClassName: document.body.className,
      href: location.href,
      msSinceLoad: performance.now() - loadTime,
    });
    // eslint-disable-next-line no-console -- this IS the console report the tripwire exists to produce
    console.error(`${ROOT_OBSERVER_TAG} #root emptied`, report);
  };

  if (root !== null) {
    new MutationObserver((mutations) => reportRootEmptied(mutations, root)).observe(root, { childList: true });
  }
  new MutationObserver((mutations) => reportRootEmptied(mutations, document.body)).observe(document.body, {
    childList: true,
  });

  // Shape 2: the document silently navigates instead of the DOM being wiped.
  const reportNavigation = (event: "beforeunload" | "pagehide") => {
    const report = buildNavigationReport({
      event,
      stack: new Error("navigation").stack ?? "(no stack available)",
      href: location.href,
      msSinceLoad: performance.now() - loadTime,
    });
    // eslint-disable-next-line no-console -- this IS the console report the tripwire exists to produce
    console.error(`${ROOT_OBSERVER_TAG} ${event}`, report);
  };
  window.addEventListener("beforeunload", () => reportNavigation("beforeunload"));
  window.addEventListener("pagehide", () => reportNavigation("pagehide"));

  // Shape 3: `#root` survives but collapses to zero height while visible.
  let collapseAlreadyReported = false;
  const collapseCheckIntervalId = window.setInterval(() => {
    const currentRoot = document.getElementById("root");
    if (currentRoot === null || collapseAlreadyReported) {
      return;
    }
    if (isRootCollapsedWhileVisible(currentRoot.getBoundingClientRect(), document.visibilityState)) {
      collapseAlreadyReported = true;
      const report = buildRootCollapsedReport({
        bodyClassName: document.body.className,
        href: location.href,
        msSinceLoad: performance.now() - loadTime,
      });
      // eslint-disable-next-line no-console -- this IS the console report the tripwire exists to produce
      console.error(`${ROOT_OBSERVER_TAG} #root collapsed to zero height`, report);
    }
  }, 2000);
  window.addEventListener("beforeunload", () => window.clearInterval(collapseCheckIntervalId), { once: true });

  // eslint-disable-next-line no-console -- confirms the tripwire is armed, not a report
  console.log(`${ROOT_OBSERVER_TAG} armed (dev build only)`);
}
