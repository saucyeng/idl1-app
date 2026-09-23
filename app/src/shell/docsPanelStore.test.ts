import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeDocs,
  getDocsPanelState,
  openDocs,
  resetDocsPanel,
  subscribeDocsPanel,
  toggleDocs,
} from "./docsPanelStore";

beforeEach(() => {
  resetDocsPanel();
});

describe("openDocs", () => {
  it("openDocs — with an anchor — the panel opens carrying it", () => {
    // Arrange / Act
    openDocs("welch");

    // Assert
    expect(getDocsPanelState()).toMatchObject({ open: true, anchor: "welch", doc: "workbook" });
  });

  it("openDocs — with no doc argument — defaults to the workbook reference", () => {
    // Arrange / Act
    openDocs();

    // Assert
    expect(getDocsPanelState().doc).toBe("workbook");
  });

  it("openDocs — with doc \"cli\" — opens the CLI reference", () => {
    // Arrange / Act
    openDocs(null, "cli");

    // Assert
    expect(getDocsPanelState()).toMatchObject({ open: true, doc: "cli" });
  });

  it("openDocs — the same anchor twice — the nonce advances so the second request still scrolls", () => {
    // Arrange
    openDocs("welch");
    const first = getDocsPanelState().nonce;

    // Act
    openDocs("welch");

    // Assert
    expect(getDocsPanelState().nonce).toBeGreaterThan(first);
  });
});

describe("closeDocs", () => {
  it("closeDocs — after opening at an anchor — the panel closes but keeps where the reader was", () => {
    // Arrange
    openDocs("welch");

    // Act
    closeDocs();

    // Assert
    expect(getDocsPanelState()).toMatchObject({ open: false, anchor: "welch" });
  });
});

describe("toggleDocs", () => {
  it("toggleDocs — with no anchor while closed — opens", () => {
    // Arrange / Act
    toggleDocs();

    // Assert
    expect(getDocsPanelState().open).toBe(true);
  });

  it("toggleDocs — with no anchor while open — closes", () => {
    // Arrange
    openDocs();

    // Act
    toggleDocs();

    // Assert
    expect(getDocsPanelState().open).toBe(false);
  });

  it("toggleDocs — with an anchor while open — stays open and moves to the anchor", () => {
    // Arrange
    openDocs("alpha");

    // Act
    toggleDocs("beta");

    // Assert — F1 on a second function must not close the panel the reader
    // is using.
    expect(getDocsPanelState()).toMatchObject({ open: true, anchor: "beta" });
  });

  it("toggleDocs — open on \"workbook\", asked for \"cli\" with no anchor — switches rather than closing", () => {
    // Arrange
    openDocs(null, "workbook");

    // Act
    toggleDocs(null, "cli");

    // Assert — `help.cliReference` while the panel is already open on the
    // workbook reference must open the CLI reference, not close the panel.
    expect(getDocsPanelState()).toMatchObject({ open: true, doc: "cli" });
  });

  it("toggleDocs — open on \"cli\" with no anchor, asked for \"cli\" again — closes", () => {
    // Arrange
    openDocs(null, "cli");

    // Act
    toggleDocs(null, "cli");

    // Assert
    expect(getDocsPanelState().open).toBe(false);
  });
});

describe("subscribeDocsPanel", () => {
  it("subscribeDocsPanel — a change after unsubscribing — the handler is not called again", () => {
    // Arrange
    const handler = vi.fn();
    const unsubscribe = subscribeDocsPanel(handler);

    // Act
    openDocs();
    unsubscribe();
    closeDocs();

    // Assert
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
