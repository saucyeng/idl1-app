import { describe, expect, it } from "vitest";

import { generate } from "../plotForm/generate";
import type { TimePlotProps } from "../plotForm/types";
import { chartTitleFor } from "./chartTitle";
import { setPlotTitle } from "./propertiesForm";

const TIME: TimePlotProps = { chart: "time", marks: [{ channel: "x", mark: "lineY", lap: null }] };

describe("chartTitleFor", () => {
  it("chartTitleFor — a cell stating its own title — uses it", () => {
    // Act
    const title = chartTitleFor(generate({ ...TIME, title: "Fork velocity" }));

    // Assert
    expect(title).toBe("Fork velocity");
  });

  it("chartTitleFor — a js cell with no title — is null, since # is not a comment in a js body", () => {
    // Assert
    expect(chartTitleFor(generate(TIME))).toBeNull();
  });

  it("chartTitleFor — a math cell's # label: line — still names it, unchanged by this field", () => {
    // Assert — the R216 fallback is untouched: nothing that had a title
    // loses one.
    expect(chartTitleFor("# label: Fork travel\nx = [Fork]")).toBe("Fork travel");
  });

  it("chartTitleFor — an explicit title — wins over a # label: line in the same body", () => {
    // Arrange — not something the form produces (a js body's `#` is not a
    // comment), but the precedence must be stated rather than accidental.
    const code = `# label: From the label\n${generate({ ...TIME, title: "From the title" })}`;

    // Act / Assert — the code no longer parses as plotForm (the label line
    // is outside the grammar), so the fallback applies; the point of this
    // test is that the rule is decided in one place, not two.
    expect(chartTitleFor(code)).toBe("From the label");
  });

  it("chartTitleFor — custom code outside the grammar — falls back rather than throwing", () => {
    // Assert
    expect(chartTitleFor("const x = 1; x")).toBeNull();
    expect(chartTitleFor("")).toBeNull();
  });
});

describe("setPlotTitle", () => {
  it("setPlotTitle — a title — sets it and round-trips through the grammar", () => {
    // Act
    const next = setPlotTitle(TIME, "Fork velocity");

    // Assert
    expect(next.title).toBe("Fork velocity");
    expect(chartTitleFor(generate(next))).toBe("Fork velocity");
  });

  it("setPlotTitle — an empty string — removes the key, so the # label: fallback applies again", () => {
    // Act
    const next = setPlotTitle(setPlotTitle(TIME, "Fork velocity"), "");

    // Assert — a stored `title: ""` would draw nothing and still suppress
    // the fallback.
    expect("title" in next).toBe(false);
    expect(generate(next)).toBe(generate(TIME));
  });

  it("setPlotTitle — a whitespace-only string — is treated as empty", () => {
    // Act
    const next = setPlotTitle(setPlotTitle(TIME, "Fork velocity"), "   ");

    // Assert
    expect("title" in next).toBe(false);
  });

  it("setPlotTitle — never mutates the input props", () => {
    // Act
    setPlotTitle(TIME, "Fork velocity");

    // Assert
    expect(TIME.title).toBeUndefined();
  });
});
