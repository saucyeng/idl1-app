/**
 * The pure save state machine for a notebook document (plan Task 14) and
 * the frontend half of C4 §4's self-write suppression.
 *
 * `saveFlow` is deliberately not a React hook -- it holds one
 * `SaveFlowState` behind a closure and is driven by an injected
 * `SaveFlowDeps.save`, so it is testable with a fake resolve/reject
 * instead of mocking `@tauri-apps/api/core`'s `invoke`. `Notebook/index.tsx`
 * owns one instance per mounted document and mirrors its `state()` into
 * component state after each `save()` call so React re-renders.
 *
 * `isSelfWrite` is a second, independent belt on top of the Rust
 * `ExpectedHashSet` (C4 §4), which is the *primary* mechanism and already
 * suppresses the app's own writes server-side before the watcher ever
 * notifies the frontend. This function exists only for the residual race
 * where a save's own rename lands and the watcher fires before (or
 * without) the server-side suppression reaching this subscription --
 * removing the Rust mechanism because this one exists would be wrong.
 */
import type { IpcError, RenamedFunction, SaveResult, WorkbookEvent } from "../../../../ipc/workbook";

/**
 * Deprecated alias for `ipc/workbook.ts`'s `WorkbookEvent`, kept only so
 * existing imports (`Notebook/index.tsx`, this module's own test) do not
 * all need a simultaneous rename. `WorkbookEvent.hash` landed for real
 * (L8w Task 4b, lead ruling R67) — `hash` is no longer optional. New code
 * should import `WorkbookEvent` directly.
 */
export type WorkbookEventWithHash = WorkbookEvent;

/**
 * Narrows a `save()` rejection to `IpcError`, or synthesizes one when it
 * isn't (review-task14.md's Minor: a raw non-`IpcError` throw -- a
 * transport-level failure, or a non-object throw like `throw "disk full"` --
 * previously cast straight to `IpcError`, so `error.kind`/`error.message`
 * could read `undefined`). A rejected `saveWorkbook` is still trusted to
 * reject with the real C3 §2 shape in the ordinary path (`ipc/workbook.ts`'s
 * own `IpcError` doc comment); this only guards the boundary so a caller's
 * `"save failed: <message>"` render never shows `undefined`.
 */
export function toIpcErrorOrUnknown(reason: unknown): IpcError {
  if (
    typeof reason === "object" &&
    reason !== null &&
    typeof (reason as { kind?: unknown }).kind === "string" &&
    typeof (reason as { message?: unknown }).message === "string"
  ) {
    return reason as IpcError;
  }
  return { kind: "unknown", message: reason instanceof Error ? reason.message : String(reason) };
}

/** Injected dependencies so `saveFlow` is testable without mocking Tauri. */
export interface SaveFlowDeps {
  /** `ipc/workbook.ts`'s `saveWorkbook`, or a test's fake. */
  save(id: string, markdown: string, basedOnHash: string | null): Promise<SaveResult>;
  /** Current time, ms epoch -- injected for deterministic `saved`-state timestamps and TTL tests. */
  now(): number;
}

/** One save attempt's outcome, or its absence. */
export type SaveFlowState =
  | { status: "idle" }
  | { status: "saving" }
  /** `hash`/`savedAtMs` (ms epoch) come from the resolved `SaveResult` and
   *  `deps.now()`, and feed a later `isSelfWrite` check. `migrations` is
   *  `SaveResult.migrations` passed through unchanged (R151 item 9, C2
   *  §3.8) — `[]` when this save rewrote no retired function name. */
  | { status: "saved"; hash: string; savedAtMs: number; migrations: RenamedFunction[] }
  /** A `conflict`-kind rejection (C3 §2, R44) -- offers reload-or-overwrite via `ConflictBanner`, never a generic error toast. */
  | { status: "conflict" }
  /** Any other rejection. The caller's document-dirty tracking (`workbookState.ts`'s `dirtyCellIds`) is untouched by this state -- only a successful save clears it. */
  | { status: "error"; error: IpcError };

/**
 * Drives one notebook document's save attempts. `save()` is the explicit
 * save action (a button, or a caller's own debounce) -- this module never
 * calls IPC on its own initiative, and there is no per-keystroke save.
 */
export function saveFlow(deps: SaveFlowDeps): {
  save(id: string, markdown: string, basedOnHash: string | null): Promise<SaveFlowState>;
  state(): SaveFlowState;
} {
  let current: SaveFlowState = { status: "idle" };

  async function save(id: string, markdown: string, basedOnHash: string | null): Promise<SaveFlowState> {
    current = { status: "saving" };
    try {
      const result = await deps.save(id, markdown, basedOnHash);
      current = { status: "saved", hash: result.hash, savedAtMs: deps.now(), migrations: result.migrations };
    } catch (reason) {
      // A rejected `saveWorkbook` always rejects with the C3 §2 `IpcError`
      // shape (`ipc/workbook.ts`'s own `IpcError` doc comment) in the
      // ordinary path; `toIpcErrorOrUnknown` only guards the boundary
      // against a non-`IpcError` rejection (review-task14.md Minor).
      const error = toIpcErrorOrUnknown(reason);
      current = error.kind === "conflict" ? { status: "conflict" } : { status: "error", error };
    }
    return current;
  }

  return { save, state: () => current };
}

/**
 * The frontend half of C4 §4's self-write suppression -- defence in depth,
 * the Rust `ExpectedHashSet` is primary (see this module's doc comment).
 * `lastSavedHash`/`lastSavedAtMs` come from the most recent `saved`
 * `SaveFlowState`; `nowMs` is injected for deterministic tests; `ttlMs` is
 * C4 §4's stated 5000 (5 s), matching the server-side set's own expiry so
 * this belt never outlives the primary one's own suppression window.
 *
 * `lastSavedHash === null` (no save has completed yet this session) always
 * returns `false` -- "unknown ⇒ reload" (R67) -- since there is nothing to
 * compare and guessing from timing alone would risk missing a genuine
 * external edit that happens to land inside the TTL window.
 */
export function isSelfWrite(
  event: WorkbookEvent,
  lastSavedHash: string | null,
  lastSavedAtMs: number | null,
  nowMs: number,
  ttlMs: number
): boolean {
  if (lastSavedHash === null || lastSavedAtMs === null) return false;
  if (event.hash !== lastSavedHash) return false;
  return nowMs - lastSavedAtMs <= ttlMs;
}
