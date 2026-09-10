import { AppStateProvider } from "./state/AppState";
import AppShell from "./shell/AppShell";
import DataRootGate from "./shell/DataRootGate";

/** Root of the idl1 UI: the missing-library gate, then the state provider
 *  and the app shell (`shell/AppShell.tsx` — bars, mount-and-hide routing,
 *  the wide column frame and the command palette, UI-4).
 *
 *  The gate is outermost on purpose (C4 §1 "Missing root", ruling R196): if
 *  the configured library folder is not there, no tab should mount, because
 *  every one of them would render an empty library over a real one that is
 *  merely offline. */
export default function App() {
  return (
    <DataRootGate>
      <AppStateProvider>
        <AppShell />
      </AppStateProvider>
    </DataRootGate>
  );
}
