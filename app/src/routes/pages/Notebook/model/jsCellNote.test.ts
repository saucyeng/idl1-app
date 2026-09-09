import { describe, expect, it } from "vitest";

import { jsCellNote, primaryWindowNote } from "./jsCellNote";

/** Every field defaults to the "nothing wrong" case; each test overrides
 *  only the field(s) it's exercising. */
function input(overrides: Partial<Parameters<typeof jsCellNote>[0]> = {}): Parameters<typeof jsCellNote>[0] {
  return {
    hasChannelReference: true,
    windowCount: 1,
    unresolvedName: null,
    isAxisLessDefinition: false,
    isDeclaredDefinitionFailed: false,
    ...overrides,
  };
}

describe("jsCellNote", () => {
  it("jsCellNote — custom code (no channel/spectrum reference at all) — is null", () => {
    const note = jsCellNote(input({ hasChannelReference: false, windowCount: 0 }));

    expect(note).toBeNull();
  });

  it("jsCellNote — a hand-written cell referencing a channel — gets the same notes as a form-generated one", () => {
    const note = jsCellNote(input({ hasChannelReference: true, windowCount: 0, unresolvedName: "front_shock" }));

    expect(note).toBe('Channel "front_shock" is not part of this session.');
  });

  it("jsCellNote — an axis-less definition — names the definition, even with no session", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "speed", isAxisLessDefinition: true }));

    expect(note).toBe('Definition "speed" has no recorded axis.');
  });

  it("jsCellNote — an unresolved name that is a declared definition whose own cell errored — says so, not the generic line", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "accel_mag_lp", isDeclaredDefinitionFailed: true }));

    expect(note).toBe('Definition "accel_mag_lp" failed to evaluate — check its math cell for an error.');
  });

  it("jsCellNote — an axis-less definition takes priority over a declared-but-failed definition", () => {
    const note = jsCellNote(
      input({ windowCount: 0, unresolvedName: "speed", isAxisLessDefinition: true, isDeclaredDefinitionFailed: true })
    );

    expect(note).toBe('Definition "speed" has no recorded axis.');
  });

  it("jsCellNote — an unresolved channel name — names the channel, even with no session", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "front_shock" }));

    expect(note).toBe('Channel "front_shock" is not part of this session.');
  });

  it("jsCellNote — no session selected, no unresolved name — says to choose one in the Data tab", () => {
    const note = jsCellNote(input({ windowCount: 0 }));

    expect(note).toBe("No session is selected — choose one in the Data tab.");
  });

  it("jsCellNote — a session selected, no unresolved name, not axis-less — is null", () => {
    const note = jsCellNote(input({ windowCount: 1 }));

    expect(note).toBeNull();
  });
});

describe("primaryWindowNote", () => {
  it("primaryWindowNote — zero windows selected — is null", () => {
    expect(primaryWindowNote(0, "Silverstone · Lap 2")).toBeNull();
  });

  it("primaryWindowNote — exactly one window selected — is null (byte-identical to today)", () => {
    expect(primaryWindowNote(1, "Silverstone · Lap 2")).toBeNull();
  });

  it("primaryWindowNote — more than one window selected — names the primary window", () => {
    expect(primaryWindowNote(2, "Silverstone · Lap 2")).toBe("Silverstone · Lap 2");
  });
});
