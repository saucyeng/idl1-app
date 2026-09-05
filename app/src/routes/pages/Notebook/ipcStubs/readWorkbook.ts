/** Stub for IPC need N1 (runs/2026-09-05/lanes/l6/IPC-NEEDS.md) — no
 *  `read_workbook` command exists yet. Throws `NotImplementedError`, never
 *  an `IpcError`-shaped rejection, so callers can distinguish "this feature
 *  doesn't exist yet" from a real backend failure. Delete this file and
 *  replace its one call site with `app/src/ipc/workbook.ts`'s `readWorkbook`
 *  once the Rust write-amendment lane lands N1. */
export class NotImplementedError extends Error {}

/** Would-be `read_workbook(id_or_path)` (C3 §3.4, N1) — always throws. */
export async function readWorkbook(_idOrPath: string): Promise<{ markdown: string; hash: string; path: string }> {
  throw new NotImplementedError("read_workbook (IPC need N1) not yet implemented");
}
