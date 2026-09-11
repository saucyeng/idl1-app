/**
 * Whether a `window` `"error"` message is one of the browser's two benign
 * `ResizeObserver` notices rather than a real failure. Both fire when a
 * `ResizeObserver` callback changes layout that re-triggers observation in
 * the same frame — normal under `requestAnimationFrame`-deferred or
 * rapid-resize code paths, and explicitly non-fatal per spec (the observer
 * keeps delivering later notifications; nothing is lost). `GlobalErrorBanner`
 * has no other signal to tell this apart from a real thrown error — both
 * arrive as a `window` `"error"` event with only a message — so the two exact
 * strings Chromium/Firefox/WebKit use are matched here, kept pure and
 * testable apart from the banner's own event wiring.
 *
 * @param message - `ErrorEvent.message`, or the description text already
 *   built from one.
 */
export function isBenignWindowError(message: string): boolean {
  return (
    message === "ResizeObserver loop completed with undelivered notifications." ||
    message === "ResizeObserver loop limit exceeded"
  );
}
