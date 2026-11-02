import { describe, expect, it } from "vitest";

import { initialRideFlow, rideFlowReducer, sessionKey } from "../../../shell/rideFlow";
import { rowStatusText } from "./NewRidesSection";

describe("rowStatusText", () => {
  it("rowStatusText — each stage — status words, with notes started once typed", () => {
    // Arrange
    let s = rideFlowReducer(initialRideFlow, { type: "BATCH_START", files: [{ name: "a", sizeBytes: 200 }, { name: "b", sizeBytes: 100 }] });
    s = rideFlowReducer(s, { type: "PROGRESS", name: "a", doneBytes: 128 });
    const downloading = rowStatusText(s.rows[0], s);
    s = rideFlowReducer(s, { type: "DRAFT", key: "a", notes: "dry" });
    s = rideFlowReducer(s, { type: "IMPORTED", name: "a", sessionId: "S" });
    s = rideFlowReducer(s, { type: "FAILED", name: "b", error: "wifi dropped", step: "download" });

    // Act
    const texts = [downloading, rowStatusText(s.rows[0], s), rowStatusText(s.rows[1], s)];

    // Assert
    expect(texts).toEqual(["Downloading 64%", "Downloaded · notes started", "Failed: wifi dropped"]);
    expect(s.drafts[sessionKey("S")].notes).toBe("dry");
  });

  it("rowStatusText — downloaded but the import failed — says import, not download", () => {
    // Arrange
    let s = rideFlowReducer(initialRideFlow, { type: "BATCH_START", files: [{ name: "a", sizeBytes: 200 }] });
    s = rideFlowReducer(s, { type: "IMPORTING", name: "a" });
    s = rideFlowReducer(s, { type: "FAILED", name: "a", error: "truncated record", step: "import" });

    // Act
    const text = rowStatusText(s.rows[0], s);

    // Assert
    expect(text).toBe("Import failed: truncated record");
    expect(s.rows[0].failedStep).toBe("import");
  });
});
