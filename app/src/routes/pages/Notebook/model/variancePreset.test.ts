/**
 * The lap variance preset and the plot-level x-binding controls behind it
 * (ruling R215 item 4), plus the lap-relative column `combineChannelWindows`
 * derives for them.
 */
import { describe, expect, it } from "vitest";

import { combineChannelWindows, type WindowDescriptor } from "../host/protocol";
import { generate } from "../plotForm/generate";
import { parse } from "../plotForm/parse";
import type { TimePlotProps } from "../plotForm/types";
import { defaultVariancePlotProps, setTimeXField, timeXFieldOf } from "./propertiesForm";
import { TIME_CHART_X_AXIS_OPTIONS, DISTANCE_X_MODE_DISABLED_REASON } from "./xMode";

const CHANNELS = [{ id: "fork_delta", label: "fork_delta", unit: "s" }];

function descriptor(label: string): WindowDescriptor {
  return { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1", label };
}

describe("defaultVariancePlotProps", () => {
  it("defaultVariancePlotProps — one line mark on the definition, bound to the lap-relative column", () => {
    // Act
    const props = defaultVariancePlotProps(CHANNELS);

    // Assert
    expect(props.chart).toBe("time");
    expect(props.marks).toEqual([{ channel: "fork_delta", mark: "lineY", xField: "tr" }]);
  });

  it("defaultVariancePlotProps — labels the x axis as lap time, not session time", () => {
    // Act
    const props = defaultVariancePlotProps(CHANNELS);

    // Assert
    expect(props.x?.label).toBe("Lap time (s)");
  });

  it("defaultVariancePlotProps — sets no per-mark lap — the overlay is the window selection, not a narrowed fetch", () => {
    // Act
    const props = defaultVariancePlotProps(CHANNELS);

    // Assert — `MarkProps.lap` is plumbed but not applied to narrow a
    // fetch, so seeding it would promise a narrowing that does not happen.
    expect(props.marks[0].lap).toBeUndefined();
  });

  it("defaultVariancePlotProps — round-trips through the grammar unchanged", () => {
    // Arrange — `parse` normalises a mark's omitted `lap` to `null`, so
    // the round trip is compared on the generated code rather than on a
    // deep equality of the seed props themselves.
    const props = defaultVariancePlotProps(CHANNELS);

    // Act
    const code = generate(props);

    // Assert
    expect(parse(code)).not.toBeNull();
    expect(generate(parse(code) as TimePlotProps)).toBe(code);
    expect(code).toContain('{ x: "tr", y: "v" }');
  });

  it("defaultVariancePlotProps — no channels at all — still generates valid code", () => {
    // Act
    const props = defaultVariancePlotProps([]);

    // Assert
    expect(props.marks[0].channel).toBe("");
    expect(parse(generate(props))).not.toBeNull();
  });
});

describe("setTimeXField / timeXFieldOf", () => {
  const twoMarks: TimePlotProps = {
    chart: "time",
    marks: [
      { channel: "a", mark: "lineY" },
      { channel: "b", mark: "dot" },
    ],
  };

  it("setTimeXField — \"tr\" — sets every mark, not just the first (a plot has one x scale)", () => {
    // Act
    const next = setTimeXField(twoMarks, "tr");

    // Assert
    expect(next.marks.every((m) => m.xField === "tr")).toBe(true);
  });

  it("setTimeXField — undefined — drops the field from every mark rather than writing an explicit \"t\"", () => {
    // Arrange
    const lapRelative = setTimeXField(twoMarks, "tr");

    // Act
    const next = setTimeXField(lapRelative, undefined);

    // Assert
    expect(next.marks.every((m) => !("xField" in m))).toBe(true);
    expect(generate(next)).toBe(generate(twoMarks));
  });

  it("setTimeXField — never mutates the input props", () => {
    // Act
    setTimeXField(twoMarks, "tr");

    // Assert
    expect(twoMarks.marks[0].xField).toBeUndefined();
  });

  it("timeXFieldOf — every mark on the lap-relative column — reports \"tr\"", () => {
    // Assert
    expect(timeXFieldOf(setTimeXField(twoMarks, "tr"))).toBe("tr");
  });

  it("timeXFieldOf — a mixed cell — reports session time, never a description that fits only one mark", () => {
    // Arrange — a hand edit: one mark on each column.
    const mixed: TimePlotProps = { chart: "time", marks: [{ channel: "a", mark: "lineY", xField: "tr" }, { channel: "b", mark: "dot" }] };

    // Assert
    expect(timeXFieldOf(mixed)).toBeUndefined();
  });

  it("timeXFieldOf — an empty marks array — reports session time, the default", () => {
    // Assert
    expect(timeXFieldOf({ chart: "time", marks: [] })).toBeUndefined();
  });
});

describe("TIME_CHART_X_AXIS_OPTIONS", () => {
  it("TIME_CHART_X_AXIS_OPTIONS — session and lap time are selectable; distance is present and disabled (R136)", () => {
    // Assert
    const byValue = new Map(TIME_CHART_X_AXIS_OPTIONS.map((o) => [o.value, o]));
    expect(byValue.get("t")?.disabledReason).toBeUndefined();
    expect(byValue.get("tr")?.disabledReason).toBeUndefined();
    expect(byValue.get("distance")?.disabledReason).toBe(DISTANCE_X_MODE_DISABLED_REASON);
  });

  it("TIME_CHART_X_AXIS_OPTIONS — every option has a non-empty label and blurb", () => {
    // Assert
    for (const option of TIME_CHART_X_AXIS_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.blurb.length).toBeGreaterThan(0);
    }
  });

  it("TIME_CHART_X_AXIS_OPTIONS — distance's reason names the lap-alignment problem, not a vague \"coming soon\"", () => {
    // Assert
    expect(DISTANCE_X_MODE_DISABLED_REASON).toMatch(/align/i);
  });
});

