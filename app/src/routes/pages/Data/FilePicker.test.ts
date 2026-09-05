import { describe, expect, it } from "vitest";

import { pickImportFile } from "./FilePicker";

describe("pickImportFile", () => {
  it("pickImportFile — a pasted path with surrounding whitespace — resolves to the trimmed path", async () => {
    const result = await pickImportFile("  C:/rides/one.idl0  ");

    expect(result).toBe("C:/rides/one.idl0");
  });

  it("pickImportFile — an empty or whitespace-only string — resolves to null", async () => {
    const empty = await pickImportFile("");
    const whitespaceOnly = await pickImportFile("   ");

    expect(empty).toBeNull();
    expect(whitespaceOnly).toBeNull();
  });
});
