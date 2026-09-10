import { describe, expect, it } from "vitest";

import type { CellKindToken } from "./cells";
import { editorContentFor, sheetTitleFor } from "./editorContent";

/** Every fence-language token a cell can carry (`model/cells.ts`), so a new
 *  kind is a compile error here until it is given sheet content. */
const ALL_KINDS: readonly CellKindToken[] = ["math", "table", "js"];

describe("editorContentFor", () => {
  it("editorContentFor — a js cell — the Properties form", () => {
    const content = editorContentFor("js");

    expect(content).toBe("properties");
  });

  it("editorContentFor — a math cell — the code editor, not a no-op", () => {
    const content = editorContentFor("math");

    expect(content).toBe("code");
  });

  it("editorContentFor — a table cell — the code editor, not a no-op", () => {
    const content = editorContentFor("table");

    expect(content).toBe("code");
  });

  it("editorContentFor — every cell kind — opens something, never nothing", () => {
    const opened = ALL_KINDS.map(editorContentFor);

    expect(opened.every((content) => content === "properties" || content === "code")).toBe(true);
  });

  it("editorContentFor — every cell kind — properties only for js", () => {
    const withProperties = ALL_KINDS.filter((kind) => editorContentFor(kind) === "properties");

    expect(withProperties).toEqual(["js"]);
  });
});

describe("sheetTitleFor", () => {
  it("sheetTitleFor — properties — names the form", () => {
    const title = sheetTitleFor("properties");

    expect(title).toBe("Cell properties");
  });

  it("sheetTitleFor — code — names the code editor", () => {
    const title = sheetTitleFor("code");

    expect(title).toBe("Cell code");
  });
});
