import { describe, expect, it } from "vitest";

import type { PlotProps } from "../plotForm";
import {
  addMark,
  advanceFormState,
  defaultPlotProps,
  deriveFormViewState,
  INITIAL_FORM_STATE,
  moveMark,
  removeMark,
  resetToFormCode,
  setColorLegend,
  updateMark,
  updateXAxis,
  updateYAxis,
} from "./propertiesForm";

const ONE_MARK: PlotProps = { marks: [{ channel: "fork_travel", mark: "lineY" }] };
const ONE_MARK_PARSED: PlotProps = { marks: [{ channel: "fork_travel", mark: "lineY", lap: null }] };

describe("deriveFormViewState", () => {
  it("deriveFormViewState — recognised plotForm code — returns parsed props, not custom", () => {
    const code = 'Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_travel"), { x: "t", y: "v" })\n  ]\n})';

    const view = deriveFormViewState(code);

    expect(view.isCustom).toBe(false);
    expect(view.props).toEqual(ONE_MARK_PARSED);
  });

  it("deriveFormViewState — code outside the plotForm subset — greys to custom", () => {
    const view = deriveFormViewState("const x = 1;");

    expect(view.isCustom).toBe(true);
    expect(view.props).toBeNull();
  });
});

describe("advanceFormState", () => {
  it("advanceFormState — code parses — updates lastKnownProps to the fresh props", () => {
    const code = 'Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_travel"), { x: "t", y: "v" })\n  ]\n})';

    const next = advanceFormState(INITIAL_FORM_STATE, code);

    expect(next.view.isCustom).toBe(false);
    expect(next.lastKnownProps).toEqual(ONE_MARK_PARSED);
  });

  it("advanceFormState — code is custom — keeps the previous lastKnownProps", () => {
    const parsedState = advanceFormState(
      INITIAL_FORM_STATE,
      'Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_travel"), { x: "t", y: "v" })\n  ]\n})'
    );

    const next = advanceFormState(parsedState, "const x = 1;");

    expect(next.view.isCustom).toBe(true);
    expect(next.view.props).toBeNull();
    expect(next.lastKnownProps).toEqual(ONE_MARK_PARSED);
  });

  it("advanceFormState — cell never once parsed — lastKnownProps stays null", () => {
    const next = advanceFormState(INITIAL_FORM_STATE, "const x = 1;");

    expect(next.lastKnownProps).toBeNull();
  });
});

describe("defaultPlotProps", () => {
  it("defaultPlotProps — channels available — seeds one mark on the first channel", () => {
    const props = defaultPlotProps([{ id: "fork_travel" }, { id: "shock_travel" }]);

    expect(props).toEqual({ marks: [{ channel: "fork_travel", mark: "lineY" }] });
  });

  it("defaultPlotProps — no channels available — seeds one mark with an empty channel name", () => {
    const props = defaultPlotProps([]);

    expect(props).toEqual({ marks: [{ channel: "", mark: "lineY" }] });
  });
});

describe("resetToFormCode", () => {
  it("resetToFormCode — lastKnownProps present — generates from lastKnownProps", () => {
    const code = resetToFormCode(ONE_MARK, []);

    expect(code).toBe('Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_travel"), { x: "t", y: "v" })\n  ]\n})');
  });

  it("resetToFormCode — parse has never once succeeded — falls back to defaultPlotProps, not a no-op", () => {
    const code = resetToFormCode(null, [{ id: "fork_travel" }]);

    expect(code).toBe('Plot.plot({\n  marks: [\n    Plot.lineY(channel("fork_travel"), { x: "t", y: "v" })\n  ]\n})');
  });
});

describe("addMark / removeMark / updateMark / moveMark", () => {
  it("addMark — appends a session-scope lineY mark on the given channel", () => {
    const props = addMark(ONE_MARK, "shock_travel");

    expect(props.marks).toEqual([
      { channel: "fork_travel", mark: "lineY" },
      { channel: "shock_travel", mark: "lineY" },
    ]);
  });

  it("removeMark — in-range index — removes exactly that mark", () => {
    const two = addMark(ONE_MARK, "shock_travel");

    const props = removeMark(two, 0);

    expect(props.marks).toEqual([{ channel: "shock_travel", mark: "lineY" }]);
  });

  it("removeMark — out-of-range index — returns props unchanged", () => {
    const props = removeMark(ONE_MARK, 5);

    expect(props).toBe(ONE_MARK);
  });

  it("updateMark — in-range index — shallow-merges the patch into that mark only", () => {
    const two = addMark(ONE_MARK, "shock_travel");

    const props = updateMark(two, 1, { mark: "dot", stroke: "red" });

    expect(props.marks).toEqual([
      { channel: "fork_travel", mark: "lineY" },
      { channel: "shock_travel", mark: "dot", stroke: "red" },
    ]);
  });

  it("updateMark — out-of-range index — returns props unchanged", () => {
    const props = updateMark(ONE_MARK, 5, { stroke: "red" });

    expect(props).toBe(ONE_MARK);
  });

  it("moveMark — reorders the mark list, shifting marks between the two indices", () => {
    const three = addMark(addMark(ONE_MARK, "shock_travel"), "wheel_speed");

    const props = moveMark(three, 0, 2);

    expect(props.marks.map((m) => m.channel)).toEqual(["shock_travel", "wheel_speed", "fork_travel"]);
  });

  it("moveMark — out-of-range index — returns props unchanged", () => {
    const props = moveMark(ONE_MARK, 0, 5);

    expect(props).toBe(ONE_MARK);
  });
});

describe("updateXAxis / updateYAxis", () => {
  it("updateXAxis — sets a field — adds the x key with that field", () => {
    const props = updateXAxis(ONE_MARK, { label: "Time (s)" });

    expect(props.x).toEqual({ label: "Time (s)" });
  });

  it("updateXAxis — clearing the only set field — drops the x key entirely, not x: {}", () => {
    const withX = updateXAxis(ONE_MARK, { label: "Time (s)" });

    const props = updateXAxis(withX, { label: undefined });

    expect(props.x).toBeUndefined();
    expect("x" in props).toBe(false);
  });

  it("updateYAxis — sets type — adds the y key with that field", () => {
    const props = updateYAxis(ONE_MARK, { type: "log" });

    expect(props.y).toEqual({ type: "log" });
  });

  it("updateYAxis — clearing every field — drops the y key entirely", () => {
    const withY = updateYAxis(ONE_MARK, { label: "Speed (km/h)", domain: [0, 100] });

    const props = updateYAxis(withY, { label: undefined, domain: undefined });

    expect("y" in props).toBe(false);
  });
});

describe("setColorLegend", () => {
  it("setColorLegend — enabled true — adds the color key", () => {
    const props = setColorLegend(ONE_MARK, true);

    expect(props.color).toEqual({ legend: true });
  });

  it("setColorLegend — enabled false — drops the color key entirely", () => {
    const withColor = setColorLegend(ONE_MARK, true);

    const props = setColorLegend(withColor, false);

    expect("color" in props).toBe(false);
  });
});
