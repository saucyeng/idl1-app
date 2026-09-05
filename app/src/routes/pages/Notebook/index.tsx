import { useEffect, useReducer, useRef, useState } from "react";

import { listWorkbooks } from "../../../ipc/catalog";
import { evalWorkbook, openWorkbook, watchWorkbook, type WorkbookEvent } from "../../../ipc/workbook";
import { useAppState } from "../../../state/AppState";
import CellList from "./components/CellList";
import { readWorkbook, NotImplementedError } from "./ipcStubs/readWorkbook";
import { extractInlineSpans } from "./components/ProseSpan";
import type { SandboxCell } from "./host/protocol";
import { SandboxHost } from "./host/SandboxHost";
import { NotebookSession } from "./host/NotebookSession";
import { TileCache } from "./model/tileCache";
import { runEval, runOpenAndEval, type OpenEvalDeps } from "./model/openEvalDriver";
import { initialWorkbookState, workbookReducer } from "./model/workbookState";

/** `init`'s `runtimeVersion` argument (`host/protocol.ts`) -- an
 *  informational string the sandbox does not currently branch on
 *  (`sandbox/main.ts`'s `init` handler ignores it beyond constructing a
 *  fresh `SandboxRuntime`); matches the placeholder value
 *  `host/rebuildReplay.test.ts` already exercises. Bumping this to track
 *  an actual notebook-runtime version is future work, not this task's. */
const SANDBOX_RUNTIME_VERSION = "1.0.0";

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
 * `runOpenAndEval`/`runEval`), and staleness is tracked by a monotonic
 * sequence ref bumped at the start of each run -- the same shape
 * `model/settle.ts`/`model/cursorReadoutDriver.ts` already use elsewhere in
 * this lane. `SandboxHost`'s callbacks are held in refs so the mount
 * effect that constructs it runs exactly once.
 *
 * `js`-kind cells render the sandbox's serialized `cellResult` output
 * directly as a plain mounted `<div>`, not through `components/ChartCell.tsx`
 * -- `ChartCell` needs a per-cell viewport/tile-fetch pipeline (session
 * channel metadata, a settle-driven fetch loop) this task did not build a
 * binding for; see this task's report for the fuller rationale
 * (`CellList.tsx`'s `renderJsCell`).
 */
export default function NotebookPage() {
  const [appState] = useAppState();
  const { sessionId, lapContext } = appState.selection;

  const [state, dispatch] = useReducer(workbookReducer, initialWorkbookState);
  const [cellResults, setCellResults] = useState<Map<string, { html?: string; error?: string }>>(new Map());
  const [inlineResults, setInlineResults] = useState<Map<string, string>>(new Map());
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxHostRef = useRef<SandboxHost | null>(null);
  const sessionRef = useRef<NotebookSession>(new NotebookSession(new TileCache()));
  const openSeqRef = useRef(0);
  const evalSeqRef = useRef(0);

  // `AppState.selection.lapContext` (R53 Data Q3) is read here but cannot
  // yet be passed to `evalWorkbook` -- the command's signature has no slot
  // for it (IPC need N4, `runs/2026-09-05/lanes/l6/IPC-NEEDS.md`, not
  // landed). Referencing it (without using it) keeps this read visible to
  // a later diff rather than silently dropped.
  void lapContext;
  // TODO(idl0): thread `lapContext` into `evalWorkbook`'s call below once
  // N4 lands (`eval_workbook(id, sessionId, lapContext)`); today it is read
  // from `AppState.selection` but not passed anywhere.

  // Callbacks are routed through refs updated on every render so the mount
  // effect below can keep an empty dependency array -- it only constructs
  // and disposes the one `SandboxHost`, it never needs a fresh callback
  // identity to do that.
  const onCellResultRef = useRef((cellId: string, html: string) => {
    setCellResults((prev) => new Map(prev).set(cellId, { html }));
  });
  const onCellErrorRef = useRef((cellId: string, message: string) => {
    setCellResults((prev) => new Map(prev).set(cellId, { error: message }));
  });
  const onInlineResultRef = useRef((spanId: string, text: string) => {
    setInlineResults((prev) => new Map(prev).set(spanId, text));
  });

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const host = new SandboxHost(container, {
      onCellResult: (cellId, html) => onCellResultRef.current(cellId, html),
      onCellError: (cellId, message) => onCellErrorRef.current(cellId, message),
      onInlineResult: (spanId, text) => onInlineResultRef.current(spanId, text),
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
    void watchWorkbook(workbookId, (event: WorkbookEvent) => {
      if (disposed) return;
      dispatch({ type: "watchEvent", event });
      const mySeq = ++evalSeqRef.current;
      void runEval({ evalWorkbook }, workbookId, sessionIdRef.current, dispatch, () => evalSeqRef.current !== mySeq);
    });

    return () => {
      disposed = true;
    };
  }, [state.handle?.id]);

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
    for (const cell of state.cells) {
      if (cell.id === null) continue;
      if (cell.kind === "js") {
        jsCells.push({ id: cell.id, code: decodeByteRange(state.markdown, cell.bodyRange) });
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
  }, [state.cells, state.markdown]);

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
        <CellList
          doc={{ frontMatterRange: null, cells: state.cells }}
          markdown={state.markdown ?? ""}
          outputs={state.outputs}
          inlineResults={inlineResults}
          renderJsCell={(cellId) => {
            const result = cellResults.get(cellId);
            return (
              <div
                className="cell-list-js-mount"
                data-selected={selectedCellId === cellId}
                onClick={() => setSelectedCellId(cellId)}
              >
                {result?.error !== undefined ? (
                  <span className="cell-list-js-error">{result.error}</span>
                ) : result?.html !== undefined ? (
                  <div dangerouslySetInnerHTML={{ __html: result.html }} />
                ) : (
                  <span className="cell-list-js-pending">...</span>
                )}
              </div>
            );
          }}
        />
      )}
      <div ref={containerRef} style={{ display: "none" }} />
    </div>
  );
}
