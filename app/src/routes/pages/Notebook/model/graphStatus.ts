/**
 * Per-node status glyph for the maths graph, from `WorkbookState.windows`
 * (ruling R131) plus the current selection and each selected session's
 * channel catalog. Pure — reads `CellDefResult`/`ChannelSummary`, computes
 * no number.
 *
 * **Worst-wins across windows, and the split is named (R132).** A
 * definition's aggregate status is the worst of its per-window outcomes;
 * when more than one window is selected and they disagree, {@link
 * NodeStatusResult.split} names the fraction ("2 of 3 windows") rather than
 * staying silent about which windows are which.
 *
 * **A whole-window failure is the canvas's problem, not fifty nodes'.**
 * `WindowEvalState.kind === "error"` means that window's entire evaluation
 * call failed — this module excludes such a window from every node's
 * aggregation (never manufactures fifty identical red ×s from one banner-
 * level failure); {@link bannerWindows} names which selected windows those
 * are, for the canvas-level banner (R132).
 *
 * **Grey by reachability from unresolved session-channel roots (decision
 * 44).** A `"channel"` node (§3.7.3: a reference resolving to neither
 * another definition nor — via {@link findChannel}, ruling R141's "reuse
 * the one predicate" — a channel on *any* selected window's session) is a
 * **red ×**: a name that resolves nowhere is a typo, not a session gap. A
 * channel present on some selected session but absent from another's is
 * **grey** for the windows lacking it, and every node reachable from it
 * (forward through the graph's edges) greys for those same windows too —
 * even where core's own evaluation legitimately reports an `UnknownChannel`
 * error for that window, since from the graph's point of view that isn't a
 * mistake, it is "this session doesn't have the input." A downstream grey
 * node carries no glyph beyond the grey itself (no spinner, no ×) — a
 * status implies the node was asked to run.
 *
 * **Selection supplies the denominator, `windows` supplies the outcome**
 * (R131 applied one layer out, ruling R141 Q2). A selected window absent
 * from `windows` has not evaluated yet — it contributes a `"pending"`
 * per-window status, exactly as an absent `windows` entry means "pending"
 * one layer down. This module never adds a synthetic "pending" entry to a
 * copy of `windows` to make itself self-sufficient — an absent entry
 * already means one thing (not yet run); giving it a second meaning is the
 * sentinel shape CLAUDE.md's own review guidance names as the recurring
 * defect here.
 *
 * **`"pending"` never outlives its window.** Once `windows` holds an entry
 * for a window, that window's evaluation is *finished* — `"pending"` for
 * that window is reachable only via the "no entry at all" case above.
 * `CellDefResult`'s own doc comment says a structural problem on a
 * definition "keeps it out of `defs` entirely" — so a completed window
 * whose output has no `defs` entry for this node is never re-labelled
 * `"pending"` (a spinner with nothing left to finish it would spin
 * forever, the same class of defect as a silently wrong value); it reads
 * as `"error"` instead. See {@link definitionPerWindow}.
 */

import type { SessionDetail } from "../../../../ipc/catalog";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { findChannel } from "./jsCellBinding";
import type { GraphModel, GraphNode } from "./graphModel";
import { wireWindowKey, type WindowEvalState } from "./workbookState";

/** One node's aggregate status glyph. `"pending"` — spinner, not yet
 *  evaluated in every selected window. `"ok"` — green check. `"error"` —
 *  red ×, a real evaluation failure. `"grey"` — this session (or every
 *  selected session) lacks an input this node needs; not an error. */
export type NodeStatus = "pending" | "ok" | "error" | "grey";

/** One node's computed status (§3.7's per-node glyph, R132's named split). */
export interface NodeStatusResult {
  status: NodeStatus;
  /** `"2 of 3 windows"` when `windowCount > 1` and the per-window outcomes
   *  disagree (R132) — the count of windows matching {@link status} out of
   *  the total selected. `null` when only one window is selected, or every
   *  selected window agrees. */
  split: string | null;
}

/** Everything {@link computeNodeStatuses} needs. */
export interface GraphStatusInputs {
  model: GraphModel;
  /** The current selection, in display order — the denominator R141 Q2
   *  requires; see the module doc comment. */
  selectedWindows: SelectedWindow[];
  /** `WorkbookState.windows`, unmodified. */
  windows: Map<string, WindowEvalState>;
  /** Each selected window's own session's channel catalog, keyed by
   *  `SelectedWindow.session_id` — decision 44's grey-vs-red split is
   *  necessarily per-session (two selected windows may name different
   *  sessions with different channels). A session with no entry here is
   *  treated as not yet loaded (`"pending"` for any channel check against
   *  it), never as "this session has no channels at all". */
  sessionDetails: Map<string, SessionDetail>;
}

