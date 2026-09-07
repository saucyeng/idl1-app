import { useEffect } from "react";
import { fetchEngineVersion } from "./ipc/engine";
import { AppStateProvider, useAppState } from "./state/AppState";
import { ROUTES } from "./routes/types";
import NotebookPage from "./routes/pages/Notebook";
import DevicePage from "./routes/pages/Device";
import DataPage from "./routes/pages/Data";
import SettingsPage from "./routes/pages/Settings";

/** The four-tab shell: nav + the active tab's page, sourced from
 *  `useAppState()`. Fetches the engine version once on mount (C3 §3.1). */
function Shell() {
  const [state, dispatch] = useAppState();

  useEffect(() => {
    fetchEngineVersion().then((v) => dispatch({ type: "SET_ENGINE_VERSION", version: v }));
  }, [dispatch]);

  const page = {
    notebook: <NotebookPage />,
    device: <DevicePage />,
    data: <DataPage />,
    settings: <SettingsPage />,
  }[state.route];

  return (
    <main className="idl1-root">
      <nav>
        {ROUTES.map((r) => (
          <button key={r.id} onClick={() => dispatch({ type: "NAVIGATE", route: r.id })} disabled={state.route === r.id}>
            {r.label}
          </button>
        ))}
      </nav>
      <p>Engine {state.engineVersion ?? "…"}</p>
      {page}
    </main>
  );
}

/** Root of the idl1 UI: state provider + the four-tab shell. */
export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
