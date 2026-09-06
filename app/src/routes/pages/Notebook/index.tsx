import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { getSession, listSessions, listWorkbooks, type SessionDetail } from "../../../ipc/catalog";
import { cursorReadout } from "../../../ipc/cursor";
import { fetchTile } from "../../../ipc/tiles";
import {
  evalWorkbook,
  fetchHostChannel,
  listMathBuiltins,
  openWorkbook,
  readWorkbook,
  saveWorkbook,
  watchWorkbook,
  type LapContext as EvalLapContext,
} from "../../../ipc/workbook";
import { useAppState } from "../../../state/AppState";
import CellFrame from "./components/CellFrame";
import CellList from "./components/CellList";
import ChartCell from "./components/ChartCell";
import ConflictBanner from "./components/ConflictBanner";
import EditorPanes from "./components/EditorPanes";
import JsCellFrame, { DEFAULT_JS_CELL_HEIGHT_PX } from "./components/JsCellFrame";
import type { PropertiesFormChannelOption, PropertiesFormLapOption } from "./components/PropertiesForm.types";
import type { SandboxCell } from "./host/protocol";
import { SandboxHost } from "./host/SandboxHost";
import { NotebookSession } from "./host/NotebookSession";
import { dropCellHeight, initialCellHeights, recordCellHeight, type CellHeights } from "./model/cellLayout";
import { replaceCellBody } from "./model/cells";
import { runChannelBind, runChannelSettle, type ChannelBindAction, type ChannelBindDeps, type ChartWindow } from "./model/channelBindDriver";
import { CellRunSequencer } from "./model/cellRunSequencer";
import { diffFunctionCatalog, type FunctionCatalogMismatch } from "./model/functionCatalog";
import { bindingFor, bindingIdentity, unresolvedChannelId } from "./model/jsCellBinding";
import { runEval, runOpenAndEval, type OpenEvalDeps } from "./model/openEvalDriver";
import { proseBlocksFor, spansToEvaluate } from "./model/proseBlocks";
import { isSelfWrite, saveFlow, type SaveFlowState, type WorkbookEventWithHash } from "./model/saveFlow";
import { runSessionSpan, type SessionSpanAction, type SessionSpanDeps } from "./model/sessionSpanDriver";
import { TileCache } from "./model/tileCache";
import { initialWorkbookState, workbookReducer } from "./model/workbookState";

/** C4 §4's stated expected-hash-set TTL (5 s), matched here for the frontend's own independent self-write belt (`saveFlow.ts`'s `isSelfWrite`). */
const SELF_WRITE_TTL_MS = 5000;

/** How long a burst of local cell edits (`EditorPanes`, Task 15) settles
 *  before this page re-runs `evalWorkbook` — separate from `CodePane`'s own
 *  400ms typing debounce (`components/CodePane.tsx`'s
 *  `CODE_CHANGE_DEBOUNCE_MS`), since a Properties-form control commits its
 *  `onChange` immediately on every click/keystroke (no debounce of its
 *  own) and a burst of those (e.g. dragging a domain field) should not each
 *  trigger a full re-evaluation. Matches `CodePane`'s value as a documented
 *  judgment call, not a spec number. */
