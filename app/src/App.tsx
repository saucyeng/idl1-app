import { AppStateProvider } from "./state/AppState";
import AppShell from "./shell/AppShell";

/** Root of the idl1 UI: state provider + the app shell (`shell/AppShell.tsx`
 *  — bars, mount-and-hide routing, the wide column frame and the command
 *  palette, UI-4). */
export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