/** One per-window outcome for a single node, before aggregation. */
type PerWindowStatus = "pending" | "ok" | "error" | "grey";

/** The selected windows whose entire evaluation call failed
 *  (`WindowEvalState.kind === "error"`) — the canvas-level banner set
 *  (R132), never folded into any node's own status. */
export function bannerWindows(inputs: Pick<GraphStatusInputs, "selectedWindows" | "windows">): SelectedWindow[] {
  return inputs.selectedWindows.filter((w) => inputs.windows.get(wireWindowKey(w))?.kind === "error");
}

/** Worst-wins ordering: a real error outranks a session-gap grey, which
 *  outranks "still running", which outranks a clean result. */
const STATUS_RANK: Record<PerWindowStatus, number> = { error: 3, grey: 2, pending: 1, ok: 0 };

/** Reduces one node's per-window outcomes to its aggregate {@link
 *  NodeStatusResult}, naming the split when the windows disagree (R132). */
function aggregate(perWindow: PerWindowStatus[]): NodeStatusResult {
  if (perWindow.length === 0) return { status: "pending", split: null };

  let worst: PerWindowStatus = "ok";
  for (const status of perWindow) {
    if (STATUS_RANK[status] > STATUS_RANK[worst]) worst = status;
  }

  const agreeing = perWindow.filter((s) => s === worst).length;
  const split = perWindow.length > 1 && agreeing < perWindow.length ? `${agreeing} of ${perWindow.length} windows` : null;

  return { status: worst, split };
}

/** For a `"channel"` node, whether it names a real channel on *any*
 *  selected window's session (ruling R141 Q1 — via {@link findChannel}).
 *  `false` means the reference is a typo, not a session gap, regardless of
 *  which window is asked. */
function resolvesSomewhere(name: string, selectedWindows: SelectedWindow[], sessionDetails: Map<string, SessionDetail>): boolean {
  return selectedWindows.some((w) => {
    const detail = sessionDetails.get(w.session_id);
    return detail !== undefined && findChannel(detail.channels, name) !== null;
  });
}

/** One `"channel"` node's per-window status (§3.7.3/decision 44 — see the
 *  module doc comment). */
function channelWindowStatus(name: string, w: SelectedWindow, sessionDetails: Map<string, SessionDetail>, isTypo: boolean): PerWindowStatus {
  const detail = sessionDetails.get(w.session_id);
  if (detail === undefined) return "pending";
  if (findChannel(detail.channels, name) !== null) return "ok";
  return isTypo ? "error" : "grey";
}

/**
 * Computes every node's {@link NodeStatusResult}, keyed by {@link
 * GraphNode.id}. See the module doc comment for the full rule set.
 */
