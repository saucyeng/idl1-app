import { useEffect, useReducer, useRef, useState } from "react";

import { getSession, listSessions, listWorkbooks, type SessionDetail } from "../../../ipc/catalog";
import { cursorReadout } from "../../../ipc/cursor";
import { fetchTile } from "../../../ipc/tiles";
import { evalWorkbook, openWorkbook, saveWorkbook, watchWorkbook } from "../../../ipc/workbook";
import { useAppState } from "../../../state/AppState";
import CellList from "./components/CellList";
import ChartCell from "./components/ChartCell";
import ConflictBanner from "./components/ConflictBanner";
import JsCellFrame, { DEFAULT_JS_CELL_HEIGHT_PX } from "./components/JsCellFrame";
import { readWorkbook, NotImplementedError } from "./ipcStubs/readWorkbook";
import { extractInlineSpans } from "./components/ProseSpan";
import type { SandboxCell } from "./host/protocol";
import { SandboxHost } from "./host/SandboxHost";
import { NotebookSession } from "./host/NotebookSession";
import { tileToChannelData } from "./model/channelData";
import { dropCellHeight, initialCellHeights, recordCellHeight, type CellHeights } from "./model/cellLayout";
import { runChannelBind, type ChannelBindAction, type ChannelBindDeps, type ChartWindow } from "./model/channelBindDriver";
import { bindingFor, bindingIdentity, unresolvedChannelId } from "./model/jsCellBinding";
import { runEval, runOpenAndEval, type OpenEvalDeps } from "./model/openEvalDriver";
import { isSelfWrite, saveFlow, type SaveFlowState, type WorkbookEventWithHash } from "./model/saveFlow";
import { runSessionSpan, type SessionSpanAction, type SessionSpanDeps } from "./model/sessionSpanDriver";
import { pointBudget, tileRange } from "./model/tiers";
import { TileCache } from "./model/tileCache";
import { initialWorkbookState, workbookReducer } from "./model/workbookState";

/** C4 §4's stated expected-hash-set TTL (5 s), matched here for the frontend's own independent self-write belt (`saveFlow.ts`'s `isSelfWrite`). */
const SELF_WRITE_TTL_MS = 5000;

/** `init`'s `runtimeVersion` argument (`host/protocol.ts`) -- an
 *  informational string the sandbox does not currently branch on
 *  (`sandbox/main.ts`'s `init` handler ignores it beyond constructing a
 *  fresh `SandboxRuntime`); matches the placeholder value
 *  `host/rebuildReplay.test.ts` already exercises. Bumping this to track
 *  an actual notebook-runtime version is future work, not this task's. */
const SANDBOX_RUNTIME_VERSION = "1.0.0";

/**
 * Chart width, in CSS px, every bound `js` cell fetches/plots at, and the
 * `columnCount` its tiles are cached under (R43). This task does not build
 * a responsive per-cell layout (measuring an actual rendered column width
 * is a Task 15/16 concern once the editor shell's own layout exists) --
 * a fixed width, matching Observable Plot's own conventional default, is
 * a documented judgment call, not a guess baked in silently.
 */
const DEFAULT_CHART_WIDTH_PX = 640;

/** Decodes a `[start, end)` **UTF-8 byte** range (`model/cells.ts`'s
 *  convention) back into text. Duplicated from `components/CellList.tsx`'s
 *  identical helper rather than shared, since both are a two-line wrapper
 *  around `TextEncoder`/`TextDecoder` and a shared module would be
 *  imported for that alone. */
function decodeByteRange(markdown: string, range: [number, number]): string {
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(range[0], range[1]));
}

