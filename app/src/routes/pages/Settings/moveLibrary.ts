import { open } from "@tauri-apps/plugin-dialog";

import type { MoveProgress } from "../../../ipc/app";

/** `@tauri-apps/plugin-dialog`'s folder-picker overload, injected so
 *  {@link pickLibraryFolder} is testable without a Tauri host — the same
 *  seam `routes/pages/Data/FilePicker.ts` uses for the import pickers. */
export type OpenFolderDialogFn = (options: {
  defaultPath?: string;
  directory: true;
  multiple?: false;
}) => Promise<string | null>;

/** Opens the native folder picker for "Move library to…" (C3 §3.10). The
 *  chosen folder is the *root*, the parent of the `data/` tree the move
 *  creates — the same thing the override field takes. Resolves `null` when
 *  the user cancels, matching `open()`'s own cancel value; never rejects on
 *  cancel.
 *
 * @param startingFolder - Seeds the dialog's starting directory when
 *  non-empty once trimmed.
 * @param openDialog - The dialog implementation; defaults to the real one. */
export async function pickLibraryFolder(
  startingFolder: string,
  openDialog: OpenFolderDialogFn = open
): Promise<string | null> {
  const trimmed = startingFolder.trim();
  return openDialog({ defaultPath: trimmed.length > 0 ? trimmed : undefined, directory: true, multiple: false });
}

/** The confirmation shown before a move runs. Says the three things a user
 *  needs to decide with: that everything is copied and verified, that the
 *  old folder is left alone rather than emptied (C4 §1 — the app never
 *  deletes it, so disk use doubles until the user does), and that the app
 *  reopens against the new location.
 *
 * @param currentPath - The `<data>` root in use right now.
 * @param newRoot - The folder chosen to move to.
 * @returns The confirmation paragraph. Not localized. */
export function describeMove(currentPath: string, newRoot: string): string {
  return (
    `idl1 will copy your whole library from "${currentPath}" to "${newRoot}", checking every file against its ` +
    "own checksum as it arrives, and then start using the new location. " +
    `Nothing is deleted: the copy at "${currentPath}" is left exactly as it is, so you will be using disk space ` +
    "in both places until you remove the old one yourself. " +
    "If anything fails to verify, the move stops and idl1 keeps using the current location."
  );
}

/** Human-readable name for a `move_data_dir` progress phase (C3 §3.10:
 *  `"copy"`, then `"verify"`, then `"catalog"`). An unrecognised phase
 *  falls through as itself rather than being hidden — a new phase should
 *  look unfamiliar, not invisible.
 *
 * @param phase - The `phase` field of a {@link MoveProgress} tick. */
export function movePhaseLabel(phase: string): string {
  switch (phase) {
    case "copy":
      return "Copying files";
    case "verify":
      return "Verifying checksums";
    case "catalog":
      return "Rebuilding the index";
    default:
      return phase;
  }
}

/** One line of progress text for a move in flight, or `null` before the
 *  first tick arrives (there is nothing honest to say yet).
 *
 *  `done`/`total` count files. A `total` of `null` or `0` prints the phase
 *  alone rather than a "0 of 0" or a divide-by-zero percentage — an empty
 *  library is a real case, not an error.
 *
 * @param progress - The most recent tick, or `null`. */
export function describeMoveProgress(progress: MoveProgress | null): string | null {
  if (progress === null) {
    return null;
  }
  const label = movePhaseLabel(progress.phase);
  if (progress.total === null || progress.total === 0) {
    return `${label}…`;
  }
  return `${label}: ${progress.done} of ${progress.total} files`;
}

/** Fraction complete, 0–1, for a progress bar, or `null` when there is no
 *  meaningful fraction (no tick yet, or an unknown/zero total). Clamped, so
 *  a `done` that overshoots `total` cannot render past the end.
 *
 * @param progress - The most recent tick, or `null`. */
export function moveProgressFraction(progress: MoveProgress | null): number | null {
  if (progress === null || progress.total === null || progress.total === 0) {
    return null;
  }
  return Math.min(1, Math.max(0, progress.done / progress.total));
}

/** The result line after a successful move (C3 §3.10 returns `DataDirInfo`;
 *  `restart_required` is true because the running process still holds the
 *  old root, resolved once at startup per C4 §1).
 *
 * @param newRoot - The folder moved to.
 * @param oldPath - The `<data>` root the app is still running against. */
export function describeMoveResult(newRoot: string, oldPath: string): string {
  return (
    `Your library was copied to "${newRoot}" and verified, and idl1 will use it after you restart. ` +
    `The old copy is still at "${oldPath}" — delete it yourself once you are satisfied the move worked.`
  );
}
