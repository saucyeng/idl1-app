import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { FUNCTION_TEMPLATES, type FunctionTemplate } from "../model/canvasBuild";
import { CHART_TYPE_CATALOG, type ChartTypeId } from "./chartTypeCatalog";
import { CHART_TYPE_ICONS } from "./chartTypeIcons";

/** What the menu was opened on (Isaac, 2026-11-04: "right click for a and
 *  b, or drag for either"). `"pane"` is a right-click on empty canvas;
 *  `"source"` is a right-click on a channel/definition node, or a wire
 *  dragged from one and dropped on empty canvas. */
export type CanvasMenuTarget =
  | { kind: "pane" }
  | { kind: "source"; name: string; nodeKind: "channel" | "definition"; placed: boolean; cellId: string | null };

/** One row of the "pick an input" list. */
export interface CanvasMenuInput {
  name: string;
  kind: "channel" | "definition";
}

/** Props for {@link CanvasMenu}. Every action is a callback; the menu
 *  computes no document edit of its own (`GraphCanvas.tsx` does, through
 *  `canvasBuild.ts`/`dragCommit.ts`). */
export interface CanvasMenuProps {
  /** Viewport (client) coordinates the menu opens at. */
  clientX: number;
  clientY: number;
  target: CanvasMenuTarget;
  /** Channels of the selected sessions plus the document's definitions —
   *  what "Add channel" and "Add math" offer. */
  inputs: CanvasMenuInput[];
  onPlaceChannel: (name: string) => void;
  onApply: (inputName: string, template: FunctionTemplate) => void;
  onChart: (name: string, chartType: ChartTypeId) => void;
  onAddChart: () => void;
  onAddTable: () => void;
  onAddNote: () => void;
  onAddVideo: () => void;
  onRemoveChannel: (name: string) => void;
  onDeleteDefinition: (cellId: string, name: string) => void;
  onClose: () => void;
}

type View = { kind: "root" } | { kind: "channels" } | { kind: "inputs" } | { kind: "functions"; input: string } | { kind: "charts"; input: string };

const ITEM_CLASS = "flex w-full items-center justify-between gap-3 px-3 py-1 text-left text-label-1 text-fg hover:bg-control-active";

/**
 * The canvas's context menu: a small floating panel with a root list and
 * searchable sub-lists. Closes on Escape, on a click outside it, and after
 * any action. Rendering only; not unit-tested (CLAUDE.md §4) — the edits it
 * triggers are tested in `canvasBuild.test.ts`/`dragCommit.test.ts`.
 */
