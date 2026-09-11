/**
 * The window's stacking model (ruling R221.1): **all chrome in one layer,
 * above one content container, and content never declares a z-index.**
 *
 * The bug this replaces: the Notebook's sandbox iframe host is
 * `position: fixed` with an explicit `zIndex: 0`, so a chart scrolled up the
 * page paints above every static in-flow element around it. Each time
 * something turned out to be underneath it, that one element was given
 * `relative z-10` — the top bar (R209), then the Notebook toolbar row
 * (R161), and the timeline strip was next in line. Patching one element at
 * a time cannot terminate: every new piece of chrome starts underneath and
 * is found by a user.
 *
 * The model instead: every chrome region carries {@link CHROME_Z_INDEX} and
 * nothing else does. The content region is one container with
 * `isolation: isolate`, which makes it a stacking context — so the iframe
 * host, and every z-index *inside* a route's own content (a sticky table
 * header, a cell's overlay chrome), is scoped to that context and can never
 * out-stack a chrome region, whatever value it picks.
 *
 * **Why `isolation: isolate` and not `contain: paint`.** R221.1 offered
 * either. `contain: paint` would also clip the host, which is tidier, but
 * it makes the container a *containing block for fixed descendants*: the
 * host's `inset: 0` would then mean the content box rather than the
 * viewport, and every chart iframe — positioned from a viewport-relative
 * `getBoundingClientRect` by `ChartCell.tsx`'s `sendLayout` — would be
 * offset by the activity bar's and title bar's own size. `isolation:
 * isolate` creates the stacking context without touching the containing
 * block, so the coordinates every chart is positioned with stay the ones
 * they were measured in. Clipping is not needed for correctness here:
 * chrome and content tile the window, so anything the host paints outside
 * the content box is painted under a chrome region.
 *
 * The module carries R221.1's other half too: {@link SHELL_ROOT_SCROLLS}
 * and {@link SHELL_REGION_SCROLLS} state that the window is a frame rather
 * than a page — the content container is the only region that scrolls, and
 * nothing at the document level overflows at all. The two halves belong
 * together because they are the same mistake twice: a shell that scrolls
 * and a chart that paints over a bar are both the window behaving like a
 * document.
 *
 * Pure and dependency-free (`aspectClass.ts`'s pattern): no React, no DOM.
 * This module is the model the shell's classes and this lane's invariant
 * test are both written against.
 */

/** One region of the window, in the stacking model. */
export type ShellRegionId =
  /** Title bar: app glyph, menu bar, drag region, window controls. */
  | "titleBar"
  /** The 48 px activity strip (and, narrow, the bottom tab bar). */
  | "activityBar"
  /** The sidebar frame: its header, its resize separator, its panel. */
  | "sidebar"
  /** The window-wide editor toolbar row (the Notebook toolbar portals in). */
  | "toolbarRow"
  /** The timeline / windowing strip under the toolbar. */
  | "timelineStrip"
  /** The status bar. */
  | "statusBar"
  /** The one content container: `RouteHost` and everything a route draws,
   *  including the sandbox iframe host. */
  | "content";

/** What a region is: part of the chrome layer, or the content it frames. */
export type ShellLayer = "chrome" | "content";

/** The z-index every chrome region carries, and the only stated z-index in
 *  the shell's own layout. `1` rather than a large number: the chrome layer
 *  competes with nothing but the content container at `auto`, and a number
 *  chosen to "win" is how a stack of ad hoc z-indexes starts. */
export const CHROME_Z_INDEX = 1;

/** Which layer each region belongs to. One table, so "is this chrome?" has
 *  exactly one answer and adding a region to the shell is a decision made
 *  here rather than in a class name. */
export const SHELL_REGION_LAYERS: Readonly<Record<ShellRegionId, ShellLayer>> = {
  titleBar: "chrome",
  activityBar: "chrome",
  sidebar: "chrome",
  toolbarRow: "chrome",
  timelineStrip: "chrome",
  statusBar: "chrome",
  content: "content",
};

/** Every region id. */
export const SHELL_REGION_IDS = Object.keys(SHELL_REGION_LAYERS) as ShellRegionId[];

/** Whether `region` is part of the chrome layer. */
export function isChrome(region: ShellRegionId): boolean {
  return SHELL_REGION_LAYERS[region] === "chrome";
}

/**
 * The z-index `region` declares: {@link CHROME_Z_INDEX} for chrome, and
 * `null` — meaning "declares none, stacks at `auto`" — for content.
 *
 * `null` is the load-bearing half. A content region that declared any
 * z-index, even a small one, would be back in the competition this model
 * exists to end.
 */
export function zIndexFor(region: ShellRegionId): number | null {
  return isChrome(region) ? CHROME_Z_INDEX : null;
}

/** The regions in the chrome layer. */
export function chromeRegions(): ShellRegionId[] {
  return SHELL_REGION_IDS.filter(isChrome);
}

/** The regions that are content. There is exactly one, by design: "ONE
 *  content scroll container" is what makes a single chrome z-index
 *  sufficient. */
export function contentRegions(): ShellRegionId[] {
  return SHELL_REGION_IDS.filter((region) => !isChrome(region));
}

/**
 * Whether the window itself scrolls. It does not, and this constant is
 * here to be asserted against rather than to be read: ruling R221.1's
 * second half is that the shell is a frame, not a page.
 *
 * The symptom it fixes: the whole shell — title bar, activity bar, status
 * bar and all — scrolled inside the window whenever anything inside it
 * grew past the viewport, because `html`, `body` and `#root` were at
 * `height: auto` with `overflow: visible` and the app root asked for
 * `100vh` (the largest viewport, not the visible one) and `100vw` (which
 * counts the scrollbar). All four are pinned now: `styles/index.css` for
 * the document, `AppShell.tsx` for the root.
 */
export const SHELL_ROOT_SCROLLS = false;

/**
 * Which regions may scroll. Exactly one does — the content container —
 * and every chrome region holds its place by being a flex item that
 * neither grows nor shrinks.
 *
 * A chrome region that scrolled would be a bar whose contents moved out
 * from under the pointer; the sidebar's own list scrolls *inside* the
 * sidebar frame, which is a container within the region, not the region.
 */
export const SHELL_REGION_SCROLLS: Readonly<Record<ShellRegionId, boolean>> = {
  titleBar: false,
  activityBar: false,
  sidebar: false,
  toolbarRow: false,
  timelineStrip: false,
  statusBar: false,
  content: true,
};

/** The regions that scroll. Exactly one, by {@link SHELL_REGION_SCROLLS}. */
export function scrollingRegions(): ShellRegionId[] {
  return SHELL_REGION_IDS.filter((region) => SHELL_REGION_SCROLLS[region]);
}
