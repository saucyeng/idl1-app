import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../../../ipc/catalog";
import type { ImportOutcome, Progress } from "../../../ipc/import";
import { isDrained, nextItemToStart, runImport, type ImportFileFn } from "./importDriver";
import { importQueueReducer, initialImportQueueState, type ImportItem, type ImportQueueAction } from "./importQueue";

const sampleSession: SessionSummary = {
  session_id: "s1",
  blob_sha256: "a".repeat(64),
  source_format: "idl0",
  device_id: null,
  config_checksum: null,
  importer_version: "0.1.0",
  seam_correction_version: "v1",
  engine_version: "0.1.0",
  timestamp_utc_ms: 0,
  created_at_ms: 0,
  rider: "",
  bike: "",
  venue_name: "",
  event_name: "",
  event_session: "",
  short_comment: "",
  tag: "",
  lap_count: null,
  duration_ms: null,
};

const sampleOutcome: ImportOutcome = { session: sampleSession, warnings: [] };

/** A promise this test controls the settlement of, plus the resolve/reject
 *  functions — lets a test observe dispatches that happen strictly between
 *  `runImport`'s `START` and its terminal dispatch. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("nextItemToStart", () => {
  it("nextItemToStart — nothing running, one queued item — returns that item", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });

    const item = nextItemToStart(state);

    expect(item?.path).toBe("a.gpx");
  });

  it("nextItemToStart — an item already running — returns null even with another item queued", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b.idl0", importerId: null });
    state = importQueueReducer(state, { type: "START", id: state.items[0].id });

    const item = nextItemToStart(state);

    expect(item).toBeNull();
  });

  it("nextItemToStart — empty queue — returns null", () => {
    const item = nextItemToStart(initialImportQueueState);

    expect(item).toBeNull();
  });
});

describe("isDrained", () => {
  it("isDrained — every item done or failed — true", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b.idl0", importerId: null });
    state = importQueueReducer(state, { type: "START", id: state.items[0].id });
    state = importQueueReducer(state, {
      type: "FAILED",
      id: state.items[0].id,
      error: { kind: "io", message: "x" },
    });
    state = importQueueReducer(state, { type: "START", id: state.items[1].id });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: state.items[1].id, outcome: sampleOutcome });

    expect(isDrained(state)).toBe(true);
  });

  it("isDrained — empty queue — false", () => {
    expect(isDrained(initialImportQueueState)).toBe(false);
  });

  it("isDrained — one item still queued — false", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b.idl0", importerId: null });
    state = importQueueReducer(state, { type: "START", id: state.items[0].id });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: state.items[0].id, outcome: sampleOutcome });

    expect(isDrained(state)).toBe(false);
  });
});

describe("runImport", () => {
  it("runImport — importFile resolves — dispatches START then SUCCEEDED for item.id", async () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    const item = state.items[0];
    const actions: ImportQueueAction[] = [];
    const fakeImportFile: ImportFileFn = () => Promise.resolve(sampleOutcome);

    runImport(item, fakeImportFile, (a) => actions.push(a));
    await Promise.resolve();
    await Promise.resolve();

    expect(actions).toEqual([
      { type: "START", id: item.id },
      { type: "SUCCEEDED", id: item.id, outcome: sampleOutcome },
    ]);
  });

  it("runImport — progress messages then a failure — nothing dropped between START and the terminal dispatch", async () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    const item = state.items[0];
    const actions: ImportQueueAction[] = [];
    const captured: { onProgress: ((p: Progress) => void) | null } = { onProgress: null };
    const { promise, reject } = deferred<ImportOutcome>();
    const fakeImportFile: ImportFileFn = (_path, _importerId, onProgress) => {
      captured.onProgress = onProgress;
      return promise;
    };

    runImport(item, fakeImportFile, (a) => actions.push(a));
    captured.onProgress?.({ done: 1, total: 4, phase: "reading" });
    captured.onProgress?.({ done: 2, total: 4, phase: "reading" });
    reject({ kind: "io", message: "disk full" });
    await promise.catch(() => undefined);
    await Promise.resolve();

    expect(actions).toEqual([
      { type: "START", id: item.id },
      { type: "PROGRESS", id: item.id, progress: { done: 1, total: 4, phase: "reading" } },
      { type: "PROGRESS", id: item.id, progress: { done: 2, total: 4, phase: "reading" } },
      { type: "FAILED", id: item.id, error: { kind: "io", message: "disk full" } },
    ]);
  });

  it("runImport — a DISMISS of a different, terminal item happens mid-flight — the running item's own updates still land on it, addressed by id not index", async () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b.idl0", importerId: null });
    const [itemA, itemB]: ImportItem[] = state.items;
    state = importQueueReducer(state, { type: "START", id: itemA.id });
    state = importQueueReducer(state, { type: "FAILED", id: itemA.id, error: { kind: "io", message: "x" } });

    const dispatch = (action: ImportQueueAction) => {
      state = importQueueReducer(state, action);
    };

    const captured: { onProgress: ((p: Progress) => void) | null } = { onProgress: null };
    const { promise, resolve } = deferred<ImportOutcome>();
    const fakeImportFile: ImportFileFn = (_path, _importerId, onProgress) => {
      captured.onProgress = onProgress;
      return promise;
    };

    runImport(itemB, fakeImportFile, dispatch);
    // itemA (now terminal) is dismissed while itemB is running — shrinks
    // the array itemB's captured id must survive.
    dispatch({ type: "DISMISS", id: itemA.id });
    captured.onProgress?.({ done: 5, total: 10, phase: "decoding" });
    resolve(sampleOutcome);
    await promise;
    await Promise.resolve();

    expect(state.items.length).toBe(1);
    expect(state.items[0].id).toBe(itemB.id);
    expect(state.items[0].status).toBe("done");
    expect(state.items[0].done).toBe(10);
  });

  it("runImport — importFile resolves with warnings — SUCCEEDED carries them", async () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.idl0", importerId: null });
    const item = state.items[0];
    const actions: ImportQueueAction[] = [];
    const outcomeWithWarnings: ImportOutcome = { session: sampleSession, warnings: ["truncated at record 400"] };
    const fakeImportFile: ImportFileFn = () => Promise.resolve(outcomeWithWarnings);

    runImport(item, fakeImportFile, (a) => actions.push(a));
    await Promise.resolve();
    await Promise.resolve();

    expect(actions).toEqual([
      { type: "START", id: item.id },
      { type: "SUCCEEDED", id: item.id, outcome: outcomeWithWarnings },
    ]);
  });
});
