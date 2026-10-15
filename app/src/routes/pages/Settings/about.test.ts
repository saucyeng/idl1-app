import { describe, expect, it } from "vitest";

import { aboutRows } from "./about";

describe("aboutRows", () => {
  it("aboutRows — an engine version string — the row shows it verbatim", () => {
    const rows = aboutRows("0.4.2");

    const engineRow = rows.find((row) => row.label === "Engine version");
    expect(engineRow?.value).toBe("0.4.2");
  });

  it('aboutRows — engine version null — the row reads "…" while the call is in flight, never "unknown"', () => {
    const rows = aboutRows(null);

    const engineRow = rows.find((row) => row.label === "Engine version");
    expect(engineRow?.value).toBe("…");
    expect(engineRow?.value).not.toBe("unknown");
  });

  it("aboutRows — always — includes app version, engine version, schema and build", () => {
    const rows = aboutRows("0.4.2");

    const labels = rows.map((row) => row.label);
    expect(labels).toContain("App version");
    expect(labels).toContain("Engine version");
    expect(labels).toContain("Schema");
    expect(labels).toContain("Build");
  });
});

describe("aboutRows — build", () => {
  it("local build — dev and the hand-kept version", () => {
    const rows = aboutRows("0.4.2");

    expect(rows.find((row) => row.label === "Build")?.value).toBe("dev");
    expect(rows.find((row) => row.label === "App version")?.value).toBe("0.1.0");
  });

  it("CI build — its number, channel and version", () => {
    const rows = aboutRows("0.4.2", { channel: "nightly", build_channel: "nightly", version: "0.1.1", build: 20 });

    expect(rows.find((row) => row.label === "Build")?.value).toBe("20 · nightly");
    expect(rows.find((row) => row.label === "App version")?.value).toBe("0.1.1");
  });
});
