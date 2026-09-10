import { describe, expect, it } from "vitest";

import type { CellKindToken } from "./cells";
import { paperSheetContent, paperSheetTitle } from "./paperSheet";

/** Every fence-language token a cell can carry (`model/cells.ts`), so a new
 *  kind is a compile error here until it is given sheet content. */
const ALL_KINDS: readonly CellKindToken[] = ["math", "table", "js"];

describe("paperSheetContent", () => {
  it("paperSheetContent — a js cell — the Properties form", () => {
    const content = paperSheetContent("js");

    expect(content).toBe("properties");
  });

  it("paperSheetContent — a math cell — the code editor, not a no-op", () => {
    const content = paperSheetContent("math");

    expect(content).toBe("code");
  });

  it("paperSheetContent — a table cell — the code editor, not a no-op", () => {
    const content = paperSheetContent("table");

    expect(content).toBe("code");
  });

  it("paperSheetContent — every cell kind — opens something, never nothing", () => {
    const opened = ALL_KINDS.map(paperSheetContent);

    expect(opened.every((content) => content === "properties" || content === "code")).toBe(true);
  });

  it("paperSheetContent — every cell kind — properties only for js", () => {
    const withProperties = ALL_KINDS.filter((kind) => paperSheetContent(kind) === "properties");

    expect(withProperties).toEqual(["js"]);
  });
});

describe("paperSheetTitle", () => {
  it("paperSheetTitle — properties — names the form", () => {
    const title = paperSheetTitle("properties");

    expect(title).toBe("Cell properties");
  });

  it("paperSheetTitle — code — names the code editor", () => {
    const title = paperSheetTitle("code");

    expect(title).toBe("Cell code");
  });
});
