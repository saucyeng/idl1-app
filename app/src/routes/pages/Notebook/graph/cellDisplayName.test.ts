import { describe, expect, it } from "vitest";

import { cellDisplayNames, displayNameFor, setCellLabelLine } from "./cellDisplayName";

describe("cellDisplayNames", () => {
  it("display name — a cell with a label — uses the label", () => {
    const names = cellDisplayNames([{ id: "1a000006", label: "Front travel" }]);

    expect(names.get("1a000006")).toBe("Front travel");
  });

  it("display name — a cell with no label — falls back to its position, not its id", () => {
    const names = cellDisplayNames([
      { id: "1a000006", label: null },
      { id: "1a000007", label: null },
    ]);

    expect(names.get("1a000007")).toBe("Cell 2");
  });

  it("display name — a blank label — falls back to the position", () => {
    const names = cellDisplayNames([{ id: "1a000006", label: "   " }]);

    expect(names.get("1a000006")).toBe("Cell 1");
  });

  it("display name — an unidentified fence between two cells — still occupies a position", () => {
    const names = cellDisplayNames([
      { id: "1a000006", label: null },
      { id: null, label: null },
      { id: "1a000008", label: null },
    ]);

    expect(names.get("1a000008")).toBe("Cell 3");
  });
});

describe("displayNameFor", () => {
  it("name lookup — an id the document no longer carries — is a stated placeholder", () => {
    const names = cellDisplayNames([{ id: "1a000006", label: null }]);

    expect(displayNameFor(names, "deadbeef")).toBe("Cell ?");
  });
});

describe("setCellLabelLine", () => {
  it("rename — a body with no label — inserts the label as the first line", () => {
    const body = "speed = channel([Speed])\n";

    const next = setCellLabelLine(body, "Speed");

    expect(next).toBe("# label: Speed\nspeed = channel([Speed])\n");
  });

  it("rename — a body that already has a label — replaces that line only", () => {
    const body = "# label: Old\nspeed = channel([Speed])\n";

    const next = setCellLabelLine(body, "New");

    expect(next).toBe("# label: New\nspeed = channel([Speed])\n");
  });

  it("rename — a leading blank line — keeps it and labels the first content line", () => {
    const body = "\n# label: Old\nx = 1\n";

    const next = setCellLabelLine(body, "New");

    expect(next).toBe("\n# label: New\nx = 1\n");
  });

  it("rename — a blank label on a labelled body — removes the label line", () => {
    const body = "# label: Old\nx = 1\n";

    const next = setCellLabelLine(body, "  ");

    expect(next).toBe("x = 1\n");
  });

  it("rename — a blank label on an unlabelled body — changes nothing", () => {
    const body = "x = 1\n";

    const next = setCellLabelLine(body, "");

    expect(next).toBe(body);
  });

  it("rename — a CRLF body — keeps CRLF line endings", () => {
    const body = "x = 1\r\ny = 2\r\n";

    const next = setCellLabelLine(body, "Two");

    expect(next).toBe("# label: Two\r\nx = 1\r\ny = 2\r\n");
  });

  it("rename — an ordinary comment as the first line — inserts above it rather than replacing it", () => {
    const body = "# just a note\nx = 1\n";

    const next = setCellLabelLine(body, "Named");

    expect(next).toBe("# label: Named\n# just a note\nx = 1\n");
  });
});