/**
 * The Notebook tab's real page (design section 6; supersedes the wave-1
 * canvas proof, L5 Task 14): opens the first indexed workbook, evaluates
 * it, and renders every cell in document order via {@link CellList}. Owns
 * the one {@link SandboxHost}/{@link NotebookSession} pair for this page's
 * lifetime.
 *
 * IPC-driving effects here follow the tightened rule
 * (`runs/2026-09-05/lanes/l6/review-STANDING.md`, "Added 2026-09-05"):
 * every effect that starts IPC or `postMessage` work depends only on data
 * (`sessionId`, `state.handle?.id`, `state.cells`/`state.markdown` --
 * never a callback identity), the sequencing itself lives in pure,
 * unit-tested driver functions (`model/openEvalDriver.ts`'s
 * `runOpenAndEval`/`runEval`, `model/sessionSpanDriver.ts`'s
 * `runSessionSpan`), and staleness is tracked by a monotonic sequence ref
 * bumped at the start of each run -- the same shape `model/settle.ts`/
 * `model/cursorReadoutDriver.ts` already use elsewhere in this lane.
 * `SandboxHost`'s callbacks are held in refs so the mount effect that
 * constructs it runs exactly once.
 *
 * A `js` cell whose code `plotForm.parse`s against a real session channel
 * (`model/jsCellBinding.ts`'s `bindingFor`, R66 item 1) mounts
 * {@link ChartCell} with a real settle-driven tile-fetch pipeline; custom
 * code, or code naming a channel this session doesn't have, mounts
 * {@link JsCellFrame} instead (the plain-mount path, with a visible note
 * for the latter case). Every cell output renders **inside the shared
 * sandbox iframe** (R69) -- neither branch here injects sandbox-produced
 * markup into this page's own DOM; `sandboxHostRef`'s container is styled
 * to cover the viewport, `pointer-events: none`, so its pixels show
 * through underneath every `ChartCell`/`JsCellFrame` frame, which alone
 * captures pointer/wheel input and keeps the sandbox's own per-cell
 * container positioned to match via `sendLayout` (`host/protocol.ts`'s
 * `layoutMessage` doc comment explains why a single shared iframe needs
 * this beyond R69's two named messages).
 *
 * The initial channel-bind effect below (its own `useEffect`) fetches each
 * newly bound cell's first window of tiles once (mirroring `ChartCell`'s
 * own settle-triggered fetch, reusing the same `chooseTier`/`tileRange`/
 * `ensureTiles`/`tileToChannelData` pieces) and registers it with
 * `sessionRef.current.setBoundChannel` -- `ChartCell`'s own
 * `onViewportSettled` callback (built per bound cell in `renderJsCell`
 * below) does the same on every later gesture settle, updating the
 * registered `BoundChannel`'s `range`/`startUs`/`endUs` each time so a
 * rebuild replays the *current* window (per this task's dispatch).
 */
