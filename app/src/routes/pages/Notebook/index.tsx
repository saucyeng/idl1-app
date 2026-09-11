import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getVersion } from "@tauri-apps/api/app";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { setStudioColumnVisible } from "../../../shell/studioColumns";
import { noteColumnsChangedByHand, setActiveLayoutPreset, useActiveLayoutPreset } from "../../../shell/layoutPreset";
import { presetLayout, type LayoutPresetId } from "../../../shell/layoutPresets";
import { BrandSheet } from "@/components/brand/BrandSheet";
import { NoteBlock } from "@/components/brand/NoteBlock";
import { listSessions, listWorkbooks, getSession, type SessionDetail, type SessionSummary } from "../../../ipc/catalog";
import { startRebuildJob, whenRebuildFinishes, type RebuildRunSummary } from "../../../ipc/rebuild_job";
import { cursorReadout } from "../../../ipc/cursor";
import { fetchFftV2, type DecodedFft } from "../../../ipc/rasters";
import { fetchTile } from "../../../ipc/tiles";
import {
  createWorkbook,
  evalWorkbookV2,
  fetchHostChannelV2,
  listMathBuiltins,
  openWorkbook,
  readWorkbook,
  saveWorkbook,
  unwatchWorkbook,
  watchWorkbook,
  type CellOutput,
  type IpcError,
  type UnitLabel,
  type Window as WireWindow,
  type WindowEval,
} from "../../../ipc/workbook";
import { useAppState } from "../../../state/AppState";
import { describeWindow, sessionDetailsReadinessKey, sessionLabel, venueLabel, windowKey, windowsKey, type SelectionWindow } from "../../../state/selection";
import { useRouteVisible } from "../../../shell/routeVisibility";
import { useEditorSlotNode } from "../../../shell/editorSlot";
import { useGraphSlotNode } from "../../../shell/graphSlot";
import { useToolbarSlotNode } from "../../../shell/toolbarSlot";
import { useSidebarSlotNode } from "../../../shell/sidebarSlot";
import { useCommand } from "../../../shell/commandRegistry";
import { MENU_COMMAND_IDS } from "../../../shell/menuModel";
import { publishMemoryUse } from "../../../shell/memoryBudget";
import { ColumnPlaceholder } from "../../../shell/ColumnFrame";
import { resolveRegister, type PaperTheme, type ThemeChoice } from "../Settings/theme";
import { createPrefsStore, localStorageBackend } from "../Settings/prefsStore";
import CellFrame from "./components/CellFrame";
import { cellStatus, type CellStatus } from "./model/cellStatus";
import CellList from "./components/CellList";
import ReportView from "./components/ReportView";
import PaperView from "./components/PaperView";
import { buildReportDocument, type ReportDocument } from "./model/report/document";
import ChartCell from "./components/ChartCell";
import ConflictBanner from "./components/ConflictBanner";
import MigrationBanner from "./components/MigrationBanner";
import VersionBanner from "./components/VersionBanner";
import { engineVersionBanner } from "./model/engineVersionBanner";
import { fetchEngineVersion } from "../../../ipc/engine";
import EditorPanes from "./components/EditorPanes";
import JsCellFrame, { DEFAULT_JS_CELL_HEIGHT_PX } from "./components/JsCellFrame";
import type { PropertiesFormChannelOption, PropertiesFormLapOption } from "./components/PropertiesForm.types";
import TimelineStrip from "./components/TimelineStrip";
import NotebookToolbar from "./components/NotebookToolbar";
import { WorkbookNotices } from "./components/WorkbookBar";
import NotebookSidebar from "./components/NotebookSidebar";
import { NewWorkbookDialog, OpenWorkbookDialog } from "./components/WorkbookMenuDialogs";
import GraphCanvas from "./graph/GraphCanvas";
import { combineSpectrumWindows, type SandboxCell, type SpectrumWindowSeries, type WindowDescriptor } from "./host/protocol";
import { SandboxHost } from "./host/SandboxHost";
import { PING_INTERVAL_MS } from "./host/watchdog";
import { NotebookSession } from "./host/NotebookSession";
import { dropCellHeight, initialCellHeights, recordCellHeight, type CellHeights } from "./model/cellLayout";
import { replaceCellBody } from "./model/cells";
import { changedCellIds } from "./model/documentRanges";
import { displayNameFor, documentCellDisplayNames, setCellLabelLine } from "./graph/cellDisplayName";
import {
  runChannelBind,
  runChannelSettle,
  updateChannelBindIdentity,
  type BindWindow,
  type ChannelBindAction,
  type ChannelBindDeps,
  type ChartWindow,
  type CombinedChannelPayload,
} from "./model/channelBindDriver";
import { channelDataKeysForCell, channelDataKeysToEvict } from "./model/channelDataRetention";
import { CellRunSequencer } from "./model/cellRunSequencer";
import { isCodeVisible, toggleCode } from "./model/codeVisibility";
import { isShowCodeShortcut, plotLegendEntries } from "./model/plotChrome";
import { cellLabelFromBody } from "./graph/cellDisplayName";
import { denseChromeMode, readDenseMode, sharesXAxisAbove, writeDenseMode } from "./model/denseMode";
import { createCursorBus, type CursorBus } from "./interaction/cursorBus";
import { BASIC_MOUSE_PRESET, findInputMapPreset, INPUT_MAP_PRESETS, type InputMapPreset } from "./interaction/inputMap";
import { playableSpanUs, setSpeed, tick, togglePlay, type PlaybackState } from "./interaction/playback";
import type { PlaybackMode } from "./interaction/playbackMode";
import { editorPlacement } from "./model/editorPlacement";
import { paperViewActive } from "./model/paperView";
import { paperLiveDecision } from "./model/paperLive";
import { editorContentFor, sheetTitleFor } from "./model/editorContent";
import { effectivePaperTheme } from "./model/report/paperPalette";
import { resolveEditorHost } from "./model/editorHost";
import { resolveGraphHost } from "./model/graphHost";
import { runFft, type FftAction, type FftDeps } from "./model/fftDriver";
import { exceedsBinCap, frequencyAxisHz } from "./model/fftRequest";
import { diffFunctionCatalog, type FunctionCatalogMismatch } from "./model/functionCatalog";
import { primaryWindowOutputs, sessionDetailsBySessionId } from "./model/graphView";
import { bindingFor, bindingIdentity, unresolvedChannelId, type FftCellBinding } from "./model/jsCellBinding";
import { extractChannelCalls, extractSpectrumCalls } from "./model/jsCellCalls";
import { jsCellNote, primaryWindowNote } from "./model/jsCellNote";
import { definitionCellIds } from "./model/graphModel";
import { fixTargetCellId } from "./model/fixTarget";
import {
  notebookColumnVisibilityFrom,
  readNotebookColumnVisibility,
  visibleNotebookColumnIds,
  writeNotebookColumnVisibility,
  type NotebookColumnVisibility,
} from "./model/notebookColumns";
import { readNotebookPrefs, writeNotebookPrefs } from "./model/notebookPrefs";
import { runEval, runOpenAndEval, type OpenEvalDeps } from "./model/openEvalDriver";
import { registerMetrics } from "./model/outputRegister";
import { proseBlocksFor, spansToEvaluate } from "./model/proseBlocks";
import { isSelfWrite, saveFlow, type SaveFlowState, type WorkbookEventWithHash } from "./model/saveFlow";
import { initialSandboxPrimeState, nextSandboxPrimeState } from "./model/sandboxLifecycle";
import { runSessionSpan, type SessionSpanAction, type SessionSpanDeps } from "./model/sessionSpanDriver";
import { commitSharedViewport, viewportForCell, type SharedViewport } from "./model/sharedViewport";
import { DEFAULT_CACHE_BYTES, TileCache } from "./model/tileCache";
import { timelineCommit } from "./model/timelineStrip";
import { resolvedWindowKeysFor, toWireWindow, windowSpanFor } from "./model/viewportWindows";
import { chooseWorkbookEntry, type WorkbookEntry } from "./model/workbookEntry";
import { resolveXMode, X_MODE_OPTIONS, type XMode } from "./model/xMode";
import { initialWorkbookState, isWindowStale, NO_WINDOW_KEY, workbookReducer } from "./model/workbookState";

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

/** Builds `w`'s `WindowDescriptor` (`host/protocol.ts`) for the sandbox
 *  host-var payload -- `label` is human-facing (rendered by a chart's own
 *  legend, per ruling R117 item 6/`state/selection.ts`'s `describeWindow`
 *  doc comment: a raw `sessionId` must never reach it), so this always
 *  goes through `describeWindow` with a resolved venue name, never the id
 *  itself. `detail` is `sessionDetailsByWindow`'s entry for `w` -- `null`
 *  while still resolving, which reads as the same "(none)" venue text a
 *  session with no venue set would.
 *
 *  Names the session through `state/selection.ts`'s shared `sessionLabel`
 *  (ruling R169, amended): a chart legend, the top-bar chip and the report
 *  all label the same window for the same reader, so all three must say the
 *  same thing -- this file's own `(none)` literal was the fourth copy R169
 *  set out to remove. */
function windowDescriptorFor(w: SelectionWindow, detail: SessionDetail | null): WindowDescriptor {
  const name = detail === null ? venueLabel("") : sessionLabel(detail);
  return { sessionId: w.sessionId, span: toWireWindow(w).span, colour: w.colour, label: describeWindow(w, name) };
}

/**
 * Builds `model/channelBindDriver.ts`'s `BindWindow[]` for every entry of
 * `windows`, in order (S1 Task 11b, ruling R131 Q2) -- `windows[0]` stays
 * the primary window in the result, matching this file's own "primary
 * window" convention. Each window's own absolute `[startUs, endUs)` is
 * resolved via `model/viewportWindows.ts`'s `resolveWindowSpan`, reading
 * `detailsByWindow`'s entry for that window (`sessionDetailsByWindow`,
 * already resolved per selected window for the FFT arm, R115) -- **not**
 * fetched here.
 *
 * A window whose `SessionDetail` hasn't resolved yet, whose `"lap"` span
 * names a lap not present in `laps[]`, or whose `"session"` span has no
 * recorded duration yet (`spanUsByWindow`, plan Task 3 -- the `Infinity`
 * sentinel `resolveWindowSpan` used to fall back to no longer exists), is
 * dropped from the result rather than blocking every other window (the same
 * per-window failure isolation `channelBindDriver.ts` itself applies
 * downstream, R121) -- **except** the primary window (`windows[0]` of the
 * input): if it can't be resolved there is no viewport coordinate frame to
 * re-base any other window onto, so the whole result is `[]` and the
 * caller's effect skips this cell's bind entirely, same as today's "no
 * primary window" early return.
 */
/**
 * `windowSpanFor`/`resolvedWindowKeysFor` (`model/viewportWindows.ts`, R138
 * fix) are the single predicate this function and the channel-bind effect's
 * identity gate below both build on -- see that module's own doc comments.
 * Moved out of this file so they're unit-testable (this file imports
 * `@/components/*`, unresolvable in vitest's node test environment).
 */
function bindWindowsFor(
  windows: readonly SelectionWindow[],
  detailsByWindow: ReadonlyMap<string, SessionDetail | null>,
  spanUsByWindow: ReadonlyMap<string, number | null>
): BindWindow[] {
  const result: BindWindow[] = [];
  for (const w of windows) {
    const span = windowSpanFor(w, detailsByWindow, spanUsByWindow);
    if (span === null) {
      if (result.length === 0) return [];
      continue;
    }
    const detail = detailsByWindow.get(windowKey(w)) ?? null;
    result.push({ sessionId: w.sessionId, span, descriptor: windowDescriptorFor(w, detail) });
  }
  return result;
}

/** The `cellRunSequencerRef`/`fftBoundIdentityRef` composite key for one
 *  FFT cell's one window's fetch (S1 Task 11a) -- `CellRunSequencer`
 *  accepts any string, so a per-(cell, window) key lets one window's
 *  fetch supersede only its own sibling runs, never a different window's
 *  in-flight fetch for the same cell (ruling R129: each window's spectrum
 *  is independent). The delimiter cannot collide with a real C2
 *  fence-string cell id. */