export default function CanvasMenu(props: CanvasMenuProps) {
  const { clientX, clientY, target, inputs, onClose } = props;
  const [view, setView] = useState<View>({ kind: "root" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = (next: View) => {
    setQuery("");
    setView(next);
  };
  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  const q = query.trim().toLowerCase();
  const channelRows = useMemo(() => inputs.filter((i) => i.kind === "channel" && i.name.toLowerCase().includes(q)), [inputs, q]);
  const inputRows = useMemo(() => inputs.filter((i) => i.name.toLowerCase().includes(q)), [inputs, q]);
  const functionRows = useMemo(() => FUNCTION_TEMPLATES.filter((t) => t.label.toLowerCase().includes(q) || t.group.toLowerCase().includes(q)), [q]);

  // Keep the panel on screen: open up/left when near the right or bottom edge.
  const style: CSSProperties = {
    position: "fixed",
    left: Math.min(clientX, window.innerWidth - 280),
    top: Math.min(clientY, window.innerHeight - 360),
    zIndex: 50,
  };

  const search = (
    <input
      autoFocus
      type="text"
      value={query}
      placeholder="Search…"
      onChange={(e) => setQuery(e.target.value)}
      className="mx-2 my-1 w-[calc(100%-1rem)] rounded-[var(--radius-structural)] border border-rule bg-control px-2 py-0.5 text-label-2 text-fg"
    />
  );
  const back = (
    <button type="button" className={`${ITEM_CLASS} text-fg-dim`} onClick={() => go({ kind: "root" })}>
      ‹ Back
    </button>
  );

  let content: ReactNode;
  if (view.kind === "channels") {
    content = (
      <>
        {back}
        {search}
        <div className="max-h-64 overflow-y-auto">
          {channelRows.length === 0 && <div className="px-3 py-1 text-label-2 text-fg-faint">No channels — select a session first.</div>}
          {channelRows.map((row) => (
            <button key={row.name} type="button" className={`${ITEM_CLASS} font-mono`} onClick={() => act(() => props.onPlaceChannel(row.name))}>
              {row.name}
            </button>
          ))}
        </div>
      </>
    );
  } else if (view.kind === "inputs") {
    content = (
      <>
        {back}
        <div className="px-3 pt-1 text-label-2 text-fg-faint">Math on which input?</div>
        {search}
        <div className="max-h-64 overflow-y-auto">
          {inputRows.length === 0 && <div className="px-3 py-1 text-label-2 text-fg-faint">Nothing to build on — select a session first.</div>}
          {inputRows.map((row) => (
            <button key={`${row.kind}:${row.name}`} type="button" className={`${ITEM_CLASS} font-mono`} onClick={() => go({ kind: "functions", input: row.name })}>
              {row.name}
              <span className="text-label-2 text-fg-faint">{row.kind === "channel" ? "∿" : "ƒ"}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (view.kind === "functions") {
    content = (
      <>
        {back}
        <div className="px-3 pt-1 font-mono text-label-2 text-fg-faint">ƒ([{view.input}])</div>
        {search}
        <div className="max-h-64 overflow-y-auto">
          {functionRows.map((t) => (
            <button key={`${t.fn}:${t.suffix}`} type="button" className={ITEM_CLASS} onClick={() => act(() => props.onApply(view.input, t))}>
              <span className="font-mono">{t.label}</span>
              <span className="text-label-2 text-fg-faint">{t.group}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (view.kind === "charts") {
    content = (
      <>
        {back}
        {CHART_TYPE_CATALOG.map(({ id, label }) => {
          const Icon = CHART_TYPE_ICONS[id];
          return (
            <button key={id} type="button" className={ITEM_CLASS} onClick={() => act(() => props.onChart(view.input, id))}>
              <span className="flex items-center gap-2">
                <Icon />
                {label}
              </span>
            </button>
          );
        })}
      </>
    );
  } else if (target.kind === "source") {
    content = (
      <>
        <div className="px-3 py-1 font-mono text-label-2 text-fg-faint">{target.name}</div>
        <button type="button" className={ITEM_CLASS} onClick={() => go({ kind: "charts", input: target.name })}>
          Chart it <span className="text-fg-faint">›</span>
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => go({ kind: "functions", input: target.name })}>
          Apply a function <span className="text-fg-faint">›</span>
        </button>
        {target.nodeKind === "channel" && target.placed && (
          <button type="button" className={ITEM_CLASS} onClick={() => act(() => props.onRemoveChannel(target.name))}>
            Remove from canvas
          </button>
        )}
        {target.nodeKind === "definition" && target.cellId !== null && (
          <button type="button" className={ITEM_CLASS} onClick={() => act(() => props.onDeleteDefinition(target.cellId as string, target.name))}>
            Delete definition
          </button>
        )}
      </>
    );
  } else {
    content = (
      <>
        <button type="button" className={ITEM_CLASS} onClick={() => go({ kind: "channels" })}>
          Add channel <span className="text-fg-faint">›</span>
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => go({ kind: "inputs" })}>
          Add math channel <span className="text-fg-faint">›</span>
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => act(props.onAddChart)}>
          Add chart
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => act(props.onAddTable)}>
          Add table
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => act(props.onAddNote)}>
          Add note
        </button>
        <button type="button" className={ITEM_CLASS} onClick={() => act(props.onAddVideo)}>
          Add video
        </button>
      </>
    );
  }

  return (
    <>
      {/* A transparent backdrop: a click (or another right-click) anywhere
          else closes the menu instead of reaching the canvas. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div style={style} role="menu" className="idl-dense w-[260px] rounded-[var(--radius-structural)] border border-rule bg-surface py-1 shadow-lg">
        {content}
      </div>
    </>
  );
}
