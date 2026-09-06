import { describe, expect, it } from "vitest";

import { isEditorEcho } from "./editorEcho";

describe("isEditorEcho", () => {
  it("isEditorEcho — nothing applied yet — is never an echo", () => {
    const result = isEditorEcho(null, "any code");

    expect(result).toBe(false);
  });

  it("isEditorEcho — incoming code matches the last applied write — is an echo", () => {
    const result = isEditorEcho("Plot.plot({})", "Plot.plot({})");

    expect(result).toBe(true);
  });

  it("isEditorEcho — incoming code differs from the last applied write — is a fresh edit, not an echo", () => {
    const result = isEditorEcho("Plot.plot({})", "Plot.plot({ x: {} })");

    expect(result).toBe(false);
  });
});
