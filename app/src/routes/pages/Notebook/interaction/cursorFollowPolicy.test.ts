import { describe, expect, it } from "vitest";

import { cursorFollowPolicy } from "./cursorFollowPolicy";
import type { Viewport } from "../model/viewport";

const VIEWPORT: Viewport = { startUs: 0, endUs: 1000, pixelWidth: 100 };

describe("cursorFollowPolicy", () => {
  it("hover, unpinned — moves the cursor", () => {
    const verb = cursorFollowPolicy("hover", false, null, 25, VIEWPORT);

    expect(verb).toEqual({ kind: "publish", tUs: 250 });
  });

  it("hover, unpinned, pointer left the chart (pixelX null) — publishes null, hiding the follow cursor", () => {
    const verb = cursorFollowPolicy("hover", false, null, null, VIEWPORT);

    expect(verb).toEqual({ kind: "publish", tUs: null });
  });

  it("hover, pinned — never moves it", () => {
    const verb = cursorFollowPolicy("hover", true, 250, 60, VIEWPORT);

    expect(verb).toEqual({ kind: "nothing" });
  });

  it("click, unpinned — pins the cursor at the click", () => {
    const verb = cursorFollowPolicy("click", false, null, 25, VIEWPORT);

    expect(verb).toEqual({ kind: "pin", tUs: 250 });
  });

  it("click, pinned, at the same instant already pinned — unpins", () => {
    const verb = cursorFollowPolicy("click", true, 250, 25, VIEWPORT);

    expect(verb).toEqual({ kind: "unpin" });
  });

  it("click, pinned, at a different instant — re-pins there rather than unpinning", () => {
    const verb = cursorFollowPolicy("click", true, 250, 60, VIEWPORT);

    expect(verb).toEqual({ kind: "pin", tUs: 600 });
  });

  it("click, pointer outside the plotted area — nothing (no cursorRequestFor result to pin at)", () => {
    const verb = cursorFollowPolicy("click", false, null, -5, VIEWPORT);

    expect(verb).toEqual({ kind: "nothing" });
  });
});
