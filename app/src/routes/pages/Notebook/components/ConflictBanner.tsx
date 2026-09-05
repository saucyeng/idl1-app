/**
 * Shown when `saveFlow`'s state reaches `"conflict"` (a `save_workbook`
 * rejection with the `conflict` kind, R44, C3 §2) -- the file on disk
 * changed since this document's `hash` was last read. Offers the two
 * coarse resolutions this lane implements; the real per-cell merge C4 §4
 * names as the eventual answer is L11's job (design §7), not this
 * component's.
 */
export interface ConflictBannerProps {
  /** Discard local edits: re-run `readWorkbook`/N1's replacement and replace `workbookState`'s markdown/cells/hash with disk's current content. */
  onReloadFromDisk: () => void;
  /** Re-read disk's current content, re-apply local edits on top, and save again with the freshly read hash. */
  onOverwrite: () => void;
}

// TODO(idl0): replace this banner's two buttons with L11's per-cell merge
// UI (C4 §4, design §7) once it lands -- reload-or-overwrite is a coarse
// stand-in, not the final conflict-resolution surface.
export default function ConflictBanner({ onReloadFromDisk, onOverwrite }: ConflictBannerProps) {
  return (
    <div className="workbook-conflict-banner" role="alert">
      <p>This workbook changed on disk since it was last read here.</p>
      <button type="button" onClick={onReloadFromDisk}>
        Reload from disk
      </button>
      <button type="button" onClick={onOverwrite}>
        Overwrite
      </button>
    </div>
  );
}
