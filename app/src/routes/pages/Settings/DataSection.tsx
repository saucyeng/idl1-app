import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDataDir, moveDataDir, setDataDir, type DataDirInfo, type MoveProgress } from "../../../ipc/app";
import { describeOverrideChange, validateDataDir, type ValidationIssue } from "./dataDir";
import { describeIpcError, type IpcErrorLike } from "./errors";
import {
  describeMove,
  describeMoveProgress,
  describeMoveResult,
  moveProgressFraction,
  pickLibraryFolder,
} from "./moveLibrary";
import type { PrefsStore } from "./prefsStore";

/** Props for {@link DataSection}. Follows {@link ProfileSection}'s
 *  `{ store: PrefsStore }` shape for consistency across sections, even
 *  though this section's main content comes from `getDataDir`/`setDataDir`
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

/** Turns a rejection from `getDataDir`/`setDataDir` into user-facing text
 *  (C3 §2). Falls back to a generic message for anything that isn't even
 *  an `IpcError`-shaped rejection (C3 §5: kinds are additive; a value that
 *  isn't an `IpcError` at all still gets a message, not a crash). */
function describeDataDirError(error: unknown): string {
  if (isIpcErrorLike(error)) {
    return describeIpcError(error);
  }
  return "Something unexpected happened while reading the data directory.";
}

/** The Data directory section: shows the resolved `<data>` path, an override
 *  field, and a confirmation step (C4 §1) before any change is committed —
 *  changing where a user's whole data store lives is not a field that saves
 *  on blur. */
export default function DataSection({ store }: DataSectionProps) {
  void store;

  const [info, setInfo] = useState<DataDirInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState<string>("");
  const [confirming, setConfirming] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The folder chosen for a move, awaiting confirmation. `null` = no move
   *  is being proposed. Separate from `overrideInput` because a move and a
   *  bare override change are different actions with different consequences
   *  (one moves and verifies every file, the other only repoints). */
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moveProgress, setMoveProgress] = useState<MoveProgress | null>(null);
  const [moving, setMoving] = useState<boolean>(false);
  const [moveResult, setMoveResult] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

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

  function handlePickMoveTarget(): void {
    setMoveError(null);
    setMoveResult(null);
    void pickLibraryFolder(info?.resolved_path ?? "")
      .then((chosen) => {
        if (chosen !== null) {
          setMoveTarget(chosen);
        }
      })
      .catch(() => {
        setMoveError("The folder picker could not be opened.");
      });
  }

  function handleConfirmMove(target: string): void {
    setMoveTarget(null);
    setMoving(true);
    setMoveProgress(null);
    setMoveError(null);
    const from = info?.resolved_path ?? "";
    void moveDataDir(target, setMoveProgress)
      .then((result) => {
        setInfo(result);
        setMoveResult(describeMoveResult(target, from));
      })
      .catch((error: unknown) => {
        setMoveError(describeDataDirError(error));
      })
      .finally(() => {
        setMoving(false);
        setMoveProgress(null);
      });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-sm text-fg">
        <span className="text-fg-dim">Current location: </span>
        {info ? info.resolved_path : (loadError ?? "Loading…")}
      </p>
      {info?.restart_required ? (
        <p className="font-mono text-xs text-brand-accent">
          A change is pending — restart the app for it to take effect.
        </p>
      ) : null}
      <label htmlFor="idl1-settings-data-dir" className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
        Override directory
      </label>
      <Input
        id="idl1-settings-data-dir"
        type="text"
        className="max-w-md"
        value={overrideInput}
        onChange={(event) => handleInputChange(event.target.value)}
        placeholder="e.g. D:\race-data"
      />
      {issues.map((issue) => (
        <p
          key={issue.message}
          className={issue.severity === "error" ? "font-mono text-xs text-brand-accent" : "font-mono text-xs text-fg-faint"}
        >
          {issue.message}
        </p>
      ))}
      <p className="font-mono text-xs text-fg-faint">A change to this setting takes effect on restart.</p>
      {!confirming ? (
        <Button type="button" onClick={handleSaveClick} disabled={hasErrors} className="w-fit">
          Save
        </Button>
      ) : (
        <div className="flex flex-col gap-2 border-l border-rule pl-3">
          <p className="font-mono text-xs text-fg-dim">{describeOverrideChange(info?.override_path ?? null, overrideInput)}</p>
          <div className="flex gap-2">
            <Button type="button" emphasis="good" filled onClick={handleConfirm}>
              Confirm change
            </Button>
            <Button type="button" onClick={handleCancelConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {saveError ? <p className="font-mono text-xs text-brand-accent">{saveError}</p> : null}

      <div className="mt-2 flex flex-col gap-2 border-t border-rule pt-3">
        <p className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Move library</p>
        <p className="font-mono text-xs text-fg-faint">
          Moves everything to a folder you pick, one file at a time, checking each against its own checksum before
          removing it from the old folder.
        </p>
        {moveTarget === null ? (
          <Button type="button" onClick={handlePickMoveTarget} disabled={moving} className="w-fit">
            Move library to…
          </Button>
        ) : (
          <div className="flex flex-col gap-2 border-l border-rule pl-3">
            <p className="font-mono text-xs text-fg-dim">{describeMove(info?.resolved_path ?? "", moveTarget)}</p>
            <div className="flex gap-2">
              <Button type="button" emphasis="good" filled onClick={() => handleConfirmMove(moveTarget)}>
                Move and verify
              </Button>
              <Button type="button" onClick={() => setMoveTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {moving ? (
          <p className="font-mono text-xs text-fg-dim">
            {describeMoveProgress(moveProgress) ?? "Preparing…"}
            {moveProgressFraction(moveProgress) === null
              ? null
              : ` (${Math.round((moveProgressFraction(moveProgress) ?? 0) * 100)}%)`}
          </p>
        ) : null}
        {moveResult ? <p className="font-mono text-xs text-fg">{moveResult}</p> : null}
        {moveError ? <p className="font-mono text-xs text-brand-accent">{moveError}</p> : null}
      </div>
    </div>
  );
}
