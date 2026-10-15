import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

import { effectiveChannel } from "./channelUpdate";

describe("effectiveChannel", () => {
  const build = { channel: "nightly" as const, build_channel: "nightly" as const, version: "0.1.0", build: 20 };

  it("no pick — the build's own channel", () => {
    expect(effectiveChannel(null, build)).toBe("nightly");
  });

  it("a pick — the pick", () => {
    expect(effectiveChannel("stable", build)).toBe("stable");
  });
});
