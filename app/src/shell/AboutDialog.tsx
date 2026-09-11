import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Props for {@link AboutDialog}. */
export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The engine's version string from `engine_version` (C3 §3.1), or `null`
   *  while the shell's mount-time fetch is still in flight or has failed. */
  engineVersion: string | null;
}

/**
 * `Help ▸ About idl1` (ruling R220 item 1). Says the two things a bug
 * report needs and nothing else: which app this is, and which engine it is
 * talking to.
 *
 * The engine version is already in `AppState` — the shell fetches it once
 * at mount — so this dialog performs no IPC of its own. A `null` version is
 * printed as such rather than hidden: "the engine did not answer" is
 * exactly what a user filing a bug needs to be able to say.
 */
export default function AboutDialog({ open, onOpenChange, engineVersion }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>idl1</DialogTitle>
          <DialogDescription>Session library, device console and analysis notebook.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-label-2">
          <dt className="text-fg-dim">Engine</dt>
          <dd className="text-fg">{engineVersion ?? "not reported"}</dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
