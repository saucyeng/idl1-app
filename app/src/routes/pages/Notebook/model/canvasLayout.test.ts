import { describe, expect, it } from "vitest";

import { aspectOf, readCanvasLayout, writeCanvasLayout, type CanvasLayout } from "./canvasLayout";

const DOC = ["---", "id: 8e4a1f6c-2d7b-4c93-a5e8-1b9d3f7c6a20", "name: x", "version: 3", "---", "", "# Hi", ""].join("\n");

const LAYOUT: CanvasLayout = {
  size: "4:3",
  theme: "overlay",
  cells: {
    "8e4a0001": { x: 0, y: 0, w: 1, h: 1, z: 0 },
    "8e4a0020": { x: 0.02, y: 0.7, w: 0.25, h: 0.28, z: 1 },
  },
};

describe("writeCanvasLayout / readCanvasLayout", () => {
  it("writeCanvasLayout — a document with none — the key before the closing fence, read back equal", () => {
    const written = writeCanvasLayout(DOC, LAYOUT);

    expect(written).toContain('canvas:\n  size: "4:3"\n  theme: overlay\n  cells:\n    8e4a0001: { x: 0, y: 0, w: 1, h: 1, z: 0 }\n    8e4a0020: { x: 0.02, y: 0.7, w: 0.25, h: 0.28, z: 1 }\n---\n');
    expect(written.endsWith("\n# Hi\n")).toBe(true);
    expect(readCanvasLayout(written)).toEqual(LAYOUT);
  });

  it("writeCanvasLayout — rewriting an existing key — replaced in place, nothing else moves", () => {
    const once = writeCanvasLayout(DOC, LAYOUT);

    const twice = writeCanvasLayout(once, { ...LAYOUT, size: "9:16" });

    expect(twice.match(/canvas:/g)?.length).toBe(1);
    expect(readCanvasLayout(twice)?.size).toBe("9:16");
    expect(twice.split("canvas:")[0]).toBe(once.split("canvas:")[0]);
  });

  it("writeCanvasLayout — null — the key removed and the document as it was", () => {
    const written = writeCanvasLayout(writeCanvasLayout(DOC, LAYOUT), null);

    expect(written).toBe(DOC);
  });

  it("readCanvasLayout — no key, or a shape it does not know — null", () => {
    expect(readCanvasLayout(DOC)).toBeNull();
    const odd = DOC.replace("version: 3\n", "version: 3\ncanvas:\n  layers: 3\n");
    expect(readCanvasLayout(odd)).toBeNull();
  });

  it("readCanvasLayout — CRLF line endings — read the same", () => {
    const crlf = writeCanvasLayout(DOC, LAYOUT).replace(/\n/g, "\r\n");

    expect(readCanvasLayout(crlf)).toEqual(LAYOUT);
  });
});

describe("aspectOf", () => {
  it("aspectOf — the frame shapes — width over height", () => {
    expect(aspectOf("16:9")).toBeCloseTo(16 / 9);
    expect(aspectOf("9:16")).toBeCloseTo(9 / 16);
    expect(aspectOf("4:3")).toBeCloseTo(4 / 3);
  });
});

describe("readCanvasLayout — the engine's block form", () => {
  it("readCanvasLayout — unquoted size and one key per line, as the engine saves it — read the same", () => {
    const engineForm = DOC.replace(
      "version: 3\n",
      ["version: 3", "canvas:", "  size: 4:3", "  theme: overlay", "  cells:", "    8e4a0001:", "      x: 0", "      y: 0", "      w: 1", "      h: 1", "      z: 0", "    8e4a0020:", "      x: 0.02", "      y: 0.7", "      w: 0.25", "      h: 0.28", "      z: 1", ""].join("\n")
    );

    expect(readCanvasLayout(engineForm)).toEqual(LAYOUT);
  });

  it("readCanvasLayout — a box missing a field — null", () => {
    const broken = DOC.replace("version: 3\n", ["version: 3", "canvas:", "  cells:", "    8e4a0001:", "      x: 0", ""].join("\n"));

    expect(readCanvasLayout(broken)).toBeNull();
  });
});
