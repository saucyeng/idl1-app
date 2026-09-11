import { describe, expect, it } from "vitest";

import { scanCells } from "./cells";
import { commitProseEdit, draftProseEdit, openProseEdit, proseEditTarget, proseSourceError } from "./proseEdit";

const DOC = [
  "---",
  "title: demo",
  "---",
  "",
  "Some prose about ${speed}.",
  "",
  "```math id=1a000006",
  "speed = channel([Speed])",
  "```",
  "",
  "Trailing prose.",
  "",
].join("\n");

/** `scanCells(markdown).cells`, the second argument every entry point takes. */
function cellsOf(markdown: string) {
  return scanCells(markdown).cells;
}

describe("proseEditTarget", () => {
  it("target — the before block of a cell — covers that block's own source", () => {
    const target = proseEditTarget(DOC, cellsOf(DOC), "1a000006::before");

    expect(target).not.toBeNull();
    expect(DOC.slice(target!.from, target!.to)).toBe(target!.source);
    expect(target!.source).toContain("Some prose about ${speed}.");
  });

  it("target — the after block of the last cell — is the trailing prose", () => {
    const target = proseEditTarget(DOC, cellsOf(DOC), "1a000006::after");

    expect(target!.position).toBe("after");
    expect(target!.source).toContain("Trailing prose.");
  });

  it("target — non-ASCII prose earlier in the document — offsets are characters, not UTF-8 bytes", () => {
    const doc = "Über — µ\n\n```math id=1a000006\nx = 1\n```\n\nAfter.\n";

    const target = proseEditTarget(doc, cellsOf(doc), "1a000006::after");

    expect(doc.slice(target!.from, target!.to)).toBe(target!.source);
    expect(target!.source).toContain("After.");
  });

  it("target — a block id for a cell the document no longer has — is null", () => {
    const target = proseEditTarget(DOC, cellsOf(DOC), "1a0000ff::before");

    expect(target).toBeNull();
  });

  it("target — a malformed block id — is null", () => {
    const target = proseEditTarget(DOC, cellsOf(DOC), "1a000006");

    expect(target).toBeNull();
  });
});

describe("openProseEdit", () => {
  it("open — an existing block — the draft starts as the block's source", () => {
    const session = openProseEdit(DOC, cellsOf(DOC), "1a000006::before");

    expect(session!.draft).toBe(session!.target.source);
    expect(session!.error).toBeNull();
  });

  it("open — a block this document does not have — is null", () => {
    const session = openProseEdit(DOC, cellsOf(DOC), "1a000006::nowhere");

    expect(session).toBeNull();
  });
});

describe("draftProseEdit", () => {
  it("draft — typing after a rejected commit — clears the error message", () => {
    const rejected = { ...openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!, error: "nope" };

    const next = draftProseEdit(rejected, "New text.\n");

    expect(next.draft).toBe("New text.\n");
    expect(next.error).toBeNull();
  });

  it("draft — the same text with no error standing — returns the same session", () => {
    const session = openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!;

    const next = draftProseEdit(session, session.draft);

    expect(next).toBe(session);
  });
});

describe("proseSourceError", () => {
  it("validation — plain prose with an inline span — is accepted", () => {
    const error = proseSourceError("Top speed was ${speed} km/h.\n");

    expect(error).toBeNull();
  });

  it("validation — a fence line in the draft — is rejected", () => {
    const error = proseSourceError("Before.\n```js id=1a000009\n1\n```\n");

    expect(error).toContain("fence");
  });
});

describe("commitProseEdit", () => {
  it("commit — an edited before block — splices the new source into the document", () => {
    const session = draftProseEdit(openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!, "\nRewritten ${speed}.\n\n");

    const result = commitProseEdit(DOC, cellsOf(DOC), session);

    expect(result.status).toBe("committed");
    expect(result.status === "committed" && result.markdown).toContain("Rewritten ${speed}.");
    expect(result.status === "committed" && result.markdown).toContain("speed = channel([Speed])");
    expect(result.status === "committed" && result.cellId).toBe("1a000006");
  });

  it("commit — an edit that only changes prose — leaves every cell body byte-identical", () => {
    const session = draftProseEdit(openProseEdit(DOC, cellsOf(DOC), "1a000006::after")!, "\nQuite different trailing prose.\n");

    const result = commitProseEdit(DOC, cellsOf(DOC), session);

    expect(result.status).toBe("committed");
    const after = result.status === "committed" ? scanCells(result.markdown).cells : [];
    expect(after.map((cell) => cell.id)).toEqual(["1a000006"]);
    expect(after[0].infoLine).toBe(scanCells(DOC).cells[0].infoLine);
  });

  it("commit — a draft that drops the block's trailing newline — restores it rather than gluing prose onto the fence", () => {
    const session = draftProseEdit(openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!, "\nOne line.");

    const result = commitProseEdit(DOC, cellsOf(DOC), session);

    expect(result.status).toBe("committed");
    expect(result.status === "committed" && result.markdown).toContain("One line.\n```math id=1a000006");
  });

  it("commit — a draft containing a fence — is rejected and keeps the message on the session", () => {
    const session = draftProseEdit(openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!, "```js id=1a000009\n1\n```\n");

    const result = commitProseEdit(DOC, cellsOf(DOC), session);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.session.error).toContain("fence");
    expect(result.status === "rejected" && result.session.draft).toBe(session.draft);
  });

  it("commit — the block gone from the document since the editor opened — is rejected, not spliced", () => {
    const session = draftProseEdit(openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!, "Rewritten.\n");
    const replaced = "```math id=1a0000aa\ny = 2\n```\n";

    const result = commitProseEdit(replaced, cellsOf(replaced), session);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.session.error).toContain("no longer in the document");
  });

  it("commit — a draft equal to the block's source — reports unchanged rather than a new document", () => {
    const session = openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!;

    const result = commitProseEdit(DOC, cellsOf(DOC), session);

    expect(result.status).toBe("unchanged");
    expect(result.status === "unchanged" && result.cellId).toBe("1a000006");
  });

  it("commit — the document edited elsewhere while the editor was open — splices at the block's current place", () => {
    const moved = DOC.replace("title: demo", "title: demo\nauthor: someone");
    const session = draftProseEdit(openProseEdit(DOC, cellsOf(DOC), "1a000006::before")!, "\nRewritten.\n\n");

    const result = commitProseEdit(moved, cellsOf(moved), session);

    expect(result.status).toBe("committed");
    expect(result.status === "committed" && result.markdown).toContain("author: someone");
    expect(result.status === "committed" && result.markdown).toContain("Rewritten.\n\n```math id=1a000006");
  });
});
