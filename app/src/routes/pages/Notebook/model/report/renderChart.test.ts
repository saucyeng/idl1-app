import { describe, expect, it } from "vitest";
import * as Plot from "@observablehq/plot";

import type { TimePlotProps } from "../../plotForm/types";
import type { PlotThemeOptions } from "../../theme/plotTheme";
import { AxisKind } from "../../../../../ipc/hostChannel";
import type { CombinedChannelPayload } from "../channelBindDriver";
import { buildPlotOptions, MissingChannelDataError } from "./renderChart";

/** The real `@observablehq/plot` module, statically imported here (not by
 *  `renderChart.ts`'s own production path, which awaits it dynamically so
 *  it lands in a lazily-fetched chunk, plan §2.3). A *mark* constructor
 *  (`Plot.lineY`, `Plot.dot`, …) does no DOM work at all — only
 *  `Plot.plot(...)` itself needs a real `document` (confirmed against this
 *  worktree's actual `@observablehq/plot`; there is no `jsdom` here and
 *  adding one is out of this lane's scope, ruling R173's amendment) — so
 *  `buildPlotOptions` can be exercised with the genuine mark objects it
 *  will build in production, asserting on their real, documented fields
 *  (`data`, `channels.x/y.value`, `stroke`, `strokeWidth`) rather than a
 *  stub that exists only to be called. */
function payload(overrides: Partial<CombinedChannelPayload> = {}): CombinedChannelPayload {
  return {
    length: 4,
    t: new Float64Array([0, 1, NaN, 2]),
    v: new Float64Array([10, 11, NaN, 12]),
    tr: new Float64Array([0, 1, NaN, 0]),
    w: new Float64Array([0, 0, NaN, 1]),
    windows: [
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-3", label: "Lap 1" },
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-5", label: "Lap 2" },
    ],
    spans: [],
    axisKind: AxisKind.Time,
    ...overrides,
  };
}

/** The shape of a real `@observablehq/plot` mark, as far as these tests
 *  read it. Only the fields asserted below are named. Every `stroke` value
 *  this module ever builds (`renderChart.ts`'s `windowColour`/
 *  `FALLBACK_STROKE`) is a colour Plot itself recognises as a literal —
 *  `"#rrggbb"`, `"currentColor"`, or a CSS colour keyword — so Plot always
 *  keeps it at the plain `mark.stroke` field, never routes it into
 *  `channels.stroke` as a data-channel binding (that only happens for a
 *  string Plot does *not* recognise as a colour, `renderChart.ts`'s own
 *  `FALLBACK_STROKE` doc comment). */
interface MarkShape {
  data: unknown;
  stroke: unknown;
  strokeWidth: unknown;
  constructor: { name: string };
  channels: { x?: { value: unknown }; y?: { value: unknown } };
}

const theme: PlotThemeOptions = { grid: "#353a32", marginLeft: 48, style: { color: "#9a968a" } };

function timeProps(marks: TimePlotProps["marks"], extra: Partial<TimePlotProps> = {}): TimePlotProps {
  return { chart: "time", marks, ...extra };
}

