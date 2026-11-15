import { describe, expect, it } from "vitest";

import { hostCursor } from "./definitionBind";

describe("hostCursor", () => {
  it("hostCursor — a cursor at 12.5 s while playing — t in seconds, playing true", () => {
    const tUs = 12_500_000n;

    const cursor = hostCursor(tUs, true);

    expect(cursor).toEqual({ t: 12.5, playing: true });
  });

  it("hostCursor — no cursor, paused — t null", () => {
    const tUs = null;

    const cursor = hostCursor(tUs, false);

    expect(cursor).toEqual({ t: null, playing: false });
  });

  it("hostCursor — a cursor at 0 — t is 0, not null", () => {
    const tUs = 0n;

    const cursor = hostCursor(tUs, false);

    expect(cursor.t).toBe(0);
  });
});
