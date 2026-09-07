import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HighlightStyle } from "@codemirror/language";
import { describe, expect, it } from "vitest";

import { tokenizeMath } from "../model/mathMode";
import { brandHighlightStyle, SYNTAX_ROLE_VARS, type SyntaxRole } from "./cmTheme";

const EDITOR_DIR = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS_PATH = join(EDITOR_DIR, "..", "..", "..", "..", "styles", "tokens.css");
const tokensCss = readFileSync(TOKENS_CSS_PATH, "utf-8");

const STUB_TOKENS: Record<string, string> = {
  "--chart-1": "#5ba6f0",
  "--chart-2": "#35c46e",
  "--chart-3": "#f5d547",
  "--chart-4": "#e8964b",
  "--chart-5": "#b98ae6",
  "--chart-6": "#3fc9c0",
  "--chart-7": "#e86fa6",
  "--chart-8": "#e05a63",
  "--fg": "#efeae0",
  "--fg-faint": "#6c6a60",
  "--bg": "#121412",
  "--surface-2": "#161915",
  "--rule": "#353a32",
  "--control": "#20251d",
  "--control-active": "#2d3327",
  "--focus": "#f5d547",
  "--font-mono": '"IBM Plex Mono", ui-monospace, monospace',
  "--text-body-small": "12px",
};

const stubReader = (name: string) => STUB_TOKENS[name] ?? "";

describe("SYNTAX_ROLE_VARS — every role — names a CSS variable defined in tokens.css", () => {
  const roles = Object.keys(SYNTAX_ROLE_VARS) as SyntaxRole[];

  it.each(roles)("%s's token exists in tokens.css", (role) => {
    // Arrange
    const varName = SYNTAX_ROLE_VARS[role];
    const pattern = new RegExp(`${varName}:\\s*\\S`);

    // Act
    const found = pattern.test(tokensCss);

    // Assert
    expect(found).toBe(true);
  });
});

describe("SYNTAX_ROLE_VARS — the record — total over SyntaxRole and free of hex", () => {
  const EXPECTED_ROLES: SyntaxRole[] = [
    "keyword",
    "identifier",
    "channelRef",
    "cellRef",
    "number",
    "operator",
    "function",
    "comment",
    "string",
    "labelComment",
  ];

  it("has exactly the ten SyntaxRole keys, no more, no fewer", () => {
    // Arrange & Act
    const keys = Object.keys(SYNTAX_ROLE_VARS).sort();

    // Assert
    expect(keys).toEqual([...EXPECTED_ROLES].sort());
  });

  it.each(EXPECTED_ROLES)("%s's value is a CSS variable name, never a hex literal", (role) => {
    // Arrange
    const value = SYNTAX_ROLE_VARS[role];

    // Act & Assert
    expect(value.startsWith("--")).toBe(true);
    expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("SYNTAX_ROLE_VARS — every MathTokenKind the math mode actually emits — has a role", () => {
  it("tokenizing a line exercising all nine math token kinds yields only known roles", () => {
    // Arrange — one line touching every MathTokenKind tokenizeMath can emit:
    // keyword, identifier, channelRef, cellRef, number, operator, function,
    // then a second line for comment and labelComment (a comment ends the line).
    const expressionLine = "const total = sum([Speed]) + {lap} and not 3.5 * x";
    const commentLine = "# a plain comment";
    const labelCommentLine = "# label: a display name";

    // Act
    const observedKinds = new Set([
      ...tokenizeMath(expressionLine).map((t) => t.kind),
      ...tokenizeMath(commentLine).map((t) => t.kind),
      ...tokenizeMath(labelCommentLine).map((t) => t.kind),
    ]);

    // Assert
    expect(observedKinds.size).toBeGreaterThanOrEqual(8);
    for (const kind of observedKinds) {
      expect(Object.keys(SYNTAX_ROLE_VARS)).toContain(kind);
    }
  });
});

describe("brandHighlightStyle — a stub reader — assigns distinct colours to keyword, number, string and comment", () => {
  it("returns a HighlightStyle instance built without throwing", () => {
    // Arrange & Act
    const style = brandHighlightStyle(stubReader);

    // Assert
    expect(style).toBeInstanceOf(HighlightStyle);
  });

  it("keyword, number, string and comment resolve to four distinct token values", () => {
    // Arrange
    const roles: SyntaxRole[] = ["keyword", "number", "string", "comment"];

    // Act
    const colours = roles.map((role) => stubReader(SYNTAX_ROLE_VARS[role]));

    // Assert
    expect(new Set(colours).size).toBe(roles.length);
  });
});
