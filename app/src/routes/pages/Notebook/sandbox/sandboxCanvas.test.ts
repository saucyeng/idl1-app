import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SANDBOX_DIR = dirname(fileURLToPath(import.meta.url));
const CANVAS_CSS_PATH = join(SANDBOX_DIR, "sandboxCanvas.css");
const MAIN_TS_PATH = join(SANDBOX_DIR, "main.ts");

describe("sandboxCanvas.css — neutralises the sandbox document's opaque background", () => {
  it("sets :root and body background to transparent, not a token or literal colour", () => {
    // Arrange
    const css = readFileSync(CANVAS_CSS_PATH, "utf-8");
    const rulePattern = /:root,\s*body\s*\{\s*background:\s*transparent;\s*\}/;

    // Act
    const found = rulePattern.test(css);

    // Assert
    expect(found).toBe(true);
  });

  it("contains no hex or rgb/hsl colour literal (tokens.css is the only file allowed one)", () => {
    // Arrange
    const css = readFileSync(CANVAS_CSS_PATH, "utf-8");
    const colorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/;

    // Act
    const found = colorLiteralPattern.test(css);

    // Assert
    expect(found).toBe(false);
  });
});

describe("sandbox/main.ts — imports sandboxCanvas.css after tokens.css", () => {
  it("the tokens.css import appears before the sandboxCanvas.css import (source order decides the cascade winner)", () => {
    // Arrange
    const source = readFileSync(MAIN_TS_PATH, "utf-8");
    const tokensIndex = source.indexOf('import "../../../../styles/tokens.css";');
    const canvasIndex = source.indexOf('import "./sandboxCanvas.css";');

    // Act & Assert
    expect(tokensIndex).toBeGreaterThanOrEqual(0);
    expect(canvasIndex).toBeGreaterThanOrEqual(0);
    expect(canvasIndex).toBeGreaterThan(tokensIndex);
  });
});
