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
    expect(getDocsPanelState()).toMatchObject({ open: true, anchor: "welch" });
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
