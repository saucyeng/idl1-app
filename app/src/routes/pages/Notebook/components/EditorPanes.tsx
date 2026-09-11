import { useRef, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CellKindToken } from "../model/cells";
import { editorContentFor } from "../model/editorContent";
import { isEditorEcho } from "../model/editorEcho";
import CodePane from "./CodePane";
import PropertiesForm from "./PropertiesForm";
import WorkbookCodePane from "./WorkbookCodePane";
import type { PropertiesFormChannelOption, PropertiesFormLapOption } from "./PropertiesForm.types";

/** Props for {@link EditorPanes}. */
export interface EditorPanesProps {
  /** The currently open cell's id (C2 fence-string id), or `null` when no
   *  cell is selected — the whole-workbook code pane (R214 item 3) still
   *  has a document to show, so this component no longer requires an open
   *  cell to be worth mounting. */
  cellId: string | null;
  /** The open cell's fence-language token (C2 §2.1); `math`/`table` mount
   *  `CodePane` alone, `js` mounts `PropertiesForm` beside it (design §6,
   *  D13). Prose has no fence id and is never independently selectable, so
   *  it never reaches this component. */
  kind: CellKindToken | null;
  /** The open cell's current body text, decoded from `workbookState`'s
   *  markdown by `Notebook/index.tsx` (`model/cells.ts`'s byte-range
   *  convention). */
  code: string | null;
  /** Called with the pane's new code once, whichever pane originated the
   *  edit (`PropertiesForm.onChange` or `CodePane`'s debounced
   *  `onChange`) — never for a `code` prop change this component
   *  recognises as its own last write (see the file doc comment and
   *  `model/editorEcho.ts`'s `isEditorEcho`). The caller writes it through
   *  `model/cells.ts`'s `replaceCellBody` and dispatches the result into
   *  `workbookState` — this component never calls `replaceCellBody`,
   *  `dispatch`, or any `ipc/*` function itself. */
  onChange: (nextCode: string) => void;
  /** Known channel ids offered as `CodePane` completions, independent of `kind`. */
  channelIds: string[];
  /** Known workbook math-definition names offered as `CodePane` completions. */
  definitionNames: string[];
  /** Channels available for a `js` cell's Properties mark pickers; ignored for every other `kind`. */
  channels: PropertiesFormChannelOption[];
  /** Laps available for a `js` cell's Properties lap-scope pickers; ignored for every other `kind`. */
  laps: PropertiesFormLapOption[];
  /** Whether the code side shows the **whole workbook** (ruling R214 item
   *  3) or just the open cell's body. The Properties/Code column and the
   *  wide editor pane show the document; the narrow `Sheet` keeps the
   *  per-cell editor, since a phone-width overlay has no room to navigate
   *  a whole file and the cell it was opened from is the point. */
  wholeDocumentCode: boolean;
  /** The whole `.idl1wb` document, for the whole-workbook code pane. */
  markdown: string;
  /** Fired with the whole new document text from that pane. */
  onMarkdownChange: (nextMarkdown: string) => void;
  /** Fired when the caret in that pane moves into a different cell (R214
   *  item 3's two-way highlight). */
  onSelectCell: (cellId: string | null) => void;
  /** The open cell's display name — its `# label:`, else "Cell N" by
   *  document order (`graph/cellDisplayName.ts`, R214 item 2). `null` when
   *  no cell is open. */
  displayName: string | null;
  /** Whether the open cell can be renamed here — true only for a `math`
   *  cell, whose body takes a `# label:` comment line. */
  renameable: boolean;
  /** Fired with `(cellId, label)` when the identity bar's inline rename
   *  commits (R214 item 2's second gesture, beside the frame-title
   *  double-click on the graph). */
  onRenameCell: (cellId: string, label: string) => void;
}

/** The open cell's identity, above whichever editor it gets (R214 item 2:
 *  the `hex8` id belongs "as a tooltip and in the properties pane", never
 *  as a frame title, and the pane carries the inline "Rename"). */
function CellIdentityBar({ cellId, displayName, renameable, onRename }: { cellId: string; displayName: string; renameable: boolean; onRename: (cellId: string, label: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(): void {
    const value = draft;
    setDraft(null);
    if (value === null || value.trim() === displayName) return;
    onRename(cellId, value);
  }

  return (
    <div className="flex items-center gap-2 border-b border-rule px-[var(--nb-pad)] py-[var(--nb-pad)] text-[length:var(--nb-text-label)]">
      {draft !== null ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") setDraft(null);
          }}
          className="min-w-0 flex-1 rounded-[var(--radius-structural)] border border-rule bg-control px-1 text-fg"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-fg">{displayName}</span>
      )}
      <span className="shrink-0 font-mono text-fg-faint" title="This cell's id in the file">
        {cellId}
      </span>
      {renameable && draft === null && (
        <button type="button" onClick={() => setDraft(displayName)} className="shrink-0 text-fg-dim hover:text-fg">
          Rename
        </button>
      )}
    </div>
  );
}

