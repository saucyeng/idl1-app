import { describe, expect, it } from "vitest";

import type { TimePlotProps } from "../../plotForm/types";
import type { PlotThemeOptions } from "../../theme/plotTheme";
import type { CombinedChannelPayload } from "../channelBindDriver";
import { buildPlotOptions, MissingChannelDataError } from "./renderChart";

function payload(overrides: Partial<CombinedChannelPayload> = {}): CombinedChannelPayload {
  return {
    length: 4,
    t: new Float64Array([0, 1, NaN, 2]),
    v: new Float64Array([10, 11, NaN, 12]),
    w: new Float64Array([0, 0, NaN, 1]),
    windows: [
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-3", label: "Lap 1" },
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-5", label: "Lap 2" },
    ],
    spans: [],
    ...overrides,
  };
}

const theme: PlotThemeOptions = { grid: "#353a32", marginLeft: 48, style: { color: "#9a968a" } };

/** A stand-in for the real `@observablehq/plot` module (no `jsdom` in this
 *  worktree, ruling R173 — see `renderChart.ts`'s own doc comment): records
 *  every mark constructor call `buildPlotOptions` makes instead of building
 *  a real SVG mark. */
function fakePlot() {
  const calls: { name: string; data: unknown; options: unknown }[] = [];
  const record =
    (name: string) =>
    (data: unknown, options: unknown): unknown => {
      calls.push({ name, data, options });
      return { kind: name };
    };
  const Plot = {
    lineY: record("lineY"),
    dot: record("dot"),
    areaY: record("areaY"),
    rectY: record("rectY"),
    ruleY: record("ruleY"),
  } as unknown as typeof import("@observablehq/plot");
  return { Plot, calls };
}

function timeProps(marks: TimePlotProps["marks"], extra: Partial<TimePlotProps> = {}): TimePlotProps {
  return { chart: "time", marks, ...extra };
}

describe("buildPlotOptions", () => {
  it("a mark with no author stroke — one Plot call per window, each in that window's own --chart-N colour", () => {
    const { Plot, calls } = fakePlot();
    const channelData = new Map([["speed", payload()]]);

    buildPlotOptions(timeProps([{ channel: "speed", mark: "lineY", lap: null }]), channelData, theme, ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"], Plot);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ name: "lineY", options: { x: "t", y: "v", stroke: "c3" } });
    expect(calls[0].data).toEqual([
      { t: 0, v: 10 },
      { t: 1, v: 11 },
    ]);
    expect(calls[1]).toMatchObject({ options: { stroke: "c5" } });
    expect(calls[1].data).toEqual([{ t: 2, v: 12 }]);
  });

  it("a mark with its own fixed stroke — one Plot call over every window's samples, break rows included", () => {
    const { Plot, calls } = fakePlot();
    const channelData = new Map([["speed", payload()]]);

    buildPlotOptions(timeProps([{ channel: "speed", mark: "lineY", lap: null, stroke: "#ff0000", strokeWidth: 2 }]), channelData, theme, [], Plot);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ options: { x: "t", y: "v", stroke: "#ff0000", strokeWidth: 2 } });
    expect((calls[0].data as unknown[]).length).toBe(4);
  });

  it("a mark whose channel has no supplied data — throws MissingChannelDataError, never a silent partial chart", () => {
    const { Plot } = fakePlot();

    expect(() => buildPlotOptions(timeProps([{ channel: "missing", mark: "lineY", lap: null }]), new Map(), theme, [], Plot)).toThrow(MissingChannelDataError);
  });

  it("the theme's grid/marginLeft/style carry straight through, matching the sandbox's own themedPlot merge", () => {
    const { Plot } = fakePlot();

    const options = buildPlotOptions(timeProps([]), new Map(), theme, [], Plot);

    expect(options).toMatchObject({ grid: "#353a32", marginLeft: 48, style: { color: "#9a968a" } });
  });

  it("props.x/props.y — forwarded when present, omitted when absent", () => {
    const { Plot } = fakePlot();

    const withAxes = buildPlotOptions(timeProps([], { x: { label: "Time" }, y: { label: "Speed", domain: [0, 100] } }), new Map(), theme, [], Plot);
    const withoutAxes = buildPlotOptions(timeProps([]), new Map(), theme, [], Plot);

    expect(withAxes).toMatchObject({ x: { label: "Time" }, y: { label: "Speed", domain: [0, 100] } });
    expect(withoutAxes.x).toBeUndefined();
    expect(withoutAxes.y).toBeUndefined();
  });

  it("props.color is never forwarded — no colour channel in this report's marks for Plot's legend to key off", () => {
    const { Plot } = fakePlot();

    const options = buildPlotOptions(timeProps([], { color: { legend: true } }), new Map(), theme, [], Plot);

    expect(options).not.toHaveProperty("color");
  });

  it("a single-window payload — one Plot call, no split needed to tell windows apart", () => {
    const { Plot, calls } = fakePlot();
    const single = payload({
      length: 2,
      t: new Float64Array([0, 1]),
      v: new Float64Array([5, 6]),
      w: new Float64Array([0, 0]),
      windows: [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1", label: "Lap 1" }],
    });
    const channelData = new Map([["speed", single]]);

    buildPlotOptions(timeProps([{ channel: "speed", mark: "dot", lap: null }]), channelData, theme, ["c1"], Plot);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "dot", options: { stroke: "c1" } });
  });

  it("a malformed colour token — falls back to the raw token string rather than throwing", () => {
    const { Plot, calls } = fakePlot();
    const bad = payload({
      length: 1,
      t: new Float64Array([0]),
      v: new Float64Array([1]),
      w: new Float64Array([0]),
      windows: [{ sessionId: "s1", span: { kind: "session" }, colour: "--not-a-chart-token", label: "Lap 1" }],
    });

    buildPlotOptions(timeProps([{ channel: "speed", mark: "lineY", lap: null }]), new Map([["speed", bad]]), theme, ["c1"], Plot);

    expect(calls[0]).toMatchObject({ options: { stroke: "--not-a-chart-token" } });
  });
});
