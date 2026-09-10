import { createContext, useContext, useReducer, type ReactNode } from "react";

import {
  importQueueReducer,
  initialImportQueueState,
  type ImportQueueAction,
  type ImportQueueState,
} from "../routes/pages/Data/importQueue";

/** The import queue, lifted out of the Data tab's `ImportPanel` so the
 *  shell can show its status on every route (ruling R201 item 3). The
 *  reducer itself is unchanged and still lives beside the panel that
 *  drives it — this module only decides *where the state hangs*, not what
 *  it means. The driving effect stays in `ImportPanel.tsx`: every route is
 *  mount-and-hide (R93), so that effect keeps running while the user is on
 *  another tab, and there is exactly one driver either way. */
const ImportQueueContext = createContext<[ImportQueueState, (action: ImportQueueAction) => void] | null>(null);

/** Wraps the app shell so both the Data tab's panel and the shell's status
 *  chip read one queue. Mounted once, inside `AppStateProvider`. */
export function ImportQueueProvider({ children }: { children: ReactNode }) {
  const value = useReducer(importQueueReducer, initialImportQueueState);

  return <ImportQueueContext.Provider value={value}>{children}</ImportQueueContext.Provider>;
}

/** `[state, dispatch]` for the shared import queue. Throws outside the
 *  provider rather than falling back to a private queue: two queues would
 *  each run their own `import_file` at once, which R13 forbids, and the
 *  failure would show up as a memory-pressure stall rather than an error. */
export function useImportQueue(): [ImportQueueState, (action: ImportQueueAction) => void] {
  const value = useContext(ImportQueueContext);
  if (value === null) throw new Error("useImportQueue must be used inside an ImportQueueProvider");
  return value;
}
