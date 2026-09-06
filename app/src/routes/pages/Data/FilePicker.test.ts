import { describe, expect, it, vi } from "vitest";

import { pickImportFile, resolvePastedPath, type OpenDialogFn } from "./FilePicker";

describe("resolvePastedPath", () => {
  it("resolvePastedPath — a pasted path — imports that path with no dialog", () => {
    // Arrange
    const pastedPath = "  C:/rides/one.idl0  ";

    // Act
    const result = resolvePastedPath(pastedPath);

    // Assert
    expect(result).toBe("C:/rides/one.idl0");
  });

  it("resolvePastedPath — an empty or whitespace-only string — resolves to null", () => {
    // Arrange
    const empty = "";
    const whitespaceOnly = "   ";

    // Act
    const emptyResult = resolvePastedPath(empty);
    const whitespaceOnlyResult = resolvePastedPath(whitespaceOnly);

    // Assert
    expect(emptyResult).toBeNull();
    expect(whitespaceOnlyResult).toBeNull();
  });
});

describe("pickImportFile", () => {
  it("pickImportFile — Browse with a chosen file — imports it", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue("C:/rides/two.idl0");

    // Act
    const result = await pickImportFile("", openDialog);

    // Assert
    expect(result).toBe("C:/rides/two.idl0");
  });

  it("pickImportFile — Browse cancelled — no import, no error", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue(null);

    // Act
    const result = await pickImportFile("C:/rides", openDialog);

    // Assert
    expect(result).toBeNull();
  });

  it("pickImportFile — a starting folder with surrounding whitespace — passes it trimmed as the dialog's defaultPath", async () => {
    // Arrange
    const openDialog: OpenDialogFn = vi.fn().mockResolvedValue(null);

    // Act
    await pickImportFile("  C:/rides/one.idl0  ", openDialog);

    // Assert
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "C:/rides/one.idl0", multiple: false })
    );
  });

  it("pickImportFile — an empty or whitespace-only starting folder — passes no defaultPath", async () => {
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
});
