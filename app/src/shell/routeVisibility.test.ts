import { describe, expect, it } from "vitest";
import { composeVisibility } from "./routeVisibility";

describe("composeVisibility", () => {
  it("composeVisibility — window visible, route inactive — false", () => {
    expect(composeVisibility(true, false)).toBe(false);
  });

  it("composeVisibility — window hidden, route active — false", () => {
    expect(composeVisibility(false, true)).toBe(false);
  });

  it("composeVisibility — both true — true", () => {
    expect(composeVisibility(true, true)).toBe(true);
  });

  it("composeVisibility — both false — false", () => {
    expect(composeVisibility(false, false)).toBe(false);
  });
});
