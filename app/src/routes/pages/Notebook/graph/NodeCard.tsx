import { useState, type MouseEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { StatusDot } from "@/components/brand/StatusDot";
import type { MathExprCall } from "../model/mathExpr";
import type { GraphNode } from "../model/graphModel";
import type { NodeStatus } from "../model/graphStatus";
import type { MarkProps } from "../plotForm/types";
import ChartTypePicker from "./ChartTypePicker";
import { chartEligibilityFor } from "./graphToChart";
import type { PortShape } from "./portShape";

/** Matches `CellFrame.tsx`'s own `STATUS_DOT_CLASS` mapping (pending →
 *  `--fg-faint`, ok → `--good`, error → `--accent`) — the same status dot
 *  convention every other run-state indicator in the app uses. `"grey"` has
 *  no entry: decision 44's downstream grey node shows no glyph at all, only
 *  the card's own muted styling (see the `status === "grey"` branch below). */
const STATUS_DOT_CLASS: Record<Exclude<NodeStatus, "grey">, string> = {
  pending: "text-fg-faint",
  ok: "text-good",
  error: "text-accent",
};

/** `NodeCard`'s own `data` shape — everything it renders is passed in, it
 *  derives nothing itself (`GraphCanvas.tsx` computes shape/status/call
 *  once per render, not once per node component instance). */
export interface MathNodeData extends Record<string, unknown> {
  graphNode: GraphNode;
  status: NodeStatus;
  /** R132's named split ("2 of 3 windows"), or `null`. */
  split: string | null;
  /** `"unknown"` for a `"channel"` node — a source node has no shape of its
   *  own (C2 §3.7.4 only defines a shape for a definition's evaluated
   *  value). */
  shape: PortShape;
  /** The definition's outer call (`mathExpr.ts`), or `null` for an opaque
   *  expression or a `"channel"` node. */
  call: MathExprCall | null;
  /** Fired with this node's name and the chosen mark once the card's
   *  {@link ChartTypePicker} commits a pictogram — only rendered when
   *  `chartEligibilityFor` says `"chart"` (§3.6.6's honest-unknown gate —
   *  see `graphToChart.ts`). `undefined` for a `"channel"` node (it has no
   *  data of its own to chart). */
  onChart?: (nodeName: string, mark: MarkProps["mark"]) => void;
  /** True when this node matches the canvas search query
   *  (`model/graphSubgraph.ts`'s `searchNodeIds`, decision 42). Purely a
   *  render hint — the decision of what matches lives in that module. */
  highlighted: boolean;
  /** Fired with `(oldName, newName)` when a double-click rename commits
   *  (decision 45a's first gesture) — `undefined` for a `"channel"` node
   *  (renaming a raw session channel is not this contract's concern, C2
   *  §3.1's `identifier` constraint is definition-only). `NodeCard` itself
   *  only gates on the C2 §3.1 `identifier` shape and "did the name
   *  change" — `graphEdits.ts`'s `renameDefinition` (via `GraphCanvas.tsx`)
   *  remains the sole author of the actual rewrite, and Rust remains the
   *  authority on whether the new name is otherwise valid (a collision, a
   *  reserved word) the next time the document evaluates. */
  onRename?: (oldName: string, newName: string) => void;
  /** Fired with `(argIndex, newText)` when a literal-argument edit commits
   *  (decision 45a's "edit a field on the card") — `undefined` for a
   *  `"channel"` node or a definition with no recognised outer call
   *  (`mathExpr.ts`'s opaque expression — there is no argument to point at).
   *  `newText` is handed to `graphEdits.ts`'s `editLiteralArg` verbatim,
   *  including quotes for a string argument — this module does not know
   *  which of a call's positions expect a string vs. a number, only C2
   *  §3.3's catalog does, and re-deriving that here would be a second,
   *  drifting copy of the catalog's own signature column. */
  onEditArg?: (argIndex: number, newText: string) => void;
}

/** C2 §3.1's `identifier` shape — the one this module needs to gate a
 *  rename commit on before calling `onRename` at all (an obviously invalid
 *  name is worth catching here rather than round-tripping through a
 *  doomed evaluation; anything this regex accepts but Rust still rejects —
 *  a collision, a reserved word — is Rust's to report, not this module's
 *  to guess at). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One call argument, editable in place on click (decision 45a). Its own
 *  small piece of interaction state, same pattern as the name rename
 *  above — a click swaps the span for an `<input>`, Enter/blur commits
 *  (skipped when the text is unchanged or blank), Escape cancels. */
function EditableArg({ value, onCommit }: { value: string; onCommit: (newText: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit(): void {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === value) return;
    onCommit(trimmed);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        size={Math.max(2, draft.length)}
        className="inline-block rounded-[var(--radius-structural)] border border-rule bg-control px-0.5 font-mono text-label-2 text-fg"
      />
    );
  }

  return (
    <span
      className="cursor-text underline decoration-dotted"
      onClick={(e) => {
        e.stopPropagation(); // a click here edits this argument, not "select this node"
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </span>
  );
}

/**
 * One graph node's card (C2 §3.7.4, decision 44, R132): name (falling back
 * to the identifier when there is no `# label:`), the status glyph, the
 * port shape, and — for a definition with a recognised outer call — its
 * name and literal arguments. Hover shows the full `def_line` (name,
 * expression, and — via the title attribute's own text — what it reads);
 * a `"channel"` source node renders as a plain stub with no call/shape row
 * (it has neither). Rendering only; not unit-tested (CLAUDE.md §4) — the
 * decision logic behind every value here lives in `model/graphStatus.ts`,
 * `model/mathExpr.ts`, and `graph/portShape.ts`.
 */
export default function NodeCard({ data }: NodeProps<Node<MathNodeData, "mathNode">>) {
  const { graphNode, status, split, shape, call, onChart, highlighted, onRename, onEditArg } = data;
  const isChannel = graphNode.kind === "channel";
  const displayName = graphNode.label ?? graphNode.name;
  const hoverText = graphNode.exprText !== null ? `${graphNode.name} = ${graphNode.exprText}` : graphNode.name;
  const eligibility = chartEligibilityFor(shape, call);

  // Rename (decision 45a's first gesture): a double-click on the
  // identifier swaps it for an inline `<input>`; Enter/blur commits
  // through `onRename` (only when the typed text is a legal C2 §3.1
  // `identifier` and actually differs), Escape cancels with no call at
  // all. Local to this card, like every other xyflow custom node's own
  // interaction state — `GraphCanvas.tsx` never knows a rename is
  // mid-edit until it commits.
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(graphNode.name);

  function startRename(e: MouseEvent): void {
    if (isChannel || onRename === undefined) return;
    e.stopPropagation(); // a double-click here is "rename this node", not "select this node"
    setDraftName(graphNode.name);
    setRenaming(true);
  }

  function commitRename(): void {
    setRenaming(false);
    const trimmed = draftName.trim();
    if (trimmed === graphNode.name || !IDENTIFIER_RE.test(trimmed)) return; // unchanged, or not a legal identifier — silently no-op, same as every other no-op edit in this lane
    onRename?.(graphNode.name, trimmed);
  }

  return (
    <div
      className={`min-w-[160px] rounded-[var(--radius-card)] border px-3 py-2 ${highlighted ? "border-hivis" : "border-rule"} bg-surface ${status === "grey" ? "opacity-50" : ""}`}
      title={hoverText}
    >
      {!isChannel && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") setRenaming(false);
            }}
            className="w-full rounded-[var(--radius-structural)] border border-rule bg-control px-1 font-mono text-label-1 text-fg"
          />
        ) : (
          <span className="truncate font-mono text-label-1 text-fg" onDoubleClick={startRename}>
            {displayName}
          </span>
        )}
        {status !== "grey" && (
          <StatusDot className={STATUS_DOT_CLASS[status]}>{split ?? status}</StatusDot>
        )}
      </div>
      {!isChannel && (
        <div className="mt-1 flex items-center justify-between gap-2 text-label-2 text-fg-dim">
          <span className="truncate">
            {call !== null ? (
              <>
                {call.name}(
                {call.args.map((arg, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {onEditArg !== undefined ? <EditableArg value={arg} onCommit={(newText) => onEditArg(i, newText)} /> : arg}
                  </span>
                ))}
                )
              </>
            ) : (
              "…"
            )}
          </span>
          <span className="font-mono text-fg-faint">{shape}</span>
        </div>
      )}
      {!isChannel && eligibility === "chart" && onChart !== undefined && (
        <ChartTypePicker onSelect={(mark) => onChart(graphNode.name, mark)} />
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