describe("combineChannelWindows — the lap-relative column", () => {
  it("combineChannelWindows — one window — tr is t rebased to that window's own first sample", () => {
    // Arrange — a lap window whose first sample is at t = 100 s.
    const t = new Float64Array([100, 101, 102]);
    const v = new Float64Array([1, 2, 3]);

    // Act
    const combined = combineChannelWindows([{ descriptor: descriptor("Lap 1"), t, v }]);

    // Assert
    expect(Array.from(combined.tr)).toEqual([0, 1, 2]);
    expect(Array.from(combined.t)).toEqual([100, 101, 102]);
  });

  it("combineChannelWindows — two windows — each starts at zero, so the two laps superimpose", () => {
    // Arrange — two laps far apart in session time.
    const a = { descriptor: descriptor("Lap 1"), t: new Float64Array([100, 101]), v: new Float64Array([1, 2]) };
    const b = { descriptor: descriptor("Lap 2"), t: new Float64Array([500, 501.5]), v: new Float64Array([3, 4]) };

    // Act
    const combined = combineChannelWindows([a, b]);

    // Assert — one NaN break row between the two, then lap 2 from zero.
    expect(Array.from(combined.tr)).toEqual([0, 1, NaN, 0, 1.5]);
  });

  it("combineChannelWindows — the break row — carries NaN in tr, matching t", () => {
    // Arrange
    const a = { descriptor: descriptor("Lap 1"), t: new Float64Array([0]), v: new Float64Array([1]) };
    const b = { descriptor: descriptor("Lap 2"), t: new Float64Array([9]), v: new Float64Array([2]) };

    // Act
    const combined = combineChannelWindows([a, b]);

    // Assert
    expect(Number.isNaN(combined.tr[1])).toBe(true);
    expect(Number.isNaN(combined.t[1])).toBe(true);
  });

  it("combineChannelWindows — no windows — tr is empty alongside t and v", () => {
    // Act
    const combined = combineChannelWindows([]);

    // Assert
    expect(combined.tr.length).toBe(0);
  });

  it("combineChannelWindows — tr is the same length as t, always", () => {
    // Arrange
    const a = { descriptor: descriptor("Lap 1"), t: new Float64Array([0, 1, 2]), v: new Float64Array([1, 2, 3]) };
    const b = { descriptor: descriptor("Lap 2"), t: new Float64Array([9]), v: new Float64Array([4]) };

    // Act
    const combined = combineChannelWindows([a, b]);

    // Assert
    expect(combined.tr.length).toBe(combined.t.length);
    expect(combined.tr.length).toBe(combined.length);
  });
});
