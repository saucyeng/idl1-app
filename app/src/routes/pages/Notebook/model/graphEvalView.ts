/**
 * What each node on the maths map is *doing* right now (ruling R250) — the
 * map as the evaluation view, rather than a picture of the last completed
 * run.
 *
 * Isaac, 2026-09-20: "maybe we can integrate this better into the flow map,
 * so i can see at a glance where it's working, and if one of the steps has
 * an error, which branches won't calculate."
 *
 * This is a **view layer over** `model/graphStatus.ts`, not a replacement
 * for it. `computeNodeStatuses` answers the question C2 §3.7 asks — did
 * this definition evaluate, in every selected window, and if not is that a
 * typo (red) or a session gap (grey, decision 44)? That answer is unchanged
 * and still authoritative. This module adds the three live states the
 * notebook already knows about per *cell* (`model/cellStatus.ts`) and the
 * blocked subgraph (`model/blockedCells.ts`), so the same card can say "this
 * one is reading IMU0_AccelZ right now" and "this branch is not going to
 * calculate at all".
 *
 * Pure: no React, no DOM, no clock, no IPC. Nothing here triggers an
 * evaluation — the map is a reader of state, never a cause of it (CLAUDE.md
 * §3's interaction-path rule).
 */
import type { BlockedBy, FailingNode } from "./blockedCells";
import type { CellStatus } from "./cellStatus";
import type { GraphModel } from "./graphModel";
import type { NodeStatusResult } from "./graphStatus";

/**
 * One node's live state on the map.
 *
 * `"pending"`, `"ok"`, `"error"` and `"grey"` are `model/graphStatus.ts`'s
 * own four, unchanged in meaning. The rest are R250's:
 *
 * - `"fetching"` — this node's cell is reading channels (a progress arc).
 * - `"evaluating"` / `"rendering"` — this node's cell is working (a pulse).
 * - `"blocked"` — an upstream node failed, so this one will not calculate.
 *   Dimmed, with its incoming edges dashed, and **no glyph**: a status
 *   implies the node was asked to run, and this one was not.
 */
export type NodeEvalState = "pending" | "fetching" | "evaluating" | "rendering" | "ok" | "error" | "grey" | "blocked";

/** The states that mean a node is working right now — the ones that pulse
 *  (`"fetching"` draws its arc instead, since it has a real fraction). */
export function isNodeWorking(state: NodeEvalState): boolean {
  return state === "fetching" || state === "evaluating" || state === "rendering";
}

/** Everything one node's card draws, and everything its hover card says. */
export interface NodeEvalView {
  state: NodeEvalState;
  /** `[0, 1]` for `"fetching"`, `null` otherwise — the progress arc. */
  fraction: number | null;
  /** The nearest upstream failure, for `"blocked"`; `null` otherwise. */
  blockedBy: BlockedBy | null;
  /** This node's own error text, for `"error"`; `null` otherwise. */
  error: string | null;
  /** R132's named split ("2 of 3 windows"), carried through unchanged. */
  split: string | null;
}

/** Everything {@link computeNodeEvalViews} needs. */
export interface NodeEvalViewInputs {
  model: GraphModel;
  /** `computeNodeStatuses`' answer, keyed by node id. */
  statuses: ReadonlyMap<string, NodeStatusResult>;
  /** `blockedNodes`' answer, keyed by node id. */
  blocked: ReadonlyMap<string, BlockedBy>;
  /** `failingNodes`' answer, keyed by node id — where an `"error"` node's
   *  message comes from. */
  failing: ReadonlyMap<string, FailingNode>;
  /** This node's owning cell's live state (`model/cellStatus.ts`).
   *  `null` for a node with no cell, or a cell the caller cannot resolve. */
  cellStatusOf: (cellId: string) => CellStatus | null;
  /** That cell's decode fraction, `[0, 1]` or `null`. */
  cellFractionOf: (cellId: string) => number | null;
}