/**
 * The editing surface for one open cell (design §6, D13; Task 15 — pure
 * assembly of Tasks 11–14, no logic of its own beyond the loop guard
 * below; restyled UI-10 per decision 29's "cell editor (`Tabs`: Properties ·
 * Code)"). A `js` cell mounts {@link PropertiesForm} and {@link CodePane} as
 * two tabs of one `Tabs` widget, writing through the same `onChange`; every
 * other kind has no Properties tab (`PropertiesForm`'s `plotForm` subset
 * only covers `js` Plot-chart code, C2 §5.3) and mounts `CodePane` alone,
 * unwrapped.
 *
 * **Update-loop guard.** Both panes write to the same cell body, so an edit
 * committed by one pane changes the `code` prop the *other* pane receives.
 * `PropertiesForm` re-derives its form state from an externally changed
 * `code` on its own (its own render-phase guard, unchanged by this task).
 * `CodePane` re-syncs its live document to an externally changed `code`
 * prop via a dispatched CodeMirror transaction (`CodePane.tsx`'s own
 * effect) — and that transaction's `docChanged` flag is indistinguishable
 * from a real keystroke to `CodePane`'s own `updateListener`, so it can
 * re-fire its debounced `onChange` for a change it did not originate,
 * echoing the exact text this component just wrote back through `onChange`
 * a second time. `lastAppliedRef` records the last string this component
 * actually called `onChange` with for the currently open cell;
 * `handleChange` (below) drops any pane's callback whose value matches it
 * (`model/editorEcho.ts`'s `isEditorEcho`, a tiny pure/tested decision)
 * instead of writing it through again. `lastAppliedRef` resets whenever
 * `cellId` changes (adjusting state during render, the same pattern
 * `PropertiesForm.tsx` already uses for its own `prevCode` guard), so a
 * coincidental text match between two different cells is never mistaken
 * for an echo.
 *
 * Manual test: open a `js` cell whose code parses, edit the y-axis label in
 * Properties, and watch the Code pane update once with no further
 * flicker/re-application; then type directly in Code and confirm
 * Properties repopulates once the debounce settles, again with no bounce
 * back into Code. Both directions should each show exactly one write.
 */
export default function EditorPanes({
  cellId,
  kind,
  code,
  onChange,
  channelIds,
  definitionNames,
  channels,
  laps,
  wholeDocumentCode,
  markdown,
  onMarkdownChange,
  onSelectCell,
  displayName,
  renameable,
  onRenameCell,
}: EditorPanesProps) {
  const openCellIdRef = useRef(cellId);
  const lastAppliedRef = useRef<string | null>(null);
  if (openCellIdRef.current !== cellId) {
    openCellIdRef.current = cellId;
    lastAppliedRef.current = null;
  }

  function handleChange(nextCode: string): void {
    if (isEditorEcho(lastAppliedRef.current, nextCode)) return;
    lastAppliedRef.current = nextCode;
    onChange(nextCode);
  }

  const identityBar =
    cellId !== null && displayName !== null ? (
      <CellIdentityBar cellId={cellId} displayName={displayName} renameable={renameable} onRename={onRenameCell} />
    ) : null;

  // The code side: the whole document (R214 item 3) wherever there is room
  // for it, else this cell's own body through the unchanged `CodePane`.
  const codeElement =
    wholeDocumentCode || kind === null || code === null ? (
      <WorkbookCodePane
        markdown={markdown}
        selectedCellId={cellId}
        onSelectCell={onSelectCell}
        onChange={onMarkdownChange}
        channelIds={channelIds}
        definitionNames={definitionNames}
      />
    ) : (
      <CodePane kind={kind} code={code} onChange={handleChange} channelIds={channelIds} definitionNames={definitionNames} />
    );

  // One decision, one place (`model/editorContent.ts`): the narrow sheet
  // titles itself from the same call, so the title and what is under it
  // can never disagree about which editor a cell gets. With no cell open
  // there is no form to offer, only the document.
  if (kind === null || code === null || editorContentFor(kind) === "code") {
    return (
      <div className="editor-panes flex h-full flex-col" data-cell-id={cellId ?? undefined}>
        {identityBar}
        {codeElement}
      </div>
    );
  }

  return (
    <Tabs defaultValue="properties" className="editor-panes flex h-full flex-col" data-cell-id={cellId ?? undefined}>
      {identityBar}
      <TabsList>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="overflow-auto">
        <PropertiesForm code={code} channels={channels} laps={laps} unitsPreference="si" onChange={handleChange} />
      </TabsContent>
      <TabsContent value="code" className="flex min-h-0 overflow-auto">
        {codeElement}
      </TabsContent>
    </Tabs>
  );
}
