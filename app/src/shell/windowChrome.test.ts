import { describe, expect, it } from "vitest";

import { TITLE_BAR_HEIGHT_PX, usesCustomTitleBar, WINDOW_CONTROL_ORDER, windowControlLabel } from "./windowChrome";

describe("usesCustomTitleBar — a Windows user agent — draws our own title bar", () => {
  it("is true for the WebView2 user agent idl1 actually runs under", () => {
    // Arrange
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

    // Act
    const custom = usesCustomTitleBar(ua);

    // Assert
    expect(custom).toBe(true);
  });

  it("is false on macOS and Linux, which keep their native decorations", () => {
    // Arrange
    const agents = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    ];

    // Act
    const results = agents.map(usesCustomTitleBar);

    // Assert
    expect(results).toEqual([false, false]);
  });

  it("is false for an empty user agent rather than throwing", () => {
    // Arrange
    const ua = "";

    // Act
    const custom = usesCustomTitleBar(ua);

    // Assert
    expect(custom).toBe(false);
  });
});

describe("windowControlLabel — the maximize toggle — names what the button will do", () => {
  it("says Maximize on a restored window and Restore down on a maximized one", () => {
    // Arrange
    const states = [false, true];

    // Act
    const labels = states.map((maximized) => windowControlLabel("maximize", maximized));

    // Assert
    expect(labels).toEqual(["Maximize", "Restore down"]);
  });

  it("leaves the other two labels alone in both states", () => {
    // Arrange
    const ids = ["minimize", "close"] as const;

    // Act
    const labels = ids.map((id) => [windowControlLabel(id, false), windowControlLabel(id, true)]);

    // Assert
    expect(labels).toEqual([
      ["Minimize", "Minimize"],
      ["Close", "Close"],
    ]);
  });
});

describe("the title bar's own geometry — Windows' caption height — is what we replace it with", () => {
  it("is 32 px, and the controls are ordered minimize, maximize, close", () => {
    // Arrange
    const expected = ["minimize", "maximize", "close"];

    // Act
    const order = [...WINDOW_CONTROL_ORDER];

    // Assert
    expect(TITLE_BAR_HEIGHT_PX).toBe(32);
    expect(order).toEqual(expected);
  });
});
