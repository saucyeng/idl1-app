import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { BrandSheet } from "@/components/brand/BrandSheet";
import { NoteBlock } from "@/components/brand/NoteBlock";
import { listSessions, listWorkbooks, getSession, rebuildCatalog, type RebuildReport, type SessionDetail } from "../../../ipc/catalog";
import { cursorReadout } from "../../../ipc/cursor";
import { fetchFft, type DecodedFft } from "../../../ipc/rasters";
import { fetchTile } from "../../../ipc/tiles";
import {
  createWorkbook,
  evalWorkbook,
  fetchHostChannel,
  listMathBuiltins,
  openWorkbook,
  readWorkbook,
  saveWorkbook,
  watchWorkbook,
  type IpcError,
  type LapContext as EvalLapContext,
} from "../../../ipc/workbook";
import { useAppState } from "../../../state/AppState";
import { useRouteVisible } from "../../../shell/routeVisibility";
import { resolveRegister } from "../Settings/theme";
import { createPrefsStore, localStorageBackend } from "../Settings/prefsStore";
import CellFrame, { type CellRunStatus } from "./components/CellFrame";
import CellList from "./components/CellList";
import ChartCell from "./components/ChartCell";
import ConflictBanner from "./components/ConflictBanner";
import EditorPanes from "./components/EditorPanes";
import JsCellFrame, { DEFAULT_JS_CELL_HEIGHT_PX } from "./components/JsCellFrame";
import PropertiesForm from "./components/PropertiesForm";
import type { PropertiesFormChannelOption, PropertiesFormLapOption } from "./components/PropertiesForm.types";
import WorkbookBar from "./components/WorkbookBar";
import type { SandboxCell } from "./host/protocol";
import { SandboxHost } from "./host/SandboxHost";
import { NotebookSession } from "./host/NotebookSession";
import { dropCellHeight, initialCellHeights, recordCellHeight, type CellHeights } from "./model/cellLayout";
import { replaceCellBody } from "./model/cells";
import { runChannelBind, runChannelSettle, type ChannelBindAction, type ChannelBindDeps, type ChartWindow } from "./model/channelBindDriver";
import { CellRunSequencer } from "./model/cellRunSequencer";
import { isCodeVisible, toggleCode } from "./model/codeVisibility";
import PlaybackTransport from "./interaction/PlaybackTransport";
import { tick, togglePlay, type PlaybackState } from "./interaction/playback";
import { editorPlacement, outputIsReadOnly } from "./model/editorPlacement";
import { runFft, type FftAction, type FftDeps } from "./model/fftDriver";
import { exceedsBinCap, frequencyAxisHz } from "./model/fftRequest";
import { diffFunctionCatalog, type FunctionCatalogMismatch } from "./model/functionCatalog";
import { bindingFor, bindingIdentity, unresolvedChannelId, type FftCellBinding } from "./model/jsCellBinding";
import { jsCellNote } from "./model/jsCellNote";
import { readNotebookPrefs, writeNotebookPrefs } from "./model/notebookPrefs";
import { runEval, runOpenAndEval, type OpenEvalDeps } from "./model/openEvalDriver";
import { registerMetrics } from "./model/outputRegister";
import { parse as parsePlotForm } from "./plotForm/parse";
import { proseBlocksFor, spansToEvaluate } from "./model/proseBlocks";
import { isSelfWrite, saveFlow, type SaveFlowState, type WorkbookEventWithHash } from "./model/saveFlow";
import { initialSandboxPrimeState, nextSandboxPrimeState } from "./model/sandboxLifecycle";
import { runSessionSpan, type SessionSpanAction, type SessionSpanDeps } from "./model/sessionSpanDriver";
import { TileCache } from "./model/tileCache";
import { chooseWorkbookEntry, type WorkbookEntry } from "./model/workbookEntry";
import { initialWorkbookState, workbookReducer } from "./model/workbookState";

/** `true` when `value` has the shape of a typed `IpcError` (C3 §2). Local
 *  copy of the same helper `openEvalDriver.ts`/`fftDriver.ts` each keep --
 *  this page's `create_workbook`/`rebuild_catalog` calls are its own IPC,
 *  outside any driver module. */
function isIpcErrorLike(value: unknown): value is IpcError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).kind === "string" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/** Turns a rejected `create_workbook`/`rebuild_catalog` promise into a typed
 *  `IpcError`, never a bare string (CLAUDE.md §5). */
function toIpcError(error: unknown): IpcError {
  if (isIpcErrorLike(error)) {
    return error.detail === undefined
      ? { kind: error.kind, message: error.message }
      : { kind: error.kind, message: error.message, detail: error.detail };
  }
  return { kind: "internal", message: error instanceof Error ? error.message : String(error) };
}

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

/**
 * A second {@link PrefsStore} instance over the same `localStorage`-backed
 * document `Settings/prefsStore.ts`'s own module-scope instance reads and
 * writes (UI-7 brief Open Question 1: "UI-10 reads it through
 * `prefsStore.ts`'s `PrefsBackend` rather than a third storage key" — the
 * recommendation the lead's UI-10 dispatch proceeded on). This is a second
 * *object*, not a second *storage key*: both instances wrap the identical
 * `idl1.settings.prefs.v1` document, so a register change from either tab
 * is visible to the other the next time it reads. `Settings/index.tsx`'s
 * own instance is not exported and is not imported here — constructing a
 * second one from the same exported factory avoids a cross-page singleton
 * import while landing on the same underlying key.
 */
const notebookPrefsStore = createPrefsStore(localStorageBackend());

