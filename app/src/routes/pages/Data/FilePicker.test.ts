import { describe, expect, it, vi } from "vitest";

import { pickImportFile, type OpenDialogFn } from "./FilePicker";

describe("pickImportFile", () => {
  it("pickImportFile — a pasted path with surrounding whitespace — passes it trimmed as the dialog's defaultPath", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue("C:/rides/two.idl0");

    // Act
    const result = await pickImportFile("  C:/rides/one.idl0  ", openDialog);

    // Assert
    expect(result).toBe("C:/rides/two.idl0");
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "C:/rides/one.idl0", multiple: false })
    );
  });

  it("pickImportFile — an empty or whitespace-only pasted path — passes no defaultPath", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue(null);

    // Act
    await pickImportFile("", openDialog);
    await pickImportFile("   ", openDialog);

    // Assert
    expect(openDialog).toHaveBeenNthCalledWith(1, expect.objectContaining({ defaultPath: undefined }));
    expect(openDialog).toHaveBeenNthCalledWith(2, expect.objectContaining({ defaultPath: undefined }));
  });

  it("pickImportFile — filters to the four importer extensions", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue(null);

    // Act
    await pickImportFile("", openDialog);

    // Assert
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [expect.objectContaining({ extensions: ["idl0", "fit", "gpx", "csv"] })] })
    );
  });

  it("pickImportFile — the user cancels the dialog — resolves to null", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue(null);

    // Act
    const result = await pickImportFile("C:/rides", openDialog);

    // Assert
    expect(result).toBeNull();
  });
});
