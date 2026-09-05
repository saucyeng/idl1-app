/** One problem found with a candidate value, surfaced next to the field it
 *  came from rather than as a generic "invalid" message. Shape shared with
 *  other Settings validators (e.g. a future `pairCode.ts`) so a form that
 *  combines several fields' issues can render them uniformly. */
export interface ValidationIssue {
  /** Name of the field the issue applies to, e.g. `"dataDir"`. */
  path: string;
  /** `"error"` blocks the action the field feeds (e.g. Save); `"warning"`
   *  does not. */
  severity: "error" | "warning";
  /** User-facing text naming the problem. Not localized. */
  message: string;
}

/** Validates a candidate `<data>` directory override before it is sent to
 *  `set_data_dir` (IPC need 7b). Checks only what can be known client-side
 *  from the string itself — whether the path exists, is writable, or can be
 *  created is the backend's job and is reported back as an `invalid_argument`,
 *  `io`, or `internal` error (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 7).
 *
 * @param path - The raw text from the override field, not yet trimmed.
 * @returns Zero or more issues. Empty means the path is well-formed enough
 *  to submit; it does not guarantee `set_data_dir` will accept it. */
export function validateDataDir(path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (path.length === 0) {
    issues.push({
      path: "dataDir",
      severity: "error",
      message: "A path is required.",
    });
    return issues;
  }

  if (!isAbsoluteLooking(path)) {
    issues.push({
      path: "dataDir",
      severity: "error",
      message: "The path must be absolute (start with a drive letter, e.g. \"D:\\\", or a leading \"/\").",
    });
  }

  if (path !== path.replace(/\s+$/, "")) {
    issues.push({
      path: "dataDir",
      severity: "warning",
      message: "This path has trailing whitespace, which would create a differently-named directory than it looks like.",
    });
  }

  return issues;
}

/** `true` when `path` looks like an absolute filesystem path: a Windows
 *  drive letter (`X:`) prefix, or a leading `/` or `\`. This is a shallow,
 *  string-only check — it does not resolve the path or check it exists. */
function isAbsoluteLooking(path: string): boolean {
  return /^[A-Za-z]:/.test(path) || path.startsWith("/") || path.startsWith("\\");
}

/** Describes, in one sentence, what changing the `<data>` directory override
 *  actually does — per C4 §1: the app opens or creates a tree at the new
 *  path, nothing already on disk is moved, and the previous tree (or, if
 *  there was no override, the platform default) is left exactly where it
 *  was. Shown as an explicit confirmation before `set_data_dir` is called —
 *  this is not a field that saves on blur.
 *
 * @param oldPath - The override in effect before this change, or `null` if
 *  the platform default was in use.
 * @param newPath - The override about to be submitted.
 * @returns The confirmation sentence, naming both paths (or the platform
 *  default when `oldPath` is `null`). */
export function describeOverrideChange(oldPath: string | null, newPath: string): string {
  const oldDescription = oldPath === null ? "the platform default location" : `"${oldPath}"`;
  return (
    `idl1 will open or create a data store at "${newPath}". ` +
    `Existing files are not moved — the data currently at ${oldDescription} is left in place. ` +
    "This takes effect after you restart the app."
  );
}