/** Tracks `window.innerWidth`, for `model/editorPlacement.ts`'s
 *  `editorPlacement`/`model/outputRegister.ts`'s `registerMetrics` and
 *  `Settings/theme.ts`'s `resolveRegister` — the same small resize-listener
 *  hook every other width-dependent page in this app keeps its own copy of
 *  (`Data/index.tsx`, `Settings/ThemeSection.tsx`), rather than a shared
 *  export, per this lane's existing convention. */
function useWindowWidth(): number {
  const [widthPx, setWidthPx] = useState<number>(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidthPx(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return widthPx;
}

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
 * canvas proof, L5 Task 14): opens the workbook `model/workbookEntry.ts`'s
 * `chooseWorkbookEntry` names (the remembered one, the only one, or the
 * first when there is a choice and nothing remembered -- L6 Task 21),
 * evaluates it, and renders every cell in document order via
 * {@link CellList}. An empty catalog shows {@link WorkbookBar}'s empty
 * state (New workbook, Rescan) instead. Owns the one
 * {@link SandboxHost}/{@link NotebookSession} pair for this page's
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
  /** The selected main lap (R83/L2b Task 6), or `null` when no lap is
   *  selected -- passed to `bindingFor`'s FFT arm so an FFT cell's
   *  `fetch_fft` request targets the same lap window the rest of the app is
   *  looking at. A time cell's own per-mark `lap` (`MarkProps.lap`) is
   *  unrelated (`bindingFor`'s `mainLap` parameter is consulted only by its
   *  FFT arm). */
  const mainLap = lapContext?.mainLap ?? null;

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
  /** An FFT cell's last `fetch_fft` failure (L6 Task 20), typed -- never a bare string (CLAUDE.md §5). Shown in the cell's `JsCellFrame` note slot. */
  const [fftErrors, setFftErrors] = useState<Map<string, IpcError>>(new Map());
  /** Which workbook to open and which chrome to show (L6 Task 21) --
   *  `null` while the first `list_workbooks` call (or the one
   *  first-open-when-empty rebuild, R81 Q1(a)) is still in flight.
   *  Computed by `model/workbookEntry.ts`'s `chooseWorkbookEntry`, never
   *  re-decided here. */
  const [entry, setEntry] = useState<WorkbookEntry | null>(null);
  /** Bumped by a successful `handleCreate`/`handleRescan` to re-run the
   *  workbook-list effect below -- the only other trigger besides mount. */
  const [reloadSeq, setReloadSeq] = useState(0);
  /** True while `rebuild_catalog` is running, whether from the one
   *  first-open-when-empty case or the Rescan button. */
  const [rescanning, setRescanning] = useState(false);
  /** True while `create_workbook` is in flight. */
  const [creating, setCreating] = useState(false);
  /** The last `create_workbook`/`rebuild_catalog` failure (L6 Task 21),
   *  typed -- never a bare string. Shown by `WorkbookBar`. */
  const [workbookBarError, setWorkbookBarError] = useState<IpcError | null>(null);
  /** The last `rebuild_catalog` report, for `WorkbookBar`'s "Rescan found
   *  N workbook(s)" line (R81 Q6). */
  const [lastRebuild, setLastRebuild] = useState<RebuildReport | null>(null);

  // R95 items 2/3: whether the Notebook route is on screen right now
  // (`shell/routeVisibility.tsx`'s composed "window visible AND this route
  // active" signal, the same one UI-4's Device tab gates its status poll
  // on). `primeState` is `model/sandboxLifecycle.ts`'s pure decision over
  // that boolean -- `running` gates the sandbox mount effect, the
  // `watchWorkbook` subscription and the debounced-eval effect below;
  // `primeEpoch` is included in the dependency array of every effect that
  // must resend its state into a freshly (re)constructed `SandboxHost` on a
  // hidden -> visible transition, reusing those effects' own existing
  // replay order rather than a new one (R69).
  const routeVisible = useRouteVisible("notebook");
  const [primeState, setPrimeState] = useState(() => initialSandboxPrimeState(routeVisible));
  useEffect(() => {
    setPrimeState((prev) => nextSandboxPrimeState(prev, routeVisible));
  }, [routeVisible]);

  // UI-11 (R99): the worksheet's shared cursor time, split into a
  // manually-set component (`setCursor`/`clearCursor`, a click, "cursor to
  // peak") and playback's own clock (`interaction/playback.ts`) -- the
  // *effective* shared cursor every mounted `ChartCell` receives is
  // whichever of the two is currently authoritative (`sharedCursorTUs`
  // below), never both merged, so there is exactly one source of truth at
  // any instant.
  const [manualCursorTUs, setManualCursorTUs] = useState<bigint | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ tUs: 0n, playing: false, speed: 1 });
  const sharedCursorTUs = playback.playing ? playback.tUs : manualCursorTUs;

  // The playback clock's `requestAnimationFrame` loop: local state only
  // (`setPlayback`), never IPC or `postMessage` itself (the effects rule's
  // carve-out for a RAF loop that "advances local state only"). Gated on
  // `primeState.running` (R95/R99): a hidden Notebook route must not keep
  // ticking a cursor nobody can see. `sessionSpanUs` is read fresh each
  // frame via a ref (`sessionSpanUsRef`, populated below) rather than
  // added to this effect's dependency array, so a mid-playback session
  // change doesn't tear down and restart the RAF loop itself.
  const sessionSpanUsRef = useRef(sessionSpanUs);
  sessionSpanUsRef.current = sessionSpanUs;
  useEffect(() => {
    if (!playback.playing || !primeState.running) return;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const elapsedMs = now - last;
      last = now;
      const spanEndUs = BigInt(Math.max(0, Math.round(sessionSpanUsRef.current ?? 0)));
      setPlayback((prev) => tick(prev, elapsedMs, [0n, spanEndUs]));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playback.playing, primeState.running]);

  // R95's own rule ("pause ... while hidden") applied to playback: a
  // hidden -> still-playing route pauses rather than silently continuing
  // off-screen, so a later re-show shows a paused transport, not one that
  // kept advancing invisibly.
  useEffect(() => {
    if (!primeState.running && playback.playing) {
      setPlayback((prev) => togglePlay(prev));
    }
  }, [primeState.running, playback.playing]);

  /** Play/pause toggle for `PlaybackTransport`. Starting play from a
   *  manually-set cursor seeds the clock's `tUs` from it (a judgment call:
   *  `interaction/playback.ts`'s `togglePlay` has no span/cursor parameter
   *  to do this itself, see its own doc comment) so playback resumes from
   *  where the user last pointed rather than wherever the clock was left. */
  function handleTogglePlay(): void {
    setPlayback((prev) => {
      if (!prev.playing && manualCursorTUs !== null) {
        return togglePlay({ ...prev, tUs: manualCursorTUs });
      }
      return togglePlay(prev);
    });
  }

  // Width-dependent chrome (UI-10): the editor's placement (panes/inline/
  // sheet, `model/editorPlacement.ts`) and the output register's CSS
  // metrics (`model/outputRegister.ts`) both read this, never a second
  // width listener.
  const widthPx = useWindowWidth();
  const placement = editorPlacement(widthPx);

  // The notebook output register (decision 31) -- stored in `UiPrefs`
  // (UI-7 Q1), read/written through `notebookPrefsStore` above. `null`
  // means "no explicit choice yet"; `resolveRegister` then defaults to
  // paper on narrow / studio on wide.
  const [storedRegister, setStoredRegister] = useState<"paper" | "studio" | null>(null);
  useEffect(() => {
    let cancelled = false;
    void notebookPrefsStore.get().then((prefs) => {
      if (!cancelled) setStoredRegister(prefs.ui.output_register);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const register = resolveRegister(storedRegister, widthPx);
  const registerCssMetrics = registerMetrics(register);

  function handleRegisterChange(next: "paper" | "studio"): void {
    setStoredRegister(next);
    void notebookPrefsStore.get().then((current) => notebookPrefsStore.set({ ui: { ...current.ui, output_register: next } }));
  }

  /** Which cells currently have their raw source revealed in the output
   *  (decision 30, `model/codeVisibility.ts`) -- UI state, never persisted
   *  and never written into the workbook. */
  const [revealedCells, setRevealedCells] = useState<ReadonlySet<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxHostRef = useRef<SandboxHost | null>(null);
  const sessionRef = useRef<NotebookSession>(new NotebookSession(new TileCache()));
  const openSeqRef = useRef(0);
  const evalSeqRef = useRef(0);
  const sessionSpanSeqRef = useRef(0);
  const listSeqRef = useRef(0);
  /** `true` once the one first-open-when-empty automatic `rebuild_catalog`
   *  (R81 Q1(a)) has been attempted for this mount -- a later empty list
   *  (e.g. after Rescan itself finds nothing) does not trigger a second
   *  automatic rebuild; the user's own Rescan already covered that case. */
  const autoRebuiltRef = useRef(false);
  /** Every js cell's currently bound identity (`bindingIdentity`), so the channel-bind effect below only *starts a new run* for a cell whose binding actually changed -- this is purely the "should a new initial bind start" decision; it is never consulted as a staleness guard (that is `cellRunSequencerRef`'s job, below, review-task13c.md's Major fix). */
  const boundIdentityRef = useRef<Map<string, string>>(new Map());
  /** The last `primeState.primeEpoch` this page has already reprimed for
   *  (R95 item 2) -- compared inside the setCells effect below so
   *  `boundIdentityRef` is cleared exactly once per hidden -> visible
   *  transition (a freshly (re)constructed `SandboxHost` has none of this
   *  document's channels bound yet, so every cell's binding must look
   *  "changed" again to the channel-bind/FFT-bind effects below), never on
   *  an ordinary cell edit that happens to run the same effect. */
  const primeEpochSeenRef = useRef(0);
  /** One shared run-sequence counter per `js` cell (`model/cellRunSequencer.ts`), used by *every* channel-window run for that cell -- the initial-bind effect below and each `ChartCell`'s gesture-settle refetch (`renderJsCell`'s `onViewportSettled`) alike -- so whichever kind of run started last always wins, regardless of which one resolves first (fix for review-task13c.md's Major: an initial bind and a settle previously carried independent guards that never invalidated each other). Shared with the FFT bind effect below (L6 Task 20) -- one counter per cell id regardless of which arm the cell resolves to, never a second counter. */
  const cellRunSequencerRef = useRef<CellRunSequencer>(new CellRunSequencer());
  /** The last decoded spectrum this page fetched for each FFT cell (L6 Task
   *  20, Open Question 5), keyed by `cellId`, alongside the `hostVarName`
   *  it was published under -- so a sandbox rebuild can re-push it (fresh
   *  `Float64Array`s built from this retained `DecodedFft`, never the
   *  transferred buffers themselves, which are detached on transfer) rather
   *  than re-fetching or leaving the cell blank. Cleared when the cell is
   *  removed from the document or its binding stops being an FFT cell. */
  const retainedSpectraRef = useRef<Map<string, { hostVarName: string; fft: DecodedFft }>>(new Map());

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
  /** `true` once the current sandbox generation has gone `BOOT_TIMEOUT_MS`
   *  without a `ready` (`host/SandboxHost.ts`'s `onSandboxUnavailable`) --
   *  the real trigger this task fixes (2026-09-07: a broken dev-server CORS
   *  path silently blanked the output column forever with no error and no
   *  retry). Rendered as a fallback banner with a Retry button below,
   *  cleared optimistically when Retry is pressed (a `retry()` that itself
   *  times out sets it again). */
  const [sandboxUnavailable, setSandboxUnavailable] = useState(false);
  const onSandboxUnavailableRef = useRef(() => setSandboxUnavailable(true));

  // R95 item 2: the sandbox iframe is a live JS runtime -- it is not
  // constructed (or is torn down) while the Notebook route is not visible.
  // `primeState.running` is the only dependency: React's own effect
  // lifecycle already gives the pause/resume shape for free -- a
  // true -> false transition runs this effect's cleanup (`host.dispose()`),
  // a false -> true transition runs the effect body again (a fresh
  // `SandboxHost`, freshly `init`ed), so no separate pause()/resume() pair
  // was added to `host/SandboxHost.ts` (untouched by this task).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || !primeState.running) return;

    setSandboxUnavailable(false);
    const host = new SandboxHost(container, {
      onCellRendered: (cellId, heightPx) => onCellRenderedRef.current(cellId, heightPx),
      onCellError: (cellId, message) => onCellErrorRef.current(cellId, message),
      onInlineResult: (spanId, text) => onInlineResultRef.current(spanId, text),
      onSpanError: (spanId, message) => onSpanErrorRef.current(spanId, message),
      onSandboxUnavailable: () => onSandboxUnavailableRef.current(),
      onChannelsInvalidated: () => {
        sessionRef.current.onChannelsInvalidated(host, { fetchHostChannel: fetchHostChannelDep })();
        // L6 Task 20, Open Question 5: a spectrum has no `TileCache` entry
        // to re-derive from, so it is re-pushed from this page's own
        // retained copy -- fresh `Float64Array`s built here, never the
        // transferred buffers themselves (detached on transfer). No IPC,
        // no refetch.
        for (const { hostVarName, fft } of retainedSpectraRef.current.values()) {
          const f = frequencyAxisHz(fft);
          const m = Float64Array.from(fft.magnitudes);
          host.setSpectrumHostVar(hostVarName, f.length, f.buffer as ArrayBuffer, m.buffer as ArrayBuffer);
        }
      },
    });
    sandboxHostRef.current = host;
    host.init(SANDBOX_RUNTIME_VERSION);

    return () => {
      host.dispose();
      sandboxHostRef.current = null;
    };
  }, [primeState.running]);

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

  // Lists indexed workbooks (L6 Task 21, R81 Q1(a)): once on mount and again
  // whenever `reloadSeq` changes (bumped by a successful `handleCreate`/
  // `handleRescan`). An empty result triggers exactly one automatic
  // `rebuild_catalog` per mount (`autoRebuiltRef`), then re-lists, before
  // falling through to the empty state -- the catalog is "an index --
  // deletable, rebuildable, never synced" (CLAUDE.md §3), so an empty index
  // does not necessarily mean there are no workbooks on disk. Depends only
  // on data (`reloadSeq`), the tightened IPC-effects rule (wave-2 operating
  // brief §4); this effect's own cleanup cancels nothing, it only prevents a
  // superseded run from calling `setEntry`/`setRescanning`.
  useEffect(() => {
    const mySeq = ++listSeqRef.current;
    const isStale = () => listSeqRef.current !== mySeq;

    (async () => {
      let workbooks = await listWorkbooks();
      if (isStale()) return;

      if (workbooks.length === 0 && !autoRebuiltRef.current) {
        autoRebuiltRef.current = true;
        setRescanning(true);
        try {
          const report = await rebuildCatalog();
          if (isStale()) return;
          setLastRebuild(report);
          workbooks = await listWorkbooks();
          if (isStale()) return;
        } catch (error) {
          if (isStale()) return;
          setWorkbookBarError(toIpcError(error));
        } finally {
          if (!isStale()) setRescanning(false);
        }
      }

      setEntry(chooseWorkbookEntry(workbooks, readNotebookPrefs().last_workbook_id));
    })();
  }, [reloadSeq]);

  // Derived from `entry` -- `null` for the empty state, so the open/eval
  // effect below starts nothing until a workbook exists to open.
  const selectedWorkbookId = entry !== null && entry.kind !== "empty" ? entry.workbookId : null;

  // Open -> read -> eval, once a workbook is chosen and again whenever the
  // selected session or the selected workbook changes (data-only
  // dependencies -- never a callback). `model/openEvalDriver.ts`'s
  // `runOpenAndEval` no longer decides which workbook to open (L6 Task 21)
  // -- that is `entry`'s job, shared with the empty state and the picker.
  useEffect(() => {
    if (selectedWorkbookId === null) return;
    const mySeq = ++openSeqRef.current;
    const deps: OpenEvalDeps = {
      openWorkbook: (idOrPath) => openWorkbook(idOrPath),
      readWorkbook: (idOrPath) => readWorkbook(idOrPath),
      evalWorkbook: (id, sid, lapContext) => evalWorkbook(id, sid, lapContext),
    };
    void runOpenAndEval(deps, selectedWorkbookId, sessionId, dispatch, () => openSeqRef.current !== mySeq, evalLapContextRef.current);
  }, [sessionId, selectedWorkbookId]);

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

  // R95 item 2: paused the same way the sandbox mount effect above is --
  // `primeState.running` added to the dependency array so a hidden route
  // drops this subscription (the cleanup below runs) and a visible one
  // re-subscribes fresh, exactly the shape this effect already used for a
  // *workbook* change before this task (its cleanup only ever set
  // `disposed`, since `watch_workbook`'s C3 contract has no unsubscribe
  // command to call) -- hiding the route is treated as the same kind of
  // "this subscription is no longer current" event a workbook switch
  // already was, not a new mechanism.
  useEffect(() => {
    const workbookId = state.handle?.id;
    if (workbookId === undefined || !primeState.running) return;

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
  }, [state.handle?.id, primeState.running]);

  // Re-runs `evalWorkbook` some time after a local edit (`handleCellCodeChange`
  // below, dispatched as `workbookReducer`'s `editCell`), debounced by
  // `EDIT_EVAL_DEBOUNCE_MS` (Task 15). Depends only on data
  // (`state.dirtyCellIds`'s identity, which `editCell` refreshes on every
  // edit, and `state.handle?.id`) -- the tightened IPC-effects rule. The
  // cleanup here only clears a *pending timer*, never an in-flight
  // `evalWorkbook` call -- the same distinction `CodePane.tsx`'s own
  // debounce relies on -- so this is not the cancelling-cleanup pattern
  // reviewers grade Critical.
  // R95 item 3: a hidden notebook must not call `eval_workbook` -- gated on
  // `primeState.running` the same way as the two effects above. Going
  // hidden mid-debounce runs this effect's cleanup (`clearTimeout`), so a
  // pending edit's eval is dropped rather than firing into the background;
  // the edit itself is not lost (`state.dirtyCellIds` is untouched), so
  // becoming visible again with a still-dirty cell re-arms the same timer.
  useEffect(() => {
    if (state.handle === null || state.dirtyCellIds.size === 0 || !primeState.running) return;
    const workbookId = state.handle.id;

    const timer = setTimeout(() => {
      const mySeq = ++evalSeqRef.current;
      void runEval({ evalWorkbook }, workbookId, sessionIdRef.current, dispatch, () => evalSeqRef.current !== mySeq, evalLapContextRef.current);
    }, EDIT_EVAL_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [state.dirtyCellIds, state.handle?.id, primeState.running]);

  /**
   * `WorkbookBar`'s "Create" (L6 Task 21) -- explicit user action, never
   * called from an effect. `create_workbook` writes the file but does not
   * index it (GATE fact 1), so the new workbook opens immediately from its
   * own returned handle -- no rebuild needed for that -- and the rebuild
   * that follows serves only the picker's next `list_workbooks` (GATE fact
   * 2 covers every other command already resolving by scanning
   * `workbooks/`). A rejection sets the typed error and changes nothing
   * else: `entry` is left as it was, so an empty state stays the empty
   * state.
   */
  async function handleCreate(name: string) {
    setCreating(true);
    setWorkbookBarError(null);
    try {
      const handle = await createWorkbook(name);
      writeNotebookPrefs({ last_workbook_id: handle.id });
      setEntry({ kind: "single", workbookId: handle.id });
      try {
        const report = await rebuildCatalog();
        setLastRebuild(report);
      } catch {
        // The new workbook is already open from its own handle; a failed
        // rebuild only means the picker won't see it yet -- not fatal here.
      }
      setReloadSeq((n) => n + 1);
    } catch (error) {
      setWorkbookBarError(toIpcError(error));
    } finally {
      setCreating(false);
    }
  }

  /**
   * `WorkbookBar`'s "Rescan" (L6 Task 21) -- explicit user action, mirroring
   * `Data/index.tsx`'s existing "Rebuild catalog" button's disabled-while-
   * running and error-reporting shape. Reports `workbooks_indexed` and
   * `duration_ms` only (R81 Q6) -- `WorkbookBar` itself says the whole
   * catalog was rebuilt, not only workbooks.
   */
  async function handleRescan() {
    setRescanning(true);
    setWorkbookBarError(null);
    try {
      const report = await rebuildCatalog();
      setLastRebuild(report);
      setReloadSeq((n) => n + 1);
    } catch (error) {
      setWorkbookBarError(toIpcError(error));
    } finally {
      setRescanning(false);
    }
  }

  /**
   * `WorkbookBar`'s picker `onChange` (L6 Task 21) -- re-keys the open/eval
   * effect above by changing `entry.workbookId`, opening the chosen
   * document. Never calls `listWorkbooks` again: the picker's own choices
   * came from the last list already held in `entry`.
   */
  function handleSelect(workbookId: string) {
    writeNotebookPrefs({ last_workbook_id: workbookId });
    setEntry((prev) => (prev !== null && prev.kind !== "empty" ? { ...prev, workbookId } : prev));
  }

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
  /** The sandbox-unavailable banner's Retry button (`onSandboxUnavailable`
   *  above): hides the banner optimistically and asks the current
   *  `SandboxHost` to rebuild — a `retry()` that itself times out sets
   *  `sandboxUnavailable` again via the same callback. */
  function handleSandboxRetry(): void {
    setSandboxUnavailable(false);
    sandboxHostRef.current?.retry();
  }

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

    // R95 item 2: this run is the first one to see a freshly (re)constructed
    // `SandboxHost` -- clear the "already bound" record so the channel-bind
    // and FFT-bind effects below (which run after this one in the same
    // commit, since they share `primeState.primeEpoch` as a dependency)
    // treat every cell's binding as new again and resend it, rather than
    // skipping cells whose identity happens not to have changed since
    // before the pause.
    if (primeEpochSeenRef.current !== primeState.primeEpoch) {
      primeEpochSeenRef.current = primeState.primeEpoch;
      boundIdentityRef.current.clear();
    }

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
        retainedSpectraRef.current.delete(cellId);
      }
    }
    setFftErrors((prev) => {
      let next = prev;
      for (const cellId of prev.keys()) {
        if (!liveIds.has(cellId)) {
          if (next === prev) next = new Map(prev);
          next.delete(cellId);
        }
      }
      return next;
    });
    // `primeState.primeEpoch` (R95 item 2): a hidden -> visible transition
    // constructs a brand-new `SandboxHost` with none of this document's
    // cells or spans pushed into it yet -- this effect already is the code
    // that populates a first-mounted host, so a re-prime reuses it rather
    // than a second replay path, by re-running it even though
    // `state.cells`/`state.markdown`/`state.outputs` may not themselves
    // have changed.
  }, [state.cells, state.markdown, state.outputs, primeState.primeEpoch]);

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
      if (binding === null || binding.kind !== "time") {
        // An FFT binding is handled by the dedicated effect below; either
        // way, this cell has no time-viewport identity to compare against
        // here.
        if (binding === null) boundIdentityRef.current.delete(cellId);
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
  }, [state.cells, state.markdown, state.outputs, sessionDetail, sessionSpanUs, sessionId, primeState.primeEpoch]);

  // For each `js` cell whose binding is the FFT arm and whose
  // `bindingIdentity` changed (L6 Task 20, C2 §5.3), fetches its spectrum
  // through the shared `CellRunSequencer`, exactly the same start/isStale
  // shape `runChannelBind` above uses -- never a second counter. Depends
  // only on data (`state.cells`/`state.markdown`/`state.outputs`/
  // `sessionDetail`/`sessionSpanUs`/`sessionId`/`mainLap`), the tightened
  // IPC-effects rule (wave-2 operating brief §4); its cleanup cancels
  // nothing. `mainLap` (R83/L2b Task 6) is in the dependency array because
  // `bindingIdentity` folds `request.lap` into an FFT cell's identity: a
  // main-lap selection change must re-run this effect so the identity
  // comparison below actually sees the new lap and starts a refetch.
  //
  // A cell whose `unrequestable` is non-null never reaches `runFft` at all
  // -- the note it carries is shown by `renderJsCell` below straight from
  // `binding.unrequestable`, with no fetch and no host-variable push. A
  // cell whose identity changes away from its last-requested spectrum
  // drops any retained copy for it, so a stale spectrum is never re-pushed
  // under a hostVarName that no longer describes this cell's current
  // parameters.
  useEffect(() => {
    if (state.markdown === null || sessionId === null) return;
    const markdown = state.markdown;
    const sid = sessionId;

    for (const cell of state.cells) {
      if (cell.id === null || cell.kind !== "js") continue;
      const cellId = cell.id;
      const code = decodeByteRange(markdown, cell.bodyRange);
      const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis, mainLap);
      if (binding === null || binding.kind !== "fft") {
        // A cell that used to be an FFT cell (chart-type switch, or an
        // edit that now names a different channel) keeps no stale
        // retained spectrum around for a hostVarName nothing binds to
        // anymore.
        retainedSpectraRef.current.delete(cellId);
        continue;
      }

      const identity = bindingIdentity(binding);
      if (boundIdentityRef.current.get(cellId) === identity) continue;
      boundIdentityRef.current.set(cellId, identity);

      if (binding.unrequestable !== null) {
        retainedSpectraRef.current.delete(cellId);
        setFftErrors((prev) => {
          if (!prev.has(cellId)) return prev;
          const next = new Map(prev);
          next.delete(cellId);
          return next;
        });
        continue;
      }

      const fftBinding: FftCellBinding = binding;
      const deps: FftDeps = {
        fetchFft: (sessId, channelId, lap, params, averaging) => fetchFft(sessId, channelId, lap, params, averaging),
      };
      const dispatchFft = (action: FftAction) => {
        if (action.type === "spectrum") {
          // MAX_FFT_BINS is checked again here, after decode, against the
          // decoded spectrum's actual bin count -- the pre-fetch check in
          // `jsCellBinding.ts`'s `bindingForFft` is a conservative estimate
          // off the resolved window size, not a promise about the real FFT
          // convention `fetch_fft` used (R79 Q4, R80 Q2). Over the cap: show
          // the note, push no host variable, and never retain the spectrum.
          if (exceedsBinCap(action.fft.magnitudes.length)) {
            retainedSpectraRef.current.delete(action.cellId);
            setFftErrors((prev) =>
              new Map(prev).set(action.cellId, {
                kind: "internal",
                message: "This spectrum has more bins than the chart can draw — reduce the window size.",
              })
            );
            return;
          }
          retainedSpectraRef.current.set(action.cellId, { hostVarName: fftBinding.hostVarName, fft: action.fft });
          setFftErrors((prev) => {
            if (!prev.has(action.cellId)) return prev;
            const next = new Map(prev);
            next.delete(action.cellId);
            return next;
          });
          const f = frequencyAxisHz(action.fft);
          const m = Float64Array.from(action.fft.magnitudes);
          sandboxHostRef.current?.setSpectrumHostVar(fftBinding.hostVarName, f.length, f.buffer as ArrayBuffer, m.buffer as ArrayBuffer);
        } else {
          setFftErrors((prev) => new Map(prev).set(action.cellId, action.error));
        }
      };
      const seq = cellRunSequencerRef.current.start(cellId);
      const isStale = () => !cellRunSequencerRef.current.isCurrent(cellId, seq);

      void runFft(deps, sid, cellId, fftBinding.request, dispatchFft, isStale);
    }
  }, [state.cells, state.markdown, state.outputs, sessionDetail, sessionSpanUs, sessionId, mainLap, primeState.primeEpoch]);

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

  /** `CellFrame`'s `StatusDot` (UI-10): `"pending"` before an `eval_workbook`
   *  result exists for `cellId`, `"error"` when the cell's own output
   *  errors, its sandbox `cellError`, or its FFT fetch failure is set,
   *  `"ok"` otherwise. `cellId === null` (an unresolved fence id) always
   *  reads as pending -- it can never have an evaluated `CellOutput`
   *  (Rust indexes by id). */
  function cellStatus(cellId: string | null): CellRunStatus {
    if (cellId === null) return "pending";
    if (cellErrors.has(cellId)) return "error";
    if (fftErrors.has(cellId)) return "error";
    const output = state.outputs.get(cellId);
    if (output === undefined) return "pending";
    return output.errors.length > 0 ? "error" : "ok";
  }

  /** The message `CellFrame`'s error `NoteBlock` shows, in the same
   *  precedence `cellStatus` checks: a sandbox render error first (the most
   *  specific, cell-local failure), then an FFT fetch error, then
   *  `eval_workbook`'s own per-cell errors joined together. */
  function cellErrorMessage(cellId: string | null): string | undefined {
    if (cellId === null) return undefined;
    const sandboxError = cellErrors.get(cellId);
    if (sandboxError !== undefined) return sandboxError;
    const fftError = fftErrors.get(cellId);
    if (fftError !== undefined) return fftError.message;
    const output = state.outputs.get(cellId);
    if (output !== undefined && output.errors.length > 0) return output.errors.map((e) => e.message).join("; ");
    return undefined;
  }

  // The editor for the currently open cell (Task 15's `EditorPanes`), built
  // once here and placed differently depending on `placement`
  // (`model/editorPlacement.ts`): beside the output in a `Resizable` pane on
  // wide, inline under the selected cell's `CellFrame` on medium, and not at
  // all on narrow (`outputIsReadOnly` -- narrow's Properties form lives in a
  // `Sheet` instead, built separately below).
  const editorPanesElement =
    openCellId !== null && openCell !== null && openCellCode !== null && !outputIsReadOnly(placement) ? (
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
    ) : null;

  // The output register's CSS shape, applied to the one container both
  // layout branches below wrap `CellList` in -- `data-register` names the
  // value for anything that later wants a CSS hook; the actual styling is
  // these inline Tailwind-driven values, matching this app's existing
  // width-dependent-layout convention (`Data/index.tsx`'s `layout.railWidthPx`).
  const registerContainerStyle: CSSProperties = {
    fontFamily: registerCssMetrics.family === "sans" ? "var(--font-sans)" : "var(--font-mono)",
    ...(registerCssMetrics.measureCh !== null ? { maxWidth: `${registerCssMetrics.measureCh}ch`, marginInline: "auto" } : {}),
  };

  const cellListElement = (
    <CellList
      doc={{ frontMatterRange: null, cells: state.cells }}
      proseBlocks={proseBlocksByBlockId}
      outputs={state.outputs}
      inlineResults={inlineResults}
      spanErrors={spanErrors}
      renderJsCell={(cellId) => {
            const cell = state.cells.find((c) => c.id === cellId);
            const code = cell !== undefined && state.markdown !== null ? decodeByteRange(state.markdown, cell.bodyRange) : "";
            const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis, mainLap);
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
              // `model/jsCellNote.ts` (L6 Task 21): fixes the rendering gap
              // the 2026-09-06 preview captured -- a cell whose code
              // round-trips through `plotForm.parse` but has no session
              // selected previously reserved blank space with no
              // explanation at all.
              const note = jsCellNote({
                isFormGenerated: parsePlotForm(code) !== null,
                sessionId,
                unresolvedName: unresolved,
                isAxisLessDefinition,
              });
              return (
                <JsCellFrame cellId={cellId} heightPx={heightPx} error={cellErrors.get(cellId)} note={note ?? undefined} sendLayout={sendLayout} />
              );
            }

            if (binding.kind === "fft") {
              // L6 Task 20 (R78 Task 19's Q2 precedent, R78 Task 18's Q2):
              // an FFT cell has no time viewport, so it mounts the plain
              // `JsCellFrame` -- no pan, no zoom, no hover readout, no
              // cursor readout, and no `sendTransform`. `unrequestable`
              // (too few samples, or over the bin cap) shows its reason in
              // the note slot and never reaches `runFft` at all (the FFT
              // bind effect above); a real fetch failure shows the typed
              // error's message instead.
              const fftError = fftErrors.get(cellId);
              const note = binding.unrequestable ?? (fftError !== undefined ? fftError.message : undefined);
              return <JsCellFrame cellId={cellId} heightPx={heightPx} note={note} sendLayout={sendLayout} />;
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
                cursorTUs={sharedCursorTUs}
                playing={playback.playing}
                onSetCursor={(tUs) => setManualCursorTUs(BigInt(Math.round(tUs)))}
                onClearCursor={() => setManualCursorTUs(null)}
                onToggleCode={() => setRevealedCells((prev) => toggleCode(prev, cellId))}
              />
            );
          }}
          frame={(cell, output, index) => (
            <CellFrame
              cell={cell}
              index={index}
              selected={cell.id !== null && selectedCellId === cell.id}
              onSelect={() => {
                if (cell.id !== null) setSelectedCellId(cell.id);
              }}
              status={cellStatus(cell.id)}
              error={cellErrorMessage(cell.id)}
              codeVisible={cell.id !== null && isCodeVisible(revealedCells, cell.id)}
              onToggleCode={() => {
                const cellId = cell.id;
                if (cellId === null) return;
                setRevealedCells((prev) => toggleCode(prev, cellId));
              }}
              code={state.markdown !== null ? decodeByteRange(state.markdown, cell.bodyRange) : undefined}
            >
              {output}
              {/* Medium layout (decision 29): the editor sits inline, under
                  the selected cell's own frame, rather than at the bottom of
                  the whole document. */}
              {placement === "inline" && cell.id !== null && cell.id === openCellId && editorPanesElement}
            </CellFrame>
          )}
        />
  );

  return (
    <div className="flex h-full flex-col">
      <PlaybackTransport
        playing={playback.playing}
        cursorTUs={sharedCursorTUs}
        onToggle={handleTogglePlay}
        disabled={!primeState.running}
        routeVisible={routeVisible}
      />
      {sandboxUnavailable && (
        <NoteBlock role="alert" className="border-brand-accent text-brand-accent flex items-center justify-between gap-3">
          <span>The cell runtime failed to start, so cell output is unavailable.</span>
          <button
            type="button"
            onClick={handleSandboxRetry}
            className="shrink-0 rounded-[var(--radius-structural)] border border-rule px-2 py-1 font-mono text-label-2 text-fg-dim hover:text-fg"
          >
            Retry
          </button>
        </NoteBlock>
      )}
      {functionCatalogMismatches.length > 0 && (
        <p role="status" className="notebook-function-catalog-warning">
          The function reference is out of date with the engine ({functionCatalogMismatches.length} mismatch
          {functionCatalogMismatches.length === 1 ? "" : "es"}). Completions and signatures may be inaccurate for
          those functions.
        </p>
      )}
      {(entry === null || entry.kind === "empty") && (
        <WorkbookBar
          entry={entry}
          rescanning={rescanning}
          creating={creating}
          dirty={false}
          error={workbookBarError}
          lastRebuild={lastRebuild}
          register={register}
          onCreate={(name) => void handleCreate(name)}
          onRescan={() => void handleRescan()}
          onSelect={handleSelect}
          onRegisterChange={handleRegisterChange}
        />
      )}
      {state.markdownStatus === "error" && state.markdownError !== null && (
        <p className="workbook-markdown-error">Notebook error: {state.markdownError}</p>
      )}
      {state.evalError !== null && (
        <p role="alert" className="workbook-eval-error">
          {state.evalError.message}
        </p>
      )}
      {selectedWorkbookId !== null && state.handle === null && state.markdownStatus === "loading" && <p>Opening notebook...</p>}
      {state.handle !== null && (
        <div className="workbook-save-bar">
          {entry !== null && entry.kind !== "empty" && (
            <WorkbookBar
              entry={entry}
              rescanning={rescanning}
              creating={creating}
              dirty={state.dirtyCellIds.size > 0}
              error={workbookBarError}
              lastRebuild={lastRebuild}
              register={register}
              onCreate={(name) => void handleCreate(name)}
              onRescan={() => void handleRescan()}
              onSelect={handleSelect}
              onRegisterChange={handleRegisterChange}
            />
          )}
          <button type="button" onClick={() => void handleSave()} disabled={saveUnavailable || saveFlowState.status === "saving"}>
            {saveFlowState.status === "saving" ? "Saving…" : "Save"}
          </button>
          {saveUnavailable && <span className="workbook-save-unavailable">save not available yet (the document's text could not be read)</span>}
          {saveFlowState.status === "error" && <span className="workbook-save-error">save failed: {saveFlowState.error.message}</span>}
        </div>
      )}
      {state.conflict && <ConflictBanner onReloadFromDisk={() => void handleReloadFromDisk()} onOverwrite={() => void handleOverwrite()} />}
      {state.handle !== null && placement === "panes" && (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="notebook-editor-output" defaultSize={65} minSize={30}>
            <div className="h-full overflow-auto p-4" data-register={register} style={registerContainerStyle}>
              {cellListElement}
            </div>
          </ResizablePanel>
          {editorPanesElement !== null && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="notebook-editor-panes" defaultSize={35} minSize={20}>
                <div className="h-full overflow-auto">{editorPanesElement}</div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
      {state.handle !== null && placement === "inline" && (
        <div className="min-h-0 flex-1 overflow-auto p-4" data-register={register} style={registerContainerStyle}>
          {cellListElement}
        </div>
      )}
      {state.handle !== null && placement === "sheet" && (
        <>
          <div className="min-h-0 flex-1 overflow-auto p-4" data-register={register} style={registerContainerStyle}>
            {cellListElement}
          </div>
          <BrandSheet
            open={openCellId !== null && openCell?.kind === "js"}
            onOpenChange={(open) => {
              if (!open) setSelectedCellId(null);
            }}
            title="Cell properties"
          >
            {openCellId !== null && openCell !== null && openCell.kind === "js" && openCellCode !== null && (
              <PropertiesForm
                code={openCellCode}
                channels={propertiesChannels}
                laps={propertiesLaps}
                unitsPreference="si"
                onChange={(nextCode) => handleCellCodeChange(openCellId, nextCode)}
              />
            )}
          </BrandSheet>
        </>
      )}
      <div
        ref={containerRef}
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, border: "none" }}
      />
    </div>
  );
}
