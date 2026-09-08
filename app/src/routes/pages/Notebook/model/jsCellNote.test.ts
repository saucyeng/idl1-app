import { describe, expect, it } from "vitest";

import { jsCellNote } from "./jsCellNote";

describe("jsCellNote", () => {
  it("jsCellNote — custom code (not form-generated) — is null", () => {
    const note = jsCellNote({ isFormGenerated: false, windowCount: 0, unresolvedName: null, isAxisLessDefinition: false });

    expect(note).toBeNull();
  });

  it("jsCellNote — an axis-less definition — names the definition, even with no session", () => {
    const note = jsCellNote({ isFormGenerated: true, windowCount: 0, unresolvedName: "speed", isAxisLessDefinition: true });

    expect(note).toBe('Definition "speed" has no recorded axis.');
  });

  it("jsCellNote — an unresolved channel name — names the channel, even with no session", () => {
    const note = jsCellNote({ isFormGenerated: true, windowCount: 0, unresolvedName: "front_shock", isAxisLessDefinition: false });

    expect(note).toBe('Channel "front_shock" is not part of this session.');
  });

  it("jsCellNote — no session selected, no unresolved name — says to choose one in the Data tab", () => {
    const note = jsCellNote({ isFormGenerated: true, windowCount: 0, unresolvedName: null, isAxisLessDefinition: false });

    expect(note).toBe("No session is selected — choose one in the Data tab.");
  });

  it("jsCellNote — a session selected, no unresolved name, not axis-less — is null", () => {
    const note = jsCellNote({ isFormGenerated: true, windowCount: 1, unresolvedName: null, isAxisLessDefinition: false });

    expect(note).toBeNull();
  });
});
