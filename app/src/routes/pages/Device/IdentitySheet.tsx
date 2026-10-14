import { BrandSheet } from "../../../components/brand/BrandSheet";
import { Input } from "../../../components/ui/input";
import { setBikeProfile } from "./config/edit";
import type { DeviceConfig } from "./config/model";

/** Props for {@link IdentitySheet}. */
export interface IdentitySheetProps {
  open: boolean;
  onClose: () => void;
  /** The settings draft, or null when the logger's config couldn't be read. */
  draft: DeviceConfig | null;
  onDraftChange: (next: DeviceConfig) => void;
}

/**
 * The rider and bike sheet the dashboard's big chips open. Both names live
 * in the logger's own config (`bike_profile`, SPEC §8), so every session it
 * records carries them; edits join the draft and go with the next **Send to
 * logger**.
 */
export default function IdentitySheet({ open, onClose, draft, onDraftChange }: IdentitySheetProps) {
  return (
    <BrandSheet open={open} onOpenChange={(o) => !o && onClose()} title="Rider and bike">
      {draft === null ? (
        <p className="text-sm text-fg-dim">Couldn&apos;t read this logger&apos;s settings yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Rider</span>
            <Input
              className="h-12 text-base"
              value={draft.bike_profile.default_rider}
              placeholder="Who rides this bike"
              onChange={(e) => onDraftChange(setBikeProfile(draft, { default_rider: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Bike</span>
            <Input
              className="h-12 text-base"
              value={draft.bike_profile.name}
              placeholder="e.g. YZ450F"
              onChange={(e) => onDraftChange(setBikeProfile(draft, { name: e.target.value }))}
            />
          </label>
          <p className="text-xs text-fg-dim">Saved to the logger with your next Send to logger, so every session it records carries these names.</p>
        </div>
      )}
    </BrandSheet>
  );
}
