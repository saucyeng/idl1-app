import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { getDataDir, setDataDir } from "../ipc/app";
import { pickLibraryFolder } from "../routes/pages/Settings/moveLibrary";
import { describeMissingDataRoot, missingDataRootFrom, type MissingDataRoot } from "./missingDataRoot";

/** Props for {@link DataRootGate}. */
export interface DataRootGateProps {
  /** The app, rendered only once the library is known to be openable. */
  children: ReactNode;
}

/** What the gate is showing. `"checking"` is the one-IPC startup probe;
 *  `"open"` hands the app through; `"restart"` is the terminal state after
 *  the user fixes the problem, because the `<data>` root is resolved once
 *  per process (C4 §1) and this process resolved it before the fix. */
type GateState =
  | { status: "checking" }
  | { status: "open" }
  | { status: "missing"; root: MissingDataRoot; busy: boolean; note: string | null }
  | { status: "restart"; message: string };

/** Blocks the whole app when the configured `<data>` root is unavailable
 *  (C4 §1 "Missing root", ruling R196).
 *
 *  The engine refuses to open a missing override rather than falling back to
 *  the platform default, so the alternative to this screen is not "a working
 *  app" — it is an app whose every screen is empty and whose next import
 *  writes a second library somewhere the user did not choose. The probe is
 *  `getDataDir`, which re-resolves the override and rejects with `io` +
 *  `detail.reason === "missing_root"` for exactly this case.
 *
 *  Both recoveries end at "restart", deliberately. `<data>` is resolved once
 *  at startup and cached for the process lifetime, and the library
 *  subsystems that would have used it (the inbox watcher, LAN sync) were not
 *  started this launch. Waving the user back into a half-started app to save
 *  one relaunch is not worth the class of bug it invites. */
export default function DataRootGate({ children }: DataRootGateProps) {
  const [state, setState] = useState<GateState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    getDataDir()
      .then(() => {
        if (!cancelled) {
          setState({ status: "open" });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const root = missingDataRootFrom(error);
        // Any other rejection is not this condition, and blocking the app on
        // it would hide a working library behind the wrong diagnosis.
        setState(root === null ? { status: "open" } : { status: "missing", root, busy: false, note: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleRetry(root: MissingDataRoot): void {
    setState({ status: "missing", root, busy: true, note: null });
    void getDataDir()
      .then(() => {
        setState({
          status: "restart",
          message: `"${root.path}" is available again. Restart idl1 to open your library.`,
        });
      })
      .catch((error: unknown) => {
        const stillMissing = missingDataRootFrom(error);
        setState({
          status: "missing",
          root: stillMissing ?? root,
          busy: false,
          note:
            stillMissing === null
              ? "That folder could not be opened. See the error above and try again."
              : "That folder is still not available.",
        });
      });
  }

  function handleChooseFolder(root: MissingDataRoot): void {
    setState({ status: "missing", root, busy: true, note: null });
    void pickLibraryFolder(root.path)
      .then((chosen) => {
        if (chosen === null) {
          setState({ status: "missing", root, busy: false, note: null });
          return;
        }
        return setDataDir(chosen).then(() => {
          setState({
            status: "restart",
            message:
              `idl1 will use "${chosen}" from now on. Restart it to open your library there. ` +
              `Nothing was copied — anything still in "${root.path}" stays where it is.`,
          });
        });
      })
      .catch(() => {
        setState({
          status: "missing",
          root,
          busy: false,
          note: "That folder could not be used. Choose a different one.",
        });
      });
  }

  if (state.status === "checking") {
    return null;
  }

  if (state.status === "open") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="flex max-w-xl flex-col gap-4 border-l border-rule pl-4">
        <h1 className="font-mono text-sm uppercase tracking-[var(--tracking-label)] text-brand-accent">
          Library unavailable
        </h1>
        {state.status === "restart" ? (
          <p className="font-mono text-sm text-fg">{state.message}</p>
        ) : (
          <>
            <p className="font-mono text-sm text-fg">{describeMissingDataRoot(state.root)}</p>
            <p className="font-mono text-xs text-fg-dim">{state.root.path}</p>
            {state.note ? <p className="font-mono text-xs text-brand-accent">{state.note}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                emphasis="good"
                filled
                disabled={state.busy}
                onClick={() => handleRetry(state.root)}
              >
                Retry
              </Button>
              <Button type="button" disabled={state.busy} onClick={() => handleChooseFolder(state.root)}>
                Choose folder…
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
