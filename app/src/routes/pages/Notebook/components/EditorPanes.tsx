import { useRef } from "react";

import type { CellKindToken } from "../model/cells";
import { isEditorEcho } from "../model/editorEcho";
import CodePane from "./CodePane";
import PropertiesForm from "./PropertiesForm";
import type { PropertiesFormChannelOption, PropertiesFormLapOption } from "./PropertiesForm.types";

/** Props for {@link EditorPanes}. */
export interface EditorPanesProps {
  /** The currently open cell's id (C2 fence-string id) — never `null`;
   *  `Notebook/index.tsx` only mounts this component once a cell with a
   *  resolved id is selected. */
  cellId: string;
  /** The open cell's fence-language token (C2 §2.1); `math`/`table` mount
   *  `CodePane` alone, `js` mounts `PropertiesForm` beside it (design §6,
   *  D13). Prose has no fence id and is never independently selectable, so
   *  it never reaches this component. */
  kind: CellKindToken;
  /** The open cell's current body text, decoded from `workbookState`'s
   *  markdown by `Notebook/index.tsx` (`model/cells.ts`'s byte-range
   *  convention). */
  code: string;
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
}

/**
 * The editing surface for one open cell (design §6, D13; Task 15 — pure
 * assembly of Tasks 11–14, no logic of its own beyond the loop guard
 * below). A `js` cell mounts {@link PropertiesForm} and {@link CodePane}
 * side by side, writing through the same `onChange`; every other kind
 * mounts `CodePane` alone (`PropertiesForm`'s `plotForm` subset only
 * covers `js` Plot-chart code, C2 §5.3).
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
export default function EditorPanes({ cellId, kind, code, onChange, channelIds, definitionNames, channels, laps }: EditorPanesProps) {
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

  return (
    <div className="editor-panes" data-cell-id={cellId}>
      {kind === "js" && (
        <PropertiesForm code={code} channels={channels} laps={laps} unitsPreference="si" onChange={handleChange} />
      )}
      <CodePane kind={kind} code={code} onChange={handleChange} channelIds={channelIds} definitionNames={definitionNames} />
    </div>
  );
}