export function computeNodeStatuses(inputs: GraphStatusInputs): Map<string, NodeStatusResult> {
  const { model, selectedWindows, windows, sessionDetails } = inputs;

  // Windows whose whole evaluation call failed contribute to nothing here
  // (the canvas banner, see bannerWindows) — excluded from every node's
  // per-window array below.
  const usableWindows = selectedWindows.filter((w) => windows.get(wireWindowKey(w))?.kind !== "error");

  // 1. Each "channel" node's per-window status.
  const channelPerWindow = new Map<string, PerWindowStatus[]>();
  const channelStatusByWindow = new Map<string, Map<string, PerWindowStatus>>(); // nodeId -> windowKey -> status
  for (const node of model.nodes) {
    if (node.kind !== "channel") continue;
    const isTypo = !resolvesSomewhere(node.name, selectedWindows, sessionDetails);
    const perWindow: PerWindowStatus[] = [];
    const byWindow = new Map<string, PerWindowStatus>();
    for (const w of usableWindows) {
      const status = channelWindowStatus(node.name, w, sessionDetails, isTypo);
      perWindow.push(status);
      byWindow.set(wireWindowKey(w), status);
    }
    channelPerWindow.set(node.id, perWindow);
    channelStatusByWindow.set(node.id, byWindow);
  }

  // 2. Forward reachability from every "grey" channel root, per window —
  // which definition nodes must grey out rather than show a real error for
  // that window (decision 44).
  const forwardTargets = new Map<string, string[]>(); // nodeId -> [nodeIds it feeds]
  for (const edge of model.edges) {
    const list = forwardTargets.get(edge.source);
    if (list) list.push(edge.target);
    else forwardTargets.set(edge.source, [edge.target]);
  }
  const greyEligible = new Map<string, Set<string>>(); // nodeId -> windowKeys it may grey for

  for (const [rootId, byWindow] of channelStatusByWindow) {
    const greyWindowKeys = [...byWindow.entries()].filter(([, s]) => s === "grey").map(([k]) => k);
    if (greyWindowKeys.length === 0) continue;

    const queue = [...(forwardTargets.get(rootId) ?? [])];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (visited.has(id)) continue;
      visited.add(id);
      const set = greyEligible.get(id);
      if (set) for (const k of greyWindowKeys) set.add(k);
      else greyEligible.set(id, new Set(greyWindowKeys));
      for (const next of forwardTargets.get(id) ?? []) queue.push(next);
    }
  }

  // 3. Each "definition" node's per-window status.
  const result = new Map<string, NodeStatusResult>();
  for (const node of model.nodes) {
    if (node.kind === "channel") {
      result.set(node.id, aggregate(channelPerWindow.get(node.id) ?? []));
      continue;
    }
    if (node.kind === "chart") {
      result.set(node.id, aggregate(chartPerWindow(node, usableWindows, windows, greyEligible)));
      continue;
    }
    result.set(node.id, aggregate(definitionPerWindow(node, usableWindows, windows, greyEligible)));
  }

  return result;
}

/** One `"definition"` node's per-window status array (see the module doc
 *  comment's algorithm). Split out of {@link computeNodeStatuses} to keep
 *  that function's three passes readable in sequence. */
function definitionPerWindow(
  node: GraphNode,
  usableWindows: SelectedWindow[],
  windows: Map<string, WindowEvalState>,
  greyEligible: Map<string, Set<string>>
): PerWindowStatus[] {
  const eligibleWindowKeys = greyEligible.get(node.id);

  return usableWindows.map((w) => {
    const key = wireWindowKey(w);
    const state = windows.get(key);
    if (state === undefined) return "pending"; // R141 Q2 — this window hasn't evaluated at all yet
    // state.kind === "error" windows were already excluded from usableWindows.
    const output = state.kind === "ok" ? state.outputs.get(node.cellId ?? "") : undefined;
    const defResult = output?.defs.find((d) => d.name === node.name);
    // `state` being present means this window's evaluation has *finished* —
    // so an absent `defs` entry here is never "not evaluated yet" (that
    // case already returned above). `CellDefResult`'s own doc comment: "a
    // structural problem on this definition keeps it out of `defs` entirely
    // ... reported, if anywhere, on the cell's own `errors` instead" — a
    // known-complete evaluation with no result for this node is a genuine,
    // permanent failure, and must read as `"error"`, never `"pending"`: a
    // pending node with nothing left to finish it would spin forever,
    // which is the same class of defect as a silently wrong value (ruling
    // R141 follow-up).
    if (defResult === undefined) return "error";
    if (defResult.error === null) return "ok";
    return eligibleWindowKeys?.has(key) ? "grey" : "error";
  });
}

/** One `"chart"` node's per-window status (R214 item 1's third kind). A
 *  `js` cell declares no definition, so it has no `CellDefResult` to read —
 *  its whole result is its `CellOutput.errors` list (C3 §3.4), which is
 *  what the notebook's own per-cell status already shows
 *  (`model/cellStatus.ts`). Decision 44's grey rule applies unchanged: a
 *  chart downstream of a channel this window's session simply doesn't carry
 *  greys out rather than reporting a fault of its own. */
function chartPerWindow(
  node: GraphNode,
  usableWindows: SelectedWindow[],
  windows: Map<string, WindowEvalState>,
  greyEligible: Map<string, Set<string>>
): PerWindowStatus[] {
  const eligibleWindowKeys = greyEligible.get(node.id);

  return usableWindows.map((w) => {
    const key = wireWindowKey(w);
    const state = windows.get(key);
    if (state === undefined) return "pending"; // this window hasn't evaluated at all yet
    const output = state.kind === "ok" ? state.outputs.get(node.cellId ?? "") : undefined;
    if (output === undefined || output.errors.length > 0) {
      return eligibleWindowKeys?.has(key) ? "grey" : "error";
    }
    return "ok";
  });
}
