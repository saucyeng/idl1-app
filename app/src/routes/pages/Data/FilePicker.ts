import { open } from "@tauri-apps/plugin-dialog";

/** The subset of `@tauri-apps/plugin-dialog`'s `open()` signature this
 *  module calls — injected as {@link OpenDialogFn} so `pickImportFile` is
 *  unit-testable without a real Tauri dialog (which does not exist outside
 *  a running app). Structurally compatible with `open()`'s own single-file
 *  overload (`multiple: false` → `Promise<string | null>`). */
export type OpenDialogFn = (options: {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  multiple?: false;
}) => Promise<string | null>;

/** The four importer extensions `list_importers` (C3 §3.3) advertises
 *  today (`idl0`, `fit`, `gpx`, `csv`), dot-stripped for
 *  `@tauri-apps/plugin-dialog`'s `filters[].extensions` convention (no
 *  leading dot, unlike C3's own `ImporterInfo.extensions`). Hardcoded
 *  rather than sourced from a `listImporters()` call here — this module
 *  has no session/IPC state to thread that fetch through — so a future
 *  fifth importer needs this list updated too. */
const IMPORT_EXTENSIONS = ["idl0", "fit", "gpx", "csv"];

/** The "paste a path → import" contract (lead ruling R55, restated R77.1,
 *  2026-09-06): trims `pastedPath` and resolves to it directly when
 *  non-empty, or `null` when blank — the typed text is the import target
 *  verbatim, with no dialog round trip and no other interpretation. This is
 *  the pasted-path field's entire behaviour; `pickImportFile` below is the
 *  separate "Browse…" entry point, not a replacement for this one. */
export function resolvePastedPath(pastedPath: string): string | null {
  const trimmed = pastedPath.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Seam between "the user browses for a file to import" and however that
 *  choice is actually made (lead ruling R55, 2026-09-05). Opens the native
 *  file dialog (`@tauri-apps/plugin-dialog`'s `open()`, wave-2 write lane)
 *  filtered to the importer extensions above, single selection only.
 *  `startingFolder`, when non-empty once trimmed, seeds the dialog's
 *  starting directory (`defaultPath`) — it is never treated as the import
 *  target itself; that is [[resolvePastedPath]]'s job, used by the
 *  separate direct-import button. Resolves `null` when the user cancels
 *  the dialog, matching `open()`'s own cancel value — never rejects on
 *  cancel. */
export async function pickImportFile(startingFolder: string, openDialog: OpenDialogFn = open): Promise<string | null> {
  const trimmed = startingFolder.trim();
  return openDialog({
    defaultPath: trimmed.length > 0 ? trimmed : undefined,
    filters: [{ name: "idl1 import sources", extensions: IMPORT_EXTENSIONS }],
    multiple: false,
  });
}
