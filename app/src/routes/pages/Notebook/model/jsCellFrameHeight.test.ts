import { describe, expect, it } from "vitest";

import { JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX, resolveJsCellFrameHeightPx } from "./jsCellFrameHeight";
import { DEFAULT_JS_CELL_HEIGHT_PX } from "../components/JsCellFrame";

describe("resolveJsCellFrameHeightPx", () => {
  it("note present, reported height below the minimum — floors at the minimum", () => {
    const heightPx = 8;

    const resolved = resolveJsCellFrameHeightPx(heightPx, true);

    expect(resolved).toBe(JS_CELL_FRAME_MIN_HEIGHT_WITH_NOTE_PX);
  });

  it("no note or error — uses the reported height as-is", () => {
    const heightPx = 320;

    const resolved = resolveJsCellFrameHeightPx(heightPx, false);

    expect(resolved).toBe(320);
  });

  it("heightPx is null — falls back to the default height", () => {
    const resolved = resolveJsCellFrameHeightPx(null, true);

    expect(resolved).toBe(DEFAULT_JS_CELL_HEIGHT_PX);
  });

  it("note present, reported height already above the minimum — keeps the reported height", () => {
    const heightPx = 500;

    const resolved = resolveJsCellFrameHeightPx(heightPx, true);

    expect(resolved).toBe(500);
  });
});
