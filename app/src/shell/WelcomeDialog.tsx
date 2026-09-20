import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WelcomePanel from "./WelcomePanel";

/** Props for {@link WelcomeDialog}. */
export interface WelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * `Help ▸ Welcome` (ruling R244), the third and last place
 * {@link WelcomePanel} appears — after an empty dock's watermark and the
 * Notebook panel with no workbook open.
 *
 * A dialog rather than a fourth dock panel, deliberately: a `welcome`
 * panel id would have to join `dockLayout.ts`'s three, every named
 * layout, every stored layout document and the validation that rejects a
 * document naming a panel this build does not have — all so it could be
 * opened once, read, and closed. `AboutDialog.tsx`'s own pattern, and the
 * same reason it gives for being one.
 *
 * Nothing is passed in: the panel reads the command registry, the recent
 * list and the data root itself, and every row it renders runs an existing
 * command. Clicking one leaves this dialog open, which is correct for
 * "reopen the Maths panel" and harmless for the rest — the command that
 * replaces what is underneath is visible the moment the dialog is
 * dismissed.
 *
 * Not unit-tested (CLAUDE.md §4: UI rendering is not unit-tested); its
 * decisions live in `welcomeItems.ts`, which is.
 */
export default function WelcomeDialog({ open, onOpenChange }: WelcomeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Welcome to idl1</DialogTitle>
          <DialogDescription>Start a workbook, reopen a panel, or bring sessions into the library.</DialogDescription>
        </DialogHeader>
        <WelcomePanel className="max-h-[70vh]" />
      </DialogContent>
    </Dialog>
  );
}
