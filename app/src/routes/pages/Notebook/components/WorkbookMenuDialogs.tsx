import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WorkbookEntry } from "../model/workbookEntry";

/** Props for {@link NewWorkbookDialog}. */
export interface NewWorkbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while `create_workbook` is in flight. */
  creating: boolean;
  /** The page's existing `handleCreate` — same call the toolbar's Create
   *  button makes, with the same trimmed name. */
  onCreate: (name: string) => void;
}

/**
 * `File ▸ New workbook` (ruling R220 item 1).
 *
 * The toolbar's Create control is a name field beside a button, which works
 * because it is already on screen. A menu command has nowhere to type, so
 * it asks — the same question, in the one place the command opened. It
 * calls the page's own `create_workbook` handler; nothing new happens here
 * that the toolbar could not already do.
 */
export function NewWorkbookDialog({ open, onOpenChange, creating, onCreate }: NewWorkbookDialogProps) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  function submit() {
    if (trimmed.length === 0) return;
    onCreate(trimmed);
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New workbook</DialogTitle>
          <DialogDescription>Creates a workbook file in the workbooks folder and opens it.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          type="text"
          value={name}
          placeholder="Workbook name"
          aria-label="Workbook name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={creating || trimmed.length === 0}>
            {creating ? "Creating…" : "Create workbook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Props for {@link OpenWorkbookDialog}. */
export interface OpenWorkbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: WorkbookEntry | null;
  /** The page's existing `handleSelect`. */
  onSelect: (workbookId: string) => void;
}

/**
 * `File ▸ Open workbook` (ruling R220 item 1): the indexed workbooks, one
 * per row, opening the chosen one.
 *
 * The same list the sidebar shows. It exists as a dialog too because a menu
 * command must work whether or not the sidebar is open — `Ctrl+B` collapses
 * it, and narrow layouts have none at all.
 */
export function OpenWorkbookDialog({ open, onOpenChange, entry, onSelect }: OpenWorkbookDialogProps) {
  const choices = entry !== null && entry.kind === "choice" ? entry.choices : [];
  const openWorkbookId = entry !== null && entry.kind !== "empty" ? entry.workbookId : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Open workbook</DialogTitle>
          <DialogDescription>Indexed workbooks in the workbooks folder.</DialogDescription>
        </DialogHeader>
        {choices.length === 0 ? (
          <p className="font-mono text-sm text-fg-dim">
            {openWorkbookId === null
              ? "No workbooks indexed yet. Create one, or rescan the library."
              : "This is the only indexed workbook."}
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col overflow-auto">
            {choices.map((choice) => (
              <li key={choice.workbook_id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(choice.workbook_id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-2 py-1.5 text-left font-mono hover:bg-control",
                    choice.workbook_id === openWorkbookId && "bg-control-active",
                  )}
                >
                  <span className="truncate text-sm text-fg">{choice.name}</span>
                  <span className="truncate text-xs text-fg-dim">{choice.file_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
