/**
 * `model/gpsDriver.ts` — the map cell's two fetches and the column shaping
 * one window's trace contributes to `combineGpsWindows` (ruling R217 item 1).
 * The drivers' own staleness/typed-error contracts are what is tested here;
 * `ipc/gps.ts`'s `IDLG` decode is not (it has its own tests, and this module
 * never decodes).
 */
import { describe, expect, it } from "vitest";

import { gpsColumns, runGpsMeta, runGpsTrace, type GpsAction, type GpsDeps } from "./gpsDriver";
import type { DecodedGpsTrace, GpsTraceMeta } from "../../../../ipc/gps";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";

const WINDOW: SelectedWindow = { session_id: "s1", span: { kind: "session" }, colour: "--chart-1" };

function trace(n: number, withColour: boolean): DecodedGpsTrace {
  return {
    xs: Float64Array.from({ length: n }, (_, i) => i),
    ys: Float64Array.from({ length: n }, (_, i) => i * 2),
    ts: Float64Array.from({ length: n }, (_, i) => i * 0.1),
    cs: withColour ? Float64Array.from({ length: n }, (_, i) => i * 10) : null,
  };
}

const META: GpsTraceMeta = {
  origin: { lat: 52.0, lon: -1.0 },
  x_domain: [0, 100],
  y_domain: [0, 200],
  polyline: [{ x: 0, y: 0 }],
  gates: [],
};

function depsReturning(t: DecodedGpsTrace, meta: GpsTraceMeta = META): GpsDeps {
  return { fetchGpsTrace: () => Promise.resolve(t), fetchGpsTraceMeta: () => Promise.resolve(meta) };
}

describe("runGpsTrace", () => {
  it("runGpsTrace — a resolved fetch and a live run — dispatches the trace with its own window", async () => {
    const actions: GpsAction[] = [];

    await runGpsTrace(depsReturning(trace(3, true)), "c1", WINDOW, "Speed", 2048, (a) => actions.push(a), () => false);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("gpsTrace");
    expect(actions[0].type === "gpsTrace" && actions[0].window).toBe(WINDOW);
  });

  it("runGpsTrace — a session with no fixes — dispatches an empty trace, not an error", async () => {
    const actions: GpsAction[] = [];

    await runGpsTrace(depsReturning(trace(0, false)), "c1", WINDOW, null, 2048, (a) => actions.push(a), () => false);

    expect(actions[0].type).toBe("gpsTrace");
    expect(actions[0].type === "gpsTrace" && actions[0].trace.xs).toHaveLength(0);
  });

  it("runGpsTrace — a stale run — dispatches nothing at all", async () => {
    const actions: GpsAction[] = [];

    await runGpsTrace(depsReturning(trace(3, false)), "c1", WINDOW, null, 2048, (a) => actions.push(a), () => true);

    expect(actions).toHaveLength(0);
  });

  it("runGpsTrace — a typed rejection — passes the engine's kind and message through", async () => {
    const deps: GpsDeps = {
      fetchGpsTrace: () => Promise.reject({ kind: "not_found", message: "no channel 'Speed'" }),
      fetchGpsTraceMeta: () => Promise.resolve(META),
    };
    const actions: GpsAction[] = [];

    await runGpsTrace(deps, "c1", WINDOW, "Speed", 2048, (a) => actions.push(a), () => false);

    expect(actions[0]).toEqual({ type: "gpsTraceError", cellId: "c1", window: WINDOW, error: { kind: "not_found", message: "no channel 'Speed'" } });
  });

  it("runGpsTrace — an untyped throw — becomes a typed internal error, never a bare string", async () => {
    const deps: GpsDeps = {
      fetchGpsTrace: () => Promise.reject(new Error("gps trace magic bytes \"XXXX\" != \"IDLG\"")),
      fetchGpsTraceMeta: () => Promise.resolve(META),
    };
    const actions: GpsAction[] = [];

    await runGpsTrace(deps, "c1", WINDOW, null, 2048, (a) => actions.push(a), () => false);

    expect(actions[0].type === "gpsTraceError" && actions[0].error.kind).toBe("internal");
  });

  it("runGpsTrace — a live run — forwards the colour channel and budget verbatim", async () => {
    const seen: { colourBy: string | null; budget: number }[] = [];
    const deps: GpsDeps = {
      fetchGpsTrace: (_w, colourBy, budget) => {
        seen.push({ colourBy, budget });
        return Promise.resolve(trace(1, true));
      },
      fetchGpsTraceMeta: () => Promise.resolve(META),
    };

    await runGpsTrace(deps, "c1", WINDOW, "Lean", 4096, () => {}, () => false);

    expect(seen).toEqual([{ colourBy: "Lean", budget: 4096 }]);
  });
});

describe("runGpsMeta", () => {
  it("runGpsMeta — a resolved fetch — dispatches the underlay keyed by session", async () => {
    const actions: GpsAction[] = [];

    await runGpsMeta(depsReturning(trace(0, false)), "s1", "track-7", (a) => actions.push(a), () => false);

    expect(actions[0]).toEqual({ type: "gpsMeta", sessionId: "s1", meta: META });
  });

  it("runGpsMeta — a stale run — dispatches nothing at all", async () => {
    const actions: GpsAction[] = [];

    await runGpsMeta(depsReturning(trace(0, false)), "s1", null, (a) => actions.push(a), () => true);

    expect(actions).toHaveLength(0);
  });

  it("runGpsMeta — a rejection — dispatches a typed error keyed by session", async () => {
    const deps: GpsDeps = {
      fetchGpsTrace: () => Promise.resolve(trace(0, false)),
      fetchGpsTraceMeta: () => Promise.reject({ kind: "not_found", message: "no track 'track-7'" }),
    };
    const actions: GpsAction[] = [];

    await runGpsMeta(deps, "s1", "track-7", (a) => actions.push(a), () => false);

    expect(actions[0]).toEqual({ type: "gpsMetaError", sessionId: "s1", error: { kind: "not_found", message: "no track 'track-7'" } });
  });
});

describe("gpsColumns", () => {
  it("gpsColumns — a well-formed coloured trace — returns every column untouched", () => {
    const t = trace(4, true);

    const columns = gpsColumns(t);

    expect(columns.xs).toBe(t.xs);
    expect(columns.cs).toBe(t.cs);
  });

  it("gpsColumns — an uncoloured trace — keeps cs null rather than zero-filling it", () => {
    const columns = gpsColumns(trace(4, false));

    expect(columns.cs).toBeNull();
    expect(columns.xs).toHaveLength(4);
  });

  it("gpsColumns — a short colour column — truncates every column to the shared point count", () => {
    const t = trace(4, true);
    const malformed: DecodedGpsTrace = { ...t, cs: t.cs!.slice(0, 2) };

    const columns = gpsColumns(malformed);

    expect(columns.xs).toHaveLength(2);
    expect(columns.ys).toHaveLength(2);
    expect(columns.ts).toHaveLength(2);
    expect(columns.cs).toHaveLength(2);
  });

  it("gpsColumns — a short position column — truncates rather than reading past its end", () => {
    const t = trace(4, false);
    const malformed: DecodedGpsTrace = { ...t, ys: t.ys.slice(0, 1) };

    const columns = gpsColumns(malformed);

    expect(columns.xs).toEqual(Float64Array.of(0));
    expect(columns.ys).toEqual(Float64Array.of(0));
  });
});
