import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { RouteId } from "../routes/types";
import { initialRoute } from "../shell/launchLayout";
import { readColumnPrefs } from "../shell/columnPrefs";
import { nextWindows, type SelectionModifier, type SelectionWindow } from "./selection";

/** The session and lap/range selection shared across tabs: the Data tab
 *  writes this slice, the Notebook reads it to drive `eval_workbook_v2`
 *  (C1 §6.1, ruling R111/R115). An ordered list of {@link SelectionWindow}
 *  — one representation for a session, a lap or an explicit drag range, no
 *  single-session special case. Supersedes the old `{ sessionId,
 *  lapContext }` shape (ledger R41/R52 Q5) outright — see this module's
 *  git history for that shape, not a field kept alongside this one. */
export type Selection = SelectionWindow[];

/** The `Selection` slice's value before any window is chosen — "nothing
 *  selected" (decision 48). */
export const initialSelection: Selection = [];

/** App-shell state: the current tab plus the values every tab may need
 *  (engine version, for a footer/about display; resolved <data> path, for
 *  Settings; the shared session/lap `selection`). L6/L7 extend this shape
 *  with their own slices (workbook handle, …) rather than inventing a
 *  second store — see this plan's Open Questions on when a heavier state
 *  library is justified. */
export interface AppState {
  route: RouteId;
  engineVersion: string | null;
  selection: Selection;
}

/** `AppState.route`'s value in {@link initialAppState} — a fixed constant so
 *  every existing test that spreads `initialAppState` keeps a deterministic
 *  starting route. The real app never uses this value directly: the
 *  provider below resolves the actual launch route through
 *  `shell/launchLayout.ts`'s `initialRoute` (width + the remembered route
 *  from `shell/columnPrefs.ts`, UI-4 brief "The shell itself") before the
 *  first render. */
const TEST_DEFAULT_ROUTE: RouteId = "device";

/** The app's state before `engine_version` resolves (M0: `fetchEngineVersion`
 *  populates it on mount) and before any session is selected. `route` here
 *  is {@link TEST_DEFAULT_ROUTE}, not the real launch route — see its doc
 *  comment. */
export const initialAppState: AppState = {
  route: TEST_DEFAULT_ROUTE,
  engineVersion: null,
  selection: initialSelection,
};

/** Every action the app-shell reducer accepts. */
export type AppAction =
  | { type: "NAVIGATE"; route: RouteId }
  | { type: "SET_ENGINE_VERSION"; version: string }
  | { type: "SET_WINDOWS"; windows: Selection }
  | { type: "TOGGLE_WINDOW"; window: SelectionWindow; modifier: SelectionModifier }
  | { type: "SET_WINDOW_COLOUR"; index: number; colour: string };

/** Pure reducer — the unit-tested half of this module (CLAUDE.md §4: UI
 *  rendering is not unit-tested; this is not rendering). Holds no selection
 *  logic of its own: `TOGGLE_WINDOW` delegates to `selection.ts`'s
 *  `nextWindows`, and a caller minting a brand-new window picks its colour
 *  via `selection.ts`'s `assignColour` before dispatching. */
export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "NAVIGATE":
      return { ...state, route: action.route };
    case "SET_ENGINE_VERSION":
      return { ...state, engineVersion: action.version };
    case "SET_WINDOWS":
      return { ...state, selection: action.windows };
    case "TOGGLE_WINDOW":
      return { ...state, selection: nextWindows(state.selection, action.window, action.modifier) };
    case "SET_WINDOW_COLOUR":
      return {
        ...state,
        selection: state.selection.map((w, i) => (i === action.index ? { ...w, colour: action.colour } : w)),
      };
  }
}

const AppStateContext = createContext<[AppState, React.Dispatch<AppAction>] | null>(null);

/** The app's real launch route, resolved once at provider construction from
 *  the current window width and the remembered route in
 *  `shell/columnPrefs.ts` (`shell/launchLayout.ts`'s `initialRoute`; UI-4
 *  brief "The shell itself" — this replaces {@link TEST_DEFAULT_ROUTE} for
 *  everything except the tests that spread {@link initialAppState}
 *  directly). `window` is guarded for the SSR-less but still
 *  test-environment-safe case (vitest's default `node` environment has no
 *  `window`). */
function resolveLaunchState(): AppState {
  const widthPx = typeof window === "undefined" ? 1200 : window.innerWidth;
  const remembered = readColumnPrefs().lastRoute;
  return { ...initialAppState, route: initialRoute(widthPx, remembered) };
}

/** Provides `useAppState()` to every descendant via a `Context` +
 *  `useReducer` store (no external dependency — see this plan's Open
 *  Questions on state-management choice). The reducer's initial state is
 *  computed lazily (`useReducer`'s third argument) so `resolveLaunchState`
 *  runs once, at mount, not on every render. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const value = useReducer(appStateReducer, undefined, resolveLaunchState);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/** Reads the app-shell `[state, dispatch]` pair.
 *  @throws Error if called outside `<AppStateProvider>`. */
export function useAppState(): [AppState, React.Dispatch<AppAction>] {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
