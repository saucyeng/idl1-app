import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { RouteId } from "../routes/types";

/** App-shell state: the current tab plus the two values every tab may need
 *  (engine version, for a footer/about display; resolved <data> path, for
 *  Settings). L6/L7 extend this shape with their own slices (workbook
 *  handle, selection model, …) rather than inventing a second store — see
 *  this plan's Open Questions on when a heavier state library is justified. */
export interface AppState {
  route: RouteId;
  engineVersion: string | null;
}

/** The app's state before `engine_version` resolves (M0: `fetchEngineVersion`
 *  populates it on mount). */
export const initialAppState: AppState = { route: "notebook", engineVersion: null };

/** Every action the app-shell reducer accepts. */
export type AppAction =
  | { type: "NAVIGATE"; route: RouteId }
  | { type: "SET_ENGINE_VERSION"; version: string };

/** Pure reducer — the unit-tested half of this module (CLAUDE.md §4: UI
 *  rendering is not unit-tested; this is not rendering). */
export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "NAVIGATE":
      return { ...state, route: action.route };
    case "SET_ENGINE_VERSION":
      return { ...state, engineVersion: action.version };
  }
}

const AppStateContext = createContext<[AppState, React.Dispatch<AppAction>] | null>(null);

/** Provides `useAppState()` to every descendant via a `Context` +
 *  `useReducer` store (no external dependency — see this plan's Open
 *  Questions on state-management choice). */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const value = useReducer(appStateReducer, initialAppState);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/** Reads the app-shell `[state, dispatch]` pair.
 *  @throws Error if called outside `<AppStateProvider>`. */
export function useAppState(): [AppState, React.Dispatch<AppAction>] {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
