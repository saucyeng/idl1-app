import type { RenamedFunction } from "../../../../ipc/workbook";
import { summarizeMigrations } from "../model/migrationNotice";

/** Props for {@link MigrationBanner}. */
export interface MigrationBannerProps {
  /** `"pending"`: the passive on-open notice (decision 75 -- opening a
   *  workbook is not consent to modify it; nothing has been rewritten
   *  yet). `"applied"`: the on-save report of what this save just
   *  rewrote. */
  variant: "pending" | "applied";
  migrations: RenamedFunction[];
  /** Present only for `"applied"` -- the pending strip is not dismissable
   *  on its own (it disappears the moment the save that resolves it
   *  lands, `workbookReducer`'s `saveResult` clears it). */
  onDismiss?: () => void;
}

/**
 * R151 items 9/10 (C2 §3.8): a retired function name in a `version: 3`
 * workbook keeps parsing, is rewritten **on save only**, and the change is
 * reported rather than left as sediment in the document. Mirrors
 * `ConflictBanner.tsx`/`VersionBanner.tsx`'s plain, unstyled-for-now shape
 * (a coarse stand-in, same posture as those two) -- renders nothing
 * (`null`) when `migrations` is empty, so a caller can render this
 * unconditionally without its own length check.
 */
export default function MigrationBanner({ variant, migrations, onDismiss }: MigrationBannerProps) {
  const summary = summarizeMigrations(migrations);
  if (summary === null) return null;

  const plural = summary.renames.length === 1 ? "name" : "names";
  const headline =
    variant === "pending"
      ? `This workbook uses ${summary.renames.length} retired function ${plural}; saving will update ${
          summary.siteCount === 1 ? "it" : "them"
        }.`
      : `${summary.renames.length} retired function ${plural} ${summary.siteCount === 1 ? "was" : "were"} updated in this workbook.`;

  return (
    <div className={variant === "pending" ? "workbook-migration-banner-pending" : "workbook-migration-banner-applied"} role="status">
      <p>{headline}</p>
      <details>
        <summary>Show renamed functions</summary>
        <ul>
          {summary.renames.map((r) => (
            <li key={`${r.old}->${r.new}`}>
              {r.old} → {r.new}
            </li>
          ))}
        </ul>
      </details>
      {onDismiss && (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
