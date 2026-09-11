import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RebuildReport } from "../../../../ipc/catalog";
import type { IpcError } from "../../../../ipc/workbook";
import type { OutputRegister } from "../model/outputRegister";
import type { WorkbookEntry } from "../model/workbookEntry";

/**
 * The Notebook's workbook chrome (L6 Task 21, R66 item 3), **split into the
 * three toolbar groups it belongs to** by ruling R212 item 4.
 *
 * It used to be one `WorkbookBar` element with its own border, padding and
 * `flex-wrap`, dropped whole into the toolbar row — which is exactly why
 * that row was two lines tall (Isaac, 2026-09-11: "two rows tall despite
 * not having tools all the way across"). A wrapping bar cannot live inside
 * a row that must never wrap, so the pieces are now separate exports the
 * toolbar composes:
 *
 * - {@link RegisterSwitch} — the `view` group: paper vs studio (decision 31).
 * - {@link WorkbookNotices} — **not** a toolbar group at all. The rescan
 *   report and the typed error line are prose of unbounded length; they
 *   render in their own strip *under* the row, where they can wrap freely
 *   without ever making the toolbar two rows tall.
 *
 * **Ruling R225 deleted the other two.** `WorkbookPicker` (the inline
 * workbook `Select` and the worksheet tab strip) and `WorkbookActions` (the
 * new-workbook name field, Create and Rescan) were the loose controls that
 * overlapped each other on the row. Opening and creating a workbook are now
 * the ribbon's Open split button, which runs the `workbook.open` and
 * `workbook.new` commands the page already registered and which already
 * open `WorkbookMenuDialogs`' two dialogs; Rescan is one entry in the
 * Import button's dropdown. The worksheet tab strip went with the picker
 * and is not replaced: it was a single fixed "Sheet 1" tab beside a
 * disabled `+`, with no worksheet concept behind it in the document model.
 *
 * Neither of the survivors holds IPC or a layout decision: which workbook
 * opens and what register is in effect live in `model/workbookEntry.ts` and
 * `model/outputRegister.ts`.
 */

/** Props shared by every part below — the same fields the single
 *  `WorkbookBar` took, so `Notebook/index.tsx` passes what it always did. */
export interface WorkbookBarProps {
  /** `null` while the first list is still in flight. */
  entry: WorkbookEntry | null;
  /** True while `rebuild_catalog` is running (either the automatic one or
   *  the Rescan button's) — disables both actions and shows progress. */
  rescanning: boolean;
  /** True while `create_workbook` is in flight. */
  creating: boolean;
  /** True while the open document has unsaved edits (`dirtyCellIds.size >
   *  0`) — disables the picker (R81 Q5(a)) so switching documents can
   *  never silently discard local edits. */
  dirty: boolean;
  /** The last `rebuild_catalog` / `create_workbook` failure, typed
   *  (`IpcError` from `ipc/workbook.ts`), or `null`. Never a bare string. */
  error: IpcError | null;
  /** The last rebuild's counts, for the "Rescan found N workbooks" line. */
  lastRebuild: RebuildReport | null;
  /** This window's effective output register (`model/outputRegister.ts`'s
   *  `defaultRegister`, overridden by the user's stored choice) — the same
   *  `UiPrefs.output_register` Settings' Theme section reads (UI-7 Q1,
   *  "not a third storage key"). */
  register: OutputRegister;
  onCreate: (name: string) => void;
  onRescan: () => void;
  onSelect: (workbookId: string) => void;
  onRegisterChange: (register: OutputRegister) => void;
}

/** The `view` group (R212 item 4): paper/studio, wired straight to
 *  `onRegisterChange`. `labelled` drops the two words and leaves the
 *  segmented control's initials — R212's "at the tightest width labels drop
 *  before groups do". */
export function RegisterSwitch({
  register,
  onRegisterChange,
  labelled = true,
}: Pick<WorkbookBarProps, "register" | "onRegisterChange"> & { labelled?: boolean }) {
  return (
    <ToggleGroup
      type="single"
      density="tight"
      value={register}
      onValueChange={(v) => v && onRegisterChange(v as OutputRegister)}
      aria-label="Output register"
    >
      <ToggleGroupItem value="paper" title="Paper">
        {labelled ? "Paper" : "P"}
      </ToggleGroupItem>
      <ToggleGroupItem value="studio" title="Studio">
        {labelled ? "Studio" : "S"}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * The notice strip under the toolbar: the true state of whatever the bar is
 * waiting on (ruling R207 item 4 — the old label said "Looking for
 * workbooks…" through a ten-minute catalog rebuild), the empty-library
 * line, the last rescan's counts, and the typed error. Renders `null` when
 * there is nothing to say, so it takes no height in the common case.
 *
 * Two distinct waits reach `entry === null`: the first `list_workbooks`,
 * which is a single indexed query, and the one automatic `rebuild_catalog`
 * an empty result triggers (R81 Q1(a)), which walks the whole tree. Only
 * the second is slow, and `rescanning` is what tells them apart.
 */
export function WorkbookNotices({ entry, error, lastRebuild, rescanning }: Pick<WorkbookBarProps, "entry" | "error" | "lastRebuild" | "rescanning">) {
  const looking = entry === null;
  const empty = entry !== null && entry.kind === "empty";
  if (!looking && !empty && error === null && lastRebuild === null) return null;

  return (
    <div className="flex flex-wrap items-center gap-[var(--space-4)] border-b border-rule bg-surface-2 px-2 py-1 font-mono text-[length:var(--nb-text-label)] text-fg-dim">
      {looking && <span>{rescanning ? "Rebuilding the catalog…" : "Looking for workbooks…"}</span>}
      {empty && <span>No workbooks yet. Name one and select Create.</span>}
      {lastRebuild !== null && (
        <span>
          Rescan found {lastRebuild.workbooks_indexed} workbook(s) in {lastRebuild.duration_ms} ms. The whole catalog was rebuilt, not only workbooks.
        </span>
      )}
      {error !== null && (
        <span role="alert" className="text-accent">
          {error.message}
        </span>
      )}
    </div>
  );
}
