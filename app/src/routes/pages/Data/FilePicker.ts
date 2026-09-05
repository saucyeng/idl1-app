/** Seam between "the user chooses a file to import" and however that
 *  choice is actually made (lead ruling R55, 2026-09-05). No file-picker
 *  mechanism exists anywhere in this codebase yet: `@tauri-apps/plugin-dialog`
 *  is not an `app/package.json` dependency and adding it needs a new
 *  `app/src-tauri` capability entry, a decision outside this lane (CLAUDE.md
 *  §1). Wave 2's implementation is a pasted absolute path, typed into
 *  `ImportPanel.tsx`'s text input; a later shell task swaps this function's
 *  body for a real native dialog once `@tauri-apps/plugin-dialog` lands,
 *  with no change needed at any call site. */
export async function pickImportFile(pastedPath: string): Promise<string | null> {
  const trimmed = pastedPath.trim();
  return trimmed.length > 0 ? trimmed : null;
}
