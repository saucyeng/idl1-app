import { describe, expect, it } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import type { SessionDetail } from "../../../../ipc/catalog";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { runSessionSpan, type SessionSpanAction, type SessionSpanDeps } from "./sessionSpanDriver";

/** A minimal selected window naming `sessionId` — the span/colour are
 *  unread by this driver (see its own doc comment). */
function windowFor(sessionId: string): SelectedWindow {
  return { session_id: sessionId, span: { kind: "session" }, colour: "--chart-1" };
}

function fakeDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session_id: "session-a",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "a".repeat(64),
    channels: [
      { channel_id: "fork_velocity", nominal_rate_hz: 200, unit: "m/s", source_kind: "imu0", channel_kind: "fixed-rate", sample_count: 1000 },
    ],
    rider: "",
    bike: "",
    bike_comment: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    long_comment: "",
    tag: "",
    bike_profile_snapshot: null,
    laps: [],
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
    main_lap_number: null,
    overlay_lap_key: null,
    starred_lap_number: null,
    track_visits_library_hash: null,
    ...overrides,
  };
}

function fakeTile(columnTUs: bigint[]): DecodedTile {
  return {
    version: 2,
    tier: 10,
    tileIndex: 0,
    sampleMin: new Float32Array(0),
    sampleMax: new Float32Array(0),
    columnMin: new Float32Array(columnTUs.length),
    columnMax: new Float32Array(columnTUs.length),
    columnMean: new Float32Array(columnTUs.length),
    columnTUs: new BigInt64Array(columnTUs),
  };
}

function baseDeps(overrides: Partial<SessionSpanDeps> = {}): SessionSpanDeps {
  return {
    getSession: async () => fakeDetail(),
    listSessions: async () => [{ session_id: "session-a", duration_ms: 60_000 }],
    fetchTile: async () => fakeTile([0n, 60_000_000n]),
    ...overrides,
  };
}

describe("runSessionSpan", () => {
  it("runSessionSpan — no session selected — dispatches null detail and null span", async () => {
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(baseDeps(), null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([
      { type: "sessionDetail", detail: null },
      { type: "sessionSpan", spanUs: null },
    ]);
  });

  it("runSessionSpan — a session with a catalog duration_ms — dispatches the detail then the span in milliseconds converted to microseconds", async () => {
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(baseDeps(), windowFor("session-a"), (a) => actions.push(a), () => false);

    expect(actions[0]).toEqual({ type: "sessionDetail", detail: fakeDetail() });
    expect(actions[1]).toEqual({ type: "sessionSpan", spanUs: 60_000_000 });
  });

  it("runSessionSpan — duration_ms is null — falls back to the first channel's coarsest tile span", async () => {
    const deps = baseDeps({
      listSessions: async () => [{ session_id: "session-a", duration_ms: null }],
      fetchTile: async () => fakeTile([1_000_000n, 5_000_000n]),
    });
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(deps, windowFor("session-a"), (a) => actions.push(a), () => false);

    expect(actions[1]).toEqual({ type: "sessionSpan", spanUs: 4_000_000 });
  });

  it("runSessionSpan — duration_ms null and the coarsest tile is entirely empty — dispatches a null span", async () => {
    const COLUMN_T_US_EMPTY = -9223372036854775808n;
    const deps = baseDeps({
      listSessions: async () => [{ session_id: "session-a", duration_ms: null }],
      fetchTile: async () => fakeTile([COLUMN_T_US_EMPTY, COLUMN_T_US_EMPTY]),
    });
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(deps, windowFor("session-a"), (a) => actions.push(a), () => false);

    expect(actions[1]).toEqual({ type: "sessionSpan", spanUs: null });
  });

  it("runSessionSpan — getSession rejects — dispatches null detail and null span, nothing else", async () => {
    const deps = baseDeps({
      getSession: async () => {
        throw new Error("session not found");
      },
    });
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(deps, windowFor("session-a"), (a) => actions.push(a), () => false);

    expect(actions).toEqual([
      { type: "sessionDetail", detail: null },
      { type: "sessionSpan", spanUs: null },
    ]);
  });

  it("runSessionSpan — duration_ms null and the session has no channels — dispatches a null span without fetching a tile", async () => {
    let fetchTileCalled = false;
    const deps = baseDeps({
      getSession: async () => fakeDetail({ channels: [] }),
      listSessions: async () => [{ session_id: "session-a", duration_ms: null }],
      fetchTile: async () => {
        fetchTileCalled = true;
        return fakeTile([0n]);
      },
    });
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(deps, windowFor("session-a"), (a) => actions.push(a), () => false);

    expect(actions[1]).toEqual({ type: "sessionSpan", spanUs: null });
    expect(fetchTileCalled).toBe(false);
  });

  it("runSessionSpan — listSessions rejects — dispatches the detail, then a null span", async () => {
    const deps = baseDeps({
      listSessions: async () => {
        throw new Error("catalog unavailable");
      },
    });
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(deps, windowFor("session-a"), (a) => actions.push(a), () => false);

    expect(actions).toEqual([
      { type: "sessionDetail", detail: fakeDetail() },
      { type: "sessionSpan", spanUs: null },
    ]);
  });

  it("runSessionSpan — stale after listSessions resolves — dispatches the detail but not the span", async () => {
    const actions: SessionSpanAction[] = [];
    let calls = 0;

    await runSessionSpan(baseDeps(), windowFor("session-a"), (a) => actions.push(a), () => {
      calls++;
      return calls > 1;
    });

    expect(actions).toEqual([{ type: "sessionDetail", detail: fakeDetail() }]);
  });

  it("runSessionSpan — stale after getSession resolves — dispatches nothing", async () => {
    const actions: SessionSpanAction[] = [];

    await runSessionSpan(baseDeps(), windowFor("session-a"), (a) => actions.push(a), () => true);

    expect(actions).toEqual([]);
  });
});
