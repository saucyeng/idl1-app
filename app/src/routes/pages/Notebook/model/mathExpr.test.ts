import { describe, expect, it } from "vitest";

import { scanMathExpr } from "./mathExpr";

describe("scanMathExpr", () => {
  it("scanMathExpr — a single catalog call — reports the call name and each argument's raw text", () => {
    // Act
    const info = scanMathExpr('butter(2, 3, "low", [IMU1_AccelZ])');

    // Assert
    expect(info.call).toEqual({ name: "butter", args: ["2", "3", '"low"', "[IMU1_AccelZ]"] });
    expect(info.refs).toEqual(["IMU1_AccelZ"]);
  });

  it("scanMathExpr — a bare reference — has refs but no call", () => {
    // Act
    const info = scanMathExpr("[Speed]");

    // Assert
    expect(info.refs).toEqual(["Speed"]);
    expect(info.call).toBeNull();
  });

  it("scanMathExpr — an operator expression referencing two definitions — collects both refs, no call", () => {
    // Act
    const info = scanMathExpr("[fork_travel] - [shock_travel]");

    // Assert
    expect(info.refs).toEqual(["fork_travel", "shock_travel"]);
    expect(info.call).toBeNull();
  });

  it("scanMathExpr — a call wrapped in more than itself — is opaque (call is null), refs still collected", () => {
    // Act
    const info = scanMathExpr("butter(2, 3, \"low\", [x]) * 2");

    // Assert
    expect(info.call).toBeNull();
    expect(info.refs).toEqual(["x"]);
  });

  it("scanMathExpr — a call to a name outside the §3.3 catalog — is opaque", () => {
    // Act
    const info = scanMathExpr("not_a_real_function([x])");

    // Assert
    expect(info.call).toBeNull();
    expect(info.refs).toEqual(["x"]);
  });

  it("scanMathExpr — a nested call as an argument — splits only at the top level", () => {
    // Act
    const info = scanMathExpr("mean(butter(2, 3, \"low\", [x]), 10)");

    // Assert
    expect(info.call).toEqual({ name: "mean", args: ['butter(2, 3, "low", [x])', "10"] });
    expect(info.refs).toEqual(["x"]);
  });

  it("scanMathExpr — a comma inside a quoted argument — does not split the argument in two", () => {
    // Act
    const info = scanMathExpr('detrend([x], "low, high")');

    // Assert
    expect(info.call).toEqual({ name: "detrend", args: ["[x]", '"low, high"'] });
  });

  it("scanMathExpr — a zero-argument catalog call — reports an empty args array, not [\"\"]", () => {
    // Act
    const info = scanMathExpr("current_lap()");

    // Assert
    expect(info.call).toEqual({ name: "current_lap", args: [] });
  });

  it("scanMathExpr — repeated references — deduplicates refs in first-appearance order", () => {
    // Act
    const info = scanMathExpr("[x] + [x] + [y]");

    // Assert
    expect(info.refs).toEqual(["x", "y"]);
  });

  it("scanMathExpr — a const-line numeric expression with no references — has empty refs and no call", () => {
    // Act
    const info = scanMathExpr("9.80665");

    // Assert
    expect(info.refs).toEqual([]);
    expect(info.call).toBeNull();
  });
});
