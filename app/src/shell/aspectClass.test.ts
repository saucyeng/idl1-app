import { describe, expect, it } from "vitest";

import { ASPECT_CLASSES, isAspectClass, resolveAspectClass, ULTRAWIDE_RATIO, WIDE_RATIO } from "./aspectClass";

describe("resolveAspectClass — real monitor shapes", () => {
  it("resolveAspectClass — 3440x1440 (21:9) — ultrawide", () => {
    const cls = resolveAspectClass(3440, 1440);

    expect(cls).toBe("ultrawide");
  });

  it("resolveAspectClass — 1920x1080 (16:9) — wide", () => {
    const cls = resolveAspectClass(1920, 1080);

    expect(cls).toBe("wide");
  });

  it("resolveAspectClass — 1280x1024 (5:4) — narrow", () => {
    const cls = resolveAspectClass(1280, 1024);

    expect(cls).toBe("narrow");
  });

  it("resolveAspectClass — a portrait window — narrow", () => {
    const cls = resolveAspectClass(900, 1400);

    expect(cls).toBe("narrow");
  });
});

describe("resolveAspectClass — the two boundaries", () => {
  it("resolveAspectClass — exactly the ultrawide ratio — ultrawide", () => {
    const height = 1000;

    const cls = resolveAspectClass(ULTRAWIDE_RATIO * height, height);

    expect(cls).toBe("ultrawide");
  });

  it("resolveAspectClass — a hair under the ultrawide ratio — wide", () => {
    const height = 1000;

    const cls = resolveAspectClass(ULTRAWIDE_RATIO * height - 1, height);

    expect(cls).toBe("wide");
  });

  it("resolveAspectClass — exactly the wide ratio — wide", () => {
    const height = 1000;

    const cls = resolveAspectClass(WIDE_RATIO * height, height);

    expect(cls).toBe("wide");
  });

  it("resolveAspectClass — a hair under the wide ratio — narrow", () => {
    const height = 1000;

    const cls = resolveAspectClass(WIDE_RATIO * height - 1, height);

    expect(cls).toBe("narrow");
  });
});

describe("resolveAspectClass — a size that is not a measurement yet", () => {
  it("resolveAspectClass — zero height — wide, not a division by zero", () => {
    const cls = resolveAspectClass(1920, 0);

    expect(cls).toBe("wide");
  });

  it("resolveAspectClass — NaN width — wide", () => {
    const cls = resolveAspectClass(Number.NaN, 1080);

    expect(cls).toBe("wide");
  });

  it("resolveAspectClass — a negative height — wide", () => {
    const cls = resolveAspectClass(1920, -1080);

    expect(cls).toBe("wide");
  });
});

describe("isAspectClass", () => {
  it("isAspectClass — every member of ASPECT_CLASSES — true", () => {
    const all = ASPECT_CLASSES.map((cls) => isAspectClass(cls));

    expect(all).toEqual([true, true, true]);
  });

  it("isAspectClass — a stale or hand-edited value — false", () => {
    const results = [isAspectClass("tall"), isAspectClass(2.1), isAspectClass(null), isAspectClass(undefined)];

    expect(results).toEqual([false, false, false, false]);
  });
});
