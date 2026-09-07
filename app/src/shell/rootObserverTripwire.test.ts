import { describe, expect, it } from "vitest";

import {
  buildNavigationReport,
  buildRootCollapsedReport,
  buildRootEmptiedReport,
  collectRemovedNodeNames,
  isEmptiedByMutations,
  isRootCollapsedWhileVisible,
  ROOT_OBSERVER_TAG,
} from "./rootObserverTripwire";

/** Builds a minimal fake `MutationRecord` with only the fields this module reads. */
function fakeMutation(removedNodeNames: string[]): MutationRecord {
  const removedNodes = removedNodeNames.map((name) => ({ nodeName: name })) as unknown as NodeList;
  return { removedNodes } as unknown as MutationRecord;
}

/** Builds a minimal fake `Element` with only `childElementCount`. */
function fakeElement(childElementCount: number): Element {
  return { childElementCount } as unknown as Element;
}

describe("isEmptiedByMutations", () => {
  it("watched element has zero children and a mutation removed a node — reports emptied", () => {
    const emptied = isEmptiedByMutations([fakeMutation(["DIV"])], fakeElement(0));

    expect(emptied).toBe(true);
  });

  it("watched element still has children — not emptied even if a mutation removed something", () => {
    const emptied = isEmptiedByMutations([fakeMutation(["DIV"])], fakeElement(1));

    expect(emptied).toBe(false);
  });

  it("zero children but no mutation actually removed a node (e.g. a text-only subtree mutation) — not emptied", () => {
    const emptied = isEmptiedByMutations([fakeMutation([])], fakeElement(0));

    expect(emptied).toBe(false);
  });

  it("watched element itself is gone from the document (null) with a removal in the batch — reports emptied", () => {
    const emptied = isEmptiedByMutations([fakeMutation(["DIV"])], null);

    expect(emptied).toBe(true);
  });
});

describe("collectRemovedNodeNames", () => {
  it("a single mutation removing two nodes — names both in order", () => {
    const names = collectRemovedNodeNames([fakeMutation(["DIV", "NAV"])]);

    expect(names).toEqual(["DIV", "NAV"]);
  });

  it("multiple mutations — concatenates names across the batch in order", () => {
    const names = collectRemovedNodeNames([fakeMutation(["DIV"]), fakeMutation(["NAV", "MAIN"])]);

    expect(names).toEqual(["DIV", "NAV", "MAIN"]);
  });

  it("no mutations — empty list", () => {
    const names = collectRemovedNodeNames([]);

    expect(names).toEqual([]);
  });
});

describe("buildRootEmptiedReport", () => {
  it("carries the tag, kind and every field the dispatch asked to see", () => {
    const report = buildRootEmptiedReport({
      stack: "Error: root emptied\n    at fake",
      removedNodeNames: ["DIV"],
      rootChildElementCount: 0,
      bodyClassName: "theme-dark",
      href: "http://localhost/notebook",
      msSinceLoad: 4321,
    });

    expect(report).toEqual({
      tag: ROOT_OBSERVER_TAG,
      kind: "root-emptied",
      stack: "Error: root emptied\n    at fake",
      removedNodeNames: ["DIV"],
      rootChildElementCount: 0,
      bodyClassName: "theme-dark",
      href: "http://localhost/notebook",
      msSinceLoad: 4321,
    });
  });
});

describe("buildNavigationReport", () => {
  it("a pagehide event — carries the tag, kind and event name", () => {
    const report = buildNavigationReport({
      event: "pagehide",
      stack: "Error: navigation\n    at fake",
      href: "http://localhost/notebook",
      msSinceLoad: 1000,
    });

    expect(report).toEqual({
      tag: ROOT_OBSERVER_TAG,
      kind: "navigation",
      event: "pagehide",
      stack: "Error: navigation\n    at fake",
      href: "http://localhost/notebook",
      msSinceLoad: 1000,
    });
  });
});

describe("isRootCollapsedWhileVisible", () => {
  it("zero height while the page is visible — reports collapsed", () => {
    const collapsed = isRootCollapsedWhileVisible({ height: 0 }, "visible");

    expect(collapsed).toBe(true);
  });

  it("zero height while the page is hidden (backgrounded tab) — not a collapse", () => {
    const collapsed = isRootCollapsedWhileVisible({ height: 0 }, "hidden");

    expect(collapsed).toBe(false);
  });

  it("nonzero height while visible — not a collapse", () => {
    const collapsed = isRootCollapsedWhileVisible({ height: 600 }, "visible");

    expect(collapsed).toBe(false);
  });
});

describe("buildRootCollapsedReport", () => {
  it("carries the tag, kind and every field the dispatch asked to see", () => {
    const report = buildRootCollapsedReport({
      bodyClassName: "theme-dark",
      href: "http://localhost/notebook",
      msSinceLoad: 8000,
    });

    expect(report).toEqual({
      tag: ROOT_OBSERVER_TAG,
      kind: "root-collapsed",
      bodyClassName: "theme-dark",
      href: "http://localhost/notebook",
      msSinceLoad: 8000,
    });
  });
});
