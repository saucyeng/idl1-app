/**
 * Ruling R214 item 1: **node kind is carried by shape and glyph; colour is
 * optional.** The graph shows three kinds of thing — a *source* (a device
 * channel), a *derived* value (a maths definition), and a *chart* (a `js`
 * cell's output) — and a reader has to be able to tell them apart without
 * relying on hue at all. So the encoding is structural first: a corner
 * radius, a glyph, and a type face. The colour stripe is an opt-in
 * Settings toggle ("Colour-code graph nodes", off by default) and
 * **nothing depends on it** — every cue below reads the same in monochrome.
 *
 * The decision table alone, so the cues can be read and tested in one
 * place rather than inferred from three branches inside `NodeCard.tsx`'s
 * JSX, and so the palette rail's legend (R214's "a one-line key in the
 * palette rail footer") names exactly the same three things the cards draw.
 */

import type { GraphNode } from "../model/graphModel";

/** R214's own display vocabulary for a node's kind — see
 *  {@link GraphNode.kind} for why the model keeps different words. */
export type NodeKind = "source" | "derived" | "chart";

/** How one kind draws. Every field is a class or a literal `NodeCard.tsx`
 *  applies verbatim; this module renders nothing itself. */
export interface NodeKindCue {
  /** The word a reader sees in the legend. */
  label: string;
  /** The one-line legend hint after {@link label}. */
  hint: string;
  /** The card's own corner treatment — R214's "source cards have a
   *  square-cornered left edge", "derived cards are rounded". */
  cardShapeClass: string;
  /** The type face the node's name is set in — R214's "the channel name in
   *  mono" for a source, "the definition name in the body face" for a
   *  derived value. Empty means "inherit the body face". */
  nameFaceClass: string;
  /** Which glyph the card's header carries — a small waveform for a
   *  source, `ƒ` for a derived value, and the cell's own chart-type
   *  pictogram (`chartTypeIcons.tsx`) for a chart. `NodeCard.tsx` draws
   *  each; this names which. */
  glyph: "waveform" | "function" | "chart-type";
  /** Whether the card carries R214's "thin bottom rule" — the chart card's
   *  own third cue, so it is not told apart from a derived card by its
   *  glyph alone. */
  bottomRule: boolean;
  /** Which `--chart-N` token the optional 4 px left stripe uses. */
  stripeVar: string;
}

/**
 * Which R214 kind a graph node is. A `"channel"` node is a source whether
 * it names a real device channel or a reference nothing defines — the
 * card's *status* is what tells those apart (`graphStatus.ts`), never its
 * kind.
 *
 * @param kind - The node's model-side kind.
 */
export function nodeKindOf(kind: GraphNode["kind"]): NodeKind {
  if (kind === "channel") return "source";
  if (kind === "chart") return "chart";
  return "derived";
}

/** Every kind's cues, in legend order (source → derived → chart: the order
 *  data actually flows through the graph). */
export const NODE_KIND_CUES: Record<NodeKind, NodeKindCue> = {
  source: {
    label: "Source",
    hint: "device channel",
    cardShapeClass: "rounded-l-none rounded-r-[var(--radius-card)]",
    nameFaceClass: "font-mono",
    glyph: "waveform",
    bottomRule: false,
    stripeVar: "var(--chart-1)",
  },
  derived: {
    label: "Derived",
    hint: "maths definition",
    cardShapeClass: "rounded-[var(--radius-card)]",
    nameFaceClass: "",
    glyph: "function",
    bottomRule: false,
    stripeVar: "var(--chart-2)",
  },
  chart: {
    label: "Chart",
    hint: "cell output",
    cardShapeClass: "rounded-[var(--radius-card)]",
    nameFaceClass: "",
    glyph: "chart-type",
    bottomRule: true,
    stripeVar: "var(--chart-3)",
  },
};

/** The legend's kinds, in the order {@link NODE_KIND_CUES} states. */
export const NODE_KINDS: readonly NodeKind[] = ["source", "derived", "chart"];