export default function NotebookPage() {
  const [appState] = useAppState();
  const { sessionId, lapContext } = appState.selection;

  const [state, dispatch] = useReducer(workbookReducer, initialWorkbookState);
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());
  const [cellHeights, setCellHeights] = useState<CellHeights>(initialCellHeights);
  const [inlineResults, setInlineResults] = useState<Map<string, string>>(new Map());
  const [spanErrors, setSpanErrors] = useState<Map<string, string>>(new Map());
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionSpanUs, setSessionSpanUs] = useState<number | null>(null);
  const [chartWindows, setChartWindows] = useState<Map<string, ChartWindow>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxHostRef = useRef<SandboxHost | null>(null);
  const sessionRef = useRef<NotebookSession>(new NotebookSession(new TileCache()));
  const openSeqRef = useRef(0);
  const evalSeqRef = useRef(0);
  const sessionSpanSeqRef = useRef(0);
  /** Every js cell's currently bound identity (`bindingIdentity`), so the channel-bind effect below only re-fetches/re-registers a cell whose binding actually changed. */
  const boundIdentityRef = useRef<Map<string, string>>(new Map());

  // One `saveFlow` instance for this page's lifetime (Task 14) -- holds
  // its own `SaveFlowState` behind a closure; `saveFlowState` mirrors it
  // into component state after every `save()` resolution so the Save
  // button/`ConflictBanner` re-render. `lastSavedHash`/`lastSavedAtMs` feed
  // the watch effect's `isSelfWrite` check below (C4 §4's second belt).
  const saveFlowRef = useRef(saveFlow({ save: saveWorkbook, now: () => Date.now() }));
  const [saveFlowState, setSaveFlowState] = useState<SaveFlowState>({ status: "idle" });
  const lastSavedHashRef = useRef<string | null>(null);
  const lastSavedAtMsRef = useRef<number | null>(null);

  // `AppState.selection.lapContext` (R53 Data Q3) is read here but cannot
  // yet be passed to `evalWorkbook` -- the command's signature has no slot
  // for it (IPC need N4, `runs/2026-09-05/lanes/l6/IPC-NEEDS.md`, not
  // landed). Referencing it (without using it) keeps this read visible to
  // a later diff rather than silently dropped. `model/jsCellBinding.ts`'s
  // `JsCellBindingChannel.lap` (from `MarkProps.lap`, per-mark) is a
  // separate, narrower lap reference plumbed the same way -- read and
  // stored on each bound channel below, never applied to narrow a fetch
  // (lead pre-ruling 2026-09-05 #2).
  void lapContext;
  // TODO(idl0): thread `lapContext` into `evalWorkbook`'s call below once
  // N4 lands (`eval_workbook(id, sessionId, lapContext)`); today it is read
  // from `AppState.selection` but not passed anywhere.

  // Callbacks are routed through refs updated on every render so the mount
  // effect below can keep an empty dependency array -- it only constructs
  // and disposes the one `SandboxHost`, it never needs a fresh callback
  // identity to do that.
  const onCellRenderedRef = useRef((cellId: string, heightPx: number) => {
    setCellHeights((prev) => recordCellHeight(prev, cellId, heightPx));
    setCellErrors((prev) => {
      if (!prev.has(cellId)) return prev;
      const next = new Map(prev);
      next.delete(cellId);
      return next;
    });
  });
  const onCellErrorRef = useRef((cellId: string, message: string) => {
    setCellErrors((prev) => new Map(prev).set(cellId, message));
  });
  const onInlineResultRef = useRef((spanId: string, text: string) => {
    setInlineResults((prev) => new Map(prev).set(spanId, text));
    setSpanErrors((prev) => {
      if (!prev.has(spanId)) return prev;
      const next = new Map(prev);
      next.delete(spanId);
      return next;
    });
  });
  const onSpanErrorRef = useRef((spanId: string, message: string) => {
    setSpanErrors((prev) => new Map(prev).set(spanId, message));
    setInlineResults((prev) => {
      if (!prev.has(spanId)) return prev;
      const next = new Map(prev);
      next.delete(spanId);
      return next;
    });
  });

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const host = new SandboxHost(container, {
      onCellRendered: (cellId, heightPx) => onCellRenderedRef.current(cellId, heightPx),
      onCellError: (cellId, message) => onCellErrorRef.current(cellId, message),
      onInlineResult: (spanId, text) => onInlineResultRef.current(spanId, text),
      onSpanError: (spanId, message) => onSpanErrorRef.current(spanId, message),
      onChannelsInvalidated: () => sessionRef.current.onChannelsInvalidated(host)(),
    });
    sandboxHostRef.current = host;
    host.init(SANDBOX_RUNTIME_VERSION);

    return () => {
      host.dispose();
      sandboxHostRef.current = null;
    };
  }, []);

  // Open -> read -> eval, once on mount and again whenever the selected
  // session changes (data-only dependency -- `sessionId`, never a callback).
  useEffect(() => {
    const mySeq = ++openSeqRef.current;
    const deps: OpenEvalDeps = {
      listWorkbooks: () => listWorkbooks(),
      openWorkbook: (idOrPath) => openWorkbook(idOrPath),
      readWorkbook: (idOrPath) => readWorkbook(idOrPath),
      evalWorkbook: (id, sid) => evalWorkbook(id, sid),
      isNotImplementedError: (error) => error instanceof NotImplementedError,
    };
    void runOpenAndEval(deps, sessionId, dispatch, () => openSeqRef.current !== mySeq);
  }, [sessionId]);

  // Resolves `sessionId`'s `SessionDetail` and recorded span (lead
  // pre-ruling 2026-09-05 #1), once per session change -- `model/
  // jsCellBinding.ts`'s `bindingFor` needs both. All branching lives in
  // `model/sessionSpanDriver.ts`'s `runSessionSpan`; this effect only
  // dispatches its two action kinds into local state.
  useEffect(() => {
    const mySeq = ++sessionSpanSeqRef.current;
    const deps: SessionSpanDeps = {
      getSession: (id) => getSession(id),
      listSessions: () => listSessions(),
      fetchTile: (sid, channel, tier, tileIndex, columnCount) => fetchTile(sid, channel, tier, tileIndex, columnCount),
    };
    const onAction = (action: SessionSpanAction) => {
      if (action.type === "sessionDetail") {
        setSessionDetail(action.detail);
      } else {
        setSessionSpanUs(action.spanUs);
      }
    };
    void runSessionSpan(deps, sessionId, onAction, () => sessionSpanSeqRef.current !== mySeq);
  }, [sessionId]);

  // Subscribes to the file watcher once this workbook has a handle.
  // `sessionId` is read fresh at fire time via a ref rather than added to
  // the dependency array, so a session change alone does not tear down and
  // re-subscribe the watcher -- the watcher is scoped to the *workbook*,
  // not to the session selection.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    const workbookId = state.handle?.id;
    if (workbookId === undefined) return;

    let disposed = false;
    void watchWorkbook(workbookId, (event: WorkbookEventWithHash) => {
      if (disposed) return;
      // C4 §4's second, independent self-write belt: the Rust
      // `ExpectedHashSet` is primary and already suppresses the app's own
      // writes server-side; this catches the residual race where a
      // save's own rename echoes back to this subscription regardless.
      if (isSelfWrite(event, lastSavedHashRef.current, lastSavedAtMsRef.current, Date.now(), SELF_WRITE_TTL_MS)) {
        return;
      }
      dispatch({ type: "watchEvent", event });
      const mySeq = ++evalSeqRef.current;
      void runEval({ evalWorkbook }, workbookId, sessionIdRef.current, dispatch, () => evalSeqRef.current !== mySeq);
    });

    return () => {
      disposed = true;
    };
  }, [state.handle?.id]);

  /**
   * Explicit save action (Task 14) -- never called from an effect or on a
   * per-keystroke basis. Disabled by the render below whenever
   * `state.hash` is `null`: while `read_workbook` (N1) reports
   * `not_implemented`, there is no legally correct `based_on_hash` to
   * pass -- `null` means "creating a new workbook" (`ipc/workbook.ts`'s
   * `saveWorkbook` doc comment), which would be wrong for an existing
   * target and would error per `write_atomic`'s own semantics. Save is
   * reported as unavailable in that state rather than guessing a hash.
   */
  async function handleSave() {
    if (state.handle === null || state.markdown === null || state.hash === null) return;
    const result = await saveFlowRef.current.save(state.handle.id, state.markdown, state.hash);
    setSaveFlowState(result);
    if (result.status === "saved") {
      lastSavedHashRef.current = result.hash;
      lastSavedAtMsRef.current = result.savedAtMs;
      dispatch({ type: "saveResult", hash: result.hash });
    } else if (result.status === "conflict") {
      dispatch({ type: "saveConflict" });
    }
  }

  /** `ConflictBanner`'s "Reload from disk": discard local edits, replace `workbookState`'s markdown/cells/hash with disk's current content. */
  async function handleReloadFromDisk() {
    if (state.handle === null) return;
    try {
      const source = await readWorkbook(state.handle.id);
      dispatch({ type: "markdownReady", markdown: source.markdown, hash: source.hash });
    } catch (error) {
      if (error instanceof NotImplementedError) {
        dispatch({ type: "markdownNotImplemented" });
      } else {
        dispatch({ type: "markdownError", message: error instanceof Error ? error.message : String(error) });
      }
    }
    setSaveFlowState({ status: "idle" });
  }

  /**
   * `ConflictBanner`'s "Overwrite": re-reads disk's current content for a
   * fresh `based_on_hash`, then saves this document's in-memory markdown
   * on top of it -- the coarse stand-in this lane implements (per
   * `ConflictBanner.tsx`'s `TODO(idl0)`); L11's per-cell merge (C4 §4,
   * design §7) is the eventual replacement, not built here.
   */
  async function handleOverwrite() {
    if (state.handle === null || state.markdown === null) return;
    try {
      const source = await readWorkbook(state.handle.id);
      const result = await saveFlowRef.current.save(state.handle.id, state.markdown, source.hash);
      setSaveFlowState(result);
      if (result.status === "saved") {
        lastSavedHashRef.current = result.hash;
        lastSavedAtMsRef.current = result.savedAtMs;
        dispatch({ type: "saveResult", hash: result.hash });
      } else if (result.status === "conflict") {
        dispatch({ type: "saveConflict" });
      }
    } catch (error) {
      dispatch({ type: "markdownError", message: error instanceof Error ? error.message : String(error) });
    }
  }

  // Pushes this document's `js` cells into the sandbox, and (best-effort --
  // see `ProseSpan.tsx`'s doc comment) re-issues every inline `${...}`
  // span's evaluation, whenever the cell set or the markdown they're read
  // from changes. True reactive re-evaluation ("whenever the Runtime
  // re-runs any cell the expression's free variables depend on," C2 par.
  // 5.2) awaits the free-identifier analysis `sandbox/main.ts`'s own TODO
  // defers -- this is a coarser trigger: every span is re-sent on every
  // `setCells`, which is this effect's only firing condition.
  useEffect(() => {
    const host = sandboxHostRef.current;
    if (host === null || state.markdown === null) return;

    const jsCells: SandboxCell[] = [];
    const spans: { spanId: string; expr: string }[] = [];
    const liveIds = new Set<string>();
    for (const cell of state.cells) {
      if (cell.id === null) continue;
      if (cell.kind === "js") {
        jsCells.push({ id: cell.id, code: decodeByteRange(state.markdown, cell.bodyRange) });
        liveIds.add(cell.id);
      }
      if (cell.proseBeforeRange !== null) {
        const text = decodeByteRange(state.markdown, cell.proseBeforeRange);
        spans.push(...extractInlineSpans(text, `${cell.id}-before`));
      }
      if (cell.proseAfterRange !== null) {
        const text = decodeByteRange(state.markdown, cell.proseAfterRange);
        spans.push(...extractInlineSpans(text, `${cell.id}-after`));
      }
    }

    host.setCells(jsCells);
    for (const span of spans) {
      host.evalInline(span.spanId, span.expr);
    }

    // A cell removed from the document (edited away) drops its recorded
    // height and its `NotebookSession` binding -- it no longer has a
    // sandbox-rendered container to size a frame for, and re-binding a
    // stale channel on a future rebuild for a cell that no longer exists
    // would be pure waste.
    setCellHeights((prev) => {
      let next: CellHeights = prev;
      for (const cellId of prev.keys()) {
        if (!liveIds.has(cellId)) next = dropCellHeight(next, cellId);
      }
      return next;
    });
    for (const cellId of boundIdentityRef.current.keys()) {
      if (!liveIds.has(cellId)) {
        boundIdentityRef.current.delete(cellId);
        sessionRef.current.removeBoundChannel(cellId);
      }
    }
  }, [state.cells, state.markdown]);

  // For each `js` cell newly bound to a real channel (`bindingFor`, R66
  // item 1) -- a cell whose binding's identity (`bindingIdentity`) has
  // changed since the last time this effect ran -- fetches and sends
  // *every* distinct bound channel's initial window of tiles (lead
  // pre-ruling 2026-09-05 #3, review-task13b.md Critical fix: a
  // multi-channel binding must not silently drop its later channels) and
  // registers the one channel `ChartCell` mounts
  // (`binding.channels[0]`) with `sessionRef.current.setBoundChannel`.
  // All of that sequencing -- and the "is this fetch's result still
  // current" decision -- lives in the pure, unit-tested
  // `model/channelBindDriver.ts`'s `runChannelBind`, mirroring
  // `openEvalDriver.ts`'s/`sessionSpanDriver.ts`'s shape: `isStale` is
  // `binding`'s captured `identity` no longer matching
  // `boundIdentityRef.current.get(cellId)`, checked after every per-channel
  // `await` inside the driver, so a superseded fetch (this cell's binding
  // changed again, or the cell/session/document changed under it) before
  // this run resolves never overwrites fresher `chartWindows`/registry
  // state. Later gesture settles are handled by each `ChartCell`'s own
  // `onViewportSettled` callback (built in `renderJsCell` below), not here.
  // Depends only on data (`state.cells`/`state.markdown`/`sessionDetail`/
  // `sessionSpanUs`/`sessionId`) -- the tightened IPC-effects rule.
  useEffect(() => {
    if (state.markdown === null || sessionId === null) return;
    const markdown = state.markdown;
    const sid = sessionId;

    for (const cell of state.cells) {
      if (cell.id === null || cell.kind !== "js") continue;
      const cellId = cell.id;
      const code = decodeByteRange(markdown, cell.bodyRange);
      const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs);
      if (binding === null) {
        boundIdentityRef.current.delete(cellId);
        continue;
      }

      const identity = bindingIdentity(binding);
      if (boundIdentityRef.current.get(cellId) === identity) continue;
      boundIdentityRef.current.set(cellId, identity);

      const deps: ChannelBindDeps = {
        fetchTile: (sessId, channelId, tier, tileIndex, columnCount) => fetchTile(sessId, channelId, tier, tileIndex, columnCount),
      };
      const onAction = (action: ChannelBindAction) => {
        if (action.type === "channelData") {
          sandboxHostRef.current?.setChannelHostVar(action.channelId, action.length, action.t, action.v);
        } else if (action.type === "boundChannel") {
          sessionRef.current.setBoundChannel(action.cellId, action.bound);
        } else {
          setChartWindows((prev) => new Map(prev).set(action.cellId, action.chartWindow));
        }
      };
      const isStale = () => boundIdentityRef.current.get(cellId) !== identity;

      void runChannelBind(deps, sessionRef.current.cache, sid, cellId, binding, DEFAULT_CHART_WIDTH_PX, onAction, isStale);
    }
  }, [state.cells, state.markdown, sessionDetail, sessionSpanUs, sessionId]);

  // Save is unavailable while there is no readable `hash` to base it on
  // (N1 `not_implemented`, still loading, or a read error) -- see
  // `handleSave`'s doc comment on why `null` cannot stand in for it.
  const saveUnavailable = state.hash === null || state.markdown === null;

  return (
    <div>
      {state.markdownStatus === "not_implemented" && (
        <p className="workbook-markdown-unavailable">
          Editing this document&apos;s raw text is not available yet (read_workbook is not implemented).
        </p>
      )}
      {state.markdownStatus === "error" && state.markdownError !== null && (
        <p className="workbook-markdown-error">Notebook error: {state.markdownError}</p>
      )}
      {state.handle === null && state.markdownStatus === "loading" && <p>Opening notebook...</p>}
      {state.handle !== null && (
        <div className="workbook-save-bar">
          <button type="button" onClick={() => void handleSave()} disabled={saveUnavailable || saveFlowState.status === "saving"}>
            {saveFlowState.status === "saving" ? "Saving…" : "Save"}
          </button>
          {saveUnavailable && <span className="workbook-save-unavailable">save not available yet (read_workbook is not implemented)</span>}
          {saveFlowState.status === "error" && <span className="workbook-save-error">save failed: {saveFlowState.error.message}</span>}
        </div>
      )}
      {state.conflict && <ConflictBanner onReloadFromDisk={() => void handleReloadFromDisk()} onOverwrite={() => void handleOverwrite()} />}
      {state.handle !== null && (
        <CellList
          doc={{ frontMatterRange: null, cells: state.cells }}
          markdown={state.markdown ?? ""}
          outputs={state.outputs}
          inlineResults={inlineResults}
          spanErrors={spanErrors}
          renderJsCell={(cellId) => {
            const cell = state.cells.find((c) => c.id === cellId);
            const code = cell !== undefined && state.markdown !== null ? decodeByteRange(state.markdown, cell.bodyRange) : "";
            const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs);
            const heightPx = cellHeights.get(cellId) ?? null;
            const sendLayout = (id: string, rect: { top: number; left: number; width: number }) =>
              sandboxHostRef.current?.sendLayout(id, rect);

            if (binding === null || sessionId === null) {
              const unresolved = sessionDetail !== null ? unresolvedChannelId(code, sessionDetail) : null;
              return (
                <div data-selected={selectedCellId === cellId} onClick={() => setSelectedCellId(cellId)}>
                  <JsCellFrame
                    cellId={cellId}
                    heightPx={heightPx}
                    error={cellErrors.get(cellId)}
                    note={unresolved !== null ? `Channel "${unresolved}" is not part of this session.` : undefined}
                    sendLayout={sendLayout}
                  />
                </div>
              );
            }

            // TODO(idl0): `ChartCell` mounts `binding.channels[0]` only --
            // no per-channel `ChartCell` instances (lead pre-ruling
            // 2026-09-05 #3, R69(d)); the cell's own Plot code reaches the
            // other bound channels via `channel()` against host variables
            // the channel-bind effect above (`model/channelBindDriver.ts`)
            // sends for every distinct channel, not just this one.
            const channel = binding.channels[0];
            const window = chartWindows.get(cellId);
            const sid = sessionId;

            return (
              <div data-selected={selectedCellId === cellId} onClick={() => setSelectedCellId(cellId)}>
                <ChartCell
                  cellId={cellId}
                  tiles={window?.tiles ?? []}
                  width={DEFAULT_CHART_WIDTH_PX}
                  height={DEFAULT_JS_CELL_HEIGHT_PX}
                  heightPx={heightPx}
                  viewport={
                    window?.viewport ?? {
                      startUs: binding.initialSpan.startUs,
                      endUs: binding.initialSpan.endUs,
                      pixelWidth: DEFAULT_CHART_WIDTH_PX,
                    }
                  }
                  sessionSpanUs={sessionSpanUs ?? binding.initialSpan.endUs}
                  sessionId={sid}
                  channelId={channel.channelId}
                  sampleRateHz={channel.sampleRateHz}
                  cache={sessionRef.current.cache}
                  fetchTile={(tier, tileIndex, columnCount) => fetchTile(sid, channel.channelId, tier, tileIndex, columnCount)}
                  onViewportSettled={(viewport, tier, tiles) => {
                    setChartWindows((prev) => new Map(prev).set(cellId, { viewport, tiles }));
                    const budget = pointBudget(viewport.pixelWidth, false);
                    const data = tileToChannelData(tiles, viewport.startUs, viewport.endUs, budget);
                    sandboxHostRef.current?.setChannelHostVar(
                      channel.channelId,
                      data.length,
                      data.t.buffer as ArrayBuffer,
                      data.v.buffer as ArrayBuffer
                    );
                    const range = tileRange(viewport.startUs, viewport.endUs, tier, channel.sampleRateHz);
                    sessionRef.current.setBoundChannel(cellId, {
                      name: channel.channelId,
                      key: { sessionId: sid, channelId: channel.channelId, tier, columnCount: viewport.pixelWidth },
                      range,
                      startUs: viewport.startUs,
                      endUs: viewport.endUs,
                      budget,
                    });
                  }}
                  fetchCursorReadout={(sessId, channels, tUs) => cursorReadout(sessId, channels, tUs)}
                  sendTransform={(id, translateXPx, scaleX) => sandboxHostRef.current?.sendTransform(id, translateXPx, scaleX)}
                  sendLayout={sendLayout}
                />
              </div>
            );
          }}
        />
      )}
      <div
        ref={containerRef}
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, border: "none" }}
      />
    </div>
  );
}
