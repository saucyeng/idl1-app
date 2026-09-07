import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GlobalErrorBanner from "./shell/GlobalErrorBanner";
import { RootErrorBoundary } from "./shell/RootErrorBoundary";
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
