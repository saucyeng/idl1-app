import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CHROME_Z_INDEX,
  chromeRegions,
  contentRegions,
  isChrome,
  scrollingRegions,
  SHELL_REGION_IDS,
  SHELL_ROOT_SCROLLS,
  zIndexFor,
} from "./stackingLayers";

const SHELL_DIR = dirname(fileURLToPath(import.meta.url));

/** One of the shell's own layout files, as text. The invariant below is
 *  about what the shell *declares*, so it is checked against the source
 *  rather than a rendered tree — the same approach `styles/tokenSheet.
 *  test.ts` takes to "no hex literal outside tokens.css". */
function shellSource(fileName: string): string {
  return withoutComments(readFileSync(join(SHELL_DIR, fileName), "utf-8"));
}

/** `source` with block and line comments removed. The invariant is about
 *  what a file *declares*, and these files explain the rule they follow in
 *  prose that quotes the very patches it forbids — scanning the comments
 *  too would make documenting the rule a violation of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A Tailwind z-index utility written on a className, e.g. `z-10` or
 *  `z-[9999]` — the per-element patch R221.1 abolishes. */
const Z_PATCH = /\bz-(\d|\[)/;

describe("the stacking model", () => {
  it("layers — every region — is either chrome or content", () => {
    const sorted = [...chromeRegions(), ...contentRegions()].sort();

    expect(sorted).toEqual([...SHELL_REGION_IDS].sort());
  });

  it("layers — the content container — is the only region that is not chrome", () => {
    const content = contentRegions();

    expect(content).toEqual(["content"]);
  });

  it("layers — every chrome region — declares the one chrome z-index", () => {
    const declared = chromeRegions().map(zIndexFor);

    expect(declared).toEqual(chromeRegions().map(() => CHROME_Z_INDEX));
  });

  it("layers — no content region — declares a z-index at all", () => {
    const declared = contentRegions().map(zIndexFor);

    expect(declared).toEqual([null]);
    expect(declared).not.toContain(0);
  });

  it("layers — the timeline strip — is chrome, not content", () => {
    const chrome = isChrome("timelineStrip");

    expect(chrome).toBe(true);
  });
});

describe("the scroll model", () => {
  it("scrolling — the window itself — never scrolls", () => {
    const root = SHELL_ROOT_SCROLLS;

    expect(root).toBe(false);
  });

  it("scrolling — the content container — is the only region that scrolls", () => {
    const scrolling = scrollingRegions();

    expect(scrolling).toEqual(contentRegions());
  });

  it("scrolling — every chrome region — holds its place", () => {
    const scrollingChrome = chromeRegions().filter((region) => scrollingRegions().includes(region));

    expect(scrollingChrome).toEqual([]);
  });
});

describe("the shell's own layout source", () => {
  /** Every file that renders a chrome region. Listed rather than derived,
   *  so a region added to the model without a file to render it is a
   *  failure here and not a silent pass. */
  const CHROME_FILES = [
    "TitleBar.tsx",
    "ActivityBar.tsx",
    "Sidebar.tsx",
    "ToolbarSlotRow.tsx",
    "TimelineSlotRow.tsx",
    "StatusBar.tsx",
    "BottomBar.tsx",
  ];

  it("invariant — every chrome region's file — joins the layer by class", () => {
    const missing = CHROME_FILES.filter((file) => !shellSource(file).includes("shell-chrome"));

    expect(missing).toEqual([]);
  });

  it("invariant — no chrome region — states a z-index of its own", () => {
    const patched = CHROME_FILES.filter((file) => Z_PATCH.test(shellSource(file)));

    expect(patched).toEqual([]);
  });

  it("invariant — the shell's frame — states no z-index anywhere", () => {
    const source = shellSource("AppShell.tsx");

    const patched = Z_PATCH.test(source);

    expect(patched).toBe(false);
  });

  it("invariant — the app root — is pinned to the viewport and cannot scroll", () => {
    const source = shellSource("AppShell.tsx");

    const root = source.match(/<div className="flex [^"]*"/)?.[0] ?? "";

    expect(root).toContain("h-[100dvh]");
    expect(root).toContain("overflow-hidden");
  });

  it("invariant — the app root — asks for neither 100vh nor 100vw", () => {
    const source = shellSource("AppShell.tsx");

    const viewportUnits = source.match(/h-screen|w-screen/g) ?? [];

    expect(viewportUnits).toEqual([]);
  });

  it("invariant — the document — pins html, body and the React root", () => {
    const css = readFileSync(join(SHELL_DIR, "..", "styles", "index.css"), "utf-8");

    const rule = css.match(/html,\s*body,\s*#root\s*\{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("height: 100%");
    expect(rule).toContain("overflow: hidden");
  });

  it("invariant — the content container — is declared exactly once", () => {
    const uses = shellSource("AppShell.tsx").match(/className="shell-content/g) ?? [];

    expect(uses).toHaveLength(contentRegions().length);
  });

  it("invariant — the Notebook toolbar row — no longer carries R161's patch", () => {
    const toolbar = withoutComments(
      readFileSync(join(SHELL_DIR, "..", "routes", "pages", "Notebook", "components", "NotebookToolbar.tsx"), "utf-8")
    );

    const patched = /className="idl-dense[^\n]*\bz-\d/.test(toolbar);

    expect(patched).toBe(false);
  });
});