/**
 * Every node's {@link NodeEvalView}, keyed by node id.
 *
 * Precedence, first match wins:
 *
 * 1. `"blocked"` — an upstream failure. Above everything, for the same
 *    reason the cell frame puts it first: a blocked node's "pending" is a
 *    lie, since nothing is going to finish it.
 * 2. `"error"` — a real evaluation failure.
 * 3. `"grey"` — decision 44's session gap. Above the live states because it
 *    is not a phase this node passes through: this session simply has no
 *    such input, whatever the document is doing.
 * 4. The owning cell's live state, when it is working. Above `"ok"` so a
 *    node that is re-reading its channels reads as busy rather than as
 *    finished with last time's answer.
 * 5. `"ok"` / `"pending"` — `computeNodeStatuses`' own answer.
 *
 * A node with no owning cell (an unresolved source) has no live state to
 * take; it falls through to its own status, which is the only thing known
 * about it.
 */
export function computeNodeEvalViews(inputs: NodeEvalViewInputs): Map<string, NodeEvalView> {
  const views = new Map<string, NodeEvalView>();

  for (const node of inputs.model.nodes) {
    const status = inputs.statuses.get(node.id)?.status ?? "pending";
    const split = inputs.statuses.get(node.id)?.split ?? null;

    const blockedBy = inputs.blocked.get(node.id) ?? null;
    if (blockedBy !== null) {
      views.set(node.id, { state: "blocked", fraction: null, blockedBy, error: null, split });
      continue;
    }

    if (status === "error") {
      views.set(node.id, { state: "error", fraction: null, blockedBy: null, error: inputs.failing.get(node.id)?.message ?? null, split });
      continue;
    }

    if (status === "grey") {
      views.set(node.id, { state: "grey", fraction: null, blockedBy: null, error: null, split });
      continue;
    }

    const live = node.cellId === null ? null : inputs.cellStatusOf(node.cellId);
    if (live === "fetching" && node.cellId !== null) {
      views.set(node.id, { state: "fetching", fraction: inputs.cellFractionOf(node.cellId), blockedBy: null, error: null, split });
      continue;
    }
    if (live === "evaluating" || live === "rendering") {
      views.set(node.id, { state: live, fraction: null, blockedBy: null, error: null, split });
      continue;
    }

    views.set(node.id, { state: status, fraction: null, blockedBy: null, error: null, split });
  }

  return views;
}

/**
 * The hover/focus card's text for one node (the R250 spec's §3.3): its
 * state, how long it has been in it, its error, its "blocked by".
 *
 * One string, newline-separated, because that is what a `title` attribute
 * renders — the same affordance every other card on this canvas already
 * uses for its `def_line`. Lines with nothing to say are left out rather
 * than printed empty.
 *
 * @param durationMs How long this node has been in its current state, or
 *   `null` when it has not been timed. Passed in: this module has no clock.
 */
export function describeNodeEval(view: NodeEvalView, durationMs: number | null): string {
  const lines: string[] = [];

  switch (view.state) {
    case "fetching":
      lines.push(view.fraction === null ? "Fetching channels" : `Fetching channels · ${Math.floor(Math.min(Math.max(view.fraction, 0), 1) * 100)} %`);
      break;
    case "evaluating":
      lines.push("Evaluating");
      break;
    case "rendering":
      lines.push("Rendering");
      break;
    case "blocked":
      lines.push(view.blockedBy === null ? "Blocked by an upstream failure" : `Blocked by ${view.blockedBy.cellLabel}: ${view.blockedBy.message}`);
      break;
    case "error":
      lines.push(view.error === null ? "Evaluation failed" : `Failed: ${view.error}`);
      break;
    case "grey":
      lines.push("Not in this session");
      break;
    case "ok":
      lines.push("Evaluated");
      break;
    case "pending":
      lines.push("Not evaluated yet");
      break;
  }

  if (view.split !== null) lines.push(view.split);
  if (durationMs !== null) lines.push(`${Math.floor(durationMs / 1000)} s`);

  return lines.join("\n");
}
