import { describe, expect, it } from "vitest";

import { jsCellNote, NO_SELECTION_NOTE, primaryWindowNote } from "./jsCellNote";

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
    const note = jsCellNote(input({ hasChannelReference: true, unresolvedName: "front_shock" }));

    expect(note).toEqual({ text: 'Channel "front_shock" is not part of this session.', fixable: true });
  });

  it("jsCellNote — an axis-less definition — names the definition", () => {
    const note = jsCellNote(input({ unresolvedName: "speed", isAxisLessDefinition: true }));

    expect(note).toEqual({ text: 'Definition "speed" has no recorded axis.', fixable: true });
  });

  it("jsCellNote — an unresolved name that is a declared definition whose own cell errored — says so, not the generic line", () => {
    const note = jsCellNote(input({ unresolvedName: "accel_mag_lp", isDeclaredDefinitionFailed: true }));

    expect(note).toEqual({
      text: 'Definition "accel_mag_lp" failed to evaluate — check its math cell for an error.',
      fixable: true,
    });
  });

  it("jsCellNote — an axis-less definition takes priority over a declared-but-failed definition", () => {
    const note = jsCellNote(input({ unresolvedName: "speed", isAxisLessDefinition: true, isDeclaredDefinitionFailed: true }));

    expect(note?.text).toBe('Definition "speed" has no recorded axis.');
  });

  it("jsCellNote — an unresolved channel name — names the channel", () => {
    const note = jsCellNote(input({ unresolvedName: "front_shock" }));

    expect(note).toEqual({ text: 'Channel "front_shock" is not part of this session.', fixable: true });
  });

  it("jsCellNote — no session selected, no unresolved name — says to choose one in the Data tab", () => {
    const note = jsCellNote(input({ windowCount: 0 }));

    expect(note).toEqual({ text: NO_SELECTION_NOTE, fixable: false });
  });

  it("jsCellNote — a session selected, no unresolved name, not axis-less — is null", () => {
    const note = jsCellNote(input({ windowCount: 1 }));

    expect(note).toBeNull();
  });
});

/** Decision 61: clearing the selection empties everything that depended on
 *  it, with one honest message and no Fix button. These pin the ordering
 *  change — an empty selection outranks every name-specific cause. */
describe("jsCellNote — decision 61, an empty selection outranks every other cause", () => {
  it("jsCellNote — no session and an unresolved channel — says no session, not the missing channel", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "front_shock" }));

    expect(note).toEqual({ text: NO_SELECTION_NOTE, fixable: false });
  });

  it("jsCellNote — no session and an axis-less definition — says no session", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "speed", isAxisLessDefinition: true }));

    expect(note?.text).toBe(NO_SELECTION_NOTE);
  });

  it("jsCellNote — no session and a failed declared definition — says no session", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "accel_mag_lp", isDeclaredDefinitionFailed: true }));

    expect(note?.text).toBe(NO_SELECTION_NOTE);
  });

  it("jsCellNote — the no-session note — is never fixable, so no Fix button is offered", () => {
    const note = jsCellNote(input({ windowCount: 0, unresolvedName: "front_shock", isDeclaredDefinitionFailed: true }));

    expect(note?.fixable).toBe(false);
  });

  it("jsCellNote — custom code with no channel call and no session — stays silent, it never depended on the selection", () => {
    const note = jsCellNote(input({ hasChannelReference: false, windowCount: 0, unresolvedName: "front_shock" }));

    expect(note).toBeNull();
  });

  it("jsCellNote — every note naming a reference — is fixable", () => {
    const notes = [
      jsCellNote(input({ unresolvedName: "speed", isAxisLessDefinition: true })),
      jsCellNote(input({ unresolvedName: "speed", isDeclaredDefinitionFailed: true })),
      jsCellNote(input({ unresolvedName: "speed" })),
    ];

    expect(notes.map((n) => n?.fixable)).toEqual([true, true, true]);
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
