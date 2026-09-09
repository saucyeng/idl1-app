import { describe, expect, it } from "vitest";

import type { FftPlotProps, PlotProps, TimePlotProps } from "../plotForm";
import {
  addMark,
  advanceFormState,
  defaultFftPlotProps,
  defaultPlotProps,
  deriveFormViewState,
  fftScalingSelectOptions,
  INITIAL_FORM_STATE,
  moveMark,
  overlapPercent,
  removeMark,
  resetToFormCode,
  setChartType,
  setColorLegend,
  suggestAxisLabel,
  suggestSpectrumAxisLabel,
  updateFftParams,
  updateMark,
  updateXAxis,
  updateYAxis,
} from "./propertiesForm";

const ONE_MARK: TimePlotProps = { chart: "time", marks: [{ channel: "fork_travel", mark: "lineY" }] };
const ONE_MARK_PARSED: PlotProps = { chart: "time", marks: [{ channel: "fork_travel", mark: "lineY", lap: null }] };

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

    expect(props).toEqual({ chart: "time", marks: [{ channel: "fork_travel", mark: "lineY" }] });
  });

  it("defaultPlotProps — no channels available — seeds one mark with an empty channel name", () => {
    const props = defaultPlotProps([]);

    expect(props).toEqual({ chart: "time", marks: [{ channel: "", mark: "lineY" }] });
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

describe("suggestAxisLabel", () => {
  it("suggestAxisLabel — channel with a unit — suggests \"label (unit)\"", () => {
    const suggestion = suggestAxisLabel({ label: "Fork travel", unit: "mm" });

    expect(suggestion).toBe("Fork travel (mm)");
  });

  it("suggestAxisLabel — channel with no unit — suggests nothing", () => {
    const suggestion = suggestAxisLabel({ label: "Fork travel" });

    expect(suggestion).toBeUndefined();
  });

  it("suggestAxisLabel — channel with an empty-string unit — suggests nothing", () => {
    const suggestion = suggestAxisLabel({ label: "Fork travel", unit: "" });

    expect(suggestion).toBeUndefined();
  });

  it("suggestAxisLabel — no channel selected — suggests nothing", () => {
    const suggestion = suggestAxisLabel(undefined);

    expect(suggestion).toBeUndefined();
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

const CHANNELS = [{ id: "fork_velocity", label: "Fork velocity", unit: "m/s" }, { id: "shock_velocity", label: "Shock velocity" }];

describe("defaultFftPlotProps", () => {
  it("defaultFftPlotProps — a channel with a unit — seeds windowSize 2048, hopSize 1024, hann/mean/raw_magnitude/mean, x.type log, and a y label", () => {
    const props = defaultFftPlotProps(CHANNELS);

    expect(props).toEqual({
      chart: "fft",
      mark: {
        channel: "fork_velocity",
        mark: "lineY",
        fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" },
      },
      x: { label: "Frequency (Hz)", type: "log" },
      y: { label: "Magnitude (m/s)" },
    });
  });

  it("defaultFftPlotProps — no channels available — seeds an empty channel name and no y label", () => {
    const props = defaultFftPlotProps([]);

    expect(props.mark.channel).toBe("");
    expect(props.y).toBeUndefined();
  });
});

describe("suggestSpectrumAxisLabel", () => {
  it("suggestSpectrumAxisLabel — raw_magnitude scaling, a channel with a unit — suggests Magnitude (unit)", () => {
    expect(suggestSpectrumAxisLabel({ label: "Fork velocity", unit: "m/s" }, "raw_magnitude")).toBe("Magnitude (m/s)");
  });

  it("suggestSpectrumAxisLabel — the retired magnitude scaling spelling, a channel with a unit (R168 back-compat) — suggests Magnitude (unit)", () => {
    expect(suggestSpectrumAxisLabel({ label: "Fork velocity", unit: "m/s" }, "magnitude")).toBe("Magnitude (m/s)");
  });

  it("suggestSpectrumAxisLabel — density scaling, a channel with a unit — suggests PSD (unit²/Hz)", () => {
    expect(suggestSpectrumAxisLabel({ label: "Fork velocity", unit: "m/s" }, "density")).toBe("PSD (m/s²/Hz)");
  });

  it("suggestSpectrumAxisLabel — spectrum scaling, a channel with a unit — suggests Power (unit²)", () => {
    expect(suggestSpectrumAxisLabel({ label: "Fork velocity", unit: "m/s" }, "spectrum")).toBe("Power (m/s²)");
  });

  it("suggestSpectrumAxisLabel — a channel with no unit — suggests nothing", () => {
    expect(suggestSpectrumAxisLabel({ label: "Fork velocity" }, "raw_magnitude")).toBeUndefined();
  });

  it("suggestSpectrumAxisLabel — no channel selected — suggests nothing", () => {
    expect(suggestSpectrumAxisLabel(undefined, "raw_magnitude")).toBeUndefined();
  });
});

describe("overlapPercent", () => {
  it("overlapPercent — hopSize half of windowSize — is 50", () => {
    expect(overlapPercent(2048, 1024)).toBe(50);
  });

  it("overlapPercent — hopSize equal to windowSize — is 0 (no overlap)", () => {
    expect(overlapPercent(1024, 1024)).toBe(0);
  });

  it("overlapPercent — windowSize \"all\" — is null", () => {
    expect(overlapPercent("all", 1024)).toBeNull();
  });

  it("overlapPercent — hopSize \"all\" — is null", () => {
    expect(overlapPercent(1024, "all")).toBeNull();
  });

  it("overlapPercent — windowSize zero — is null, not a division by zero", () => {
    expect(overlapPercent(0, 0)).toBeNull();
  });
});

describe("setChartType", () => {
  const timeProps: PlotProps = {
    chart: "time",
    marks: [
      { channel: "fork_velocity", mark: "lineY" },
      { channel: "shock_velocity", mark: "dot" },
    ],
  };
  const fftProps: FftPlotProps = {
    chart: "fft",
    mark: { channel: "shock_velocity", mark: "lineY", fft: { windowSize: 4096, hopSize: 2048, window: "hamming", detrend: "linear", scaling: "density", averaging: "max" } },
    x: { type: "linear" },
  };

  it("setChartType — time to fft — preserves the first mark's channel and seeds FFT defaults", () => {
    const next = setChartType(timeProps, "fft", CHANNELS);

    expect(next.chart).toBe("fft");
    expect((next as FftPlotProps).mark.channel).toBe("fork_velocity");
    expect((next as FftPlotProps).mark.fft).toEqual({ windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" });
  });

  it("setChartType — fft to time — preserves the spectrum's channel and seeds a single time mark", () => {
    const next = setChartType(fftProps, "time", CHANNELS);

    expect(next.chart).toBe("time");
    expect((next as PlotProps & { chart: "time" }).marks).toEqual([{ channel: "shock_velocity", mark: "lineY" }]);
  });

  it("setChartType — switching to the type props already has — is a no-op, returns props unchanged", () => {
    expect(setChartType(timeProps, "time", CHANNELS)).toBe(timeProps);
    expect(setChartType(fftProps, "fft", CHANNELS)).toBe(fftProps);
  });

  it("setChartType — no confirmation is required — the function itself has no side effect and always returns synchronously", () => {
    const next = setChartType(timeProps, "fft", CHANNELS);

    expect(next).not.toBe(timeProps);
  });
});

describe("updateFftParams", () => {
  const fftProps: FftPlotProps = {
    chart: "fft",
    mark: { channel: "fork_velocity", mark: "lineY", fft: { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" } },
    x: { type: "log" },
  };

  it("updateFftParams — a patch to one field — merges it, leaving the rest untouched", () => {
    const next = updateFftParams(fftProps, { window: "hamming" });

    expect(next.mark.fft).toEqual({ windowSize: 2048, hopSize: 1024, window: "hamming", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" });
  });

  it("updateFftParams — setting averaging to none — forces windowSize and hopSize to \"all\" in the same returned value", () => {
    const next = updateFftParams(fftProps, { averaging: "none" });

    expect(next.mark.fft.windowSize).toBe("all");
    expect(next.mark.fft.hopSize).toBe("all");
    expect(next.mark.fft.averaging).toBe("none");
  });

  it("updateFftParams — averaging none with an explicit windowSize in the same patch — the forcing rule wins", () => {
    const next = updateFftParams(fftProps, { averaging: "none", windowSize: 4096 });

    expect(next.mark.fft.windowSize).toBe("all");
  });

  it("updateFftParams — a hopSize edit while averaging is already none — stays forced to all", () => {
    const alreadyNone = updateFftParams(fftProps, { averaging: "none" });

    const next = updateFftParams(alreadyNone, { hopSize: 777 });

    expect(next.mark.fft.hopSize).toBe("all");
    expect(next.mark.fft.windowSize).toBe("all");
  });

  it("updateFftParams — switching averaging away from none — does not itself restore a sample count (the caller/UI picks a new one)", () => {
    const none = updateFftParams(fftProps, { averaging: "none" });

    const next = updateFftParams(none, { averaging: "mean" });

    expect(next.mark.fft.averaging).toBe("mean");
    expect(next.mark.fft.windowSize).toBe("all");
  });
});

describe("fftScalingSelectOptions", () => {
  it("fftScalingSelectOptions — current scaling is one of the three offered — returns exactly the three offered options", () => {
    expect(fftScalingSelectOptions("density")).toEqual(["density", "spectrum", "raw_magnitude"]);
  });

  it("fftScalingSelectOptions — current scaling is the retired \"magnitude\" spelling (R168 back-compat) — appends it as a fourth option", () => {
    const options = fftScalingSelectOptions("magnitude");

    expect(options).toEqual(["density", "spectrum", "raw_magnitude", "magnitude"]);
  });
});
