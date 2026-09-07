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

/** Props for {@link WorkbookBar}. */
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
   *  `defaultRegister`, overridden by the user's stored choice) — shown and
   *  changeable from the worksheet bar, the same `UiPrefs.output_register`
   *  Settings' Theme section reads (UI-7 Q1, "not a third storage key"). */
  register: OutputRegister;
  onCreate: (name: string) => void;
  onRescan: () => void;
  onSelect: (workbookId: string) => void;
  onRegisterChange: (register: OutputRegister) => void;
}

/** The register toggle, shared by every `WorkbookBar` render path below —
 *  paper/studio, wired straight to `onRegisterChange`. */
function RegisterSwitch({ register, onRegisterChange }: Pick<WorkbookBarProps, "register" | "onRegisterChange">) {
  return (
    <ToggleGroup type="single" value={register} onValueChange={(v) => v && onRegisterChange(v as OutputRegister)} aria-label="Output register">
      <ToggleGroupItem value="paper">Paper</ToggleGroupItem>
      <ToggleGroupItem value="studio">Studio</ToggleGroupItem>
    </ToggleGroup>
  );
}

/** The worksheet tabs row. This lane's `.idl1wb` document model has no
 *  multi-worksheet concept yet (no IPC command names a "worksheet" distinct
 *  from the workbook document itself) — a single fixed tab stands in for
 *  "this workbook's one sheet", and `+` is present per the direction but
 *  disabled, since there is nothing yet for it to create. Parity gap: idl0
 *  had no worksheet concept either, so this is new UI-DIRECTION chrome with
 *  no backend counterpart, not a regression. */
function WorksheetTabs() {
  return (
    <div className="flex items-center gap-2">
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
 * The Notebook's workbook-chrome surface (L6 Task 21, R66 item 3; restyled
 * UI-10 as the worksheet bar): the empty state ("New workbook" + "Rescan"),
 * and, once more than one workbook is indexed, a workbook `Select` naming
 * the open document, a worksheet-tabs row, and the output-register switch
 * (decision 31). Holds no IPC and no layout decisions of its own — which
 * workbook opens, whether a picker or the empty state shows, and what
 * register is in effect all live in `model/workbookEntry.ts`/
 * `model/outputRegister.ts`/`Settings/theme.ts`; this component only
 * renders what it is given plus the callbacks its controls invoke.
 *
 * "Looking for workbooks…" (a `null` `entry`) covers both the very first
 * `list_workbooks` call and the one automatic `rebuild_catalog` an empty
 * result triggers (R81 Q1(a)), so a genuinely empty install's one-time
 * rebuild cost is not mistaken for a hang.
 */
export default function WorkbookBar({
  entry,
  rescanning,
  creating,
  dirty,
  error,
  lastRebuild,
  register,
  onCreate,
  onRescan,
  onSelect,
  onRegisterChange,
}: WorkbookBarProps) {
  const [newName, setNewName] = useState("");

  if (entry === null) {
    return <p className="font-mono text-sm text-fg-dim">Looking for workbooks…</p>;
  }

  const rebuildLine =
    lastRebuild !== null ? (
      <p className="font-mono text-xs text-fg-dim">
        Rescan found {lastRebuild.workbooks_indexed} workbook(s) in {lastRebuild.duration_ms} ms. The whole catalog
        was rebuilt, not only workbooks.
      </p>
    ) : null;

  const errorLine = error !== null ? <p role="alert" className="font-mono text-xs text-accent">{error.message}</p> : null;

  function submitCreate() {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    onCreate(trimmed);
    setNewName("");
  }

  const createControl = (
    <div className="flex items-center gap-2">
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
        placeholder="New workbook name"
        className="h-8 w-48"
      />
      <Button type="button" size="sm" emphasis="normal" onClick={submitCreate} disabled={creating || newName.trim().length === 0}>
        {creating ? "Creating…" : "Create"}
      </Button>
    </div>
  );

  const rescanControl = (
    <Button type="button" size="sm" emphasis="normal" onClick={onRescan} disabled={rescanning}>
      {rescanning ? "Rescanning…" : "Rescan"}
    </Button>
  );

  if (entry.kind === "empty") {
    return (
      <div className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-2">
        <p className="font-mono text-sm text-fg-dim">No workbooks yet.</p>
        {createControl}
        {rescanControl}
        <p className="font-mono text-xs text-fg-faint">A workbook file copied into the `workbooks` folder appears here after a rescan.</p>
        {rebuildLine}
        {errorLine}
      </div>
    );
  }

  // `entry.kind === "single" | "choice"` — both render the worksheet bar
  // (workbook picker + worksheet tabs + register switch) plus New workbook +
  // Rescan in a compact form (a second workbook has to be creatable from a
  // non-empty notebook too); the workbook `Select` only appears when there
  // is more than one indexed workbook (R81 Q4(a)).
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-2">
      {entry.kind === "choice" && (
        <Select value={entry.workbookId} disabled={dirty} onValueChange={onSelect}>
          <SelectTrigger className="w-56" aria-label="Workbook">
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
      {entry.kind === "choice" && dirty && (
        <span className="font-mono text-xs text-fg-faint">Save your edits before switching workbooks.</span>
      )}
      <WorksheetTabs />
      <RegisterSwitch register={register} onRegisterChange={onRegisterChange} />
      {createControl}
      {rescanControl}
      {rebuildLine}
      {errorLine}
    </div>
  );
}
