import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(STYLES_DIR, "..");
const TOKENS_CSS_PATH = join(STYLES_DIR, "tokens.css");
const FONTS_CSS_PATH = join(STYLES_DIR, "fonts.css");

const tokensCss = readFileSync(TOKENS_CSS_PATH, "utf-8");
const fontsCss = readFileSync(FONTS_CSS_PATH, "utf-8");

/** Known hex-literal exceptions to the "hex only in tokens.css" rule, each
 *  tagged with the task that removes it. Adding a new exception here without
 *  a task name is what this test is designed to catch.
 *
 * Empty since UI-7: `Settings/settings.css`'s `rgba(0,0,0,0.08)` selection
 * tint was the last entry — the file is deleted and its selected-row state
 * now uses `--control-active` like every other list. */
const KNOWN_EXCEPTIONS: { file: string; task: string }[] = [];

/** Recursively lists every file under `dir` whose name matches `extensions`. */
function listFiles(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFiles(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("tokens.css — the 13 idl0 palette tokens — present with the exact idl0 hex", () => {
  const palette: [string, string][] = [
    ["--bg", "#121412"],
    ["--surface", "#1a1e18"],
    ["--surface-2", "#161915"],
    ["--control", "#20251d"],
    ["--control-active", "#2d3327"],
    ["--fg", "#efeae0"],
    ["--fg-dim", "#9a968a"],
    ["--fg-faint", "#6c6a60"],
    ["--rule", "#353a32"],
    ["--accent", "#e63946"],
    ["--good", "#35c46e"],
    ["--hivis", "#f5d547"],
    ["--info", "#3b92e8"],
  ];

  it.each(palette)("%s is %s", (name, hex) => {
    // Arrange
    const pattern = new RegExp(`${name}:\\s*${hex}\\b`, "i");

    // Act
    const found = pattern.test(tokensCss);

    // Assert
    expect(found).toBe(true);
  });
});

describe("tokens.css — the 8 chart series tokens — present in cycle order", () => {
  const chartSeries: [string, string][] = [
    ["--chart-1", "#5ba6f0"],
    ["--chart-2", "#35c46e"],
    ["--chart-3", "#f5d547"],
    ["--chart-4", "#e8964b"],
    ["--chart-5", "#b98ae6"],
    ["--chart-6", "#3fc9c0"],
    ["--chart-7", "#e86fa6"],
    ["--chart-8", "#e05a63"],
  ];

  it("every chart token appears with its cycle hex, in ascending index order", () => {
    // Arrange
    const indices = chartSeries.map(([name]) => {
      const match = tokensCss.match(new RegExp(`${name}:\\s*([0-9a-fA-F#]+)`));
      return { name, position: tokensCss.indexOf(`${name}:`), hex: match?.[1]?.toLowerCase() };
    });

    // Act
    const positions = indices.map((i) => i.position);
    const isAscending = positions.every((p, i) => i === 0 || p > positions[i - 1]);

    // Assert
    expect(indices.every((i) => i.position >= 0)).toBe(true);
    expect(isAscending).toBe(true);
    chartSeries.forEach(([name, hex]) => {
      const entry = indices.find((i) => i.name === name);
      expect(entry?.hex).toBe(hex);
    });
  });
});

describe("tokens.css — every shadcn variable — resolves to a var(), not a literal", () => {
  const shadcnVariables = [
    "--background",
    "--card",
    "--popover",
    "--muted",
    "--foreground",
    "--muted-foreground",
    "--border",
    "--input",
    "--ring",
    "--destructive",
  ];

  it.each(shadcnVariables)("%s is declared as var(...)", (name) => {
    // Arrange
    const declPattern = new RegExp(`${name}:\\s*([^;]+);`);

    // Act
    const match = tokensCss.match(declPattern);

    // Assert
    expect(match).not.toBeNull();
    expect(match?.[1].trim().startsWith("var(")).toBe(true);
  });
});

describe("tokens.css — no light-theme block — first pass authors dark only", () => {
  it("contains no [data-theme=\"light\"] selector", () => {
    // Arrange
    const pattern = /\[data-theme\s*=\s*["']light["']\]/;

    // Act
    const found = pattern.test(tokensCss);

    // Assert
    expect(found).toBe(false);
  });
});

describe("stylesheets — hex colour literals — appear only in tokens.css", () => {
  // Broadened beyond the literal `#hex` regex to also catch `rgb()`/`rgba()`/
  // `hsl()`/`hsla()` function literals: the brief's own known-offender
  // example (`Settings/settings.css`'s `rgba(0,0,0,0.08)`) is an rgba, not a
  // hex, so the KNOWN_EXCEPTIONS mechanism only means something if the same
  // check flags it too.
  const colorLiteralSource = "#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?)\\([^)]*\\)";

  // TODO(idl0): this scan's extension list is [".css", ".tsx"] only, so it
  // never reaches plain `.ts` modules (e.g. `Notebook/theme/*.ts`, which read
  // tokens rather than write literals today, but the gate wouldn't catch it
  // if a future one did). Broadening to `.ts` is a follow-up task against
  // this shared test infra, not a single lane's own files (UI-8 review).
  it("no .css or .tsx file outside tokens.css (or a listed KNOWN_EXCEPTIONS file) contains a hardcoded colour literal", () => {
    // Arrange
    const files = listFiles(SRC_DIR, [".css", ".tsx"]).filter((f) => f !== TOKENS_CSS_PATH);
    const exceptionPaths = new Set(KNOWN_EXCEPTIONS.map((e) => e.file));

    // Act
    const offenders = files
      .filter((f) => !exceptionPaths.has(f))
      .map((f) => ({
        file: relative(SRC_DIR, f),
        matches: readFileSync(f, "utf-8").match(new RegExp(colorLiteralSource, "g")) ?? [],
      }))
      .filter((r) => r.matches.length > 0);

    // Assert
    expect(offenders).toEqual([]);
  });

  it("every KNOWN_EXCEPTIONS entry still exists and still contains a colour literal (stale exceptions are removed, not left behind)", () => {
    // Act & Assert
    for (const exception of KNOWN_EXCEPTIONS) {
      const contents = readFileSync(exception.file, "utf-8");
      expect(new RegExp(colorLiteralSource).test(contents)).toBe(true);
    }
  });
});

describe("fonts.css — every @font-face — points at a committed local woff2", () => {
  it("every url(...) in fonts.css resolves to a file on disk", () => {
    // Arrange
    const urlPattern = /url\((["']?)([^)"']+)\1\)/g;
    const urls = [...fontsCss.matchAll(urlPattern)].map((m) => m[2]);

    // Act
    const results = urls.map((u) => ({ url: u, exists: statSync(join(STYLES_DIR, u), { throwIfNoEntry: false
    }) !== undefined }));

    // Assert
    expect(urls.length).toBe(6);
    expect(results.every((r) => r.exists)).toBe(true);
  });

  it("no @font-face url is a remote address (no CDN)", () => {
    // Arrange
    const remotePattern = /url\(["']?(https?:)?\/\//;

    // Act
    const hasRemote = remotePattern.test(fontsCss);

    // Assert
    expect(hasRemote).toBe(false);
  });
});