function fftRunKey(cellId: string, windowKeyValue: string): string {
  return `${cellId}|fft|${windowKeyValue}`;
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

/** `buildReportDocument`'s `appVersion`, as the paper view passes it
 *  (ruling R184). The builder reads this field for the `cover` block
 *  alone, and `model/report/paperDocument.ts` drops `cover` on screen, so
 *  paper never renders it. A fixed placeholder rather than a real
 *  `getVersion()` call: fetching a version for a block that is discarded
 *  would make every settle an await, and the string is deliberately one no
 *  reader could mistake for a version if a future change ever did print
 *  it. */
const PAPER_UNPRINTED_APP_VERSION = "not applicable on screen";

/** `buildReportDocument`'s `generatedAtMs`, as the paper view passes it --
 *  same reasoning as {@link PAPER_UNPRINTED_APP_VERSION}, plus one of its
 *  own: `Date.now()` here would make each rebuild produce a document that
 *  differs from the last even when nothing about the workbook changed. */
const PAPER_UNPRINTED_GENERATED_AT_MS = 0;

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
  const [appState, appDispatch] = useAppState();
  /** `AppState.selection` (C1 §6.1, ruling R111/R115/R117): an ordered list
   *  of {@link SelectionWindow}s, superseding the old `{ sessionId,
   *  lapContext }` pair outright (S1 Task 11a). Every consumer below either
   *  loops it (the FFT bind effect: full multi-window overlay, ruling
   *  R129) or reads its first entry as the page's one "primary" window
   *  (`primaryWindow` below) for everything this task does not extend to
   *  true multi-window rendering yet -- math/table cell values and the
   *  time-chart channel-bind pipeline (`channelBindDriver.ts`, deferred to
   *  Task 11b per ruling R131). A documented S1 Task 11a judgment call, not
   *  a value any ruling states: R121's "per-window failures render in
   *  place" is, by its own wording ("shows where its series would be"),
   *  about chart series -- this task extends true per-window rendering to
   *  FFT charts (fully supported by `combineSpectrumWindows` already) and
   *  keeps every other cell kind showing its one primary window's value,
   *  same as before multi-window existed. */
  const windows = appState.selection;
  /** A stable identity for the *whole* selected list (`state/selection.ts`'s
   *  `windowsKey`) -- the effect-dependency key every IPC-driving effect
   *  below keys on instead of `windows`' own array identity (operating
   *  brief §4's tightening). */
  const windowsKeyValue = windowsKey(windows);
  /**
   * Decision 61: every currently selected window's own lookup key, for
   * `ChartCell`'s `selectedWindowKeys` prop (`model/cursorCard.ts`'s own
   * doc comment) -- memoized on `windowsKeyValue` rather than rebuilt
   * every render, since it is handed to a `useCallback`'s dependency array
   * (`handlePointerMove`) and a fresh `Set` identity there would rebuild
   * that callback (and its pointer-capture closures) every render for no
   * reason.
   */
  const selectedWindowKeys = useMemo(() => new Set(windows.map(windowKey)), [windowsKeyValue]); // eslint-disable-line react-hooks/exhaustive-deps
  /** This page's one "primary" window -- see the `windows` doc comment
   *  above. `null` when nothing is selected. */
  const primaryWindow: SelectionWindow | null = windows[0] ?? null;
  /** `primaryWindow`'s `workbookState.ts` lookup key (`windowKey`/
   *  `wireWindowKey` produce the identical string for the same window) --
   *  `NO_WINDOW_KEY` when nothing is selected, matching
   *  `evalWorkbookV2([])`'s own "nothing selected" result key. */
  const primaryKey = primaryWindow !== null ? windowKey(primaryWindow) : NO_WINDOW_KEY;

  const [state, dispatch] = useReducer(workbookReducer, initialWorkbookState);
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());
  const [cellHeights, setCellHeights] = useState<CellHeights>(initialCellHeights);
  const [inlineResults, setInlineResults] = useState<Map<string, string>>(new Map());
  const [spanErrors, setSpanErrors] = useState<Map<string, string>>(new Map());
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  /** Which of the three Notebook-local panes (maths graph, properties/code,
   *  cells) the top toolbar's leading group currently shows (ruling R161)
   *  -- generalises the old binary Graph/Cells view toggle: showing or
   *  hiding a pane is the same gesture, extended from two mutually
   *  exclusive states to three independent ones. Read once at mount
   *  (`readNotebookColumnVisibility`'s own per-machine default reproduces
   *  the old `graphViewOpen = false` starting state byte-for-byte: cells
   *  on, graph off). */
  const [columnVisibility, setColumnVisibility] = useState(() => readNotebookColumnVisibility());

  /** Ruling R216 item 3's "Dense" stacking option, remembered per machine
   *  beside `notebookColumns` (`model/denseMode.ts`). A view preference,
   *  never part of a workbook and never synced: it changes gaps, padding
   *  and chrome, and nothing a number depends on. */
  const [dense, setDense] = useState(() => readDenseMode());

  function applyDense(next: boolean): void {
    setDense(next);
    writeDenseMode(next);
  }

  // R208 item 2: publishes this page's own Graph toggle to the shell, so
  // `RouteHost.tsx` can drop the studio's maths column entirely when it is
  // off rather than dock a full-width panel holding a placeholder that
  // names the toggle. Data-only dependency array (a boolean); the store's
  // own setter is module-scope and idempotent, so this is a plain state
  // mirror, not an IPC or subscription effect.
  //
  // `useLayoutEffect`, not `useEffect`: the store defaults to "visible", so
  // a machine whose stored preference is graph-off would otherwise paint
  // one frame with the maths column docked before a passive effect could
  // correct it. This runs before that paint, so the first frame is already
  // right.
  useLayoutEffect(() => {
    setStudioColumnVisible("graph", columnVisibility.graph);
    setStudioColumnVisible("properties", columnVisibility.properties);
  }, [columnVisibility.graph, columnVisibility.properties]);

  /** The active layout preset for this machine's current viewport shape
   *  (ruling R213). The shell owns it (`shell/layoutPreset.ts`, persisted
   *  per aspect class); this page owns the column visibility a preset
   *  *writes*, which is why the two meet here. */
  const activePreset = useActiveLayoutPreset();

  // R213 item 3: "applying a preset writes the column visibility the R161
  // toggles already read, so the toggles and the preset never disagree".
  // Runs whenever the active preset changes — including at mount, when the
  // shell has just recalled this viewport shape's remembered preset, and
  // including a re-pick of the preset the class left for `"custom"`.
  // `"custom"` is the one value that writes nothing: it means "whatever the
  // toggles say", so the stored R161 visibility stands untouched.
  //
  // `useLayoutEffect` for the same reason the publish above uses it: the
  // column frame reads the result through `studioColumns.ts`, and a passive
  // effect would paint one frame of the previous arrangement first.
  useLayoutEffect(() => {
    if (activePreset === "custom") return;
    const next = presetLayout(activePreset).columns;
    setColumnVisibility((prev) => {
      if (prev.graph === next.graph && prev.properties === next.properties && prev.cells === next.cells) return prev;
      writeNotebookColumnVisibility(next);
      return next;
    });
  }, [activePreset]);

  /** Persists the toolbar column toggle group's whole next set of on-ids.
   *  The group reports the full selection rather than the one item that
   *  changed (`type="multiple"`), so this replaced the per-id
   *  `toggleNotebookColumn` call site; that function stays the model's
   *  single-id entry point for a future keyboard/menu binding. The
   *  never-all-off guard lives in `model/notebookColumns.ts` either way. */
  function applyColumnToggleValue(ids: string[]): void {
    setColumnVisibility((prev) => {
      const next = notebookColumnVisibilityFrom(prev, ids);
      writeNotebookColumnVisibility(next);
      // R213 item 3: a column thrown by hand moves this viewport shape to
      // "custom" unless the new set is still the active preset's own — so
      // the picker never claims an arrangement that is no longer on screen.
      // The never-all-off guard above runs first, so what is reported here
      // is what the toggles actually became.
      noteColumnsChangedByHand(next);
      return next;
    });
  }

  /** Applies a preset picked from the toolbar's view group (R213 item 3).
   *  Writes only the shell store; the column visibility follows through the
   *  `activePreset` effect above, so a preset picked here and one applied by
   *  `Ctrl+Shift+L` take exactly the same path. */
  function applyLayoutPreset(id: LayoutPresetId): void {
    setActiveLayoutPreset(id);
  }
  /** One entry per window this page has resolved a `SessionDetail` for
   *  (`model/sessionSpanDriver.ts`'s `runSessionSpan`, called once per
   *  selected window -- R127's accepted item), keyed by `windowKey`. An
   *  FFT cell's binding (`jsCellBinding.ts`'s `bindingForFft`) needs every
   *  selected window's own channel list, since two windows may (R115) name
   *  different sessions entirely; every other consumer reads only
   *  `primaryWindow`'s entry (see the `windows` doc comment above). */
  const [sessionDetailsByWindow, setSessionDetailsByWindow] = useState<Map<string, SessionDetail | null>>(new Map());
  /** `primaryWindow`'s recorded session span, in µs -- unaffected by which
   *  lap/range is selected (`sessionSpanDriver.ts`'s own doc comment); only
   *  ever resolved for the primary window (unused by the FFT arm, per
   *  `jsCellBinding.ts`'s `bindingFor` doc comment). */
  const [sessionSpanUs, setSessionSpanUs] = useState<number | null>(null);
  /** Every selected window's own recorded session span, in µs, keyed by
   *  `windowKey` (plan Task 3, ruling R134: `resolveWindowSpan`'s
   *  `"session"` arm needs *this* window's own recorded duration, not only
   *  the primary window's `sessionSpanUs` above -- a `"session"` window in
   *  a non-primary slot was previously fetched as `[0, Infinity)`, the
   *  sentinel this task removes). Populated by the same per-window
   *  `runSessionSpan` loop that already fills `sessionDetailsByWindow`;
   *  `null` for a window whose span hasn't resolved (or failed to). */
  const [sessionSpanUsByWindow, setSessionSpanUsByWindow] = useState<Map<string, number | null>>(new Map());
  const [chartWindows, setChartWindows] = useState<Map<string, ChartWindow>>(new Map());
  /**
   * One combined multi-window payload per (cell, channel) -- `${cellId}::
   * ${channelId}` -- retained from `channelBindDriver.ts`'s own
   * `"channelData"` action instead of being dropped after
   * `setChannelHostVar` (ruling R139). A plain ref, not React state:
   * updated inside `onAction` alongside `setChannelHostVar` itself (a
   * side effect, not a render input on its own), and read back out only
   * when `ChartCell`'s own props are computed each render -- the same
   * "cheap ref mutated at commit-relevant times, read on next render"
   * shape as `sessionDetailsByWindowRef` below. The `chartWindow`/
   * `boundChannels` actions dispatched alongside every `"channelData"`
   * action already call `setState`, so the next render this ref's new
   * value is read in is never more than one commit stale.
   */
  const combinedChannelDataRef = useRef<Map<string, CombinedChannelPayload>>(new Map());
  /** Bumped every time `combinedChannelDataRef` above gains new combined
   *  arrays. That ref is deliberately a ref -- the cell list reads it
   *  during render and must not re-render for it -- but the paper view's
   *  document (ruling R184) is rebuilt by an effect, and an effect cannot
   *  depend on a mutation no render ever hears about. Without this counter
   *  a chart's data landing after paper's last rebuild would leave that
   *  chart an `absence` block until something unrelated changed. */
  const [channelDataEpoch, setChannelDataEpoch] = useState(0);
  /**
   * The worksheet's one shared X range (decision 52, Task 4) --
   * `chartWindows`' per-cell `Viewport`s are still where each cell's own
   * settled `tiles` live, but the *time range* half of every chart's
   * `viewport` prop below reads through this instead once it is non-`null`.
   * Starts `null` -- "no gesture has settled anywhere yet" -- so a freshly
   * opened workbook still shows each binding's own `initialSpan` (which can
   * legitimately differ per cell before the user has ever panned/zoomed);
   * the first settle in *any* chart (`onViewportSettled` below) commits it,
   * and every mounted chart's `viewport` prop then reads the same range
   * from that point on. Never `Infinity`/a sentinel -- `null` is the only
   * "not yet known" state (plan §3.4's rule).
   */
  const [sharedViewport, setSharedViewport] = useState<SharedViewport | null>(null);
  const [functionCatalogMismatches, setFunctionCatalogMismatches] = useState<FunctionCatalogMismatch[]>([]);
  /** An FFT cell's per-window `fetch_fft_v2` failures (L6 Task 20,
   *  migrated to per-window in S1 Task 11a), typed -- never a bare string
   *  (CLAUDE.md §5) -- keyed `cellId` -> `windowKey`. `cellErrorMessage`
   *  below joins a cell's own entries into one displayed string (R121's
   *  "shows where its series would be" -- one note slot per cell, exactly
   *  as before multi-window FFT existed, just describing more than one
   *  window's failure when more than one fails). */
  const [fftErrors, setFftErrors] = useState<Map<string, Map<string, IpcError>>>(new Map());
  const sessionDetail = primaryWindow !== null ? (sessionDetailsByWindow.get(windowKey(primaryWindow)) ?? null) : null;
  /** Changes exactly when the set of selected windows with a resolved
   *  `SessionDetail` changes -- the readiness dependency the channel-bind
   *  and FFT effects below key on, so a non-primary window's detail
   *  arriving (independently, asynchronously, in no particular order --
   *  `sessionSpanDriver.runSessionSpan`) re-runs those effects even though
   *  `sessionDetail` (the primary window's entry) hasn't changed. See
   *  `state/selection.ts`'s `sessionDetailsReadinessKey` doc comment. */
  const sessionDetailsReadiness = sessionDetailsReadinessKey(windows, sessionDetailsByWindow);
  /** Same shape as {@link sessionDetailsReadiness}, over
   *  {@link sessionSpanUsByWindow} instead -- plan Task 3: `bindWindowsFor`
   *  now needs a `"session"`-kind window's own recorded span (not only its
   *  `SessionDetail`) to resolve it at all (the `Infinity` sentinel this
   *  task removes used to make that resolution instant). Without this as
   *  its own dependency, a window's span resolving *after* its
   *  `SessionDetail` already had (R133's "an effect's dependency array and
   *  an inner identity cache are two staleness gates" — this is the deps
   *  array itself missing a value the effect body now reads) would leave
   *  that window's channel data never fetched until some unrelated
   *  dependency happened to change. */
  const sessionSpansReadiness = sessionDetailsReadinessKey(windows, sessionSpanUsByWindow);
  /** `primaryWindow`'s own `WindowEvalState` entry (ruling R131 Q1), or
   *  `undefined` while still pending -- every math/table cell, prose span
   *  and completion list below reads this one window's result, same as
   *  before multi-window existed (see the `windows` doc comment above for
   *  why this is a scoped S1 Task 11a judgment call, not full per-window
   *  cell rendering). */
  const primaryEval = state.windows.get(primaryKey);
  /** The outputs a single-window-oriented consumer reads -- `primaryEval`'s
   *  own map when it succeeded, otherwise empty (pending or errored: an
   *  errored primary window has no per-cell outputs to show, its own
   *  `IpcError` is surfaced separately, see `evalErrorMessage` below). */
  const primaryOutputs: ReadonlyMap<string, CellOutput> = primaryEval?.kind === "ok" ? primaryEval.outputs : new Map();
  /** The page-level error banner (below the `WorkbookBar`) -- a whole-call
   *  `evalWorkbookV2` rejection (unknown/unparseable workbook id) or, when
   *  nothing is selected, a rejection of the "nothing selected" call
   *  itself; both key under `NO_WINDOW_KEY` (see that constant's doc
   *  comment in `model/workbookState.ts`). Replaces the pre-Task-11a flat
   *  `state.evalError` field. */
  const evalErrorMessage = state.windows.get(NO_WINDOW_KEY);
  const evalError: IpcError | null = evalErrorMessage?.kind === "error" ? evalErrorMessage.error : null;
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
  /** The last finished rebuild's counts, for `WorkbookBar`'s "Rescan found
   *  N workbook(s)" line (R81 Q6). Read from `rebuild_status().last_run`
   *  once the background job lands (ruling R219), not from a command's
   *  return -- no route awaits a rebuild any more. */
  const [lastRebuild, setLastRebuild] = useState<RebuildRunSummary | null>(null);
  /** Task R2 (ruling R166): the report currently mounted into `#report-
   *  print-root` for `window.print()`, or `null` when no export is in
   *  flight. Set by `handleExportReport`, cleared once printing finishes
   *  (the `afterprint` effect below) -- never left mounted between exports,
   *  since a stale report reprinted by a second `Ctrl+P` would be wrong. */
  const [reportDoc, setReportDoc] = useState<ReportDocument | null>(null);
  /** True while `handleExportReport` is building the document (a
   *  `listSessions` + `getVersion` round trip) -- disables the button so a
   *  second click cannot race the first. */
  const [exportingReport, setExportingReport] = useState(false);
  /** Decision 62: the live engine's own version (`fetchEngineVersion`,
   *  C3 §3.1 -- never fails), fetched once on mount since it cannot change
   *  while this app instance is running. `null` until that first call
   *  resolves; the banner effect below simply has nothing to compare yet. */
  const [currentEngineVersion, setCurrentEngineVersion] = useState<string | null>(null);
  /** Decision 62: each currently selected session's own recorded
   *  `engine_version` (`SessionSummary`, C1 §4.3), refreshed whenever the
   *  selection changes. Only the sessions windows are keyed for
   *  (`sessionId`) -- unrelated sessions are dropped, not accumulated. */
  const [sessionEngineVersions, setSessionEngineVersions] = useState<Map<string, string>>(new Map());
  /** Every catalog session the current selection could name, for the paper
   *  view's own document build (ruling R184) -- `buildReportDocument` reads
   *  these for its session block and for each window's label. Filled by the
   *  same `listSessions` call `sessionEngineVersions` above already makes,
   *  rather than a second round trip on the same trigger. */
  const [paperSessions, setPaperSessions] = useState<readonly SessionSummary[]>([]);
  /** The paper view's current document (ruling R184), or `null` for "nothing
   *  to show yet". Rebuilt from a settled evaluation, kept across an
   *  in-flight one -- `model/paperLive.ts` owns that rule. Distinct from
   *  `reportDoc` above, which is print's one-shot document and is mounted
   *  into `#report-print-root`: the two are built from the same builder but
   *  have opposite lifetimes (one press versus every settle). */
  const [paperDoc, setPaperDoc] = useState<ReportDocument | null>(null);
  /** `paperDoc`'s current value, readable from inside the rebuild effect
   *  without making it a dependency of that effect -- it is only ever asked
   *  the yes/no question "is a last good document being held", and adding
   *  the document itself as a dependency would make every rebuild schedule
   *  the next one. */
  const paperDocRef = useRef<ReportDocument | null>(null);
  /** Decision 62's "dismissable": the `windowsKeyValue` the banner was last
   *  dismissed for -- Isaac: "a banner for now so it can be temporarily
   *  ignored", so a dismissal is scoped to the current selection and
   *  reappears once the selection (or the live engine version) changes
   *  under it, never remembered permanently. */
  const [versionBannerDismissedFor, setVersionBannerDismissedFor] = useState<string | null>(null);
  /** R151 item 9's on-save migration report: the `hash` (`SaveResult.hash`)
   *  it was last dismissed for -- a later save producing a new `hash` (even
   *  one with no migrations, which then renders nothing anyway) un-dismisses
   *  it, mirroring `versionBannerDismissedFor`'s own "keyed on what changed
   *  it" scoping rather than a one-time permanent dismissal. */
  const [appliedMigrationsDismissedFor, setAppliedMigrationsDismissedFor] = useState<string | null>(null);

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
  /** Decision 57's playback mode (Task 11), beside `playback` itself since
   *  it is the same kind of worksheet-scoped playback state; `"scroll-at-
   *  edge"` (the picture holds still, the cursor moves) is the default --
   *  decision 57 states it first ("stop at the end of the lap; yes on
   *  scroll") and names cursor-fixed as the *second*, opt-in mode ("I kind
   *  of want the *option* to..."). `PlaybackTransport`'s mode toggle (Task
   *  12) is the only writer. */
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("scroll-at-edge");

  // One worksheet-shared cursor bus (Task 1/2) -- created once and handed
  // down to every `ChartCell` as a stable reference, never React state, so
  // hover-follow publishes at pointer rate without re-rendering this page.
  // `ChartCell`'s own click handler mirrors `pin`/`unpin` into
  // `manualCursorTUs` above through `onSetCursor`/`onClearCursor`, so
  // `sharedCursorTUs` stays the single source of truth for everything else
  // this page already reads it for (playback seed, the readout settle).
  // Lazy-init (`useRef(() => …)`, not `useRef(createCursorBus())`): the
  // latter calls `createCursorBus()` on *every* render -- React discards
  // every result but the first, but the call (and its throwaway
  // subscriber-array allocation) still happens each time (review of Tasks
  // 1-3, folded in per R138's dispatch).
  const cursorBusRef = useRef<CursorBus | null>(null);
  if (cursorBusRef.current === null) cursorBusRef.current = createCursorBus();
  const cursorBus: CursorBus = cursorBusRef.current;

  // The worksheet's selected gesture input-map preset (ruling R137,
  // `interaction/inputMap.ts`; Task 5) -- plain React state, not a ref: a
  // preset switch is a deliberate, infrequent user action (a picker
  // selection), not an interaction-rate event, so re-rendering every
  // mounted `ChartCell` with the newly chosen preset object is exactly how
  // R137's "takes effect immediately, with no reload" is satisfied -- the
  // very next gesture on any chart reads the new object, no extra
  // plumbing. Initialized once from this machine's persisted choice
  // (`readNotebookPrefs`); `BASIC_MOUSE_PRESET` is the fallback default
  // (documented judgment call -- no preset is named as the default in R137
  // or decision 56, and a single-wheel mouse with no modifier gestures is
  // the least assumption to make about the machine this build first runs
  // on).
  const [inputMapPreset, setInputMapPresetState] = useState<InputMapPreset>(
    () => findInputMapPreset(readNotebookPrefs().input_map_preset_id ?? "") ?? BASIC_MOUSE_PRESET
  );
  /** Switches the active preset and persists the choice (R137: "stored in
   *  user prefs") -- preserves `last_workbook_id` rather than clobbering it,
   *  since `writeNotebookPrefs` replaces the whole document. */
  function setInputMapPreset(preset: InputMapPreset): void {
    setInputMapPresetState(preset);
    writeNotebookPrefs({ ...readNotebookPrefs(), input_map_preset_id: preset.id });
  }

  // Decision 54's worksheet-level X mode (Task 13) -- initialized once from
  // this machine's persisted choice, `resolveXMode`'d by `readNotebookPrefs`
  // itself so a stored value this build can't honour never reaches state.
  const [xMode, setXModeState] = useState<XMode>(() => readNotebookPrefs().x_mode);
  /** Switches the worksheet's X mode and persists it -- routes through
   *  `resolveXMode` again here (not only at read time) so a caller passing
   *  an unselectable mode (`"distance"` while R136 keeps it disabled) can
   *  never put the worksheet into a state `X_MODE_OPTIONS` itself says is
   *  unavailable; `readNotebookPrefs()`/`{...}` preserves the other fields,
   *  same as `setInputMapPreset` above. */
  function setXMode(mode: XMode): void {
    const resolved = resolveXMode(mode);
    setXModeState(resolved);
    writeNotebookPrefs({ ...readNotebookPrefs(), x_mode: resolved });
  }

  // Playback's playing window (decision 57/plan Task 10, R134 item 6): the
  // *primary* selected window's own resolved span -- a lap window's
  // `AbsoluteSpan`, not `[0, sessionSpanUs]` -- so play stops at the end of
  // the lap rather than the end of the whole session, exactly per Task 3's
  // already-tested `windowSpanFor` (the same "resolved" predicate the
  // channel-bind gate uses, R138). `null` while unresolved (nothing
  // selected, or the window's own session/span hasn't loaded yet).
  const primaryWindowSpan = primaryWindow !== null ? windowSpanFor(primaryWindow, sessionDetailsByWindow, sessionSpanUsByWindow) : null;
  /**
   * The same value as {@link primaryWindowSpan} above, but with a stable
   * object identity across renders when its own `startUs`/`endUs` haven't
   * changed -- `windowSpanFor` builds a fresh object literal every call, so
   * passing `primaryWindowSpan` itself as a `ChartCell` prop would make
   * every one of that cell's own `useCallback`/`useEffect` dependency
   * arrays that include it "change" on every render regardless of whether
   * the primary window's span actually moved. `ChartCell.tsx`'s own
   * hover-follow/pin/value-card code needs this true resolved span (fixing
   * the review finding: it previously assumed `{startUs: 0, endUs:
   * sessionSpanUs}`, correct only for a `"session"`-kind primary window --
   * silently wrong the moment a lap or range became primary, R138's
   * pattern again).
   */
  const primaryWindowSpanForCell = useMemo(
    () => (primaryWindowSpan === null ? null : { startUs: primaryWindowSpan.startUs, endUs: primaryWindowSpan.endUs }),
    [primaryWindowSpan?.startUs, primaryWindowSpan?.endUs]
  );

  // The playback clock's `requestAnimationFrame` loop: local state only
  // (`setPlayback`), never IPC or `postMessage` itself (the effects rule's
  // carve-out for a RAF loop that "advances local state only"). Gated on
  // `primeState.running` (R95/R99): a hidden Notebook route must not keep
  // ticking a cursor nobody can see. `primaryWindowSpan` is read fresh each
  // frame via a ref (`primaryWindowSpanRef`, populated below) rather than
  // added to this effect's dependency array, so a mid-playback selection
  // change doesn't tear down and restart the RAF loop itself.
  const primaryWindowSpanRef = useRef(primaryWindowSpan);
  primaryWindowSpanRef.current = primaryWindowSpan;
  useEffect(() => {
    if (!playback.playing || !primeState.running) return;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const elapsedMs = now - last;
      last = now;
      const spanUs = playableSpanUs(primaryWindowSpanRef.current);
      if (spanUs !== null) {
        setPlayback((prev) => tick(prev, elapsedMs, spanUs));
      }
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
   *  where the user last pointed rather than wherever the clock was left.
   *  With no manual cursor, Task 10 seeds from the *playing window's own
   *  start* (`primaryWindowSpan`, decision 57) instead of leaving `tUs`
   *  wherever a previous window's playback left it -- otherwise pressing
   *  play on a freshly selected lap that starts partway through the
   *  session could resume from `0`, outside that lap entirely, and the
   *  very next {@link tick} would stall it at the start bound. */
  function handleTogglePlay(): void {
    setPlayback((prev) => {
      if (!prev.playing) {
        if (manualCursorTUs !== null) {
          return togglePlay({ ...prev, tUs: manualCursorTUs });
        }
        const spanUs = playableSpanUs(primaryWindowSpan);
        if (spanUs !== null) {
          return togglePlay({ ...prev, tUs: spanUs[0] });
        }
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
  // Ruling R184: paper *is* the narrow placement, named through
  // `model/paperView.ts` so this page reads intent rather than an enum
  // member -- and so the two can never be given different breakpoints.
  const paperActive = paperViewActive(widthPx);

  // R109: the wide studio's properties column (`shell/EditorSlotColumn.tsx`)
  // publishes its DOM node here; when present, the editor portals into it
  // instead of rendering in this page's own `placement`-chosen spot --
  // `resolveEditorHost` decides which wins, by slot presence alone, never
  // by the (possibly narrow-reading, inside the studio's own output
  // column) measured `placement`.
  const editorSlotNode = useEditorSlotNode();
  const editorHost = resolveEditorHost(editorSlotNode !== null, placement);
  const editorIsPortalHosted = editorHost === "portal";

  // The same arrangement for the maths graph: the wide studio's maths
  // column (`shell/GraphSlotColumn.tsx`) publishes its DOM node, and the
  // canvas this page builds portals into it rather than taking a pane in
  // this page's own content area. Slot presence decides, never the
  // measured `placement` -- inside the studio this page's width *is* the
  // output column's, so a width test would put a second `GraphCanvas`
  // beside the one the column already holds (R109 ruling 2's failure,
  // applied to the graph). Before this, the maths column rendered a
  // "reserved" placeholder while the real canvas sat inside the output
  // column beside the cell list.
  const graphSlotNode = useGraphSlotNode();
  const graphHost = resolveGraphHost(graphSlotNode !== null, placement);
  const graphIsPortalHosted = graphHost === "portal";

  // Bug report fixed 2026-09-09, correcting R161: the toolbar spans the
  // *window*, not just this tab's own column area. `AppShell.tsx` mounts
  // `shell/ToolbarSlotRow.tsx` unconditionally, so its node exists whether
  // or not Notebook is the active tab (mount-and-hide, R93) -- unlike the
  // editor slot above, node presence alone cannot gate the portal here, or
  // every other tab would show this toolbar too. `routeVisible` (already
  // read further down for `PlaybackTransport`) is the same "is this tab the
  // one currently shown" signal.
  const toolbarSlotNode = useToolbarSlotNode();
  const notebookSidebarNode = useSidebarSlotNode("notebook");

  // The notebook output register (decision 31) -- stored in `UiPrefs`
  // (UI-7 Q1), read/written through `notebookPrefsStore` above. `null`
  // means "no explicit choice yet"; `resolveRegister` then defaults to
  // paper on narrow / studio on wide.
  const [storedRegister, setStoredRegister] = useState<"paper" | "studio" | null>(null);
  /** The paper view's own theme (ruling R185 item 3, `Settings/prefs.ts`'s
   *  `ui.paper_theme`) -- read from the same store as the register beside
   *  it, never a second storage key. */
  const [paperTheme, setPaperTheme] = useState<PaperTheme>("app");
  /** The app's own theme choice, read for one reason: `"app"` paper follows
   *  it (`effectivePaperTheme`). The app *applies* its own theme in
   *  `Settings/ThemeSection.tsx`, which stamps `data-theme`; this page only
   *  reads the choice. */
  const [appTheme, setAppTheme] = useState<ThemeChoice>("dark");
  /** Ruling R214 item 1's optional cue: the Settings toggle "Colour-code
   *  graph nodes" (`Settings/prefs.ts`'s `ui.graph_node_colour`, off by
   *  default). Nothing on the canvas depends on it — shape and glyph carry
   *  the kind — so an unread or failed preference simply means no stripes. */
  const [colourCodeNodes, setColourCodeNodes] = useState(false);
  // Re-read on every transition into visibility, not only on mount: the
  // Settings tab writes these two through its *own* `PrefsStore` instance
  // over the same backend, so this page's instance never hears that store's
  // `subscribe` notification. Routes are mounted-and-hidden (decision 13),
  // so "the user came back from Settings" is exactly `routeVisible` going
  // true -- which is when a changed paper theme has to be picked up, or the
  // toggle would appear to do nothing until the app restarted.
  useEffect(() => {
    if (!routeVisible) return;
    let cancelled = false;
    void notebookPrefsStore.get().then((prefs) => {
      if (cancelled) return;
      setStoredRegister(prefs.ui.output_register);
      setPaperTheme(prefs.ui.paper_theme);
      setAppTheme(prefs.ui.theme);
      setColourCodeNodes(prefs.ui.graph_node_colour);
    });
    return () => {
      cancelled = true;
    };
  }, [routeVisible]);
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
  // The tile cache reports its own bytes to the shell's status-bar memory
  // meter (ruling R220 item 1). `DEFAULT_CACHE_BYTES` is passed explicitly
  // because the callback is the second argument; `publishMemoryUse` only
  // notifies on a whole-percent change, so a pan that puts hundreds of
  // tiles re-renders the status bar a handful of times, not hundreds.
  const sessionRef = useRef<NotebookSession>(
    new NotebookSession(new TileCache(DEFAULT_CACHE_BYTES, publishMemoryUse))
  );
  const openSeqRef = useRef(0);
  const evalSeqRef = useRef(0);
  /**
   * How many `eval_workbook`/`open_workbook` round trips are in flight
   * right now (ruling R210). A count, not a boolean: a watch event and an
   * edit debounce can both fire a run, and an older run resolving must not
   * report the notebook as idle while a newer one is still out.
   *
   * Read only by `cellStatusFor` below, to tell a cell that is *waiting*
   * on a result (`"queued"`) from one whose result is *being computed*
   * (`"evaluating"`) -- Jupyter's own distinction. The evaluator runs the
   * whole workbook per call, so this is document-level; what makes the
   * status per-cell is that only a cell without a current result reads it.
   */
  const [evalInFlightCount, setEvalInFlightCount] = useState(0);
  const evalInFlight = evalInFlightCount > 0;

  /** Counts `run` in and out of {@link evalInFlightCount}, returning
   *  nothing -- every call site already fires its run with `void`, and
   *  `finally` re-raises a rejection exactly as the bare promise did, so
   *  this changes no call's error behaviour. */
  const trackEvalRun = useCallback((run: Promise<unknown>): void => {
    setEvalInFlightCount((n) => n + 1);
    void run.finally(() => setEvalInFlightCount((n) => n - 1));
  }, []);
  /** One monotonic run-sequence counter per selected window (keyed by
   *  `windowKey`), for `model/sessionSpanDriver.ts`'s `runSessionSpan` --
   *  called once per window (R127's accepted item), so staleness is
   *  decided per window, not for the selection as a whole: a session
   *  change on window 2 must not invalidate window 1's already-resolved
   *  `SessionDetail`. */
  const sessionSpanSeqRef = useRef<Map<string, number>>(new Map());
  const listSeqRef = useRef(0);
  /** `true` once the one first-open-when-empty automatic `rebuild_catalog`
   *  (R81 Q1(a)) has been attempted for this mount -- a later empty list
   *  (e.g. after Rescan itself finds nothing) does not trigger a second
   *  automatic rebuild; the user's own Rescan already covered that case. */
  const autoRebuiltRef = useRef(false);
  /** Every js cell's currently bound identity (`bindingIdentity`), recorded
   *  **per selected window** (outer key `cellId`, inner key `windowKey` --
   *  ruling R133, mirroring `fftBoundIdentityRef` below) so the
   *  channel-bind effect only *starts a new run* for a cell whose binding
   *  changed **or** whose set of ready windows changed -- keying this
   *  purely by `cellId` (the pre-R133 shape) meant a sibling window's
   *  `SessionDetail` resolving after the primary window's left every
   *  already-bound cell's single recorded identity unchanged, so the gate
   *  below never re-ran and that window's channel data was never fetched
   *  (R133's finding: the dependency-array fix alone was not enough --
   *  this inner cache is a second staleness gate in series with it). The
   *  binding's own *content* still never varies by window (R127 item 1: a
   *  channel's host-variable name must not encode which windows are
   *  selected) -- one `runChannelBind` call still fetches every ready
   *  window at once; this map only decides *whether* that call is needed.
   *  This is purely the "should a new initial bind start" decision; it is
   *  never consulted as a staleness guard (that is `cellRunSequencerRef`'s
   *  job, below, review-task13c.md's Major fix). */
  const boundIdentityRef = useRef<Map<string, Map<string, string>>>(new Map());
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
  /** Every FFT cell's currently bound per-window identity (S1 Task 11a,
   *  extends `boundIdentityRef`'s "should a new run start" role to one
   *  entry per selected window instead of one per cell): outer key
   *  `cellId`, inner key `windowKey`. `cellRunSequencerRef` above is keyed
   *  by the composite string `fftRunKey(cellId, windowKey)` for these runs
   *  (see that function) so one window's fetch never supersedes a
   *  sibling's -- each window's spectrum is independent (ruling R129). */
  const fftBoundIdentityRef = useRef<Map<string, Map<string, string>>>(new Map());
  /** The last decoded spectrum this page fetched for each FFT cell and
   *  window (L6 Task 20, Open Question 5; extended to per-window in S1
   *  Task 11a), keyed by `cellId` then `windowKey`, alongside the shared
   *  `hostVarName` it is published under (ruling R129: one host variable
   *  per (channel, `fft_params`), regardless of how many windows) -- so a
   *  sandbox rebuild can re-push the combined payload (fresh
   *  `Float64Array`s built from these retained `DecodedFft`s, never the
   *  transferred buffers themselves, which are detached on transfer)
   *  rather than re-fetching or leaving the cell blank. Cleared when the
   *  cell is removed from the document, its binding stops being an FFT
   *  cell, or (per window) that window is no longer selected (decision 61). */
  const retainedSpectraRef = useRef<Map<string, { hostVarName: string; byWindow: Map<string, DecodedFft> }>>(new Map());

  // One `saveFlow` instance for this page's lifetime (Task 14) -- holds
  // its own `SaveFlowState` behind a closure; `saveFlowState` mirrors it
  // into component state after every `save()` resolution so the Save
  // button/`ConflictBanner` re-render. `lastSavedHash`/`lastSavedAtMs` feed
  // the watch effect's `isSelfWrite` check below (C4 §4's second belt).
  const saveFlowRef = useRef(saveFlow({ save: saveWorkbook, now: () => Date.now() }));
  const [saveFlowState, setSaveFlowState] = useState<SaveFlowState>({ status: "idle" });
  const lastSavedHashRef = useRef<string | null>(null);
  const lastSavedAtMsRef = useRef<number | null>(null);

  // `AppState.selection` (C1 §6.1, ruling R117), mapped to `ipc/workbook.ts`'s
  // wire `Window[]` shape and passed to every `evalWorkbookV2` call below
  // (C3 §3.4). Read via a ref, not the dependency array, for the same
  // reason `sessionIdRef` used to be: the watch/debounced-edit effects
  // should read the freshest selection at fire time without re-subscribing
  // whenever the selection changes. `model/jsCellBinding.ts`'s
  // `JsCellBindingChannel.lap` (from `MarkProps.lap`, per-mark) is a
  // separate, narrower lap reference plumbed independently -- read and
  // stored on each bound channel below, never applied to narrow a fetch
  // (lead pre-ruling 2026-09-05 #2).
  const windowsRef = useRef<WireWindow[]>([]);
  windowsRef.current = windows.map(toWireWindow);

  /** Decision 59's staleness generation, read fresh by every `runEval`/
   *  `runOpenAndEval` call site below -- the same "fresh values through a
   *  ref" shape as {@link windowsRef}, so a run started from an effect never
   *  captures a stale `state.evalRequestGeneration` from the render that
   *  scheduled it. */
  const evalGenerationRef = useRef(state.evalRequestGeneration);
  evalGenerationRef.current = state.evalRequestGeneration;

  /** App-side mirror of `windows`, read fresh by {@link pushCombinedSpectrumFor}
   *  when it is called from the mount effect's `onChannelsInvalidated`
   *  closure below (captured once, at mount, and stale thereafter --
   *  `fetchHostChannelDep`'s existing ref-based freshness pattern in this
   *  same file). */
  const selectionRef = useRef<SelectionWindow[]>(windows);
  selectionRef.current = windows;
  /** Same freshness reason as {@link selectionRef}, for `sessionDetailsByWindow`. */
  const sessionDetailsByWindowRef = useRef<Map<string, SessionDetail | null>>(sessionDetailsByWindow);
  sessionDetailsByWindowRef.current = sessionDetailsByWindow;

  /**
   * Rebuilds and pushes `cellId`'s combined multi-window spectrum host
   * variable from `retainedSpectraRef`'s currently retained per-window
   * spectra (ruling R129: one host variable per (channel, `fft_params`),
   * window dimension in the payload). Iterates `selectionRef.current` (the
   * current selection, in order) so `w`'s index matches each window's
   * position in the selection and `host/protocol.ts`'s break-row insertion
   * (ruling R127 item 4) falls in the right places -- a window with no
   * retained entry (still resolving, unrequestable, or its own fetch
   * errored, R121) is simply omitted, never padded with placeholder
   * samples. Reads `selectionRef`/`sessionDetailsByWindowRef` rather than
   * the render-scoped `windows`/`sessionDetailsByWindow` so it stays
   * correct when called from the mount effect's `onChannelsInvalidated`
   * closure below, captured once at mount and otherwise stale.
   */
  function pushCombinedSpectrumFor(cellId: string): void {
    const retained = retainedSpectraRef.current.get(cellId);
    const host = sandboxHostRef.current;
    if (retained === undefined || host === null) return;
    const series: SpectrumWindowSeries[] = [];
    for (const w of selectionRef.current) {
      const wKey = windowKey(w);
      const fft = retained.byWindow.get(wKey);
      if (fft === undefined) continue;
      const detail = sessionDetailsByWindowRef.current.get(wKey) ?? null;
      series.push({ descriptor: windowDescriptorFor(w, detail), f: frequencyAxisHz(fft), m: Float64Array.from(fft.magnitudes) });
    }
    const combined = combineSpectrumWindows(series);
    host.setSpectrumHostVar(
      retained.hostVarName,
      combined.length,
      combined.f.buffer as ArrayBuffer,
      combined.m.buffer as ArrayBuffer,
      combined.w.buffer as ArrayBuffer,
      combined.windows
    );
  }

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
        const getPrimaryWindowDescriptor = (): WindowDescriptor | null => {
          const w = selectionRef.current[0] ?? null;
          if (w === null) return null;
          return windowDescriptorFor(w, sessionDetailsByWindowRef.current.get(windowKey(w)) ?? null);
        };
        sessionRef.current.onChannelsInvalidated(host, { fetchHostChannel: fetchHostChannelDep }, getPrimaryWindowDescriptor)();
        // L6 Task 20, Open Question 5 (extended to per-window in S1 Task
        // 11a): a spectrum has no `TileCache` entry to re-derive from, so
        // each cell's combined multi-window payload is rebuilt and
        // re-pushed from this page's own retained per-window copies --
        // fresh `Float64Array`s built here, never the transferred buffers
        // themselves (detached on transfer). No IPC, no refetch.
        for (const cellId of retainedSpectraRef.current.keys()) {
          pushCombinedSpectrumFor(cellId);
        }
      },
    });
    sandboxHostRef.current = host;
    host.init(SANDBOX_RUNTIME_VERSION);

    // Drives the sandbox's liveness watchdog (`host/watchdog.ts`, never
    // wired to a caller before this task) at its own ping cadence, so a
    // stalled sandbox is torn down and rebuilt instead of hanging forever.
    // Scoped to this effect (not a separate one) so the timer's lifetime is
    // exactly `host`'s: it starts only once a host exists and is cleared in
    // this same cleanup, before `host.dispose()` -- it never survives past
    // the iframe it was ticking, and it is not re-created by `rebuild()`
    // (`SandboxHost.tick` forwards to one `Watchdog` instance that outlives
    // every rebuild internal to `host`, so one timer for this whole effect
    // is correct, not one per generation). Piggybacking on `primeState.running`
    // rather than reading `useRouteVisible` again here means a hidden
    // Notebook route (R95/R99) has no host to tick in the first place --
    // the same visibility gate already applied above, not a second one.
    const watchdogTimer = window.setInterval(() => host.tick(Date.now()), PING_INTERVAL_MS);

    return () => {
      window.clearInterval(watchdogTimer);
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
      const workbooks = await listWorkbooks();
      if (isStale()) return;

      // Render whatever the catalog already has, first and always (ruling
      // R219 item 3): the rebuild below is started, never awaited, and the
      // page re-lists when it lands.
      setEntry(chooseWorkbookEntry(workbooks, readNotebookPrefs().last_workbook_id));

      if (workbooks.length === 0 && !autoRebuiltRef.current) {
        autoRebuiltRef.current = true;
        void startBackgroundRebuild();
      }
    })();
  }, [reloadSeq]);

  // Derived from `entry` -- `null` for the empty state, so the open/eval
  // effect below starts nothing until a workbook exists to open.
  const selectedWorkbookId = entry !== null && entry.kind !== "empty" ? entry.workbookId : null;

  // Open -> read -> eval, once a workbook is chosen and again whenever the
  // selected windows or the selected workbook change (data-only
  // dependencies, keyed on `windowsKeyValue` per operating brief §4's
  // tightening -- never `windows`' own array identity; `model/
  // openEvalDriver.ts`'s `runOpenAndEval` no longer decides which workbook
  // to open (L6 Task 21) -- that is `entry`'s job, shared with the empty
  // state and the picker). `pruneWindows` runs first (ruling R131: "the
  // reducer prunes") so a deselected window's stale result never lingers
  // through to this run's fresh dispatches, which then repopulate whatever
  // is still selected.
  useEffect(() => {
    if (selectedWorkbookId === null) return;
    dispatch({ type: "pruneWindows", keep: new Set(windows.map(windowKey)) });
    const mySeq = ++openSeqRef.current;
    const deps: OpenEvalDeps = {
      openWorkbook: (idOrPath) => openWorkbook(idOrPath),
      readWorkbook: (idOrPath) => readWorkbook(idOrPath),
      evalWorkbookV2: (id, w) => evalWorkbookV2(id, w),
    };
    trackEvalRun(runOpenAndEval(deps, selectedWorkbookId, windows.map(toWireWindow), dispatch, () => openSeqRef.current !== mySeq, evalGenerationRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowsKeyValue, selectedWorkbookId]);

  // Task R2/R6: once `reportDoc` is mounted into `#report-print-root`,
  // clear it once the print dialog closes (`afterprint`) -- a stale report
  // must never sit mounted for a second, unrelated `Ctrl+P` to pick up.
  // Printing itself is triggered by `handleReportReady` below, not on a
  // fixed next frame (task R2's original timing) -- task R6 added charts,
  // which render asynchronously (`renderChart.ts`'s dynamic `import()`),
  // so "the DOM has committed" is no longer the same moment as "every
  // chart has painted"; `ReportView`'s own `onReady` reports the latter.
  useEffect(() => {
    if (reportDoc === null) return;
    const onAfterPrint = () => setReportDoc(null);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [reportDoc]);

  /** `ReportView`'s `onReady` (task R6): every `chartSlot` this report
   *  built has settled (rendered or failed) -- fires immediately for a
   *  chartless report, matching task R2's original "next frame" timing. */
  function handleReportReady(): void {
    requestAnimationFrame(() => window.print());
  }

  // Decision 62: the live engine's own version, once -- `fetchEngineVersion`
  // never fails (C3 §3.1) and cannot change mid-session, so this never
  // needs to run again.
  useEffect(() => {
    let disposed = false;
    void fetchEngineVersion().then((version) => {
      if (!disposed) setCurrentEngineVersion(version);
    });
    return () => {
      disposed = true;
    };
  }, []);

  // Decision 62: refreshes each selected session's own recorded
  // `engine_version` whenever the selection changes -- `listSessions`
  // (already used by `model/sessionSpanDriver.ts` for the same catalog
  // read) is the only IPC surface that carries it (`SessionDetail`, unlike
  // `SessionSummary`, does not). Filtered down to this selection's own
  // session ids so this map never grows to hold every session the catalog
  // has ever seen.
  useEffect(() => {
    if (windows.length === 0) {
      setSessionEngineVersions(new Map());
      setPaperSessions([]);
      return;
    }
    let disposed = false;
    const selectedSessionIds = new Set(windows.map((w) => w.sessionId));
    void listSessions().then((sessions) => {
      if (disposed) return;
      const next = new Map<string, string>();
      for (const s of sessions) {
        if (selectedSessionIds.has(s.session_id)) next.set(s.session_id, s.engine_version);
      }
      setSessionEngineVersions(next);
      // Ruling R184: the paper view needs the summaries themselves, not
      // just their engine versions, and this is already the one call that
      // has them at exactly the right cadence (once per selection change).
      setPaperSessions(sessions);
    });
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowsKeyValue]);

  // Resolves every selected window's `SessionDetail` and its own recorded
  // span (lead pre-ruling 2026-09-05 #1; extended to every window, not only
  // the primary, by plan Task 3/ruling R134), once per window change --
  // `model/jsCellBinding.ts`'s `bindingFor` needs both for the primary
  // window, the FFT arm needs every selected window's own `SessionDetail`
  // (R115: two windows may name different sessions), and
  // `model/viewportWindows.ts`'s `resolveWindowSpan` needs every selected
  // window's own recorded span to resolve a `"session"`-kind window without
  // the `Infinity` sentinel this task removes. All branching lives in
  // `model/sessionSpanDriver.ts`'s `runSessionSpan`, called once per window
  // (R127's accepted item); this effect only dispatches its two action
  // kinds into local state, keyed per window. `sessionSpanUs` (the primary
  // window's span, singular) stays in sync from the same loop for the
  // existing single-window consumers (`ChartCell`'s clamp, `jsCellBinding`'s
  // `bindingFor`) that read it directly.
  useEffect(() => {
    const currentKeys = new Set(windows.map(windowKey));
    for (const key of sessionSpanSeqRef.current.keys()) {
      if (!currentKeys.has(key)) sessionSpanSeqRef.current.delete(key);
    }
    setSessionDetailsByWindow((prev) => {
      let next = prev;
      for (const key of prev.keys()) {
        if (!currentKeys.has(key)) {
          if (next === prev) next = new Map(prev);
          next.delete(key);
        }
      }
      return next;
    });
    setSessionSpanUsByWindow((prev) => {
      let next = prev;
      for (const key of prev.keys()) {
        if (!currentKeys.has(key)) {
          if (next === prev) next = new Map(prev);
          next.delete(key);
        }
      }
      return next;
    });

    const deps: SessionSpanDeps = {
      getSession: (id) => getSession(id),
      listSessions: () => listSessions(),
      fetchTile: (sid, channel, tier, tileIndex, columnCount) => fetchTile(sid, channel, tier, tileIndex, columnCount),
    };

    for (const w of windows) {
      const key = windowKey(w);
      const mySeq = (sessionSpanSeqRef.current.get(key) ?? 0) + 1;
      sessionSpanSeqRef.current.set(key, mySeq);
      const isPrimary = primaryWindow !== null && windowKey(primaryWindow) === key;
      const onAction = (action: SessionSpanAction) => {
        if (action.type === "sessionDetail") {
          setSessionDetailsByWindow((prev) => new Map(prev).set(key, action.detail));
        } else {
          setSessionSpanUsByWindow((prev) => new Map(prev).set(key, action.spanUs));
          if (isPrimary) setSessionSpanUs(action.spanUs);
        }
      };
      void runSessionSpan(deps, toWireWindow(w), onAction, () => sessionSpanSeqRef.current.get(key) !== mySeq);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowsKeyValue]);

  // Read fresh at call time by the mount-once sandbox-construction effect
  // and the channel-bind driver's injected `fetchHostChannel` (L6 Task 18)
  // -- so neither needs `state.handle` in a dependency array.
  const workbookIdRef = useRef<string | null>(state.handle?.id ?? null);
  workbookIdRef.current = state.handle?.id ?? null;

  /** Binds `ipc/workbook.ts`'s `fetchHostChannelV2` to whatever workbook/
   *  primary window are current at call time (L6 Task 18, R77.3; migrated
   *  to `fetchHostChannelV2` in S1 Task 11a) -- the one place
   *  `ChannelBindDeps`'s injected `fetchHostChannel` is actually
   *  constructed, so `channelBindDriver.ts` and `channelRebind.ts` never
   *  import `ipc/workbook.ts` themselves. `channelBindDriver.ts` itself is
   *  still single-window (Task 11b, ruling R131) -- this always resolves
   *  the *primary* window, `null` when nothing is selected, matching
   *  `fetchHostChannelV2`'s own "old session-less behaviour" default.
   *  Rejects if no workbook is open yet, matching every other
   *  `workbookId`-dependent call site in this file. */
  const fetchHostChannelDep = (defName: string, budget: number) => {
    const workbookId = workbookIdRef.current;
    if (workbookId === null) return Promise.reject(new Error("fetchHostChannel: no workbook open"));
    const window = windowsRef.current[0] ?? null;
    return fetchHostChannelV2(workbookId, window, defName, budget);
  };

  // R95 item 2: paused the same way the sandbox mount effect above is --
  // `primeState.running` added to the dependency array so a hidden route
  // drops this subscription (the cleanup below runs) and a visible one
  // re-subscribes fresh -- hiding the route is treated as the same kind of
  // "this subscription is no longer current" event a workbook switch
  // already was, not a new mechanism.
  //
  // The cleanup now also calls `unwatchWorkbook` (R98): setting `disposed`
  // alone silenced the callback but left the OS file handle open for the
  // app's life, because Tauri v2 gives the Rust side no channel-close
  // signal. `unwatch_workbook` resolves for an id that is not currently
  // watched, so this is safe on every path that reaches it -- an unmount
  // racing the subscribe, React strict mode's double unmount, or a
  // re-subscribe that already replaced the entry.
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
      trackEvalRun(runEval({ evalWorkbookV2 }, workbookId, windowsRef.current, dispatch, () => evalSeqRef.current !== mySeq, evalGenerationRef.current));
    });

    return () => {
      disposed = true;
      void unwatchWorkbook(workbookId);
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
      trackEvalRun(runEval({ evalWorkbookV2 }, workbookId, windowsRef.current, dispatch, () => evalSeqRef.current !== mySeq, evalGenerationRef.current));
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
      writeNotebookPrefs({ ...readNotebookPrefs(), last_workbook_id: handle.id });
      setEntry({ kind: "single", workbookId: handle.id });
      // The new workbook is already open from its own handle; the rebuild
      // serves only the picker's next `list_workbooks`, so it runs in the
      // background and this never waits for it (ruling R219 item 3).
      void startBackgroundRebuild();
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
    await startBackgroundRebuild();
  }

  /**
   * Starts the background catalog rebuild and re-lists when it lands
   * (ruling R219 items 2-3). Shared by the Rescan button, `handleCreate`,
   * and the one first-open-when-empty trigger (R81) -- all three used to
   * await a synchronous `rebuild_catalog`, which on a 159-session library
   * meant minutes of re-hashing between the user and their workbook.
   *
   * `rescanning` is a button state here, not a blocked route: the page has
   * already rendered from whatever the catalog held. A run that was already
   * in flight is joined rather than started twice -- `start_rebuild_job`
   * returns `false` and `whenRebuildFinishes` waits for the running one.
   */
  async function startBackgroundRebuild() {
    setRescanning(true);
    setWorkbookBarError(null);
    try {
      await startRebuildJob();
      setLastRebuild(await whenRebuildFinishes());
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
    writeNotebookPrefs({ ...readNotebookPrefs(), last_workbook_id: workbookId });
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
      dispatch({ type: "saveResult", hash: result.hash, migrations: result.migrations });
    } else if (result.status === "conflict") {
      dispatch({ type: "saveConflict" });
    }
  }

  /**
   * Splits `combinedChannelDataRef`'s own `${cellId}::${channelId}` keys
   * (`channelBindDriver.ts`'s key shape, set at `index.tsx:1719`/`:2330`)
   * back into a per-cell map for `buildReportDocument`'s `chartChannelData`
   * input (task R6, ruling R173). A cell id is always a hex8 (C2 §2.2,
   * ruling R21) — eight characters, always — so slicing the key's first
   * eight characters off before the fixed `"::"` separator is a safe split
   * point regardless of what a channel id itself contains.
   */
  function groupChannelDataByCell(flat: ReadonlyMap<string, CombinedChannelPayload>): Map<string, Map<string, CombinedChannelPayload>> {
    const byCell = new Map<string, Map<string, CombinedChannelPayload>>();
    for (const [key, payload] of flat) {
      const cellId = key.slice(0, 8);
      const channelId = key.slice(10);
      let inner = byCell.get(cellId);
      if (inner === undefined) {
        inner = new Map();
        byCell.set(cellId, inner);
      }
      inner.set(channelId, payload);
    }
    return byCell;
  }

  /**
   * "Export report" (decisions 85/89, tasks R2/R6): builds a
   * {@link ReportDocument} from the primary window's already-settled
   * evaluation and mounts it into `#report-print-root` for
   * `window.print()` -- the v1 path `report-plan.md` §2.2 accepted
   * (`window.print()` works on every platform with zero new
   * dependencies; a vendored PDF writer is task R7). `listSessions` and
   * `getVersion` are one-shot, settle-bound fetches, the same shape as
   * `handleRescan`'s own `rebuildCatalog` call -- never a hot path.
   */
  async function handleExportReport() {
    if (state.markdown === null) return;
    setExportingReport(true);
    try {
      const [sessions, appVersion] = await Promise.all([listSessions(), getVersion()]);
      // Task R4: one `WindowEval` per selected window, same order -- reads
      // `state.windows` (ruling R131 Q1's per-window map) by each window's
      // own key rather than the primary-only `primaryEval`.
      const evals: (WindowEval | undefined)[] = windows.map((w) => {
        const entry = state.windows.get(windowKey(w));
        if (entry === undefined) return undefined;
        return entry.kind === "ok" ? { ok: Array.from(entry.outputs.values()) } : { error: entry.error };
      });
      const proseBlocks = new Map(proseBlocksFor(state.cells, state.markdown, primaryOutputs).map((block) => [block.blockId, block]));
      setReportDoc(
        buildReportDocument({
          cells: state.cells,
          markdown: state.markdown,
          proseBlocks,
          evals,
          windows,
          sessions,
          chartChannelData: groupChannelDataByCell(combinedChannelDataRef.current),
          xMode,
          appVersion,
          generatedAtMs: Date.now(),
        }),
      );
    } finally {
      setExportingReport(false);
    }
  }

  /** `ConflictBanner`'s "Reload from disk": discard local edits, replace `workbookState`'s markdown/cells/hash with disk's current content. */
  async function handleReloadFromDisk() {
    if (state.handle === null) return;
    try {
      const source = await readWorkbook(state.handle.id);
      dispatch({ type: "markdownReady", markdown: source.markdown, hash: source.hash, pendingMigrations: source.pending_migrations });
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
        dispatch({ type: "saveResult", hash: result.hash, migrations: result.migrations });
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
  /**
   * The whole-workbook code pane's write path (ruling R214 item 3). A
   * document-level edit may touch any number of cells at once, so the cells
   * whose bodies actually changed are named by `documentRanges.ts`'s
   * `changedCellIds` and each marked dirty through the same `editCell`
   * action a per-cell edit uses — the first carries the new markdown, the
   * rest only add themselves to `dirtyCellIds`. An edit that changed no
   * cell body (prose, front matter, whitespace between cells) goes through
   * `editFrontMatter` instead: the document is dirty for save, but nothing
   * needs re-evaluating.
   */
  function handleDocumentChange(nextMarkdown: string) {
    if (state.markdown === null || nextMarkdown === state.markdown) return;
    const changed = changedCellIds(state.markdown, nextMarkdown);
    if (changed.length === 0) {
      dispatch({ type: "editFrontMatter", markdown: nextMarkdown });
      return;
    }
    changed.forEach((cellId, index) => {
      dispatch(index === 0 ? { type: "editCell", cellId, markdown: nextMarkdown } : { type: "editCell", cellId });
    });
  }

  /**
   * Ruling R214 item 2's second rename gesture — the Properties/Code
   * column's inline "Rename", beside the graph's frame-title double-click.
   * Both write the same `# label:` first line through the same ordinary
   * cell-edit path (§3.7.3), so the two can never disagree about what a
   * rename means. Math cells only: `#` is not a comment in a `js` or
   * `table` body, and the caller only offers the control for `math`.
   */
  function handleRenameCell(cellId: string, label: string) {
    if (state.markdown === null) return;
    const cell = state.cells.find((c) => c.id === cellId);
    if (cell === undefined || cell.kind !== "math") return;
    handleCellCodeChange(cellId, setCellLabelLine(decodeByteRange(state.markdown, cell.bodyRange), label));
  }

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
    const blocks = proseBlocksFor(state.cells, state.markdown, primaryOutputs);
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
    // R203.5: the retained full-resolution t/v/w arrays a removed cell's
    // charts were reading. Every sibling ref above is cleaned up here;
    // this one used to only ever grow, so a long session accumulated
    // every channel every cell had ever bound.
    for (const key of channelDataKeysToEvict(combinedChannelDataRef.current.keys(), liveIds)) {
      combinedChannelDataRef.current.delete(key);
    }
    for (const [cellId, perWindow] of fftBoundIdentityRef.current) {
      if (!liveIds.has(cellId)) {
        for (const wKey of perWindow.keys()) cellRunSequencerRef.current.delete(fftRunKey(cellId, wKey));
        fftBoundIdentityRef.current.delete(cellId);
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
    // `state.cells`/`state.markdown`/`primaryEval` may not themselves
    // have changed. `primaryEval` (not `primaryOutputs`, a fresh `Map()`
    // literal on every render when pending/errored) is the stable
    // dependency -- it only changes identity when the reducer actually
    // updates that window's entry.
  }, [state.cells, state.markdown, primaryEval, primeState.primeEpoch]);

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
  // `primaryWindow`/`windowsKeyValue`/`sessionDetailsReadiness`/`primaryEval`)
  // -- the tightened IPC-effects rule. `primaryEval` was added for L6 Task 18 (definition-channel binding,
  // R77.3): `definitionsWithAxis` below is derived from it, so a cell
  // naming a `math` definition rebinds once that definition's first
  // `eval_workbook_v2` result exists, or once its `has_t` becomes known.
  //
  // `definitionsWithAxis` (this task): every workbook `math` definition
  // name with a recorded time axis (`CellDefResult.value.has_t`) --
  // `eval_workbook_v2`'s own output for `primaryWindow`, the same source
  // `definitionNames` below (CodePane completions) reads, just restricted
  // to the subset a chart can bind to (Q3(a), R78: an axis-less definition
  // is not bindable, and is treated exactly like an unresolvable channel by
  // `bindingFor`).
  const definitionsWithAxis: ReadonlySet<string> = new Set(
    Array.from(primaryOutputs.values())
      .filter((o) => o.kind === "math")
      .flatMap((o) => o.defs)
      .filter((d) => d.value !== null && d.value.has_t)
      .map((d) => d.name)
  );

  // `bindingFor`'s `definitionUnitByName` (R154/R164, Task 2 of the unit
  // model's TS half): every workbook `math` definition's own inferred unit,
  // same primary-window source as `definitionsWithAxis` above -- a
  // `"definition"` bound channel's host-variable `.unit`/`.unitState`
  // (C2 §5.1) comes from here, not from `fetch_host_channel`'s IDLH bytes
  // (R165, which carries samples only).
  const definitionUnitByName: ReadonlyMap<string, UnitLabel> = new Map(
    Array.from(primaryOutputs.values())
      .filter((o) => o.kind === "math")
      .flatMap((o) => o.defs)
      .map((d) => [d.name, d.unit] as const)
  );

  // Time-chart channel binding (`ChartCell`'s tile-fetch pipeline,
  // `channelBindDriver.ts`) is fully window-aware as of S1 Task 11b
  // (ruling R131 Q2): every selected window is fetched and combined into
  // one host variable per channel (`bindWindowsFor`/`runChannelBind`), the
  // gesture viewport re-based onto each window's own start. A single
  // selected window stays byte-identical to the pre-multi-window shape
  // (R127 item 3) end to end -- see `channelBindDriver.ts`'s own top doc
  // comment.
  useEffect(() => {
    if (state.markdown === null || primaryWindow === null) return;
    const markdown = state.markdown;
    const bindWindows = bindWindowsFor(windows, sessionDetailsByWindow, sessionSpanUsByWindow);
    if (bindWindows.length === 0) return;
    const windowKeys = windows.map(windowKey);
    // R138 fix: one predicate for "resolved," shared with `bindWindowsFor`
    // itself (`windowSpanFor`) -- see `resolvedWindowKeysFor`'s own doc
    // comment. Computed once per effect run, not per cell: it depends only
    // on `windows`/`sessionDetailsByWindow`/`sessionSpanUsByWindow`, all
    // fixed for the duration of this loop.
    const resolvedWindowKeys = resolvedWindowKeysFor(windows, sessionDetailsByWindow, sessionSpanUsByWindow);

    for (const cell of state.cells) {
      if (cell.id === null || cell.kind !== "js") continue;
      const cellId = cell.id;
      const code = decodeByteRange(markdown, cell.bodyRange);
      const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis, null, definitionUnitByName);
      if (binding === null || binding.kind !== "time") {
        // An FFT binding is handled by the dedicated effect below; either
        // way, this cell has no time-viewport identity to compare against
        // here.
        if (binding === null) {
          boundIdentityRef.current.delete(cellId);
          // R203.5: this cell binds no channel any more, so its retained
          // arrays are unreachable. Narrowed to this cell's own keys first
          // — nothing here knows which other cells are still mounted.
          for (const key of channelDataKeysForCell(combinedChannelDataRef.current.keys(), cellId)) {
            combinedChannelDataRef.current.delete(key);
          }
        }
        continue;
      }

      // Ruling R133: the "should a new run start" decision is recorded
      // **per window**, not once per cell -- `model/channelBindDriver.ts`'s
      // `updateChannelBindIdentity` doc comment explains why (a sibling
      // window's `SessionDetail` resolving after the primary window's must
      // reopen this gate even though the binding's own content, and so
      // `identity`, doesn't vary by window).
      const identity = bindingIdentity(binding);
      const perWindowIdentity = boundIdentityRef.current.get(cellId) ?? new Map<string, string>();
      boundIdentityRef.current.set(cellId, perWindowIdentity);
      const needsRun = updateChannelBindIdentity(perWindowIdentity, windowKeys, resolvedWindowKeys, identity);
      if (!needsRun) continue;

      const deps: ChannelBindDeps = {
        fetchTile: (sessId, channelId, tier, tileIndex, columnCount) => fetchTile(sessId, channelId, tier, tileIndex, columnCount),
        fetchHostChannel: (defName, budget) => fetchHostChannelDep(defName, budget),
      };
      const onAction = (action: ChannelBindAction) => {
        if (action.type === "channelData") {
          sandboxHostRef.current?.setChannelHostVar(action.channelId, action.length, action.t, action.v, action.w, action.windows, action.unit);
          // R139: retain the same combined arrays the sandbox just got a
          // transfer clone of -- `model/cursorCard.ts` reads this back.
          combinedChannelDataRef.current.set(`${action.cellId}::${action.channelId}`, action.retained);
          setChannelDataEpoch((n) => n + 1);
        } else if (action.type === "boundChannels") {
          sessionRef.current.setBoundChannels(action.cellId, action.bound);
        } else {
          setChartWindows((prev) => new Map(prev).set(action.cellId, action.chartWindow));
        }
      };
      const seq = cellRunSequencerRef.current.start(cellId);
      const isStale = () => !cellRunSequencerRef.current.isCurrent(cellId, seq);

      // Design line 152's mobile half (ruling R184, task 6): the same
      // predicate that decides paper decides the point budget, so a phone
      // fetches half the points a desktop does at the same chart width.
      void runChannelBind(deps, sessionRef.current.cache, bindWindows, cellId, binding, DEFAULT_CHART_WIDTH_PX, onAction, isStale, paperActive);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.cells,
    state.markdown,
    primaryEval,
    sessionDetail,
    sessionSpanUs,
    primaryWindow,
    windowsKeyValue,
    sessionDetailsReadiness,
    sessionSpansReadiness,
    primeState.primeEpoch,
  ]);

  // For each `js` cell whose binding is the FFT arm, once per **selected
  // window** whose per-window `bindingIdentity` changed (L6 Task 20, C2
  // §5.3; extended to full multi-window overlay in S1 Task 11a, ruling
  // R129 -- unlike the time-chart channel-bind effect above, `fetch_fft_v2`
  // and the sandbox's spectrum payload already carry a window dimension,
  // so there is no interim single-window restriction here). Each window's
  // fetch runs through the shared `CellRunSequencer`, keyed by
  // `fftRunKey(cellId, windowKey)` so one window's fetch supersedes only
  // its own prior runs, never a sibling window's in-flight fetch for the
  // same cell. Depends only on data (`state.cells`/`state.markdown`/
  // `primaryEval`/`sessionDetail`/`sessionSpanUs`/`windowsKeyValue`/
  // `sessionDetailsReadiness`), the tightened IPC-effects rule (wave-2
  // operating brief §4); its cleanup cancels nothing.
  //
  // A cell whose `unrequestable` is non-null for a given window never
  // reaches `runFft` for that window -- the note it carries is folded into
  // `cellErrorMessage` below, with no fetch and no host-variable push for
  // that window. Per ruling R121 ("shows where its series would be"), one
  // window's failure never blocks a sibling window's spectrum from being
  // fetched, retained or combined -- `pushCombinedSpectrumFor` omits only
  // the failed window's own series.
  //
  // `sessionDetailsReadiness` is in the dependency array below for the same
  // reason as the channel-bind effect above: `sessionSpanDriver` resolves
  // each selected window's `SessionDetail` independently and
  // asynchronously, and the per-window loop just below reads
  // `sessionDetailsByWindow` for every selected window, not only the
  // primary one -- without this dependency, a non-primary window's detail
  // arriving after the primary's would never re-run this effect, and that
  // window's spectrum would never be fetched (S1 merge blocker).
  useEffect(() => {
    if (state.markdown === null) return;
    const markdown = state.markdown;
    const currentWindowKeys = new Set(windows.map(windowKey));

    for (const cell of state.cells) {
      if (cell.id === null || cell.kind !== "js") continue;
      const cellId = cell.id;
      const code = decodeByteRange(markdown, cell.bodyRange);

      // Whether this cell is FFT-shaped at all is session-independent
      // beyond needing *some* non-null `sessionDetail`/`sessionSpanUs` to
      // reach `bindingFor` in the first place (`props.chart === "fft"`
      // does not vary by window) -- resolved against the primary window.
      const shapeWindow = primaryWindow !== null ? toWireWindow(primaryWindow) : null;
      const shapeBinding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis, shapeWindow, definitionUnitByName);
      if (shapeBinding === null || shapeBinding.kind !== "fft") {
        // Not FFT-shaped (or nothing resolvable yet, e.g. no session) --
        // drop every retained window's spectrum/identity/error for this
        // cell (a chart-type switch, or an edit that now names a
        // different channel, keeps no stale state around for a
        // `hostVarName` nothing binds to anymore).
        const perWindow = fftBoundIdentityRef.current.get(cellId);
        if (perWindow !== undefined) {
          for (const wKey of perWindow.keys()) cellRunSequencerRef.current.delete(fftRunKey(cellId, wKey));
          fftBoundIdentityRef.current.delete(cellId);
        }
        retainedSpectraRef.current.delete(cellId);
        setFftErrors((prev) => {
          if (!prev.has(cellId)) return prev;
          const next = new Map(prev);
          next.delete(cellId);
          return next;
        });
        continue;
      }

      // Prune this cell's per-window state to the currently selected
      // windows (decision 61: nothing shows data outside the current
      // selection) before considering which windows to (re)fetch.
      const perWindowIdentity = fftBoundIdentityRef.current.get(cellId) ?? new Map<string, string>();
      for (const wKey of Array.from(perWindowIdentity.keys())) {
        if (!currentWindowKeys.has(wKey)) {
          perWindowIdentity.delete(wKey);
          cellRunSequencerRef.current.delete(fftRunKey(cellId, wKey));
        }
      }
      fftBoundIdentityRef.current.set(cellId, perWindowIdentity);
      const retained = retainedSpectraRef.current.get(cellId);
      if (retained !== undefined) {
        let prunedAny = false;
        for (const wKey of Array.from(retained.byWindow.keys())) {
          if (!currentWindowKeys.has(wKey)) {
            retained.byWindow.delete(wKey);
            prunedAny = true;
          }
        }
        // Decision 61: dropping a deselected window's entry above is not
        // enough on its own -- the sandbox already has this cell's *old*
        // combined host variable, built while that window was still
        // selected, and nothing else in this loop necessarily re-pushes it
        // (a remaining window whose own identity is unchanged is skipped
        // below without calling `pushCombinedSpectrumFor`). Without this,
        // an unchecked lap's spectrum trace would keep rendering until some
        // unrelated edit happened to touch a still-selected window.
        if (prunedAny) pushCombinedSpectrumFor(cellId);
      }
      setFftErrors((prev) => {
        const cellMap = prev.get(cellId);
        if (cellMap === undefined) return prev;
        const nextCellMap = new Map(cellMap);
        let changed = false;
        for (const wKey of cellMap.keys()) {
          if (!currentWindowKeys.has(wKey)) {
            nextCellMap.delete(wKey);
            changed = true;
          }
        }
        return changed ? new Map(prev).set(cellId, nextCellMap) : prev;
      });

      for (const w of windows) {
        const wKey = windowKey(w);
        const detail = sessionDetailsByWindow.get(wKey) ?? null;
        if (detail === null) continue; // this window's session is still resolving

        const binding = bindingFor({ id: cellId, code }, detail, sessionSpanUs, definitionsWithAxis, toWireWindow(w), definitionUnitByName);
        if (binding === null || binding.kind !== "fft") continue; // e.g. the channel isn't in this window's session

        const identity = bindingIdentity(binding);
        if (perWindowIdentity.get(wKey) === identity) continue;
        perWindowIdentity.set(wKey, identity);

        if (binding.unrequestable !== null) {
          retainedSpectraRef.current.get(cellId)?.byWindow.delete(wKey);
          setFftErrors((prev) => {
            const cellMap = prev.get(cellId);
            if (cellMap === undefined || !cellMap.has(wKey)) return prev;
            const nextCellMap = new Map(cellMap);
            nextCellMap.delete(wKey);
            return new Map(prev).set(cellId, nextCellMap);
          });
          pushCombinedSpectrumFor(cellId);
          continue;
        }

        const fftBinding: FftCellBinding = binding;
        const deps: FftDeps = {
          fetchFftV2: (window, channelId, params, averaging) => fetchFftV2(window, channelId, params, averaging),
        };
        const dispatchFft = (action: FftAction) => {
          if (action.type === "spectrum") {
            // MAX_FFT_BINS is checked again here, after decode, against the
            // decoded spectrum's actual bin count -- the pre-fetch check in
            // `jsCellBinding.ts`'s `bindingForFft` is a conservative
            // estimate off the resolved window size, not a promise about
            // the real FFT convention `fetch_fft_v2` used (R79 Q4, R80
            // Q2). Over the cap: show the note, drop this window's
            // retained copy, and re-combine the rest.
            if (exceedsBinCap(action.fft.magnitudes.length)) {
              retainedSpectraRef.current.get(cellId)?.byWindow.delete(wKey);
              setFftErrors((prev) => {
                const cellMap = new Map(prev.get(cellId));
                cellMap.set(wKey, { kind: "internal", message: "This spectrum has more bins than the chart can draw — reduce the window size." });
                return new Map(prev).set(cellId, cellMap);
              });
              pushCombinedSpectrumFor(cellId);
              return;
            }
            const entry = retainedSpectraRef.current.get(cellId) ?? { hostVarName: fftBinding.hostVarName, byWindow: new Map<string, DecodedFft>() };
            entry.hostVarName = fftBinding.hostVarName;
            entry.byWindow.set(wKey, action.fft);
            retainedSpectraRef.current.set(cellId, entry);
            setFftErrors((prev) => {
              const cellMap = prev.get(cellId);
              if (cellMap === undefined || !cellMap.has(wKey)) return prev;
              const nextCellMap = new Map(cellMap);
              nextCellMap.delete(wKey);
              return new Map(prev).set(cellId, nextCellMap);
            });
            pushCombinedSpectrumFor(cellId);
          } else {
            retainedSpectraRef.current.get(cellId)?.byWindow.delete(wKey);
            setFftErrors((prev) => {
              const cellMap = new Map(prev.get(cellId));
              cellMap.set(wKey, action.error);
              return new Map(prev).set(cellId, cellMap);
            });
            pushCombinedSpectrumFor(cellId);
          }
        };
        const seq = cellRunSequencerRef.current.start(fftRunKey(cellId, wKey));
        const isStale = () => !cellRunSequencerRef.current.isCurrent(fftRunKey(cellId, wKey), seq);

        void runFft(deps, cellId, fftBinding.request, dispatchFft, isStale);
      }
    }
  }, [
    state.cells,
    state.markdown,
    primaryEval,
    sessionDetail,
    sessionSpanUs,
    windowsKeyValue,
    sessionDetailsReadiness,
    primeState.primeEpoch,
  ]);

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

  /** Every cell's display name (R214 item 2) — the same `# label:`-else-
   *  "Cell N" rule the maths graph's frames use, from the same module, so
   *  a cell is named identically wherever it appears. */
  const cellDisplayNameMap = useMemo(() => documentCellDisplayNames(state.markdown ?? ""), [state.markdown]);

  // `CodePane` completions (every kind); `plotForm`'s custom-code detection
  // means these are just candidates, never validated against what a cell
  // actually references. Unfiltered by `has_t` -- unlike `definitionsWithAxis`
  // above (which only feeds `bindingFor`/`unresolvedChannelId`), a definition
  // with no recorded axis is still a valid completion for a `math` cell to
  // reference in non-chart code.
  const channelIds = sessionDetail?.channels.map((c) => c.channel_id) ?? [];
  const definitionNames = Array.from(primaryOutputs.values())
    .filter((o) => o.kind === "math")
    .flatMap((o) => o.defs.map((d) => d.name));

  // Every `def_line` identifier the document declares, regardless of
  // whether it evaluated (ruling R150's amendment): a structural error on
  // one definition drops it from `defs` entirely (`CellDefResult`'s own
  // doc comment), so `definitionNames` above can't tell "never declared"
  // apart from "declared, but its own math cell errored" -- this can, and
  // feeds `jsCellNote`'s `isDeclaredDefinitionFailed` below.
  // Also the source `model/fixTarget.ts`'s `fixTargetCellId` resolves a
  // "Fix" button's target cell id from (decision 58) -- one scan serves
  // both, since a definition's own declaring cell is exactly what "Fix"
  // must open.
  const declaredDefCellIds = useMemo(() => definitionCellIds(state.markdown ?? ""), [state.markdown]);

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
    const blocks = proseBlocksFor(state.cells, state.markdown ?? "", primaryOutputs);
    return new Map(blocks.map((block) => [block.blockId, block]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cells, state.markdown, primaryEval]);

  /**
   * Paper's rebuild (ruling R184, L9-PAPER-PLAN task 5). The printed report
   * is built once, by `handleExportReport`, from an evaluation the user
   * waited for; paper is the same document rebuilt as the workbook
   * re-evaluates underneath the reader. `model/paperLive.ts` owns the one
   * rule that difference needs -- an in-flight evaluation keeps the last
   * good document rather than blanking a phone that is being read.
   *
   * A window counts as settled only if its stored result is *current*
   * (`isWindowStale`): showing a number computed from code the document has
   * since changed would be worse than showing the previous complete
   * document for another moment.
   *
   * `appVersion`/`generatedAtMs` are the two inputs paper genuinely has no
   * use for -- `buildReportDocument` reads them only for the `cover` block,
   * which `toPaperDocument` drops on screen (R184 item 2). They are passed
   * as fixed placeholders rather than fetched, which is also what keeps
   * this rebuild synchronous: a `getVersion()` await here would make every
   * settle a round trip, and `Date.now()` would make the document differ
   * from itself on every rebuild.
   */
  useEffect(() => {
    if (!paperActive) return;
    const settledWindowCount = windows.filter((w) => {
      const entry = state.windows.get(windowKey(w));
      return entry !== undefined && !isWindowStale(entry, state.evalRequestGeneration);
    }).length;
    const decision = paperLiveDecision({
      workbookReady: state.handle !== null && state.markdown !== null,
      windowCount: windows.length,
      settledWindowCount,
      hasLastDocument: paperDocRef.current !== null,
    });
    if (decision === "keep-last") return;
    if (decision === "empty") {
      paperDocRef.current = null;
      setPaperDoc(null);
      return;
    }
    const evals: (WindowEval | undefined)[] = windows.map((w) => {
      const entry = state.windows.get(windowKey(w));
      if (entry === undefined) return undefined;
      return entry.kind === "ok" ? { ok: Array.from(entry.outputs.values()) } : { error: entry.error };
    });
    const next = buildReportDocument({
      cells: state.cells,
      markdown: state.markdown ?? "",
      proseBlocks: proseBlocksByBlockId,
      evals,
      windows,
      sessions: paperSessions,
      chartChannelData: groupChannelDataByCell(combinedChannelDataRef.current),
      xMode,
      appVersion: PAPER_UNPRINTED_APP_VERSION,
      generatedAtMs: PAPER_UNPRINTED_GENERATED_AT_MS,
    });
    paperDocRef.current = next;
    setPaperDoc(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `windows` is
    // covered by `windowsKeyValue` (this page's existing convention for a
    // selection dependency), and `paperDocRef` is read deliberately as a
    // ref: see its own doc comment for why the held document must not be a
    // dependency of the effect that replaces it.
  }, [
    paperActive,
    windowsKeyValue,
    state.windows,
    state.cells,
    state.markdown,
    state.handle,
    state.evalRequestGeneration,
    proseBlocksByBlockId,
    paperSessions,
    channelDataEpoch,
    xMode,
  ]);

  /** Whether the current result for `cellId` is an error: its sandbox
   *  `cellError`, any of its per-window FFT fetch failures, or its own
   *  `CellOutput` carrying errors -- the same three sources, in the same
   *  precedence, `cellErrorMessage` builds its text from. */
  function cellHasError(cellId: string): boolean {
    if (cellErrors.has(cellId)) return true;
    if ((fftErrors.get(cellId)?.size ?? 0) > 0) return true;
    return (primaryOutputs.get(cellId)?.errors.length ?? 0) > 0;
  }

  /**
   * This cell's own evaluation status for `CellFrame` (ruling R210): each
   * cell reports queued / evaluating / settled / error for itself and
   * lands its own result, rather than the page standing in for all of them
   * with one spinner. `model/cellStatus.ts` holds the rule; this function
   * only reads the signals out of state.
   *
   * `cellId === null` (an unresolved fence id) always reads as queued -- it
   * can never have an evaluated `CellOutput`, since Rust indexes by id, so
   * it is permanently waiting on a result that cannot arrive.
   *
   * Scoped to the *primary* window, like every other single-window reader
   * in this file (`cellErrorMessage`, and `cellStale` before it).
   */
  function cellStatusFor(cellId: string | null): CellStatus {
    if (cellId === null) {
      return cellStatus({ hasOutput: false, stale: false, evalInFlight: evalInFlight, hasError: false });
    }

    return cellStatus({
      hasOutput: primaryOutputs.has(cellId),
      stale: isWindowStale(primaryEval, state.evalRequestGeneration),
      evalInFlight,
      hasError: cellHasError(cellId),
    });
  }

  /** The message `CellFrame`'s error `NoteBlock` shows, in the same
   *  precedence `cellStatus` checks: a sandbox render error first (the most
   *  specific, cell-local failure), then every selected window's own FFT
   *  fetch error joined together (S1 Task 11a: one note slot per cell, R121
   *  -- a sibling window's own successful spectrum still renders even when
   *  another window's fetch failed), then `primaryOutputs`' own per-cell
   *  errors. */
  function cellErrorMessage(cellId: string | null): string | undefined {
    if (cellId === null) return undefined;
    const sandboxError = cellErrors.get(cellId);
    if (sandboxError !== undefined) return sandboxError;
    const fftErrorsForCell = fftErrors.get(cellId);
    if (fftErrorsForCell !== undefined && fftErrorsForCell.size > 0) {
      return Array.from(fftErrorsForCell.values())
        .map((e) => e.message)
        .join("; ");
    }
    const output = primaryOutputs.get(cellId);
    if (output !== undefined && output.errors.length > 0) return output.errors.map((e) => e.message).join("; ");
    return undefined;
  }

  // The editor for the currently open cell (Task 15's `EditorPanes`), built
  // once here and placed differently depending on `placement`
  // (`model/editorPlacement.ts`): beside the output in a `Resizable` pane on
  // wide, inline under the selected cell's `CellFrame` on medium, and inside
  // the narrow `Sheet` on paper widths -- or portalled into the studio's
  // properties column when that column has published a slot node (R109).
  //
  // Ruling R185 item 1 is what put the sheet in that list. Narrow used to
  // build no editor at all (`outputIsReadOnly`) and hand the sheet a bare
  // `PropertiesForm`, which only exists for `js` cells -- so a `math` or
  // `table` cell was uneditable on a phone. `EditorPanes` already covers
  // every kind (`js` gets Properties beside Code, everything else gets Code
  // alone), so the sheet now holds the same editor every other placement
  // does, and each branch below decides only *where* it goes.
  //
  // Ruling R214 item 3 is why this no longer requires an open cell: the
  // column's code pane is the whole `.idl1wb` document, which is worth
  // showing whether or not a cell is selected. A `js` cell still adds its
  // Properties tab beside it; every other kind, and no selection at all,
  // is the document alone.
  const editorPanesElement =
    state.markdown !== null ? (
      <EditorPanes
        cellId={openCellId}
        kind={openCell?.kind ?? null}
        code={openCellCode}
        onChange={(nextCode) => openCellId !== null && handleCellCodeChange(openCellId, nextCode)}
        channelIds={channelIds}
        definitionNames={definitionNames}
        channels={propertiesChannels}
        laps={propertiesLaps}
        wholeDocumentCode={placement !== "sheet"}
        markdown={state.markdown}
        onMarkdownChange={handleDocumentChange}
        onSelectCell={setSelectedCellId}
        displayName={openCellId !== null ? displayNameFor(cellDisplayNameMap, openCellId) : null}
        renameable={openCell?.kind === "math"}
        onRenameCell={handleRenameCell}
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

  // Ruling R132: `null` with zero or one window selected (no marker,
  // byte-identical to today, R127 item 3); with more than one window
  // selected, the primary window's own label -- every math/table/prose
  // cell below reads only that window's `eval_workbook_v2`/`evalInline`
  // result (`primaryOutputs`/`inlineResults`), so it must say which window
  // it is showing once the selection names more than one.
  const cellListWindowNote =
    primaryWindow !== null ? primaryWindowNote(windows.length, windowDescriptorFor(primaryWindow, sessionDetail).label) : null;

  // Decision 62: `null` while the live engine version hasn't resolved yet,
  // or once every selected session already matches it -- `model/
  // engineVersionBanner.ts` decides the rest. `versionBannerDismissedFor`
  // scopes a dismissal to the exact selection it was dismissed for, so a
  // changed selection (or a changed live engine version, folded into the
  // same key) brings the banner back rather than hiding it forever.
  const versionBanner =
    currentEngineVersion !== null
      ? engineVersionBanner(
          windows.map((w) => ({ sessionId: w.sessionId, engineVersion: sessionEngineVersions.get(w.sessionId) ?? currentEngineVersion })),
          currentEngineVersion
        )
      : null;
  const versionBannerDismissKey = `${windowsKeyValue}::${currentEngineVersion ?? ""}`;
  const versionBannerVisible = versionBanner !== null && versionBannerDismissedFor !== versionBannerDismissKey;

  // Ruling R216 item 2's keyboard half of "Show code". A window listener
  // keyed to the selected cell, not a handler on the cell's own element:
  // a chart cell's frame holds nothing focusable (the plot itself lives in
  // the sandbox iframe), so a `keydown` on the frame would never fire for
  // the common case of a settled plot. Ignored while the focus is in a text
  // field or the editor, where Alt+C is the document's to interpret.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (selectedCellId === null) return;
      if (!isShowCodeShortcut(e)) return;
      const target = e.target as HTMLElement | null;
      if (target !== null && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      e.preventDefault();
      setRevealedCells((prev) => toggleCode(prev, selectedCellId));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCellId]);

  /** Every cell's kind in document order — `denseMode.ts`'s
   *  `sharesXAxisAbove` needs the cell above's kind, which `CellList`'s
   *  per-cell `frame` callback does not carry. */
  const cellKinds = state.cells.map((cell) => cell.kind);

  /**
   * Each `js` cell's legend (ruling R216 item 2), keyed by cell id and
   * already empty for a single-series plot.
   *
   * Built from the cell's own `channel(...)` call sites rather than from
   * `bindingFor` — the binding resolves one *mounted* channel per cell
   * (`renderJsCell`'s own TODO), so it cannot say how many series the plot
   * draws, while the call sites can. Units come from the same
   * `definitionUnitByName` map the binding uses, so a definition's legend
   * entry carries the unit the engine inferred rather than one guessed
   * here; a raw session channel has no entry and shows its name alone.
   */
  const cellLegends = new Map(
    state.cells
      .filter((cell) => cell.kind === "js" && cell.id !== null && state.markdown !== null)
      .map((cell) => {
        const code = decodeByteRange(state.markdown as string, cell.bodyRange);
        const names = Array.from(new Set(extractChannelCalls(code).map((call) => call.channel)));
        const series = names.map((name) => {
          const unit = definitionUnitByName.get(name);
          return { name, unit: unit !== undefined && unit.state === "known" ? unit.text : null };
        });
        return [cell.id as string, plotLegendEntries(series)] as const;
      }),
  );

  /** The plot context menu's two navigation items (ruling R216 item 2):
   *  select the cell and make sure the column that answers the question is
   *  on. Routed through `applyColumnToggleValue` so R213's "thrown by hand
   *  moves this shape to custom" rule applies to a menu pick exactly as it
   *  does to the toolbar's own toggles. */
  function openCellIn(cellId: string, column: "properties" | "graph"): void {
    setSelectedCellId(cellId);
    if (columnVisibility[column]) return;
    applyColumnToggleValue([...visibleNotebookColumnIds(columnVisibility, notebookColumnAvailability), column]);
  }

  const cellListElement = (
    <CellList
      doc={{ frontMatterRange: null, cells: state.cells }}
      proseBlocks={proseBlocksByBlockId}
      outputs={primaryOutputs}
      inlineResults={inlineResults}
      spanErrors={spanErrors}
      windowNote={cellListWindowNote}
      renderJsCell={(cellId) => {
            const cell = state.cells.find((c) => c.id === cellId);
            const code = cell !== undefined && state.markdown !== null ? decodeByteRange(state.markdown, cell.bodyRange) : "";
            const primaryWireWindow = primaryWindow !== null ? toWireWindow(primaryWindow) : null;
            const binding = bindingFor({ id: cellId, code }, sessionDetail, sessionSpanUs, definitionsWithAxis, primaryWireWindow, definitionUnitByName);
            const heightPx = cellHeights.get(cellId) ?? null;
            const sendLayout = (id: string, rect: { top: number; left: number; width: number }) =>
              sandboxHostRef.current?.sendLayout(id, rect);

            if (binding === null || primaryWindow === null) {
              const unresolved = sessionDetail !== null ? unresolvedChannelId(code, sessionDetail, definitionsWithAxis) : null;
              // A name that resolves as a plain (unfiltered) definition but
              // was excluded from `definitionsWithAxis` is a definition with
              // no recorded axis (Q3(a), R78) -- a distinct note from "not
              // part of this session", since the name itself is perfectly
              // valid, it just has nothing to chart against (C1: "time is
              // recorded, not assumed").
              const isAxisLessDefinition = unresolved !== null && definitionNames.includes(unresolved) && !definitionsWithAxis.has(unresolved);
              // A name that resolves as neither a session channel, a
              // definition with a value, nor an axis-less definition, but
              // *is* declared as a `def_line` somewhere in the document, is
              // a definition whose own math cell errored (ruling R150's
              // amendment) -- distinct from a name the session has simply
              // never heard of.
              const isDeclaredDefinitionFailed = unresolved !== null && !isAxisLessDefinition && declaredDefCellIds.has(unresolved);
              // `model/jsCellNote.ts` (L6 Task 21, extended by ruling R148
              // part 2/R150): fixes the rendering gap the 2026-09-06
              // preview captured -- a cell with no window selected
              // previously reserved blank space with no explanation at
              // all. `hasChannelReference` no longer requires `code` to
              // round-trip through `plotForm.parse` -- `bindingFor` binds
              // by extracting `channel(...)`/`spectrum(...)` calls, so this
              // note must recognise the same cells it does, not only
              // form-generated ones. Migrated from `sessionId` to
              // `windowCount` (S1 Task 11a, ruling R117).
              const note = jsCellNote({
                hasChannelReference: extractChannelCalls(code).length > 0 || extractSpectrumCalls(code).length > 0,
                windowCount: windows.length,
                unresolvedName: unresolved,
                isAxisLessDefinition,
                isDeclaredDefinitionFailed,
              });
              // Decision 58's "Fix" affordance: any note naming a specific
              // unresolved reference (a declared definition that failed, an
              // unknown channel, an axis-less definition) points somewhere
              // fixable -- a failed declared definition opens its own math
              // cell (`model/fixTarget.ts`), everything else opens this
              // chart's own cell so the user can correct the reference.
              // "No session selected" (`unresolved === null`) has no
              // per-cell fix -- no button in that case.
              const onFix =
                unresolved !== null
                  ? () =>
                      setSelectedCellId(
                        fixTargetCellId({
                          cellId,
                          failedDefinitionName: isDeclaredDefinitionFailed ? unresolved : null,
                          definitionCellIds: declaredDefCellIds,
                        })
                      )
                  : undefined;
              return (
                <JsCellFrame
                  cellId={cellId}
                  heightPx={heightPx}
                  error={cellErrors.get(cellId)}
                  note={note ?? undefined}
                  onFix={onFix}
                  sendLayout={sendLayout}
                />
              );
            }

            if (binding.kind === "fft") {
              // L6 Task 20 (R78 Task 19's Q2 precedent, R78 Task 18's Q2):
              // an FFT cell has no time viewport, so it mounts the plain
              // `JsCellFrame` -- no pan, no zoom, no hover readout, no
              // cursor readout, and no `sendTransform`. `unrequestable`
              // (too few samples, or over the bin cap, checked against the
              // primary window) shows its reason in the note slot; a real
              // per-window fetch failure (S1 Task 11a: full multi-window
              // overlay) shows `cellErrorMessage`'s joined text instead --
              // a sibling window's own successful spectrum still renders
              // (R121).
              const note = binding.unrequestable ?? cellErrorMessage(cellId);
              // Decision 58: the only fixable location for either cause is
              // this FFT cell's own properties (its axis config, or the
              // definition it names) -- opens itself.
              return (
                <JsCellFrame
                  cellId={cellId}
                  heightPx={heightPx}
                  note={note}
                  onFix={note !== undefined ? () => setSelectedCellId(cellId) : undefined}
                  sendLayout={sendLayout}
                />
              );
            }

            if (binding.mountedChannelId === null) {
              // Q2(a), R78: every one of this cell's bound channels is a
              // workbook definition -- there is no session channel, no time
              // window and so no gesture surface to mount `ChartCell` for.
              // The sandbox's own Plot still renders (the channel-bind
              // effect above feeds it every definition's data as a host
              // variable, same as a session channel); this frame just has
              // no pan/zoom/hover.
              const ownError = cellErrors.get(cellId);
              return (
                <JsCellFrame
                  cellId={cellId}
                  heightPx={heightPx}
                  error={ownError}
                  onFix={ownError !== undefined ? () => setSelectedCellId(cellId) : undefined}
                  sendLayout={sendLayout}
                />
              );
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
            const sid = primaryWireWindow!.session_id;

            return (
              <ChartCell
                cellId={cellId}
                tiles={window?.tiles ?? []}
                width={DEFAULT_CHART_WIDTH_PX}
                height={DEFAULT_JS_CELL_HEIGHT_PX}
                heightPx={heightPx}
                viewport={
                  // Decision 52 / Task 4: once any chart has settled a
                  // gesture, every chart's own time range reads through the
                  // one shared value -- `viewportForCell` applies this
                  // chart's own `DEFAULT_CHART_WIDTH_PX` to it. Before that
                  // first settle, each binding's own `initialSpan` still
                  // applies per cell (bindings can legitimately open to
                  // different spans; `sharedViewport` is `null` until a
                  // gesture actually commits one).
                  sharedViewport !== null
                    ? viewportForCell(sharedViewport, DEFAULT_CHART_WIDTH_PX)
                    : (window?.viewport ?? {
                        startUs: binding.initialSpan.startUs,
                        endUs: binding.initialSpan.endUs,
                        pixelWidth: DEFAULT_CHART_WIDTH_PX,
                      })
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

                  // Decision 52 / Task 4: this settle is the one that
                  // commits the worksheet's shared X range -- every mounted
                  // `ChartCell`'s own `viewport` prop reads through
                  // `viewportForCell(sharedViewport, …)` above, so every
                  // chart visually snaps to this same time window on the
                  // very next render, regardless of which chart's gesture
                  // triggered it.
                  setSharedViewport(commitSharedViewport(viewport));

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
                      sandboxHostRef.current?.setChannelHostVar(action.channelId, action.length, action.t, action.v, action.w, action.windows, action.unit);
                      // R139: retain the same combined arrays the sandbox
                      // just got a transfer clone of -- `model/cursorCard.ts`
                      // reads this back.
                      combinedChannelDataRef.current.set(`${action.cellId}::${action.channelId}`, action.retained);
                      setChannelDataEpoch((n) => n + 1);
                    } else if (action.type === "boundChannels") {
                      sessionRef.current.setBoundChannels(action.cellId, action.bound);
                    } else {
                      setChartWindows((prev) => new Map(prev).set(action.cellId, action.chartWindow));
                    }
                  };
                  void runChannelSettle(
                    deps,
                    sessionRef.current.cache,
                    bindWindowsFor(windows, sessionDetailsByWindow, sessionSpanUsByWindow),
                    cellId,
                    binding.channels,
                    channel.channelId,
                    viewport.startUs,
                    viewport.endUs,
                    viewport.pixelWidth,
                    onAction,
                    isStale,
                    sessionRef.current.boundChannelsFor(cellId),
                    paperActive
                  );

                  // "Every chart re-fetches" (plan Task 4): every *other*
                  // time-bound chart cell must re-fetch its own bound
                  // channels for this newly shared range too, not only the
                  // one whose gesture triggered this settle -- otherwise a
                  // sibling chart would keep showing tiles for its old
                  // window while its `viewport` prop (via `sharedViewport`
                  // above) has already moved, a picture-vs-viewport
                  // mismatch of exactly the silent-wrong-number shape this
                  // lane guards against. Mirrors the channel-bind effect
                  // above cell for cell, but calls `runChannelSettle` at the
                  // *shared* range (`viewport.startUs`/`endUs`, this chart's
                  // own `DEFAULT_CHART_WIDTH_PX` since every chart renders
                  // at that same constant width today), never
                  // `runChannelBind` -- that would silently discard the
                  // pan/zoom the user just performed for every chart but
                  // this one, snapping the rest back to their own
                  // `initialSpan`. `onAction` above is already
                  // cellId-agnostic (reads `action.cellId` from the action
                  // itself), so it's reused as-is.
                  for (const otherCell of state.cells) {
                    if (otherCell.id === null || otherCell.id === cellId || otherCell.kind !== "js") continue;
                    const otherCellId = otherCell.id;
                    const otherCode = state.markdown !== null ? decodeByteRange(state.markdown, otherCell.bodyRange) : "";
                    const otherBinding = bindingFor({ id: otherCellId, code: otherCode }, sessionDetail, sessionSpanUs, definitionsWithAxis, primaryWireWindow, definitionUnitByName);
                    if (otherBinding === null || otherBinding.kind !== "time" || otherBinding.mountedChannelId === null) continue;
                    const otherChannel = otherBinding.channels.find((c) => c.channelId === otherBinding.mountedChannelId);
                    if (otherChannel === undefined) continue;

                    const otherSeq = cellRunSequencerRef.current.start(otherCellId);
                    const otherIsStale = () => !cellRunSequencerRef.current.isCurrent(otherCellId, otherSeq);
                    void runChannelSettle(
                      deps,
                      sessionRef.current.cache,
                      bindWindowsFor(windows, sessionDetailsByWindow, sessionSpanUsByWindow),
                      otherCellId,
                      otherBinding.channels,
                      otherChannel.channelId,
                      viewport.startUs,
                      viewport.endUs,
                      DEFAULT_CHART_WIDTH_PX,
                      onAction,
                      otherIsStale,
                      sessionRef.current.boundChannelsFor(otherCellId),
                      paperActive
                    );
                  }
                }}
                fetchCursorReadout={(sessId, channels, tUs) => cursorReadout(sessId, channels, tUs)}
                channelUnit={sessionDetail?.channels.find((c) => c.channel_id === channel.channelId)?.unit}
                windowCount={windows.length}
                selectedWindowKeys={selectedWindowKeys}
                combinedChannelData={combinedChannelDataRef.current.get(`${cellId}::${channel.channelId}`)}
                sendTransform={(id, translateXPx, scaleX) => sandboxHostRef.current?.sendTransform(id, translateXPx, scaleX)}
                sendLayout={sendLayout}
                cursorTUs={sharedCursorTUs}
                playing={playback.playing}
                playbackMode={playbackMode}
                primaryWindowSpan={primaryWindowSpanForCell}
                onSetCursor={(tUs) => setManualCursorTUs(BigInt(Math.round(tUs)))}
                onClearCursor={() => setManualCursorTUs(null)}
                cursorBus={cursorBus}
                inputMapPreset={inputMapPreset}
                onToggleCode={() => setRevealedCells((prev) => toggleCode(prev, cellId))}
              />
            );
          }}
          frame={(cell, output, index) => {
            const cellCode = state.markdown !== null ? decodeByteRange(state.markdown, cell.bodyRange) : undefined;
            const cellTitle = cellCode !== undefined ? cellLabelFromBody(cellCode) : null;
            return (
            <CellFrame
              cell={cell}
              index={index}
              selected={cell.id !== null && selectedCellId === cell.id}
              onSelect={() => {
                if (cell.id !== null) setSelectedCellId(cell.id);
              }}
              status={cellStatusFor(cell.id)}
              error={cellErrorMessage(cell.id)}
              codeVisible={cell.id !== null && isCodeVisible(revealedCells, cell.id)}
              onToggleCode={() => {
                const cellId = cell.id;
                if (cellId === null) return;
                setRevealedCells((prev) => toggleCode(prev, cellId));
              }}
              code={cellCode}
              /* Ruling R216 items 2 and 3: a chart cell's chrome overlays
                 its plot instead of sitting in a row above it, and dense
                 stacking overlays every kind's. */
              chrome={denseChromeMode(dense, cell.kind)}
              dense={dense}
              sharesXAxisAbove={sharesXAxisAbove(cellKinds, index, dense)}
              title={cellTitle ?? undefined}
              legend={cell.id !== null ? (cellLegends.get(cell.id) ?? undefined) : undefined}
              onOpenProperties={cell.id !== null ? () => openCellIn(cell.id as string, "properties") : undefined}
              onTidyInGraph={cell.id !== null ? () => openCellIn(cell.id as string, "graph") : undefined}
            >
              {output}
              {/* Medium layout (decision 29): the editor sits inline, under
                  the selected cell's own frame, rather than at the bottom of
                  the whole document. */}
              {!editorIsPortalHosted && placement === "inline" && columnVisibility.properties && cell.id !== null && cell.id === openCellId && editorPanesElement}
            </CellFrame>
            );
          }}
        />
  );

  /**
   * The maths graph canvas (Task 10, C2 §3.7): a view of the same open
   * workbook `cellListElement` renders, not a second document (decision
   * 40). `graphOutputs`/`graphSessionDetails` derive from state this
   * component already holds via the pure `model/graphView.ts` helpers, so
   * the derivation itself stays unit-tested rather than living inline
   * here. A card click opens the node's owning cell in `EditorPanes`
   * through the existing `selectedCellId` mechanism -- no new editor path.
   * `onCommit` dispatches `editFrontMatter`, which marks the document
   * dirty for save without touching `dirtyCellIds` (no re-evaluation for a
   * move, §3.7.1's advisory guarantee).
   */
  // Memoized on identity, not recomputed every render: `GraphCanvas.tsx`
  // itself `useMemo`s its heavy derivations (`buildGraphModel`,
  // `computeNodeStatuses`, ...) keyed on these same props' identity, so a
  // fresh array/map here on every render (this page re-renders often, e.g.
  // every cursor tick) would silently defeat that memoization.
  const graphOutputs = useMemo(() => primaryWindowOutputs(state.windows, primaryWindow), [state.windows, primaryWindow]);
  const graphSessionDetails = useMemo(() => sessionDetailsBySessionId(windows, sessionDetailsByWindow), [windows, sessionDetailsByWindow]);
  const graphCanvasElement =
    state.markdown !== null ? (
      <GraphCanvas
        markdown={state.markdown}
        outputs={graphOutputs}
        selectedWindows={windows.map(toWireWindow)}
        windows={state.windows}
        sessionDetails={graphSessionDetails}
        onCommit={(nextMarkdown) => dispatch({ type: "editFrontMatter", markdown: nextMarkdown })}
        onSelectCell={(cellId) => setSelectedCellId(cellId)}
        colourCodeNodes={colourCodeNodes}
        selectedCellId={selectedCellId}
      />
    ) : null;

  // Desktop-only canvas (decision 77): `placement === "sheet"` is this
  // page's existing narrow-width signal (`editorPlacement.ts`) -- the
  // Properties pane keeps its narrow `BrandSheet` behaviour unchanged
  // (Task 12), the graph simply never takes over the main content area at
  // that width, falling back to the cell list even if the toggle was left
  // on from a wider layout. Ruling R161, decision 29: a narrow layout has
  // no columns to toggle at all, so the toolbar's leading group hides
  // entirely rather than showing dead controls -- `columnsToggleAvailable`.
  //
  // Ruling R184 extends that to `cells`: where paper is active the cell
  // list is *replaced* by the paper view, so the cells pane is unavailable
  // too. Availability goes through `visibleNotebookColumnIds`'s
  // availability record and **never** by writing stored visibility -- a
  // phone that overwrote `columnVisibility` would silently retune the
  // desktop's remembered toggles (R161 is renderer-only and per-machine).
  const notebookColumnAvailability: NotebookColumnVisibility = {
    graph: !paperActive,
    properties: !paperActive,
    cells: !paperActive,
  };
  const visibleColumnIds = visibleNotebookColumnIds(columnVisibility, notebookColumnAvailability);
  const columnsToggleAvailable = !paperActive;

  /** The toggle group's next on-id set with `column` flipped — what the
   *  View menu's two column items hand `applyColumnToggleValue`, so a menu
   *  pick goes through exactly the same path (and the same R213 "thrown by
   *  hand" bookkeeping) as the toolbar's own toggles. */
  function toggledColumnIds(column: "graph" | "properties"): string[] {
    return columnVisibility[column] ? visibleColumnIds.filter((id) => id !== column) : [...visibleColumnIds, column];
  }
  // `!graphIsPortalHosted`: when the wide studio's maths column hosts the
  // canvas, this page renders no graph pane of its own -- one
  // `GraphCanvas` instance, in one place, exactly as `editorIsPortalHosted`
  // does for `EditorPanes` (R109 ruling 1).
  const showGraph = visibleColumnIds.includes("graph") && graphCanvasElement !== null && !graphIsPortalHosted;
  const showCells = visibleColumnIds.includes("cells");
  // Fallback single content (medium/`"inline"` and narrow/`"sheet"`
  // placements have one content area, not a resizable split) -- same
  // preference order the pre-R161 `graphViewOpen` toggle had: graph when
  // it's on and available, the cell list otherwise. Also the wide/`"panes"`
  // placement's own last-resort fallback when neither pane below ends up
  // rendering (graph unavailable and cells toggled off at once) -- an empty
  // main area is a worse regression than showing the cell list unasked.
  // Ruling R184: at paper widths the notebook's one content area is the
  // paper view, never the cell list or the graph -- both are unavailable
  // there (`notebookColumnAvailability` above), and `showGraph`/`showCells`
  // are already false, so this is the only branch that can put paper on
  // screen. `paperDoc === null` is a real state, not an error: the first
  // evaluation of a freshly opened workbook has not settled yet
  // (`model/paperLive.ts`), and saying so beats an unexplained blank page.
  const mainContentElement = paperActive ? (
    paperDoc !== null ? (
      <PaperView document={paperDoc} onSelectCell={(cellId) => setSelectedCellId(cellId)} scheme={effectivePaperTheme(appTheme, paperTheme)} />
    ) : (
      <p className="paper-empty">No output yet -- this notebook has not finished evaluating.</p>
    )
  ) : showGraph ? (
    graphCanvasElement
  ) : (
    cellListElement
  );
  // Wide/`"panes"` placement's own panel list -- both graph and cells can
  // show at once now (R161: "these replace the current Graph/Cells toggle,
  // since showing or hiding a column is the same gesture, generalised" --
  // generalised *from* mutually exclusive *to* independent).
  const mainPanels: { id: "graph" | "cells"; element: ReactNode }[] =
    showGraph || showCells
      ? [...(showGraph ? [{ id: "graph" as const, element: graphCanvasElement }] : []), ...(showCells ? [{ id: "cells" as const, element: cellListElement }] : [])]
      : [{ id: "cells", element: cellListElement }];
  const showPropertiesPane = !editorIsPortalHosted && placement === "panes" && columnVisibility.properties && editorPanesElement !== null;

  /** The one line the Save button needs to explain itself, or `null`.
   *  Shown as the button's own `title` and, when it is a real failure, in
   *  the notice strip under the row — never as a free-floating span inside
   *  a toolbar that must stay one line tall (ruling R212 item 4). */
  const saveNote =
    saveUnavailable
      ? "Save is not available yet -- the document's text could not be read."
      : saveFlowState.status === "error"
        ? `Save failed: ${saveFlowState.error.message}`
        : null;

  // Ruling R161, corrected by a 2026-09-09 bug report and reshaped by R212
  // item 4: one CAD-style top toolbar spanning the *window* (not just this
  // tab's own column area -- that correction is what `shell/toolbarSlot.ts`
  // exists for), above the columns, so the preview beneath it runs full
  // height.
  //
  // The row's own markup, its group order, its collapse behaviour and its
  // layer-order note all live in `components/NotebookToolbar.tsx` now; this
  // file keeps only the state those groups read and write. What R161
  // achieved with a static split (the gesture-preset and X-axis selects
  // parked behind a "More" disclosure, because "nothing in this codebase
  // measures toolbar overflow yet") is now an actual measurement --
  // `shell/toolbarLayout.ts` over a `ResizeObserver` on the row.
  // --- the File and View menus' Notebook commands (ruling R220 item 1) ---
  //
  // Registered here, not in the shell: every one of these closes over this
  // page's own state (the open document, the catalog entry, the column
  // visibility R213 reads), which is exactly why R109 puts the handler
  // where the state is. `available` is the second argument, so a command
  // whose preconditions are not met leaves the registry and greys out in
  // its menu rather than being a menu item that silently does nothing.
  const [newWorkbookOpen, setNewWorkbookOpen] = useState(false);
  const [openWorkbookOpen, setOpenWorkbookOpen] = useState(false);

  useCommand(MENU_COMMAND_IDS.workbookNew, true, () => setNewWorkbookOpen(true));
  useCommand(MENU_COMMAND_IDS.workbookOpen, true, () => setOpenWorkbookOpen(true));
  useCommand(MENU_COMMAND_IDS.libraryRescan, !rescanning, () => void handleRescan());
  useCommand(
    MENU_COMMAND_IDS.workbookSave,
    state.handle !== null && !saveUnavailable && saveFlowState.status !== "saving",
    () => void handleSave()
  );
  useCommand(
    MENU_COMMAND_IDS.workbookExportReport,
    state.handle !== null && !exportingReport && state.markdown !== null,
    () => void handleExportReport()
  );
  useCommand(MENU_COMMAND_IDS.viewToggleDense, true, () => applyDense(!dense));
  useCommand(MENU_COMMAND_IDS.viewToggleGraph, columnsToggleAvailable, () =>
    applyColumnToggleValue(toggledColumnIds("graph"))
  );
  useCommand(MENU_COMMAND_IDS.viewToggleProperties, columnsToggleAvailable, () =>
    applyColumnToggleValue(toggledColumnIds("properties"))
  );

  const toolbarElement = (
    <>
      <NotebookToolbar
        columnsToggleAvailable={columnsToggleAvailable}
        columnVisibility={columnVisibility}
        onColumnToggleValue={applyColumnToggleValue}
        entry={entry}
        rescanning={rescanning}
        creating={creating}
        dirty={state.dirtyCellIds.size > 0 || state.frontMatterDirty}
        workbookBarError={workbookBarError}
        lastRebuild={lastRebuild}
        onCreate={(name) => void handleCreate(name)}
        onRescan={() => void handleRescan()}
        onSelect={handleSelect}
        register={register}
        dense={dense}
        onDenseChange={applyDense}
        onRegisterChange={handleRegisterChange}
        activePreset={activePreset}
        onPresetChange={applyLayoutPreset}
        windows={windows}
        sessionDetailsByWindow={sessionDetailsByWindow}
        playing={playback.playing}
        cursorTUs={sharedCursorTUs}
        onTogglePlay={handleTogglePlay}
        transportDisabled={!primeState.running}
        routeVisible={routeVisible}
        speed={playback.speed}
        onSpeedChange={(speed) => setPlayback((prev) => setSpeed(prev, speed))}
        playbackMode={playbackMode}
        onPlaybackModeChange={setPlaybackMode}
        followingWindowLabel={cellListWindowNote}
        documentOpen={state.handle !== null}
        saveDisabled={saveUnavailable || saveFlowState.status === "saving"}
        saveLabel={saveFlowState.status === "saving" ? "Saving…" : "Save"}
        onSave={() => void handleSave()}
        saveNote={saveNote}
        exporting={exportingReport}
        exportDisabled={exportingReport || state.markdown === null}
        onExportReport={() => void handleExportReport()}
        inputMapPreset={inputMapPreset}
        inputMapPresets={INPUT_MAP_PRESETS}
        onInputMapPresetChange={(id) => {
          const next = findInputMapPreset(id);
          if (next !== null) setInputMapPreset(next);
        }}
        xMode={xMode}
        xModeOptions={X_MODE_OPTIONS}
        onXModeChange={setXMode}
      />
      {/* Not a toolbar group: the rescan report, the typed catalog error
          and a failed save are prose of unbounded length, and a row that
          must never wrap is the wrong home for them (R212 item 4). They
          render here, directly under the row, where they may wrap freely
          and take no height at all when there is nothing to say. */}
      <WorkbookNotices entry={entry} error={workbookBarError} lastRebuild={lastRebuild} rescanning={rescanning} />
      {saveFlowState.status === "error" && saveNote !== null && (
        <p role="alert" className="border-b border-rule bg-surface-2 px-2 py-1 font-mono text-[length:var(--nb-text-label)] text-accent">
          {saveNote}
        </p>
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Portal-hosted whenever this tab is the active route (bug report
          fixed 2026-09-09): `toolbarSlotNode` exists whether or not
          Notebook is the active tab (it is always mounted, R93), so
          `routeVisible` is the gate that keeps every other tab from
          showing this toolbar too. The inline fallback below only fires in
          the brief window before `AppShell.tsx`'s `ToolbarSlotRow` has
          published its node (same latency `editorSlotNode` already
          accepts) -- Notebook's own route panel is `hidden` in that case
          whenever this tab is not the active one, so the fallback never
          leaks onto another tab either. */}
      {routeVisible && toolbarSlotNode !== null && createPortal(toolbarElement, toolbarSlotNode)}
      {routeVisible && toolbarSlotNode === null && toolbarElement}
      {/* The Notebook activity's sidebar content (ruling R220 item 1): the
          workbook list and the cells outline. Unlike the toolbar above,
          this needs no `routeVisible` gate — `sidebarSlot.ts` keys its
          nodes by route, so this portal only ever reaches the Notebook
          activity's own panel, which the shell shows when that activity is
          current. Nothing renders here when there is no sidebar at all
          (narrow layouts, R220 item 3): the cells are already on the page
          and the workbook picker is in the toolbar. */}
      {notebookSidebarNode !== null &&
        createPortal(
          <NotebookSidebar
            entry={entry}
            onSelectWorkbook={handleSelect}
            cells={state.cells}
            displayName={(cellId) => displayNameFor(cellDisplayNameMap, cellId)}
            selectedCellId={selectedCellId}
            onSelectCell={setSelectedCellId}
          />,
          notebookSidebarNode
        )}
      <NewWorkbookDialog
        open={newWorkbookOpen}
        onOpenChange={setNewWorkbookOpen}
        creating={creating}
        onCreate={(name) => void handleCreate(name)}
      />
      <OpenWorkbookDialog open={openWorkbookOpen} onOpenChange={setOpenWorkbookOpen} entry={entry} onSelect={handleSelect} />
      {/* Master timeline strip (decision 52, R115, R134 item 1): one lane
          per selected window, own draggable boundary handles. Not one of
          R161's named toolbar controls -- kept as its own full-width strip,
          same as before, directly under the toolbar. Commits a drag to
          `AppState.selection` on pointer-up only (`model/timelineStrip.ts`'s
          own settle-discipline doc comment) -- `timelineCommit` is the same
          pure function `TimelineStrip.tsx`'s own test suite exercises
          directly; this call site only wires it to `appDispatch`. */}
      <TimelineStrip
        windows={windows}
        detailsByWindow={sessionDetailsByWindow}
        spanUsByWindow={sessionSpanUsByWindow}
        viewport={sharedViewport}
        onCommit={(laneIndex, candidate) => appDispatch({ type: "SET_WINDOWS", windows: timelineCommit(windows, laneIndex, candidate) })}
      />
      {/* R161 item 4: banners stay banners -- a statement about the
          document, not a control -- and move under the toolbar, spanning
          the tab, so they never shrink one column. Same conditions, same
          components, as before; only their position (below the toolbar and
          timeline, above the columns) changed. */}
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
      {state.markdownStatus === "error" && state.markdownError !== null && (
        <p className="workbook-markdown-error">Notebook error: {state.markdownError}</p>
      )}
      {evalError !== null && (
        <p role="alert" className="workbook-eval-error">
          {evalError.message}
        </p>
      )}
      {selectedWorkbookId !== null && state.handle === null && state.markdownStatus === "loading" && <p>Opening notebook...</p>}
      {state.conflict && <ConflictBanner onReloadFromDisk={() => void handleReloadFromDisk()} onOverwrite={() => void handleOverwrite()} />}
      {versionBannerVisible && versionBanner !== null && (
        <VersionBanner banner={versionBanner} onDismiss={() => setVersionBannerDismissedFor(versionBannerDismissKey)} />
      )}
      {/* R151 items 9/10 (C2 §3.8): a passive on-open notice, never a rewrite the user didn't ask for. */}
      <MigrationBanner variant="pending" migrations={state.pendingMigrations} />
      {/* The on-save report of what the save just rewrote -- dismissable, re-shown by the next save that produces a new hash. */}
      {appliedMigrationsDismissedFor !== state.hash && (
        <MigrationBanner
          variant="applied"
          migrations={state.appliedMigrations}
          onDismiss={() => setAppliedMigrationsDismissedFor(state.hash)}
        />
      )}
      {state.handle !== null && placement === "panes" && (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          {/* R161 item 2, generalised: `mainPanels` holds graph and/or cells,
              whichever `columnVisibility` currently has on (both, either, or
              (via its own fallback) cells alone) -- each its own resizable
              panel, a divider only between two actually-rendered panels,
              same "no panel, no divider when hidden" rule `ColumnFrame.tsx`
              already established (R107). */}
          {mainPanels.map((panel, index) => (
            <Fragment key={panel.id}>
              {index > 0 && <ResizableHandle withHandle />}
              <ResizablePanel id={`notebook-${panel.id}`} defaultSize={mainPanels.length === 1 ? 65 : 65 / mainPanels.length} minSize={20}>
                <div className="h-full overflow-auto p-4" data-register={register} style={registerContainerStyle}>
                  {panel.element}
                </div>
              </ResizablePanel>
            </Fragment>
          ))}
          {showPropertiesPane && (
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
          {mainContentElement}
        </div>
      )}
      {state.handle !== null && placement === "sheet" && (
        <>
          <div className="min-h-0 flex-1 overflow-auto p-4" data-register={register} style={registerContainerStyle}>
            {mainContentElement}
          </div>
          {/* Ruling R185 item 1: paper and the editor alternate on narrow
              and never share the screen -- the editor is this overlay, over
              the paper it was opened from. Every cell kind opens it now, so
              the title names what the sheet actually holds: a `js` cell's
              Properties tab beside its Code, or the code editor alone. */}
          <BrandSheet
            open={!editorIsPortalHosted && openCellId !== null && editorPanesElement !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedCellId(null);
            }}
            title={openCell === null ? "" : sheetTitleFor(editorContentFor(openCell.kind))}
          >
            {!editorIsPortalHosted && editorPanesElement}
          </BrandSheet>
        </>
      )}
      {/* The properties column's content. The "Properties hidden -- shown
          via the toolbar's toggle" branch is gone with R213 item 1: the
          Output preset needs the output column *full* width, so the
          properties toggle now removes the whole column the way R208 made
          the Graph toggle remove its own (`shell/studioColumns.ts`).
          `editorSlotNode` is therefore non-null exactly when the column is
          showing, and a hidden-state message would have nowhere to render
          and nothing to say. */}
      {editorSlotNode !== null &&
        createPortal(editorPanesElement ?? <ColumnPlaceholder>Select a cell to edit its properties and code.</ColumnPlaceholder>, editorSlotNode)}
      {/* The maths column's content. Unlike the properties column just
          above, there is no "hidden" placeholder branch here: R208 item 2
          made the Graph toggle remove the whole column, so `graphSlotNode`
          is non-null exactly when the column is showing and a hidden-state
          message would have nowhere to render and nothing to say. R161's
          "the toggles never remove a studio column" is superseded for this
          column -- a column that stays put to explain where its own toggle
          is was the bug. `graphCanvasElement` is `null` until a workbook is
          open -- a stated absence beats an empty column (R148/R150). */}
      {graphSlotNode !== null &&
        createPortal(
          graphCanvasElement ?? <ColumnPlaceholder>Open a workbook to see its maths graph.</ColumnPlaceholder>,
          graphSlotNode
        )}
      {/* The sandbox iframe host: fixed to the full viewport so cell
          iframes positioned into it (`sendLayout`) track scroll in real
          pixels. `zIndex: 0` is explicit, not incidental -- a fixed element
          with *any* stated z-index stacks above ordinary static in-flow
          content regardless of DOM order, which is exactly what a chart
          needs against the cell text around it. See the toolbar's own
          layer-order comment above (`toolbarElement`) for why this host
          must stay above in-flow content everywhere except that one row,
          and why the toolbar's `z-10` -- not lowering this `0` -- is what
          keeps a scrolled chart from painting over it. */}
      <div
        ref={containerRef}
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, border: "none" }}
      />
      {/* Task R2: `styles/report-print.css` hides everything else and
          shows only this root once `window.print()` runs -- the report is
          a purpose-built document, never the notebook column (which
          cannot be printed, report-plan.md §1.2). */}
      <div id="report-print-root">{reportDoc !== null && <ReportView document={reportDoc} onReady={handleReportReady} />}</div>
    </div>
  );
}
