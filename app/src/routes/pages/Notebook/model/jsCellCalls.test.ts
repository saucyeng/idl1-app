import { describe, expect, it } from "vitest";

import { extractChannelCalls, extractSpectrumCalls } from "./jsCellCalls";

describe("extractChannelCalls", () => {
  it("extractChannelCalls — a bare channel() call with no surrounding form — extracts it", () => {
    // Act
    const calls = extractChannelCalls('const data = channel("fork_velocity");');

    // Assert
    expect(calls).toEqual([{ channel: "fork_velocity", lap: null }]);
  });

  it("extractChannelCalls — a channel() call with a { lap } option — extracts the lap number", () => {
    // Act
    const calls = extractChannelCalls('channel("fork_velocity", { lap: 3 })');

    // Assert
    expect(calls).toEqual([{ channel: "fork_velocity", lap: 3 }]);
  });

  it("extractChannelCalls — two distinct calls anywhere in the source — extracts both, in order", () => {
    // Act
    const calls = extractChannelCalls('const a = channel("fork_velocity");\nconst b = channel("rear_wheel_speed");');

    // Assert
    expect(calls).toEqual([
      { channel: "fork_velocity", lap: null },
      { channel: "rear_wheel_speed", lap: null },
    ]);
  });

  it("extractChannelCalls — a call named inside a // line comment — is not extracted", () => {
    // Act
    const calls = extractChannelCalls('// channel("fork_velocity")\nconst x = 1;');

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractChannelCalls — a call named inside a block comment — is not extracted", () => {
    // Act
    const calls = extractChannelCalls('/* channel("fork_velocity") */\nconst x = 1;');

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractChannelCalls — a call named inside a string literal — is not extracted", () => {
    // Act
    const calls = extractChannelCalls('const label = \'channel("fork_velocity")\';');

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractChannelCalls — a .channel(...) property access — is not extracted", () => {
    // Act
    const calls = extractChannelCalls('someObject.channel("fork_velocity");');

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractChannelCalls — an identifier merely ending in \"channel\" — is not extracted", () => {
    // Act
    const calls = extractChannelCalls('mychannel("fork_velocity");');

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractChannelCalls — a call whose argument isn't a string literal — is not extracted", () => {
    // Act
    const calls = extractChannelCalls("channel(someVariable);");

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractChannelCalls — no channel() calls at all — returns an empty array", () => {
    // Act
    const calls = extractChannelCalls("const x = 1;\nreturn x + 1;");

    // Assert
    expect(calls).toEqual([]);
  });
});

describe("extractSpectrumCalls", () => {
  it("extractSpectrumCalls — a bare spectrum() call with no surrounding form — extracts its channel and fft params", () => {
    // Arrange
    const code =
      'const s = spectrum("fork_velocity", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" });';

    // Act
    const calls = extractSpectrumCalls(code);

    // Assert
    expect(calls).toEqual([
      {
        channel: "fork_velocity",
        fft: { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" },
      },
    ]);
  });

  it("extractSpectrumCalls — a call missing a required fft_params key — is not extracted", () => {
    // Arrange
    const code = 'spectrum("fork_velocity", { windowSize: 1024, hopSize: 512, window: "hann", detrend: "mean", scaling: "magnitude" });';

    // Act
    const calls = extractSpectrumCalls(code);

    // Assert
    expect(calls).toEqual([]);
  });

  it("extractSpectrumCalls — no spectrum() calls at all — returns an empty array", () => {
    // Act
    const calls = extractSpectrumCalls('const data = channel("fork_velocity");');

    // Assert
    expect(calls).toEqual([]);
  });
});
