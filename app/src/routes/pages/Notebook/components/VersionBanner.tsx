import {
  workbookVersionBannerMessage,
  type EngineVersionBanner,
  type WorkbookVersionBanner,
} from "../model/engineVersionBanner";

/** Props for {@link VersionBanner}. */
export interface VersionBannerProps {
  banner: EngineVersionBanner;
  /** Dismisses this banner for the current selection -- Isaac: "a banner
   *  for now so it can be temporarily ignored" (decision 62). `Notebook/
   *  index.tsx` re-shows it the next time the selection or the live engine
   *  version changes; dismissal is not remembered across either. */
  onDismiss: () => void;
}

/**
 * Decision 62: an engine version change that will regenerate derived files
 * is announced by a dismissable banner on the workbook, not a toast or
 * silence -- mirrors `ConflictBanner.tsx`'s plain, unstyled-for-now shape
 * (a coarse stand-in, same as that component). Names every outdated
 * session explicitly rather than a generic warning, so the reader knows
 * which of their selected sessions is affected.
 */
export default function VersionBanner({ banner, onDismiss }: VersionBannerProps) {
  return (
    <div className="workbook-version-banner" role="status">
      <p>
        The engine has moved to v{banner.currentEngineVersion} since{" "}
        {banner.outdated.length === 1 ? "this session was" : `${banner.outdated.length} of these sessions were`} last processed
        (recorded at {Array.from(new Set(banner.outdated.map((s) => s.engineVersion))).join(", ")}). Re-importing will regenerate its
        derived files.
      </p>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

/** Props for {@link WorkbookVersionBannerView}. */
export interface WorkbookVersionBannerProps {
  banner: WorkbookVersionBanner;
  /** Dismisses this banner until the recorded or live version changes
   *  again -- decision 62's "so it can be temporarily ignored". */
  onDismiss: () => void;
  /** Re-runs the workbook's evaluation now. Explicit, and the only thing
   *  the banner offers beyond dismissal: decision 62 forbids rewriting the
   *  file, so this re-evaluates and leaves the recorded version alone. */
  onReevaluate: () => void;
}

/**
 * Decision 62's workbook half: the build that last evaluated this workbook
 * differs from the one the reader is on. A banner, not a toast and not
 * silence, and nothing is rewritten -- Re-evaluate re-runs the evaluation
 * against the current build; it does not stamp the current version into
 * front matter.
 *
 * Kept in the same file and the same plain shape as the per-session banner
 * above, which announces the neighbouring half of the same decision.
 */
export function WorkbookVersionBannerView({ banner, onDismiss, onReevaluate }: WorkbookVersionBannerProps) {
  return (
    <div className="workbook-version-banner" role="status">
      <p>{workbookVersionBannerMessage(banner)}</p>
      <button type="button" onClick={onReevaluate}>
        Re-evaluate
      </button>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
