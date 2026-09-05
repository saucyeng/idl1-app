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
