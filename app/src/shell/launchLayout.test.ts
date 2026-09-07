import { describe, expect, it } from "vitest";
import { initialRoute } from "./launchLayout";

describe("initialRoute", () => {
  it("initialRoute — first run, narrow width — device", () => {
    expect(initialRoute(390, null)).toBe("device");
  });

  it("initialRoute — first run, medium width — device", () => {
    expect(initialRoute(1199, null)).toBe("device");
  });

  it("initialRoute — first run, wide width — notebook (the studio layout)", () => {
    expect(initialRoute(1600, null)).toBe("notebook");
  });

  it("initialRoute — remembered route set — remembered wins over width", () => {
    expect(initialRoute(1600, "settings")).toBe("settings");
    expect(initialRoute(390, "data")).toBe("data");
  });
});
