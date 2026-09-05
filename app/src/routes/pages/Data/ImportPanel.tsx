import { useEffect, useReducer, useRef, useState } from "react";

import { importFile, listImporters, type ImporterInfo } from "../../../ipc/import";
import { describeIpcError } from "./errors";
import { pickImportFile } from "./FilePicker";
import { isDrained, nextItemToStart, runImport } from "./importDriver";
import { importQueueReducer, initialImportQueueState, overallPercent, type ImportItem } from "./importQueue";

/** @param onImported Called once every time the queue drains (every item
 *  reaches `"done"`/`"failed"`) after having had at least one active item —
 *  never on first render with an empty queue. The Data tab passes its
 *  `listSessions()` refresh so newly imported sessions appear without a
 *  manual reload (settle-bound: once per drain, not per file). */
interface ImportPanelProps {
  onImported: () => void;
}

/** One line of the queue: path, status, and (while running) phase + a
 *  count. Dismiss is only offered once the item is terminal — the reducer
 *  refuses to remove a `"queued"`/`"running"` item. */
function ImportRow({ item, onDismiss }: { item: ImportItem; onDismiss: () => void }) {
  const countText = item.total !== null ? `${item.done}/${item.total}` : `${item.done}`;

  return (
    <li>
      <span>{item.path}</span>{" "}
      <span>
        {item.status}
        {item.status === "running" ? ` — ${item.phase} (${countText})` : ""}
      </span>
      {item.status === "failed" && item.error !== undefined && <span role="alert"> {item.error}</span>}
      {(item.status === "done" || item.status === "failed") && (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </li>
  );
}

/** The Data tab's import entry point over C3 §3.3's `import_file`/
 *  `list_importers`. Wave 2's picker is a pasted absolute path (lead
 *  ruling R55, `FilePicker.ts`'s `pickImportFile` seam) rather than a
 *  native dialog. Files run **one at a time, serialised** (R13: this
 *  machine is memory-bound, import is CPU/I/O-heavy) — the driving effect
 *  below never starts a second `importFile` call while one is
 *  `"running"`. `import_file`/`list_importers` are real C3 §3.3 commands
 *  whose Rust side lands with L5 Task 9; until then both reject and the
 *  panel shows that honestly through `describeIpcError`, not as a stub. */
export function ImportPanel({ onImported }: ImportPanelProps) {
  const [state, dispatch] = useReducer(importQueueReducer, initialImportQueueState);
  const [importers, setImporters] = useState<ImporterInfo[]>([]);
  const [importersErrorText, setImportersErrorText] = useState<string | null>(null);
  const [pastedPath, setPastedPath] = useState("");
  const [importerId, setImporterId] = useState<string | null>(null);
  const drainedAtLengthRef = useRef(0);

  // Populates the forced-importer override menu. A rejection here (e.g.
  // `list_importers` not yet landed) only disables the override, never the
  // panel — `null` (auto-detect) still works.
  useEffect(() => {
    let cancelled = false;

    listImporters()
      .then((list) => {
        if (cancelled) return;
        setImporters(list);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setImportersErrorText(describeIpcError(e).text);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Drives the queue: starts the next "queued" item whenever nothing is
  // "running", and fires `onImported` once when every item has reached a
  // terminal status (guarded by `drainedAtLengthRef` so it fires once per
  // drain, not once per item). Deliberately has no cleanup that cancels an
  // in-flight `runImport` call: this effect's own `START`/`PROGRESS`/
  // `SUCCEEDED`/`FAILED` dispatches all change `state`, which re-runs this
  // very effect, and an effect that tears down "the import I'm babysitting"
  // on every dependency change can never let one complete (review-task5
  // Critical) — `nextItemToStart` already refuses to start a second item
  // while one is `"running"`, which is all the guarding this needs.
  useEffect(() => {
    const item = nextItemToStart(state);
    if (item === null) {
      if (isDrained(state) && state.items.length !== drainedAtLengthRef.current) {
        drainedAtLengthRef.current = state.items.length;
        onImported();
      }
      return;
    }

    runImport(item, importFile, dispatch);
  }, [state, onImported]);

  const handleImportClick = () => {
    pickImportFile(pastedPath)
      .then((path) => {
        if (path === null) return;
        dispatch({ type: "ENQUEUE", path, importerId });
        setPastedPath("");
      })
      .catch(() => {
        // pickImportFile never rejects in wave 2 (it only trims text); kept
        // so a future dialog-backed implementation (user cancels the
        // native picker) has somewhere safe to resolve/reject into.
      });
  };

  const percent = overallPercent(state);

  return (
    <div className="import-panel">
      <label>
        Paste a file path{" "}
        <input
          type="text"
          value={pastedPath}
          onChange={(e) => setPastedPath(e.target.value)}
          placeholder="C:\path\to\file.idl0"
        />
      </label>
      <label>
        Importer{" "}
        <select value={importerId ?? ""} onChange={(e) => setImporterId(e.target.value === "" ? null : e.target.value)}>
          <option value="">Auto-detect</option>
          {importers.map((importer) => (
            <option key={importer.id} value={importer.id}>
              {importer.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={handleImportClick} disabled={pastedPath.trim().length === 0}>
        Import
      </button>
      {importersErrorText !== null && <p role="alert">{importersErrorText}</p>}
      {percent !== null && <progress value={percent} max={100} />}
      {state.items.length > 0 && (
        <ul>
          {state.items.map((item) => (
            <ImportRow key={item.id} item={item} onDismiss={() => dispatch({ type: "DISMISS", id: item.id })} />
          ))}
        </ul>
      )}
    </div>
  );
}