describe("buildPlotOptions", () => {
  it("a mark with no author stroke — one mark per window, each in that window's own --chart-N colour", () => {
    const channelData = new Map([["speed", payload()]]);

    const options = buildPlotOptions(timeProps([{ channel: "speed", mark: "lineY", lap: null }]), channelData, theme, ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"], Plot);

    expect(options.marks).toHaveLength(2);
    const [first, second] = options.marks as unknown as MarkShape[];
    expect(first.channels.x!.value).toBe("t");
    expect(first.channels.y!.value).toBe("v");
    expect(first.stroke).toBe("#333333");
    // Every record carries `tr` alongside `t` (ruling R215 items 4-5) —
    // which of the two a mark binds is the mark's own `xField`, asserted
    // on `channels.x.value` above.
    expect(first.data).toEqual([
      { t: 0, v: 10, tr: 0 },
      { t: 1, v: 11, tr: 1 },
    ]);
    expect(second.stroke).toBe("#555555");
    expect(second.data).toEqual([{ t: 2, v: 12, tr: 0 }]);
  });

  it("a mark bound to the lap-relative column — binds x to \"tr\", not silently to session time (R215 items 4-5)", () => {
    // Arrange — without this, a report of a lap-pair overlay would redraw
    // the laps end to end instead of superimposed.
    const channelData = new Map([["speed", payload()]]);

    // Act
    const options = buildPlotOptions(
      timeProps([{ channel: "speed", mark: "lineY", lap: null, xField: "tr" }]),
      channelData,
      theme,
      ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
      Plot
    );

    // Assert
    const [first] = options.marks as unknown as MarkShape[];
    expect(first.channels.x!.value).toBe("tr");
    expect(first.channels.y!.value).toBe("v");
  });

  it("a zeroLine cell — puts Plot.ruleY([0]) first, so it draws under the data (R215 item 5)", () => {
    // Arrange
    const channelData = new Map([["speed", payload()]]);

    // Act
    const options = buildPlotOptions(
      timeProps([{ channel: "speed", mark: "lineY", lap: null }], { zeroLine: true }),
      channelData,
      theme,
      ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
      Plot
    );

    // Assert — one rule plus one mark per window.
    expect(options.marks).toHaveLength(3);
    const [rule] = options.marks as unknown as MarkShape[];
    expect(rule.data).toEqual([0]);
  });

  it("no zeroLine — adds no rule, byte-identical to before the option existed", () => {
    // Arrange
    const channelData = new Map([["speed", payload()]]);

    // Act
    const options = buildPlotOptions(
      timeProps([{ channel: "speed", mark: "lineY", lap: null }]),
      channelData,
      theme,
      ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
      Plot
    );

    // Assert
    expect(options.marks).toHaveLength(2);
  });

  it("a mark with its own fixed stroke — one mark over every window's samples, break rows included", () => {
    const channelData = new Map([["speed", payload()]]);

    const options = buildPlotOptions(timeProps([{ channel: "speed", mark: "lineY", lap: null, stroke: "#ff0000", strokeWidth: 2 }]), channelData, theme, [], Plot);

    expect(options.marks).toHaveLength(1);
    const [mark] = options.marks as unknown as MarkShape[];
    expect(mark.stroke).toBe("#ff0000");
    expect(mark.strokeWidth).toBe(2);
    expect(mark.data).toHaveLength(4);
  });

  it("a mark whose channel has no supplied data — throws MissingChannelDataError, never a silent partial chart", () => {
    expect(() => buildPlotOptions(timeProps([{ channel: "missing", mark: "lineY", lap: null }]), new Map(), theme, [], Plot)).toThrow(MissingChannelDataError);
  });

  it("the theme's grid/marginLeft/style carry straight through, matching the sandbox's own themedPlot merge", () => {
    const options = buildPlotOptions(timeProps([]), new Map(), theme, [], Plot);

    expect(options).toMatchObject({ grid: "#353a32", marginLeft: 48, style: { color: "#9a968a" } });
  });

  it("props.x/props.y — forwarded when present, omitted when absent", () => {
    const withAxes = buildPlotOptions(timeProps([], { x: { label: "Time" }, y: { label: "Speed", domain: [0, 100] } }), new Map(), theme, [], Plot);
    const withoutAxes = buildPlotOptions(timeProps([]), new Map(), theme, [], Plot);

    expect(withAxes).toMatchObject({ x: { label: "Time" }, y: { label: "Speed", domain: [0, 100] } });
    expect(withoutAxes.x).toBeUndefined();
    expect(withoutAxes.y).toBeUndefined();
  });

  it("props.color is never forwarded — no colour channel in this report's marks for Plot's legend to key off", () => {
    const options = buildPlotOptions(timeProps([], { color: { legend: true } }), new Map(), theme, [], Plot);

    expect(options).not.toHaveProperty("color");
  });

  it("a single-window payload — one mark, no split needed to tell windows apart", () => {
    const single = payload({
      length: 2,
      t: new Float64Array([0, 1]),
      v: new Float64Array([5, 6]),
      w: new Float64Array([0, 0]),
      windows: [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1", label: "Lap 1" }],
    });
    const channelData = new Map([["speed", single]]);

    const options = buildPlotOptions(timeProps([{ channel: "speed", mark: "dot", lap: null }]), channelData, theme, ["#111111"], Plot);

    expect(options.marks).toHaveLength(1);
    const [mark] = options.marks as unknown as MarkShape[];
    expect(mark.constructor.name).toBe("Dot");
    expect(mark.stroke).toBe("#111111");
  });

  it("a malformed colour token — falls back to currentColor rather than throwing or binding a stray data channel", () => {
    const bad = payload({
      length: 1,
      t: new Float64Array([0]),
      v: new Float64Array([1]),
      w: new Float64Array([0]),
      windows: [{ sessionId: "s1", span: { kind: "session" }, colour: "--not-a-chart-token", label: "Lap 1" }],
    });

    const options = buildPlotOptions(timeProps([{ channel: "speed", mark: "lineY", lap: null }]), new Map([["speed", bad]]), theme, ["#111111"], Plot);

    // "--not-a-chart-token" is not a colour Plot recognises, so returning it
    // verbatim as `stroke` would not render "unstyled" -- Plot would read it
    // as a *data channel* name instead (confirmed against this worktree's
    // actual `@observablehq/plot`) and silently bind a channel to a field
    // no record has. `"currentColor"` is always a valid colour keyword, so
    // it is always read as the literal it is (see `MarkShape`'s own doc
    // comment on where a channel-bound value would otherwise end up).
    const [mark] = options.marks as unknown as MarkShape[];
    expect(mark.stroke).toBe("currentColor");
  });
});
