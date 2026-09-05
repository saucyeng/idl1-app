import { useReducer, useRef, useState } from "react";

import { downloadFile, listDeviceFiles } from "../../../ipc/device";
import type { DeviceIpcError } from "./errors";
import { describeIpcError } from "./errors";
import {
  downloadReducer,
  formatTransferRate,
  initialFilesState,
  isDownloadActive,
  newCount,
  toFileViews,
  type DownloadItem,
} from "./files";

/** Props for {@link DeviceFiles}. */
export interface DeviceFilesProps {
  /** The BLE device id `listDeviceFiles`/`downloadFile` act on. */
  deviceId: string;
  /** Session ids the catalog already knows about (`listSessions`,
   *  `app/src/ipc/catalog.ts`, C3 §3.2), sourced by `index.tsx` — this
   *  component never calls catalog IPC itself (R53 Device Q3: no
   *  cross-tab import handoff, and no cross-tab IPC ownership either). */
  knownSessionIds: Set<string>;
}

/** Lifecycle of the file-list fetch, separate from the download queue
 *  (`FilesState`) — listing and downloading fail independently. */
type ListPhase = "idle" | "loading" | "loaded" | "failed";

/** Renders one `DownloadItem`'s progress/result line. */
function DownloadRow({ item, elapsedMs }: { item: DownloadItem; elapsedMs: number }) {
  if (item.status === "done") {
    return (
      <li>
        {item.name}: downloaded ({item.sha256?.slice(0, 12)}…) — import it from the Data tab.
      </li>
    );
  }
  if (item.status === "failed") {
    return (
      <li role="alert">
        {item.name}: failed — {item.error}
      </li>
    );
  }
  const rate = formatTransferRate(item.doneBytes, elapsedMs);
  const total = item.totalBytes === null ? "" : ` / ${item.totalBytes} bytes`;
  return (
    <li>
      {item.name}: {item.status === "downloading" ? "downloading" : "queued"} — {item.doneBytes} bytes{total} ({rate})
    </li>
  );
}

/**
 * The Device tab's file list and download queue (plan Task 9, SPEC
 * §24.17). Lists files only on explicit user action (a **List files**
 * button, never an effect that fires on mount or on a dependency change —
 * standing reviewer brief's IPC-effects rule) and downloads **one file at
 * a time**: the **Download** button on every row is disabled while
 * `isDownloadActive(queue)` holds.
 *
 * A completed download lands a blob under `<data>/blobs/sha256/`
 * (`DownloadResult`, C3 §3.8) — this component never imports it itself.
 * R53 Device Q3: there is no cross-tab handoff in wave 2, so the row's
 * text tells the rider the file is downloaded and to import it from the
 * Data tab.
 */
export default function DeviceFiles({ deviceId, knownSessionIds }: DeviceFilesProps) {
  const [listPhase, setListPhase] = useState<ListPhase>("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(downloadReducer, initialFilesState);
  // Per-item download start time, for `formatTransferRate`. Not reducer
  // state: it is wall-clock bookkeeping for display only, never a value
  // `downloadReducer`'s tests need to reproduce.
  const startedAtMsRef = useRef<Map<string, number>>(new Map());
  const [, forceTick] = useState(0);

  function onListFiles(): void {
    setListPhase("loading");
    setListError(null);
    listDeviceFiles(deviceId)
      .then((files) => {
        dispatch({ type: "FILES_LOADED", files: toFileViews(files, knownSessionIds) });
        setListPhase("loaded");
      })
      .catch((err: DeviceIpcError) => {
        setListError(describeIpcError(err));
        setListPhase("failed");
      });
  }

  function onDownload(name: string): void {
    if (isDownloadActive(state.queue)) return; // one at a time; button is disabled anyway
    dispatch({ type: "ENQUEUE", name });
    startedAtMsRef.current.set(name, Date.now());
    downloadFile(deviceId, name, (progress) => {
      dispatch({ type: "PROGRESS", name, progress });
      forceTick((n) => n + 1); // re-render so the elapsed-time-derived rate updates
    })
      .then((result) => {
        dispatch({ type: "SUCCEEDED", name, result });
      })
      .catch((err: DeviceIpcError) => {
        dispatch({ type: "FAILED", name, error: describeIpcError(err) });
      });
  }

  const active = isDownloadActive(state.queue);

  return (
    <section className="device-files">
      <button type="button" onClick={onListFiles} disabled={listPhase === "loading"}>
        {listPhase === "loading" ? "Listing…" : "List files"}
      </button>
      {listPhase === "failed" && listError && <p role="alert">{listError}</p>}
      {listPhase === "loaded" && <p role="status">{newCount(state.files)} new of {state.files.length} files</p>}
      <ul>
        {state.files.map((file) => (
          <li key={file.name}>
            {file.name} ({file.size_bytes} bytes){file.isNew ? " — new" : " — in library"}{" "}
            <button type="button" onClick={() => onDownload(file.name)} disabled={active}>
              Download
            </button>
          </li>
        ))}
      </ul>
      <ul className="device-files__queue">
        {state.queue.map((item) => (
          <DownloadRow key={item.name} item={item} elapsedMs={Date.now() - (startedAtMsRef.current.get(item.name) ?? Date.now())} />
        ))}
      </ul>
    </section>
  );
}
