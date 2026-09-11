import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { SelectionWindow } from "../../../../state/selection";
import { windowKey } from "../../../../state/selection";
import { sessionText, spanText, windowChipGroups } from "./windowChip";

function lap(sessionId: string, lapNumber: number, colour = "--chart-1"): SelectionWindow {
  return { sessionId, span: { kind: "lap", lapNumber }, colour };
}

function detail(overrides: Partial<SessionDetail>): SessionDetail {
  return {
    session_id: "s1",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "",
    channels: [],
    rider: "",
    bike: "",
    bike_comment: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    long_comment: "",
    tag: "",
    ...overrides,
  } as SessionDetail;
}

describe("spanText — each span kind — reads as the thing it names", () => {
  it("a whole session reads Full, a lap reads L<n>, a range reads its seconds", () => {
    // Arrange
    const windows: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" },
      lap("s1", 4),
      { sessionId: "s1", span: { kind: "range", t0Us: 12_300_000, t1Us: 48_900_000 }, colour: "--chart-2" },
    ];

    // Act
    const texts = windows.map(spanText);

    // Assert
    expect(texts).toEqual(["Full", "L4", "12.3–48.9s"]);
  });
});

describe("sessionText — a session's display name — prefers metadata over the raw id", () => {
  it("event name wins, then venue, then rider", () => {
    // Arrange
    const cases = [
      detail({ event_name: "Round 3", venue_name: "Bike Park", rider: "IA" }),
      detail({ venue_name: "Bike Park", rider: "IA" }),
      detail({ rider: "IA" }),
    ];

    // Act
    const texts = cases.map((d) => sessionText("abcdef0123456789", d));

    // Assert
    expect(texts).toEqual(["Round 3", "Bike Park", "IA"]);
  });

  it("an unresolved session falls back to eight characters of its id, not to a blank", () => {
    // Arrange
    const sessionId = "abcdef0123456789";

    // Act
    const unresolved = sessionText(sessionId, null);
    const allBlank = sessionText(sessionId, detail({}));

    // Assert
    expect(unresolved).toBe("abcdef01");
    expect(allBlank).toBe("abcdef01");
  });
});

describe("windowChipGroups — several laps of one session — collapse into one named group", () => {
  it("three laps of the same session produce one group with three swatches in selection order", () => {
    // Arrange
    const windows = [lap("s1", 2, "--chart-1"), lap("s1", 4, "--chart-2"), lap("s1", 7, "--chart-3")];
    const details = new Map(windows.map((w) => [windowKey(w), detail({ event_name: "Round 3" })]));

    // Act
    const groups = windowChipGroups(windows, details);

    // Assert
    expect(groups).toHaveLength(1);
    expect(groups[0].sessionText).toBe("Round 3");
    expect(groups[0].spans.map((s) => s.text)).toEqual(["L2", "L4", "L7"]);
    expect(groups[0].spans.map((s) => s.colour)).toEqual(["--chart-1", "--chart-2", "--chart-3"]);
  });

  it("two sessions stay two groups, in first-appearance order", () => {
    // Arrange
    const windows = [lap("s2", 1), lap("s1", 1), lap("s2", 3)];
    const details = new Map<string, SessionDetail | null>();

    // Act
    const groups = windowChipGroups(windows, details);

    // Assert
    expect(groups.map((g) => g.sessionId)).toEqual(["s2", "s1"]);
    expect(groups[0].spans.map((s) => s.text)).toEqual(["L1", "L3"]);
  });

  it("a group whose first window has no detail yet takes the name from a later one that does", () => {
    // Arrange
    const first = lap("abcdef0123456789", 1);
    const second = lap("abcdef0123456789", 2);
    const details = new Map<string, SessionDetail | null>([
      [windowKey(first), null],
      [windowKey(second), detail({ venue_name: "Bike Park" })],
    ]);

    // Act
    const groups = windowChipGroups([first, second], details);

    // Assert
    expect(groups[0].sessionText).toBe("Bike Park");
  });

  it("an empty selection produces no groups at all", () => {
    // Arrange
    const windows: SelectionWindow[] = [];

    // Act
    const groups = windowChipGroups(windows, new Map());

    // Assert
    expect(groups).toEqual([]);
  });
});
