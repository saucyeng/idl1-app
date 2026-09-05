import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { RouteId } from "../routes/types";

/** The main lap plus zero or more overlay laps chosen for a session, passed
 *  through unchanged to `eval_workbook`'s `lap_context` argument (R52 Q5) —
 *  a UI selection, not file content, so it lives here rather than in the
 *  workbook itself. */
export interface LapContext {
  mainLap: number;
  overlayLaps: number[];
}

/** The session and lap selection shared across tabs: the Data tab writes
 *  this slice, the Notebook reads it to drive `eval_workbook` (R53 Data
 *  Q3). Supersedes R52 Q9(iii)'s bare `activeSessionId`. */
export interface Selection {
  sessionId: string | null;
  lapContext: LapContext | null;
}

/** The `Selection` slice's value before any session is chosen. */
export const initialSelection: Selection = { sessionId: null, lapContext: null };

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

/** The app's state before `engine_version` resolves (M0: `fetchEngineVersion`
 *  populates it on mount) and before any session is selected. */
export const initialAppState: AppState = {
  route: "notebook",
  engineVersion: null,
  selection: initialSelection,
};

/** Every action the app-shell reducer accepts. */
export type AppAction =
  | { type: "NAVIGATE"; route: RouteId }
  | { type: "SET_ENGINE_VERSION"; version: string }
  | { type: "SET_SELECTED_SESSION"; sessionId: string | null }
  | { type: "SET_LAP_CONTEXT"; lapContext: LapContext | null };

/** Pure reducer — the unit-tested half of this module (CLAUDE.md §4: UI
 *  rendering is not unit-tested; this is not rendering). */
export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "NAVIGATE":
      return { ...state, route: action.route };
    case "SET_ENGINE_VERSION":
      return { ...state, engineVersion: action.version };
    case "SET_SELECTED_SESSION":
      // A new (or cleared) session invalidates any lap chosen for the old one.
      return { ...state, selection: { sessionId: action.sessionId, lapContext: null } };
    case "SET_LAP_CONTEXT":
      return { ...state, selection: { ...state.selection, lapContext: action.lapContext } };
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
