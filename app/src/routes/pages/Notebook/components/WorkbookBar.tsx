import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * - {@link WorkbookPicker} — the `document` group: which workbook is open,
 *   and its worksheet tabs.
 * - {@link RegisterSwitch} — the `view` group: paper vs studio (decision 31).
 * - {@link WorkbookActions} — part of the `actions` group: create and rescan.
 * - {@link WorkbookNotices} — **not** a toolbar group at all. The rescan
 *   report and the typed error line are prose of unbounded length; they
 *   render in their own strip *under* the row, where they can wrap freely
 *   without ever making the toolbar two rows tall.
 *
 * None of these holds IPC or a layout decision: which workbook opens and
 * what register is in effect live in `model/workbookEntry.ts` and
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

/** The worksheet tabs. This lane's `.idl1wb` document model has no
 *  multi-worksheet concept yet (no IPC command names a "worksheet" distinct
 *  from the workbook document itself) — a single fixed tab stands in for
 *  "this workbook's one sheet", and `+` is present per the direction but
 *  disabled, since there is nothing yet for it to create. Parity gap: idl0
 *  had no worksheet concept either, so this is new UI-DIRECTION chrome with
 *  no backend counterpart, not a regression. */
function WorksheetTabs() {
  return (
    <div className="flex items-center gap-[var(--nb-gap)]">
      <Tabs value="sheet-1">
        <TabsList>
          <TabsTrigger value="sheet-1">Sheet 1</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button type="button" size="icon-sm" emphasis="normal" disabled title="Multiple worksheets are not supported yet">
        +
      </Button>
    </div>
  );
}

/**
 * The `document` group: the workbook `Select` (only when more than one
 * workbook is indexed, R81 Q4(a)) and the worksheet tabs.
 *
 * The "Save your edits before switching workbooks" line that used to sit
 * beside the picker as its own paragraph is now the disabled picker's
 * `title` — the same explanation, in the one place a reader looks when a
 * control will not respond, and no extra width in a row that has none.
 */
export function WorkbookPicker({ entry, dirty, onSelect, labelled = true }: Pick<WorkbookBarProps, "entry" | "dirty" | "onSelect"> & { labelled?: boolean }) {
  if (entry === null || entry.kind === "empty") return null;

  return (
    <div className="flex min-w-0 items-center gap-[var(--nb-gap)]">
      {entry.kind === "choice" && (
        <Select value={entry.workbookId} disabled={dirty} onValueChange={onSelect}>
          <SelectTrigger
            size="sm"
            className={labelled ? "w-40" : "w-24"}
            aria-label="Workbook"
            title={dirty ? "Save your edits before switching workbooks." : "Open workbook"}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {entry.choices.map((choice) => (
              <SelectItem key={choice.workbook_id} value={choice.workbook_id}>
                {choice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <WorksheetTabs />
    </div>
  );
}

/**
 * The create-and-rescan half of the `actions` group. Present whether or not
 * any workbook exists yet — a second workbook has to be creatable from a
 * non-empty notebook too — so this is the one control the empty state and
 * the loaded state share.
 *
 * The empty state's "a workbook file copied into the `workbooks` folder
 * appears here after a rescan" hint is Rescan's `title`, for the same
 * reason the dirty-picker explanation moved: prose belongs on the control
 * it explains, not in the row.
 */
export function WorkbookActions({ creating, rescanning, onCreate, onRescan, labelled = true }: Pick<WorkbookBarProps, "creating" | "rescanning" | "onCreate" | "onRescan"> & { labelled?: boolean }) {
  const [newName, setNewName] = useState("");

  function submitCreate() {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    onCreate(trimmed);
    setNewName("");
  }

  return (
    <div className="flex items-center gap-[var(--nb-gap)]">
      <label htmlFor="notebook-new-workbook-name" className="sr-only">
        New workbook name
      </label>
      <Input
        id="notebook-new-workbook-name"
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitCreate();
        }}
        placeholder="New workbook"
        className={labelled ? "w-32" : "w-20"}
      />
      <Button type="button" size="sm" emphasis="normal" onClick={submitCreate} disabled={creating || newName.trim().length === 0}>
        {creating ? "Creating…" : "Create"}
      </Button>
      <Button
        type="button"
        size="sm"
        emphasis="normal"
        onClick={onRescan}
        disabled={rescanning}
        title="A workbook file copied into the workbooks folder appears here after a rescan."
      >
        {rescanning ? "Rescanning…" : "Rescan"}
      </Button>
    </div>
  );
}

/**
 * The notice strip under the toolbar: "Looking for workbooks…" while the
 * first `list_workbooks` (and the one automatic `rebuild_catalog` an empty
 * result triggers, R81 Q1(a)) is in flight, the empty-library line, the
 * last rescan's counts, and the typed error. Renders `null` when there is
 * nothing to say, so it takes no height in the common case.
 */
export function WorkbookNotices({ entry, error, lastRebuild }: Pick<WorkbookBarProps, "entry" | "error" | "lastRebuild">) {
  const looking = entry === null;
  const empty = entry !== null && entry.kind === "empty";
  if (!looking && !empty && error === null && lastRebuild === null) return null;

  return (
    <div className="flex flex-wrap items-center gap-[var(--space-4)] border-b border-rule bg-surface-2 px-2 py-1 font-mono text-[length:var(--nb-text-label)] text-fg-dim">
      {looking && <span>Looking for workbooks…</span>}
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
