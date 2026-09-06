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

/** Seam between "the user chooses a file to import" and however that
 *  choice is actually made (lead ruling R55, 2026-09-05). Opens the native
 *  file dialog (`@tauri-apps/plugin-dialog`'s `open()`, wave-2 write lane)
 *  filtered to the importer extensions above, single selection only.
 *  `pastedPath`, when non-empty, is passed as the dialog's starting
 *  directory (`defaultPath`) — it no longer names the imported file
 *  directly, so `ImportPanel.tsx`'s paste-a-path field now reads as "start
 *  the browser here" rather than "import this path verbatim". Resolves
 *  `null` when the user cancels the dialog, matching `open()`'s own
 *  cancel value — never rejects on cancel. */
export async function pickImportFile(pastedPath: string, openDialog: OpenDialogFn = open): Promise<string | null> {
  const trimmed = pastedPath.trim();
  return openDialog({
    defaultPath: trimmed.length > 0 ? trimmed : undefined,
    filters: [{ name: "idl1 import sources", extensions: IMPORT_EXTENSIONS }],
    multiple: false,
  });
}
