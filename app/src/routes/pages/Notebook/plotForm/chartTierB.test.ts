/**
 * The three chart kinds ruling R217 added to C2 §5.3 — map, lap progression
 * and spectrogram — through the same `generate`/`parse` pair every other kind
 * goes through. What is tested here is the grammar's own rules: the literals
 * that are required rather than defaulted, the discriminant each kind is
 * recognised by, and the pairings that make a cell custom code.
 */
import { describe, expect, it } from "vitest";

import { generate } from "./generate";
import { parse } from "./parse";
import type { FftParams, LapPlotProps, MapPlotProps, SpectrogramPlotProps } from "./types";

const FFT: FftParams = {
  windowSize: 2048,
  hopSize: 1024,
  window: "hann",
  detrend: "mean",
  scaling: "raw_magnitude",
  averaging: "mean",
};

const MAP: MapPlotProps = { chart: "map", marks: [{ colourBy: "Speed", mark: "line", stroke: "c" }] };
const LAP: LapPlotProps = { chart: "lap", mark: { definition: "lap_time_s", mark: "lineY", seriesBy: "w" } };
const SPECTROGRAM: SpectrogramPlotProps = { chart: "spectrogram", mark: { channel: "Fork travel", fft: FFT } };

describe("the map cell", () => {
  it("generate — a map cell — always emits aspectRatio 1, because equal aspect is the projection's own", () => {
    // Act
    const code = generate(MAP);

    // Assert
    expect(code).toContain("aspectRatio: 1");
    expect(code).toContain('Plot.line(gps("Speed"), { x: "x", y: "y", stroke: "c" })');
  });

  it("generate — an uncoloured trace — emits the bare null, never the string", () => {
    // Act
    const code = generate({ chart: "map", marks: [{ colourBy: null, mark: "line" }] });

    // Assert — a channel literally named "null" is a different request.
    expect(code).toContain("gps(null)");
    expect(code).not.toContain('gps("null")');
  });

  it("generate — the track underlay — puts both underlay marks at the head, under the traces", () => {
    // Act
    const code = generate({ ...MAP, trackUnderlay: true });

    // Assert
    const polyline = code.indexOf("trackGeometry.polyline");
    const gates = code.indexOf("trackGeometry.gates");
    const trace = code.indexOf("gps(");
    expect(polyline).toBeGreaterThan(-1);
    expect(polyline).toBeLessThan(gates);
    expect(gates).toBeLessThan(trace);
  });

  it("parse — a generated map cell — round-trips byte-identically", () => {
    // Act
    const parsed = parse(generate(MAP));

    // Assert
    expect(parsed).toEqual(MAP);
    expect(generate(parsed!)).toBe(generate(MAP));
  });

  it("parse — a map cell with the underlay — round-trips byte-identically", () => {
    // Arrange
    const props: MapPlotProps = { ...MAP, trackUnderlay: true, color: { domain: [0, 40] } };

    // Act
    const parsed = parse(generate(props));

    // Assert
    expect(parsed).toEqual(props);
    expect(generate(parsed!)).toBe(generate(props));
  });

  it("parse — a map cell with no aspectRatio — is custom code, not a shorter valid form", () => {
    // Arrange — the generated code with the required literal removed.
    const code = generate(MAP).replace("  aspectRatio: 1,\n", "");

    // Act / Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — stroke \"c\" on an uncoloured trace — is custom code, there being no channel to colour by", () => {
    // Arrange
    const code = generate({ chart: "map", marks: [{ colourBy: null, mark: "line", stroke: "c" }] });

    // Act / Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — an aspectRatio other than 1 — is custom code", () => {
    // Arrange
    const code = generate(MAP).replace("aspectRatio: 1", "aspectRatio: 2");

    // Act / Assert
    expect(parse(code)).toBeNull();
  });
});

