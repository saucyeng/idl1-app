import { getCurrentWebview } from "@tauri-apps/api/webview";
import { UploadIcon } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { toastFor } from "../../../components/toasts/events";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { importFile, listImporters, type ImporterInfo } from "../../../ipc/import";
import { scanFolder } from "../../../ipc/library";
import { describeIpcError } from "./errors";
import { pickImportFile, pickImportFolder, resolvePastedPath } from "./FilePicker";
import { importableRows, summarizeScanPreview, toScanPreviewRows, type ScanPreviewRow } from "./libraryPanel";
import { isDrained, nextItemToStart, runImport } from "./importDriver";
import { importQueueReducer, initialImportQueueState, overallPercent, type ImportItem, type ImportQueueAction } from "./importQueue";

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
    <li className="flex flex-col gap-0.5 border-b border-rule py-1.5 font-mono text-sm last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-fg">{item.path}</span>
        <span className="shrink-0 text-fg-dim">
          {item.status}
          {item.status === "running" ? ` — ${item.phase} (${countText})` : ""}
        </span>
        {(item.status === "done" || item.status === "failed") && (
          <Button type="button" size="xs" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      {item.status === "failed" && item.error !== undefined && (
        <span role="alert" className="text-brand-accent">
          {item.error}
        </span>
      )}
      {item.status === "done" && item.warnings !== undefined && item.warnings.length > 0 && (
        <ul className="pl-3 text-fg-dim">
          <li>
            imported with {item.warnings.length} warning{item.warnings.length === 1 ? "" : "s"}
          </li>
          {item.warnings.map((warning, index) => (
            // Warning text has no stable id of its own — index is safe here
            // because this list is only ever rendered once, on a terminal,
            // no-longer-mutating item.
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Shows `toastFor`'s descriptor (UI-DIRECTION decision 21) via `sonner`'s
 *  `toast`, picking sonner's method from the descriptor's tone. The only
 *  toast call site in the Data tab — an import failure, fired once per
 *  failed item from the queue-driving effect's own dispatch wrapper below,
 *  never from `importQueue.ts`/`importDriver.ts` themselves (neither module
 *  knows about toasts). */
function showImportFailedToast(fileName: string, message: string): void {
  const descriptor = toastFor({ kind: "importFailed", fileName, message });
  const show = descriptor.tone === "accent" ? toast.error : descriptor.tone === "good" ? toast.success : toast.info;
  show(descriptor.title, { description: descriptor.detail });
}

/** The "Import folder…" preview's own fetch state (C3 §3.3 `scan_folder`).
 *  Independent of the import queue: a scan failure narrows the panel to its
 *  other entry points rather than disturbing files already queued. */
type ScanState =
  | { status: "idle" }
  | { status: "scanning"; folder: string }
  | { status: "ready"; folder: string; rows: ScanPreviewRow[] }
  | { status: "error"; text: string };

/** One preview row: name, size, importer and header-peek start. An
 *  already-imported or unsupported file is greyed and never enqueued —
 *  shown rather than hidden, because "what is in this folder" is the
 *  question the preview answers. */
function ScanPreviewLine({ row }: { row: ScanPreviewRow }) {
  return (
    <li className={`flex items-center gap-2 border-b border-rule py-1 last:border-b-0 ${row.importable ? "text-fg" : "text-fg-dim"}`}>
      <span className="flex-1 truncate">{row.fileName}</span>
      <span className="shrink-0">{row.sizeText}</span>
      <span className="w-16 shrink-0">{row.importerText}</span>
      <span className="w-40 shrink-0 truncate">{row.startText}</span>
      <span className="w-32 shrink-0">{row.skipReason ?? ""}</span>
    </li>
  );
}

/** The Data tab's import entry point over C3 §3.3's `import_file`/
 *  `list_importers`. Two ways in, per lead ruling R55/R77.1
 *  (2026-09-06): the "Paste a file path" field's `Import` button imports
 *  that text directly and verbatim, no dialog round trip (the original
 *  wave-2 contract, restored); the separate `Browse…` button opens the
 *  native file dialog (`FilePicker.ts`'s `pickImportFile` seam, now backed
 *  by `@tauri-apps/plugin-dialog`'s `open()`) filtered to the four importer
 *  extensions, optionally seeded from whatever is currently pasted as its
 *  starting folder. A third way in is a native OS file drop anywhere over
 *  the window (Tauri's own `onDragDropEvent`, C3 has no wire shape here —
 *  this is a desktop windowing event, not an IPC command): every dropped
 *  path enqueues exactly like a pasted path, through the same
 *  `importQueueReducer`/`runImport` this component already drives — no
 *  second queue. Files run **one at a time, serialised** (R13: this machine
 *  is memory-bound, import is CPU/I/O-heavy) — the driving effect below
 *  never starts a second `importFile` call while one is `"running"`. */
export function ImportPanel({ onImported }: ImportPanelProps) {
  const [state, dispatch] = useReducer(importQueueReducer, initialImportQueueState);
  const [importers, setImporters] = useState<ImporterInfo[]>([]);
  const [importersErrorText, setImportersErrorText] = useState<string | null>(null);
  const [pastedPath, setPastedPath] = useState("");
  const [importerId, setImporterId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [scanState, setScanState] = useState<ScanState>({ status: "idle" });
  const drainedAtLengthRef = useRef(0);
  const importerIdRef = useRef(importerId);
  importerIdRef.current = importerId;

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

  // The window-level native file drop (no per-element DOM drop target — a
  // Tauri `DragDropEvent` fires for the whole webview, not a specific
  // node, so the results panel's "drop target" is this component's overlay
  // rendered while `dragActive`, not a scoped `onDrop` handler). Mount-only
  // subscription, unlistened on unmount; `importerIdRef` avoids
  // resubscribing every time the override menu selection changes.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragActive(true);
        } else if (event.payload.type === "leave") {
          setDragActive(false);
        } else if (event.payload.type === "drop") {
          setDragActive(false);
          for (const path of event.payload.paths) {
            dispatch({ type: "ENQUEUE", path, importerId: importerIdRef.current });
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        // No webview to listen on (e.g. this build isn't running inside
        // Tauri) — drag-and-drop just isn't available; paste/Browse still
        // work.
      });

    return () => {
      cancelled = true;
      unlisten?.();
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
  // while one is `"running"`, which is all the guarding this needs. The
  // dispatch wrapper below is the toast call site (decision 21): a `FAILED`
  // action still reaches the real reducer unchanged, `showImportFailedToast`
  // is only ever additional to that.
  useEffect(() => {
    const item = nextItemToStart(state);
    if (item === null) {
      if (isDrained(state) && state.items.length !== drainedAtLengthRef.current) {
        drainedAtLengthRef.current = state.items.length;
        onImported();
      }
      return;
    }

    const dispatchAndToast = (action: ImportQueueAction) => {
      dispatch(action);
      if (action.type === "FAILED") {
        showImportFailedToast(item.path, describeIpcError(action.error).text);
      }
    };

    runImport(item, importFile, dispatchAndToast);
  }, [state, onImported]);

  /** "Import" click: the pasted path, trimmed and used verbatim — no
   *  dialog round trip. Synchronous and infallible ([[resolvePastedPath]]
   *  only trims text), unlike [[handleBrowseClick]] below. */
  const handleImportClick = () => {
    const path = resolvePastedPath(pastedPath);
    if (path === null) return;
    dispatch({ type: "ENQUEUE", path, importerId });
    setPastedPath("");
  };

  /** "Browse…" click: opens the native file dialog, optionally seeded from
   *  whatever is currently pasted, and enqueues the chosen file. Resolving
   *  to `null` means the user cancelled — not an error, nothing to enqueue. */
  const handleBrowseClick = () => {
    pickImportFile(pastedPath)
      .then((path) => {
        if (path === null) return; // user cancelled the native dialog
        dispatch({ type: "ENQUEUE", path, importerId });
        setPastedPath("");
      })
      .catch((e: unknown) => {
        setImportersErrorText(describeIpcError(e).text);
      });
  };

  /** "Import folder…" click: picks a folder, scans it (C3 §3.3
   *  `scan_folder` — non-recursive, nothing imported yet) and shows the
   *  preview. The scan hashes every file to answer `already_imported`, so
   *  it can be slow on a folder of large files; it runs once per pick,
   *  never on a timer (ruling R191). */
  const handleFolderClick = () => {
    pickImportFolder(pastedPath)
      .then((folder) => {
        if (folder === null) return; // user cancelled the native dialog
        setScanState({ status: "scanning", folder });
        return scanFolder(folder).then((entries) => {
          setScanState({ status: "ready", folder, rows: toScanPreviewRows(entries) });
        });
      })
      .catch((e: unknown) => {
        setScanState({ status: "error", text: describeIpcError(e).text });
      });
  };

  /** Enqueues every importable row of the current preview, one
   *  `import_file` per file through the queue this panel already drives
   *  (C3 §3.3 has no bulk-import command by design, R191: progress and
   *  errors stay per file). Each row goes in with the importer the scan
   *  detected for that file, never the panel's single-file override menu —
   *  one dropdown cannot describe a folder holding two formats. */
  const handleImportPreviewClick = () => {
    if (scanState.status !== "ready") return;
    for (const row of importableRows(scanState.rows)) {
      dispatch({ type: "ENQUEUE", path: row.path, importerId: row.importerId });
    }
    setScanState({ status: "idle" });
  };

  const percent = overallPercent(state);

  return (
    <div className="relative flex flex-col gap-2">
      {dragActive && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-2 border-dashed border-good bg-bg/80"
        >
          <p className="font-mono text-sm text-good">Drop to import</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          className="w-64"
          value={pastedPath}
          onChange={(e) => setPastedPath(e.target.value)}
          placeholder="C:\path\to\file.idl0"
          aria-label="Paste a file path"
        />
        <Select value={importerId ?? "auto"} onValueChange={(v) => setImporterId(v === "auto" ? null : v)}>
          <SelectTrigger size="sm" aria-label="Importer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            {importers.map((importer) => (
              <SelectItem key={importer.id} value={importer.id}>
                {importer.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={handleImportClick} disabled={pastedPath.trim().length === 0}>
          Import
        </Button>
        <Button type="button" size="sm" onClick={handleFolderClick} className="ml-auto">
          Import folder…
        </Button>
        <Button type="button" size="sm" emphasis="good" filled onClick={handleBrowseClick}>
          <UploadIcon /> Browse…
        </Button>
      </div>
      {scanState.status === "scanning" && (
        <p className="font-mono text-sm text-fg-dim">Scanning {scanState.folder}…</p>
      )}
      {scanState.status === "error" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {scanState.text}
        </p>
      )}
      {scanState.status === "ready" && (
        <div role="region" aria-label="Folder import preview" className="flex flex-col gap-1 border border-rule p-2">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="flex-1 truncate text-fg-dim">{summarizeScanPreview(scanState.rows)}</span>
            <Button
              type="button"
              size="xs"
              emphasis="good"
              filled
              onClick={handleImportPreviewClick}
              disabled={importableRows(scanState.rows).length === 0}
            >
              Import {importableRows(scanState.rows).length} files
            </Button>
            <Button type="button" size="xs" onClick={() => setScanState({ status: "idle" })}>
              Cancel
            </Button>
          </div>
          <ul className="flex max-h-64 flex-col overflow-y-auto font-mono text-sm">
            {scanState.rows.map((row) => (
              <ScanPreviewLine key={row.path} row={row} />
            ))}
          </ul>
        </div>
      )}
      {importersErrorText !== null && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {importersErrorText}
        </p>
      )}
      {percent !== null && (
        <progress className="h-1 w-full accent-good" value={percent} max={100} />
      )}
      {state.items.length > 0 && <ul className="flex flex-col">{state.items.map((item) => (
        <ImportRow key={item.id} item={item} onDismiss={() => dispatch({ type: "DISMISS", id: item.id })} />
      ))}</ul>}
    </div>
  );
}
