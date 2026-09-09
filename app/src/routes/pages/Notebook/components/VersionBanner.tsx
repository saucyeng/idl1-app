import type { EngineVersionBanner } from "../model/engineVersionBanner";

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