describe("the lap-progression cell", () => {
  it("generate — a lap cell — emits the definition bare, never quoted as a channel", () => {
    // Act
    const code = generate(LAP);

    // Assert
    expect(code).toContain('Plot.lineY(lap_time_s, { x: "lap", y: "v", z: "w" })');
    expect(code).not.toContain('"lap_time_s"');
  });

  it("parse — a generated lap cell — round-trips byte-identically and is recognised as a lap cell", () => {
    // Act
    const parsed = parse(generate(LAP));

    // Assert — the discriminant is a bare identifier where every other kind
    // has a data call.
    expect(parsed).toEqual(LAP);
    expect(parsed?.chart).toBe("lap");
    expect(generate(parsed!)).toBe(generate(LAP));
  });

  it("parse — a lap cell with no series binding — round-trips with seriesBy absent", () => {
    // Arrange
    const props: LapPlotProps = { chart: "lap", mark: { definition: "peak_freq", mark: "barY" } };

    // Act
    const parsed = parse(generate(props));

    // Assert
    expect(parsed).toEqual(props);
  });

  it("parse — a lap mark binding x to t rather than lap — is custom code", () => {
    // Arrange
    const code = generate(LAP).replace('x: "lap"', 'x: "t"');

    // Act / Assert
    expect(parse(code)).toBeNull();
  });
});

describe("the spectrogram cell", () => {
  it("generate — a spectrogram cell — always emits the window facet and the fixed image options", () => {
    // Act
    const code = generate(SPECTROGRAM);

    // Assert — one raster per window, faceted: pixels cannot interleave.
    expect(code).toContain('fx: "w"');
    expect(code).toContain('Plot.image(spectrogram("Fork travel",');
    // `iw`/`ih`, not `w`/`h`: the same cell fixes `fx: "w"`, and `w` is the
    // window index every payload in the app keys by (corrected 2026-09-11).
    expect(code).toContain('{x:"x", y:"y", width:"iw", height:"ih", src:"src"}');
  });

  it("generate — a spectrogram's parameters — are the same six fft_params in the same order as an FFT cell", () => {
    // Act
    const code = generate(SPECTROGRAM);

    // Assert
    expect(code).toContain(
      '{ windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "raw_magnitude", averaging: "mean" }'
    );
  });

  it("parse — a generated spectrogram cell — round-trips byte-identically", () => {
    // Act
    const parsed = parse(generate(SPECTROGRAM));

    // Assert
    expect(parsed).toEqual(SPECTROGRAM);
    expect(generate(parsed!)).toBe(generate(SPECTROGRAM));
  });

  it("parse — a spectrogram with a colour domain and a log frequency axis — round-trips", () => {
    // Arrange
    const props: SpectrogramPlotProps = { ...SPECTROGRAM, y: { type: "log" }, color: { domain: [0, 12] } };

    // Act
    const parsed = parse(generate(props));

    // Assert
    expect(parsed).toEqual(props);
  });

  it("parse — a spectrogram cell with no fx — is custom code: several windows would draw over one another", () => {
    // Arrange
    const code = generate(SPECTROGRAM).replace('  fx: "w",\n', "");

    // Act / Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a spectrogram_call missing an fft_params key — is custom code, exactly as a spectrum_call is", () => {
    // Arrange
    const code = generate(SPECTROGRAM).replace(', averaging: "mean"', "");

    // Act / Assert
    expect(parse(code)).toBeNull();
  });
});

describe("chart-kind routing", () => {
  it("parse — each new kind — is recognised by its own discriminant, never as a time cell", () => {
    // Assert
    expect(parse(generate(MAP))?.chart).toBe("map");
    expect(parse(generate(LAP))?.chart).toBe("lap");
    expect(parse(generate(SPECTROGRAM))?.chart).toBe("spectrogram");
  });

  it("parse — an aspectRatio on a time cell — is custom code: it is a map cell's option alone", () => {
    // Arrange
    const code = 'Plot.plot({\n  aspectRatio: 1,\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})';

    // Act / Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — an fx on a time cell — is custom code: it is a spectrogram cell's option alone", () => {
    // Arrange
    const code = 'Plot.plot({\n  fx: "w",\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})';

    // Act / Assert
    expect(parse(code)).toBeNull();
  });

  it("parse — a colour domain on a time cell — is custom code: only a map and a spectrogram state one", () => {
    // Arrange
    const code =
      'Plot.plot({\n  color: { domain: [0, 1] },\n  marks: [\n    Plot.lineY(channel("x"), { x: "t", y: "v" })\n  ]\n})';

    // Act / Assert
    expect(parse(code)).toBeNull();
  });
});
