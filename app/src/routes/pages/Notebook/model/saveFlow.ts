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
import type { IpcError, SaveResult, WorkbookEvent } from "../../../../ipc/workbook";

/**
 * `WorkbookEvent`'s future wire shape (lead ruling R67, C3 §3.4 amendment,
 * implemented by L8w Task 4b): a `hash` field, the sha256 hex of the
 * file's bytes after the change, computed by the same watcher that emits
 * the event. Declared locally -- extending, not replacing,
 * `ipc/workbook.ts`'s landed `WorkbookEvent` -- because Task 4b has not
 * merged yet (as of this task, `WorkbookEvent` still carries only `kind`
 * and `cell_ids`). `hash` is optional here so this module type-checks
 * against both the pre- and post-amendment wire value; `isSelfWrite`
 * treats a missing `hash` as "unknown ⇒ do not suppress ⇒ reload" (R67),
 * which is the safe default until Task 4b lands.
 */
export interface WorkbookEventWithHash extends WorkbookEvent {
  /** sha256 hex of the file's bytes after this event's change; absent until L8w Task 4b lands the field. */
  hash?: string;
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
  /** `hash`/`savedAtMs` (ms epoch) come from the resolved `SaveResult` and `deps.now()`, and feed a later `isSelfWrite` check. */
  | { status: "saved"; hash: string; savedAtMs: number }
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
      current = { status: "saved", hash: result.hash, savedAtMs: deps.now() };
    } catch (reason) {
      // A rejected `saveWorkbook` always rejects with the C3 §2 `IpcError`
      // shape (`ipc/workbook.ts`'s own `IpcError` doc comment) -- trusted
      // here rather than runtime-type-guarded, matching every other call
      // site in this codebase, none of which type-guards a rejection either.
      const error = reason as IpcError;
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
 * A `hash`-less `event` (today's landed wire shape, pending L8w Task 4b)
 * always returns `false` -- "unknown ⇒ reload" (R67) -- since there is
 * nothing to compare and guessing from timing alone would risk missing a
 * genuine external edit that happens to land inside the TTL window.
 */
export function isSelfWrite(
  event: WorkbookEventWithHash,
  lastSavedHash: string | null,
  lastSavedAtMs: number | null,
  nowMs: number,
  ttlMs: number
): boolean {
  if (event.hash === undefined) return false;
  if (lastSavedHash === null || lastSavedAtMs === null) return false;
  if (event.hash !== lastSavedHash) return false;
  return nowMs - lastSavedAtMs <= ttlMs;
}
