import { useEffect, useState } from "react";

import { describeOverrideChange, validateDataDir, type ValidationIssue } from "./dataDir";
import { describeIpcError, type IpcErrorLike } from "./errors";
import { getDataDir, NotImplementedError, setDataDir, type DataDirInfo } from "./ipcStubs";
import type { PrefsStore } from "./prefsStore";

/** Props for {@link DataSection}. Follows {@link ProfileSection}'s
 *  `{ store: PrefsStore }` shape for consistency across sections, even
 *  though this section's main content comes from the `getDataDir` stub
 *  rather than `store`. */
export interface DataSectionProps {
  /** Unused by this section's own content; kept for prop-shape consistency
   *  with the other sections. */
  store: PrefsStore;
}

/** Narrows an unknown rejection reason to C3 §2's `IpcError` shape, as this
 *  tab sees it (`errors.ts`'s {@link IpcErrorLike}). */
function isIpcErrorLike(error: unknown): error is IpcErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof (error as { kind: unknown }).kind === "string" &&
    "message" in error
  );
}

/** Turns a rejection from `getDataDir`/`setDataDir` into user-facing text.
 *  Distinguishes a {@link NotImplementedError} (this stub always rejects
 *  with one, in wave 2) from a real {@link IpcErrorLike} the eventual
 *  command would raise, so the copy says "not built yet" rather than
 *  inventing a fake IPC error kind. */
function describeDataDirError(error: unknown): string {
  if (error instanceof NotImplementedError) {
    return `The data directory isn't wired up yet (${error.command} is not implemented).`;
  }
  if (isIpcErrorLike(error)) {
    return describeIpcError(error);
  }
  return "Something unexpected happened while reading the data directory.";
}

/** The Data directory section: shows the resolved `<data>` path, an override
 *  field, and a confirmation step (C4 §1) before any change is committed —
 *  changing where a user's whole data store lives is not a field that saves
 *  on blur. The "Save" action calls the `set_data_dir` stub, which always
 *  rejects in wave 2; that rejection is shown the same "not wired up yet"
 *  way other stubbed sections report it. */
export default function DataSection({ store }: DataSectionProps) {
  void store;

  const [info, setInfo] = useState<DataDirInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState<string>("");
  const [confirming, setConfirming] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDataDir()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setInfo(result);
        setOverrideInput(result.override_path ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(describeDataDirError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const issues: ValidationIssue[] = validateDataDir(overrideInput);
  const hasErrors = issues.some((issue) => issue.severity === "error");

  function handleInputChange(value: string): void {
    setOverrideInput(value);
    setConfirming(false);
    setSaveError(null);
  }

  function handleSaveClick(): void {
    if (hasErrors) {
      return;
    }
    setConfirming(true);
  }

  function handleConfirm(): void {
    setConfirming(false);
    void setDataDir(overrideInput)
      .then((result) => {
        setInfo(result);
        setSaveError(null);
      })
      .catch((error: unknown) => {
        setSaveError(describeDataDirError(error));
      });
  }

  function handleCancelConfirm(): void {
    setConfirming(false);
  }

  return (
    <div className="idl1-settings__section">
      <p>
        <strong>Current location:</strong> {info ? info.resolved_path : (loadError ?? "Loading…")}
      </p>
      {info?.restart_required ? (
        <p className="idl1-settings__hint idl1-settings__hint--error">
          A change is pending — restart the app for it to take effect.
        </p>
      ) : null}
      <label htmlFor="idl1-settings-data-dir">Override directory</label>
      <input
        id="idl1-settings-data-dir"
        type="text"
        value={overrideInput}
        onChange={(event) => handleInputChange(event.target.value)}
        placeholder="e.g. D:\race-data"
      />
      {issues.map((issue) => (
        <p
          key={issue.message}
          className={issue.severity === "error" ? "idl1-settings__hint idl1-settings__hint--error" : "idl1-settings__hint"}
        >
          {issue.message}
        </p>
      ))}
      <p className="idl1-settings__hint">A change to this setting takes effect on restart.</p>
      {!confirming ? (
        <button type="button" onClick={handleSaveClick} disabled={hasErrors}>
          Save
        </button>
      ) : (
        <div className="idl1-settings__confirm">
          <p>{describeOverrideChange(info?.override_path ?? null, overrideInput)}</p>
          <button type="button" onClick={handleConfirm}>
            Confirm change
          </button>
          <button type="button" onClick={handleCancelConfirm}>
            Cancel
          </button>
        </div>
      )}
      {saveError ? <p className="idl1-settings__hint idl1-settings__hint--error">{saveError}</p> : null}
    </div>
  );
}