const EDIT_EVAL_DEBOUNCE_MS = 400;

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
 * newly bound cell's first window of tiles once for *every* distinct
 * channel the binding references (mirroring `ChartCell`'s own
 * settle-triggered fetch, reusing the same `chooseTier`/`tileRange`/
 * `ensureTiles`/`tileToChannelData` pieces via `model/channelBindDriver.ts`)
 * and registers the whole channel list with
 * `sessionRef.current.setBoundChannels` (R72) -- `ChartCell`'s own
 * `onViewportSettled` callback (built per bound cell in `renderJsCell`
 * below) does the same on every later gesture settle via
 * `runChannelSettle`, re-fetching and re-registering every one of the
 * cell's bound channels for the newly settled window so a rebuild replays
 * the *current* window for all of them, not only the one `ChartCell` mounts.
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
  const [functionCatalogMismatches, setFunctionCatalogMismatches] = useState<FunctionCatalogMismatch[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxHostRef = useRef<SandboxHost | null>(null);
  const sessionRef = useRef<NotebookSession>(new NotebookSession(new TileCache()));
  const openSeqRef = useRef(0);
  const evalSeqRef = useRef(0);
  const sessionSpanSeqRef = useRef(0);
  /** Every js cell's currently bound identity (`bindingIdentity`), so the channel-bind effect below only *starts a new run* for a cell whose binding actually changed -- this is purely the "should a new initial bind start" decision; it is never consulted as a staleness guard (that is `cellRunSequencerRef`'s job, below, review-task13c.md's Major fix). */
  const boundIdentityRef = useRef<Map<string, string>>(new Map());
  /** One shared run-sequence counter per `js` cell (`model/cellRunSequencer.ts`), used by *every* channel-window run for that cell -- the initial-bind effect below and each `ChartCell`'s gesture-settle refetch (`renderJsCell`'s `onViewportSettled`) alike -- so whichever kind of run started last always wins, regardless of which one resolves first (fix for review-task13c.md's Major: an initial bind and a settle previously carried independent guards that never invalidated each other). */
  const cellRunSequencerRef = useRef<CellRunSequencer>(new CellRunSequencer());

  // One `saveFlow` instance for this page's lifetime (Task 14) -- holds
  // its own `SaveFlowState` behind a closure; `saveFlowState` mirrors it
  // into component state after every `save()` resolution so the Save
  // button/`ConflictBanner` re-render. `lastSavedHash`/`lastSavedAtMs` feed
  // the watch effect's `isSelfWrite` check below (C4 §4's second belt).
  const saveFlowRef = useRef(saveFlow({ save: saveWorkbook, now: () => Date.now() }));
  const [saveFlowState, setSaveFlowState] = useState<SaveFlowState>({ status: "idle" });
  const lastSavedHashRef = useRef<string | null>(null);
  const lastSavedAtMsRef = useRef<number | null>(null);

  // `AppState.selection.lapContext` (R53 Data Q3), mapped to `ipc/workbook.ts`'s
  // wire `LapContext` shape and passed to every `evalWorkbook` call below
  // (C3 §3.4, ledger R59). Read via a ref, not the dependency array, for the
  // same reason `sessionIdRef` is below: the watch/debounced-edit effects
  // should read the freshest selection at fire time without re-subscribing
  // whenever the lap selection alone changes. `model/jsCellBinding.ts`'s
  // `JsCellBindingChannel.lap` (from `MarkProps.lap`, per-mark) is a
  // separate, narrower lap reference plumbed independently -- read and
  // stored on each bound channel below, never applied to narrow a fetch
  // (lead pre-ruling 2026-09-05 #2).
  const evalLapContextRef = useRef<EvalLapContext | null>(null);
  evalLapContextRef.current = lapContext === null ? null : { main_lap: lapContext.mainLap, overlay_laps: lapContext.overlayLaps };

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
      onChannelsInvalidated: () => sessionRef.current.onChannelsInvalidated(host, { fetchHostChannel: fetchHostChannelDep })(),
    });
    sandboxHostRef.current = host;
    host.init(SANDBOX_RUNTIME_VERSION);

    return () => {
      host.dispose();
      sandboxHostRef.current = null;
    };
  }, []);

  // Verifies `model/functionCatalog.ts`'s hand-transcribed `MATH_FUNCTIONS`
  // against the engine's own `list_math_builtins` (C3 §3.4, ledger R64.2),
  // once at notebook open. A mismatch is surfaced below as a dismissable
  // warning, never thrown -- a stale transcription is a completion/parity
  // gap, not a reason to block the editor. `list_math_builtins` never
  // rejects (C3 §3.4), so this has no error path to handle.
  useEffect(() => {
    let cancelled = false;
    listMathBuiltins().then((remote) => {
      if (cancelled) return;
      setFunctionCatalogMismatches(diffFunctionCatalog(remote));
    });
    return () => {
      cancelled = true;
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
      evalWorkbook: (id, sid, lapContext) => evalWorkbook(id, sid, lapContext),
    };
    void runOpenAndEval(deps, sessionId, dispatch, () => openSeqRef.current !== mySeq, evalLapContextRef.current);
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

  // Read fresh at call time by the mount-once sandbox-construction effect
  // and the channel-bind driver's injected `fetchHostChannel` (L6 Task 18)
  // -- same pattern as `sessionIdRef` above, so neither needs `state.handle`
  // in a dependency array.
  const workbookIdRef = useRef<string | null>(state.handle?.id ?? null);
  workbookIdRef.current = state.handle?.id ?? null;

  /** Binds `ipc/workbook.ts`'s `fetchHostChannel` to whatever workbook/session are current at call time (L6 Task 18, R77.3) -- the one place `ChannelBindDeps`'s injected `fetchHostChannel` is actually constructed, so `channelBindDriver.ts` and `channelRebind.ts` never import `ipc/workbook.ts` themselves. Rejects if no workbook is open yet, matching every other `workbookId`-dependent call site in this file. */
  const fetchHostChannelDep = (defName: string, budget: number) => {
    const workbookId = workbookIdRef.current;
    if (workbookId === null) return Promise.reject(new Error("fetchHostChannel: no workbook open"));
    return fetchHostChannel(workbookId, sessionIdRef.current, defName, budget);
  };

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
      void runEval({ evalWorkbook }, workbookId, sessionIdRef.current, dispatch, () => evalSeqRef.current !== mySeq, evalLapContextRef.current);
    });

    return () => {
      disposed = true;
    };
  }, [state.handle?.id]);

  // Re-runs `evalWorkbook` some time after a local edit (`handleCellCodeChange`
  // below, dispatched as `workbookReducer`'s `editCell`), debounced by
  // `EDIT_EVAL_DEBOUNCE_MS` (Task 15). Depends only on data
  // (`state.dirtyCellIds`'s identity, which `editCell` refreshes on every
  // edit, and `state.handle?.id`) -- the tightened IPC-effects rule. The
  // cleanup here only clears a *pending timer*, never an in-flight
  // `evalWorkbook` call -- the same distinction `CodePane.tsx`'s own
  // debounce relies on -- so this is not the cancelling-cleanup pattern
  // reviewers grade Critical.
  useEffect(() => {
    if (state.handle === null || state.dirtyCellIds.size === 0) return;
    const workbookId = state.handle.id;

    const timer = setTimeout(() => {
      const mySeq = ++evalSeqRef.current;
      void runEval({ evalWorkbook }, workbookId, sessionIdRef.current, dispatch, () => evalSeqRef.current !== mySeq, evalLapContextRef.current);
    }, EDIT_EVAL_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state.dirtyCellIds, state.handle?.id]);

  /**
   * Explicit save action (Task 14) -- never called from an effect or on a
   * per-keystroke basis. Disabled by the render below whenever
   * `state.hash` is `null`: before the first successful `readWorkbook`, or
   * after one fails, there is no legally correct `based_on_hash` to pass --
   * `null` means "creating a new workbook" (`ipc/workbook.ts`'s
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
      dispatch({ type: "markdownError", message: error instanceof Error ? error.message : String(error) });
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

  /**
   * The one path both `EditorPanes`' `PropertiesForm` and `CodePane` write
   * a cell edit through (Task 15's brief): `replaceCellBody` produces the
   * document's new full text, which `workbookReducer`'s `editCell` both
   * stores as `state.markdown` and re-scans into `state.cells` -- the
   * debounced re-eval effect above then picks up `state.dirtyCellIds`'s
   * change and re-runs `evalWorkbook`. Never calls `dispatch` for a no-op
   * replacement (`replaceCellBody` returns `markdown` unchanged when
   * `cellId` isn't found -- an unresolved-id race with a concurrent watch
   * event, say -- which would otherwise mark a cell dirty for no reason).
   */
  function handleCellCodeChange(cellId: string, nextCode: string) {
    if (state.markdown === null) return;
    const nextMarkdown = replaceCellBody(state.markdown, cellId, nextCode);
    if (nextMarkdown === state.markdown) return;
    dispatch({ type: "editCell", cellId, markdown: nextMarkdown });
  }

  // Pushes this document's `js` cells into the sandbox, and (best-effort --
  // ledger R70's known limitation, `model/proseBlocks.ts`'s doc comment)
  // re-issues every inline `${...}` span's evaluation, whenever the cell
  // set, the markdown they're read from, or the last evaluation's outputs
  // change -- `outputs` joined the dependency list here (ledger R78) since
  // a block's spans now come from `CellOutput.prose_spans`, not a
  // TypeScript regex scan of the raw text, so a span is only knowable once
  // that cell has an output entry. True reactive re-evaluation ("whenever
  // the Runtime re-runs any cell the expression's free variables depend
  // on," C2 par. 5.2) awaits the free-identifier analysis
  // `sandbox/main.ts`'s own TODO defers -- this is a coarser trigger:
  // every span is re-sent on every `setCells`, which is this effect's
  // only firing condition.
  useEffect(() => {
    const host = sandboxHostRef.current;
    if (host === null || state.markdown === null) return;

    const jsCells: SandboxCell[] = [];
    const liveIds = new Set<string>();
    for (const cell of state.cells) {
      if (cell.id === null) continue;
      if (cell.kind === "js") {
        jsCells.push({ id: cell.id, code: decodeByteRange(state.markdown, cell.bodyRange) });
        liveIds.add(cell.id);
      }
    }

    host.setCells(jsCells);
    const blocks = proseBlocksFor(state.cells, state.markdown, state.outputs);
    for (const span of spansToEvaluate(blocks)) {
      host.evalInline(span.id, span.expr);
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
        cellRunSequencerRef.current.delete(cellId);
        sessionRef.current.removeBoundChannel(cellId);
      }
    }
  }, [state.cells, state.markdown, state.outputs]);

  // For each `js` cell newly bound to a real channel (`bindingFor`, R66
  // item 1) -- a cell whose binding's identity (`bindingIdentity`) has
  // changed since the last time this effect ran -- fetches and sends
  // *every* distinct bound channel's initial window of tiles (lead
  // pre-ruling 2026-09-05 #3, review-task13b.md Critical fix: a
  // multi-channel binding must not silently drop its later channels) and
  // registers *all* of them, in order, with
  // `sessionRef.current.setBoundChannels` (R72, Task 13c) -- not only the
  // one channel `ChartCell` mounts, so a sandbox rebuild restores every
  // bound channel this cell's Plot code reads via `channel()`.
  // All of that sequencing lives in the pure, unit-tested
  // `model/channelBindDriver.ts`'s `runChannelBind`, mirroring
  // `openEvalDriver.ts`'s/`sessionSpanDriver.ts`'s shape. `boundIdentityRef`
  // decides only whether a *new* run should start (this cell's binding
  // identity changed); the "is this fetch's result still current" decision
  // is a separate question, answered by `cellRunSequencerRef` -- one
  // monotonic run-sequence counter per cell shared with every gesture
  // settle's own refetch (`renderJsCell`'s `onViewportSettled`, below), so
  // whichever kind of run started last for a cell always wins regardless of
  // which one resolves first (fix for review-task13c.md's Major: an
  // initial bind and a settle used to carry independent guards that never
  // invalidated each other, so a slow initial fetch could resolve after a
  // faster settle and overwrite its fresher `chartWindows`/registry state
  // with the stale initial-span one). Depends only on data
  // (`state.cells`/`state.markdown`/`sessionDetail`/`sessionSpanUs`/
  // `sessionId`/`state.outputs`) -- the tightened IPC-effects rule.
  // `state.outputs` was added for L6 Task 18 (definition-channel binding,
  // R77.3): `definitionsWithAxis` below is derived from it, so a cell
  // naming a `math` definition rebinds once that definition's first
  // `eval_workbook` result exists, or once its `has_t` becomes known.
  //
  // `definitionsWithAxis` (this task): every workbook `math` definition
  // name with a recorded time axis (`CellDefResult.value.has_t`) --
  // `eval_workbook`'s own output, the same source `definitionNames` below
  // (CodePane completions) reads, just restricted to the subset a chart can
  // bind to (Q3(a), R78: an axis-less definition is not bindable, and is
  // treated exactly like an unresolvable channel by `bindingFor`).
  const definitionsWithAxis: ReadonlySet<string> = new Set(
    Array.from(state.outputs.values())
      .filter((o) => o.kind === "math")
      .flatMap((o) => o.defs)
      .filter((d) => d.value !== null && d.value.has_t)
      .map((d) => d.name)
  );

  useEffect(() => {
    if (state.markdown === null || sessionId === null) return;
    const markdown = state.markdown;
    const sid = sessionId;

    for (const cell of state.cells) {
      if (cell.id === null || cell.kind !== "js") continue;
      const cellId = cell.id;
      const code = decodeByteRange(markdown, cell.bodyRange);
      const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis);
      if (binding === null) {
        boundIdentityRef.current.delete(cellId);
        continue;
      }

      const identity = bindingIdentity(binding);
      if (boundIdentityRef.current.get(cellId) === identity) continue;
      boundIdentityRef.current.set(cellId, identity);

      const deps: ChannelBindDeps = {
        fetchTile: (sessId, channelId, tier, tileIndex, columnCount) => fetchTile(sessId, channelId, tier, tileIndex, columnCount),
        fetchHostChannel: (defName, budget) => fetchHostChannelDep(defName, budget),
      };
      const onAction = (action: ChannelBindAction) => {
        if (action.type === "channelData") {
          sandboxHostRef.current?.setChannelHostVar(action.channelId, action.length, action.t, action.v);
        } else if (action.type === "boundChannels") {
          sessionRef.current.setBoundChannels(action.cellId, action.bound);
        } else {
          setChartWindows((prev) => new Map(prev).set(action.cellId, action.chartWindow));
        }
      };
      const seq = cellRunSequencerRef.current.start(cellId);
      const isStale = () => !cellRunSequencerRef.current.isCurrent(cellId, seq);

      void runChannelBind(deps, sessionRef.current.cache, sid, cellId, binding, DEFAULT_CHART_WIDTH_PX, onAction, isStale);
    }
  }, [state.cells, state.markdown, state.outputs, sessionDetail, sessionSpanUs, sessionId]);

  // Save is unavailable while there is no readable `hash` to base it on
  // (still loading, or a read error) -- see `handleSave`'s doc comment on
  // why `null` cannot stand in for it.
  const saveUnavailable = state.hash === null || state.markdown === null;

  // The editor shell's inputs (Task 15) -- derived on every render from
  // state already held above rather than kept in their own state slice,
  // matching this component's existing style for `renderJsCell`'s per-cell
  // derivations. `openCell`/`openCellId`/`openCellCode` are only non-null
  // together: `selectedCellId` names a cell (`CellFrame`'s `onSelect`
  // above only ever sets it to a cell with a resolved id), that cell is
  // still present in `state.cells`, and `state.markdown` is loaded to
  // decode its body from.
  const openCell = state.cells.find((cell) => cell.id === selectedCellId) ?? null;
  const openCellId = openCell?.id ?? null;
  const openCellCode = openCell !== null && state.markdown !== null ? decodeByteRange(state.markdown, openCell.bodyRange) : null;

  // `CodePane` completions (every kind); `plotForm`'s custom-code detection
  // means these are just candidates, never validated against what a cell
  // actually references. Unfiltered by `has_t` -- unlike `definitionsWithAxis`
  // above (which only feeds `bindingFor`/`unresolvedChannelId`), a definition
  // with no recorded axis is still a valid completion for a `math` cell to
  // reference in non-chart code.
  const channelIds = sessionDetail?.channels.map((c) => c.channel_id) ?? [];
  const definitionNames = Array.from(state.outputs.values())
    .filter((o) => o.kind === "math")
    .flatMap((o) => o.defs.map((d) => d.name));

  // `PropertiesForm`'s channel/lap pickers (`js` cells only -- `EditorPanes`
  // ignores these props for every other kind). `label` has no separate
  // source in `ChannelSummary` (`ipc/catalog.ts`) -- `channel_id` doubles
  // as the human-facing name, same as `MarkRow`'s picker options today.
  const propertiesChannels: PropertiesFormChannelOption[] =
    sessionDetail?.channels.map((c) => ({ id: c.channel_id, label: c.channel_id, unit: c.unit })) ?? [];
  const propertiesLaps: PropertiesFormLapOption[] = sessionDetail?.laps.map((l) => ({ number: l.lap_number })) ?? [];

  // Every prose block this document has right now, keyed by `blockId`
  // (`model/proseBlocks.ts`) -- computed here rather than in `CellList` so
  // that component stays a pure "where in document order" layout, not a
  // second consumer of `state.markdown`'s byte-range decoding.
  const proseBlocksByBlockId = useMemo(() => {
    const blocks = proseBlocksFor(state.cells, state.markdown ?? "", state.outputs);
    return new Map(blocks.map((block) => [block.blockId, block]));
  }, [state.cells, state.markdown, state.outputs]);

  return (
    <div>
      {functionCatalogMismatches.length > 0 && (
        <p role="status" className="notebook-function-catalog-warning">
          The function reference is out of date with the engine ({functionCatalogMismatches.length} mismatch
          {functionCatalogMismatches.length === 1 ? "" : "es"}). Completions and signatures may be inaccurate for
          those functions.
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
          {saveUnavailable && <span className="workbook-save-unavailable">save not available yet (the document's text could not be read)</span>}
          {saveFlowState.status === "error" && <span className="workbook-save-error">save failed: {saveFlowState.error.message}</span>}
        </div>
      )}
      {state.conflict && <ConflictBanner onReloadFromDisk={() => void handleReloadFromDisk()} onOverwrite={() => void handleOverwrite()} />}
      {state.handle !== null && (
        <CellList
          doc={{ frontMatterRange: null, cells: state.cells }}
          proseBlocks={proseBlocksByBlockId}
          outputs={state.outputs}
          inlineResults={inlineResults}
          spanErrors={spanErrors}
          renderJsCell={(cellId) => {
            const cell = state.cells.find((c) => c.id === cellId);
            const code = cell !== undefined && state.markdown !== null ? decodeByteRange(state.markdown, cell.bodyRange) : "";
            const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis);
            const heightPx = cellHeights.get(cellId) ?? null;
            const sendLayout = (id: string, rect: { top: number; left: number; width: number }) =>
              sandboxHostRef.current?.sendLayout(id, rect);

            if (binding === null || sessionId === null) {
              const unresolved = sessionDetail !== null ? unresolvedChannelId(code, sessionDetail, definitionsWithAxis) : null;
              // A name that resolves as a plain (unfiltered) definition but
              // was excluded from `definitionsWithAxis` is a definition with
              // no recorded axis (Q3(a), R78) -- a distinct note from "not
              // part of this session", since the name itself is perfectly
              // valid, it just has nothing to chart against (C1: "time is
              // recorded, not assumed").
              const isAxisLessDefinition = unresolved !== null && definitionNames.includes(unresolved) && !definitionsWithAxis.has(unresolved);
              const note = isAxisLessDefinition
                ? `Definition "${unresolved}" has no recorded axis.`
                : unresolved !== null
                  ? `Channel "${unresolved}" is not part of this session.`
                  : undefined;
              return <JsCellFrame cellId={cellId} heightPx={heightPx} error={cellErrors.get(cellId)} note={note} sendLayout={sendLayout} />;
            }

            if (binding.mountedChannelId === null) {
              // Q2(a), R78: every one of this cell's bound channels is a
              // workbook definition -- there is no session channel, no time
              // window and so no gesture surface to mount `ChartCell` for.
              // The sandbox's own Plot still renders (the channel-bind
              // effect above feeds it every definition's data as a host
              // variable, same as a session channel); this frame just has
              // no pan/zoom/hover.
              return <JsCellFrame cellId={cellId} heightPx={heightPx} error={cellErrors.get(cellId)} sendLayout={sendLayout} />;
            }

            // TODO(idl0): `ChartCell` mounts `binding.mountedChannelId` only
            // -- no per-channel `ChartCell` instances (lead pre-ruling
            // 2026-09-05 #3, R69(d)); the cell's own Plot code reaches the
            // other bound channels via `channel()` against host variables
            // the channel-bind effect above (`model/channelBindDriver.ts`)
            // sends for every distinct channel, not just this one.
            const mountedChannelId = binding.mountedChannelId;
            const channel = binding.channels.find((c) => c.channelId === mountedChannelId)!;
            const window = chartWindows.get(cellId);
            const sid = sessionId;

            return (
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
                onViewportSettled={(viewport, _tier, tiles) => {
                  // ChartCell has already committed its own (mounted-channel)
                  // settle-fetch by the time this fires -- paint it
                  // immediately rather than waiting on the multi-channel
                  // driver below, whose re-fetch of this same channel is a
                  // cache hit but still a microtask away.
                  setChartWindows((prev) => new Map(prev).set(cellId, { viewport, tiles }));

                  // Every one of this cell's bound channels -- not only the
                  // mounted one -- must re-fetch for the newly settled
                  // window and re-register as one list (R72, Task 13c): a
                  // multi-mark cell's other channels would otherwise desync
                  // from the mounted channel's viewport after a pan/zoom.
                  // `cellRunSequencerRef` -- shared with the initial-bind
                  // effect above -- guards this settle against both a
                  // later settle for the same cell and a slower initial
                  // bind that is still in flight, so whichever of the two
                  // started last always wins (review-task13c.md's Major).
                  const seq = cellRunSequencerRef.current.start(cellId);
                  const isStale = () => !cellRunSequencerRef.current.isCurrent(cellId, seq);
                  const deps: ChannelBindDeps = {
                    fetchTile: (sessId, chId, chTier, tileIndex, columnCount) => fetchTile(sessId, chId, chTier, tileIndex, columnCount),
                    fetchHostChannel: (defName, budget) => fetchHostChannelDep(defName, budget),
                  };
                  const onAction = (action: ChannelBindAction) => {
                    if (action.type === "channelData") {
                      sandboxHostRef.current?.setChannelHostVar(action.channelId, action.length, action.t, action.v);
                    } else if (action.type === "boundChannels") {
                      sessionRef.current.setBoundChannels(action.cellId, action.bound);
                    } else {
                      setChartWindows((prev) => new Map(prev).set(action.cellId, action.chartWindow));
                    }
                  };
                  void runChannelSettle(
                    deps,
                    sessionRef.current.cache,
                    sid,
                    cellId,
                    binding.channels,
                    channel.channelId,
                    viewport.startUs,
                    viewport.endUs,
                    viewport.pixelWidth,
                    onAction,
                    isStale,
                    sessionRef.current.boundChannelsFor(cellId)
                  );
                }}
                fetchCursorReadout={(sessId, channels, tUs) => cursorReadout(sessId, channels, tUs)}
                sendTransform={(id, translateXPx, scaleX) => sandboxHostRef.current?.sendTransform(id, translateXPx, scaleX)}
                sendLayout={sendLayout}
              />
            );
          }}
          frame={(cell, output) => (
            <CellFrame
              cell={cell}
              selected={cell.id !== null && selectedCellId === cell.id}
              onSelect={() => {
                if (cell.id !== null) setSelectedCellId(cell.id);
              }}
            >
              {output}
            </CellFrame>
          )}
        />
      )}
      {openCellId !== null && openCell !== null && openCellCode !== null && (
        <EditorPanes
          cellId={openCellId}
          kind={openCell.kind}
          code={openCellCode}
          onChange={(nextCode) => handleCellCodeChange(openCellId, nextCode)}
          channelIds={channelIds}
          definitionNames={definitionNames}
          channels={propertiesChannels}
          laps={propertiesLaps}
        />
      )}
      <div
        ref={containerRef}
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, border: "none" }}
      />
    </div>
  );
}
