import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CHROME_Z_INDEX,
  chromeRegions,
  contentRegions,
  isChrome,
  SHELL_REGION_IDS,
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
