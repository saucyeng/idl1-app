import { useState } from "react";

import type { RebuildReport } from "../../../../ipc/catalog";
import type { IpcError } from "../../../../ipc/workbook";
import type { WorkbookEntry } from "../model/workbookEntry";

/** Props for {@link WorkbookBar}. */
export interface WorkbookBarProps {
  /** `null` while the first list is still in flight. */
  entry: WorkbookEntry | null;
  /** True while `rebuild_catalog` is running (either the automatic one or
   *  the Rescan button's) — disables both actions and shows progress. */
  rescanning: boolean;
  /** True while `create_workbook` is in flight. */
  creating: boolean;
  /** True while the open document has unsaved edits (`dirtyCellIds.size >
   *  0`) — disables the picker (R81 Q5(a)) so switching documents can
   *  never silently discard local edits. */
  dirty: boolean;
  /** The last `rebuild_catalog` / `create_workbook` failure, typed
   *  (`IpcError` from `ipc/workbook.ts`), or `null`. Never a bare string. */
  error: IpcError | null;
  /** The last rebuild's counts, for the "Rescan found N workbooks" line. */
  lastRebuild: RebuildReport | null;
  onCreate: (name: string) => void;
  onRescan: () => void;
  onSelect: (workbookId: string) => void;
}

/**
 * The Notebook's workbook-chrome surface (L6 Task 21, R66 item 3): the
 * empty state ("New workbook" + "Rescan"), and, once more than one
 * workbook is indexed, a `<select>` naming the open document. Holds no IPC
 * and no decisions — every decision (which workbook opens, whether a
 * picker or the empty state shows) lives in `model/workbookEntry.ts`'s
 * `chooseWorkbookEntry`; this component only renders the `WorkbookEntry`
 * it is given plus the callbacks its buttons/select invoke.
 *
 * "Looking for workbooks…" (a `null` `entry`) covers both the very first
 * `list_workbooks` call and the one automatic `rebuild_catalog` an empty
 * result triggers (R81 Q1(a)), so a genuinely empty install's one-time
 * rebuild cost is not mistaken for a hang.
 */
export default function WorkbookBar({ entry, rescanning, creating, dirty, error, lastRebuild, onCreate, onRescan, onSelect }: WorkbookBarProps) {
  const [newName, setNewName] = useState("");

  if (entry === null) {
    return <p className="workbook-bar-loading">Looking for workbooks…</p>;
  }

  const rebuildLine =
    lastRebuild !== null ? (
      <p className="workbook-bar-rebuild-report">
        Rescan found {lastRebuild.workbooks_indexed} workbook(s) in {lastRebuild.duration_ms} ms. The whole catalog
        was rebuilt, not only workbooks.
      </p>
    ) : null;

  const errorLine = error !== null ? <p role="alert">{error.message}</p> : null;

  function submitCreate() {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    onCreate(trimmed);
    setNewName("");
  }

  if (entry.kind === "empty") {
    return (
      <div className="workbook-bar workbook-bar-empty">
        <p>No workbooks yet.</p>
        <div className="workbook-bar-create">
          <label htmlFor="notebook-new-workbook-name">New workbook name</label>
          <input
            id="notebook-new-workbook-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
            }}
          />
          <button type="button" onClick={submitCreate} disabled={creating || newName.trim().length === 0}>
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
        <div className="workbook-bar-rescan">
          <button type="button" onClick={onRescan} disabled={rescanning}>
            {rescanning ? "Rescanning…" : "Rescan"}
          </button>
          <p>A workbook file copied into the `workbooks` folder appears here after a rescan.</p>
        </div>
        {rebuildLine}
        {errorLine}
      </div>
    );
  }

  // `entry.kind === "single" | "choice"` — both render New workbook + Rescan
  // in a compact form (a second workbook has to be creatable from a
  // non-empty notebook too), plus the picker only when there is more than
  // one indexed workbook (R81 Q4(a)).
  return (
    <div className="workbook-bar workbook-bar-nonempty">
      {entry.kind === "choice" && (
        <label className="workbook-bar-picker">
          Workbook
          <select
            value={entry.workbookId}
            disabled={dirty}
            onChange={(e) => onSelect(e.target.value)}
          >
            {entry.choices.map((choice) => (
              <option key={choice.workbook_id} value={choice.workbook_id}>
                {choice.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {entry.kind === "choice" && dirty && <span className="workbook-bar-picker-hint">Save your edits before switching workbooks.</span>}
      <div className="workbook-bar-create workbook-bar-create-compact">
        <label htmlFor="notebook-new-workbook-name">New workbook name</label>
        <input
          id="notebook-new-workbook-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCreate();
          }}
        />
        <button type="button" onClick={submitCreate} disabled={creating || newName.trim().length === 0}>
          {creating ? "Creating…" : "Create"}
        </button>
      </div>
      <button type="button" onClick={onRescan} disabled={rescanning}>
        {rescanning ? "Rescanning…" : "Rescan"}
      </button>
      {rebuildLine}
      {errorLine}
    </div>
  );
}
