/**
 * The builtin function catalog — generated (ruling R249), not
 * hand-transcribed.
 *
 * Until 2026-09-20 this module carried a 75-entry array typed in by hand
 * from C2 §3.3 and cross-checked against `rust/core/src/math/catalog.rs`
 * on paper. It drifted twice in the same week (a rename landed 2026-09-09
 * and three new builtins landed 2026-09-13 without the transcription
 * following either time) and then conflicted between two lanes editing it
 * concurrently on 2026-09-20 (75 = 70 + 5, resolved by the lead). The
 * generator this ruling adds removes the possibility of both: `idl-rs docs
 * workbook --json` emits the engine's own catalog as sorted, stable JSON,
 * checked in as `functionCatalog.json` beside this file and diff-gated in
 * CI exactly like `docs cli --json`/`shell/cliTable.json` already is
 * (ruling R230 item 2). {@link MATH_FUNCTIONS} below is that file, typed.
 *
 * The JSON is generated from `rust/core/src/math/catalog.rs`'s
 * `math_builtin_catalog()`, sorted by name (not C2 §3.3's row order, which
 * groups related functions for a reader skimming the Markdown reference —
 * irrelevant to `CodePane`'s completion and {@link tokenizeMath}'s lookup,
 * both of which key on one name). A signature row naming several functions
 * together (e.g. `floor` `ceil` `round`) is expanded into one entry per
 * name in the Rust catalog itself, not here. `and`/`or`/`not` are C2 §3.2
 * grammar operators, not catalog entries (`mathMode.ts`'s `KEYWORDS` set);
 * `main(col[])` (C2 §4) is a table-cell-only function documented in C2 §4.
 * Regenerate with (same working directory `docs/CI.md` documents for the
 * other two generated files):
 *
 *     cargo run --manifest-path rust/Cargo.toml -p idl-rs-cli -- \
 *       docs workbook --json \
 *       --out app/src/routes/pages/Notebook/model/functionCatalog.json
 */

import functionCatalogJson from "./functionCatalog.json";

/** The generated file's own shape — narrower than {@link CatalogEntry}: no
 *  `description`/`units` reach `MATH_FUNCTIONS` below, because nothing in
 *  this lane's consumers (`CodePane`'s completion, `mathMode.ts`'s
 *  tokenizer, {@link diffFunctionCatalog}) reads either yet. Kept as its
 *  own type rather than widening {@link CatalogEntry} so a future reader of
 *  one is not misled about what the other carries. */
interface GeneratedFunctionCatalogEntry {
  name: string;
  signature: string;
  category: string;
  status: "implemented" | "notImplemented";
  description: string;
  units: string | null;
}

/** The checked-in file, typed. `as unknown as` is `cliTable.ts`'s own
 *  pattern for a generated JSON import: nothing here re-validates the
 *  shape beyond it, because CI's diff gate is what keeps this file honest
 *  against the engine that generated it, not a runtime check. */
const GENERATED_FUNCTIONS = (functionCatalogJson as { functions: GeneratedFunctionCatalogEntry[] }).functions;

/** Whether a catalog entry's engine implementation is complete. A
 *  `"notImplemented"` entry still parses and validates in the grammar (C2
 *  §3.3) — it is shown in completion, greyed, rather than omitted. */
export type CatalogStatus = "implemented" | "notImplemented";

/** One `MATH_FUNCTIONS` row: a single callable name, its call signature as
 *  C2 §3.3 documents it, its category column, and its implementation
 *  status. */
export interface CatalogEntry {
  /** The bare function name as it appears before `(` in a math expression. */
  name: string;
  /** The call signature, transcribed from C2 §3.3's Signature column
   *  (one alternative per `name` when the source row covers several call
   *  shapes with `|`). A `key=value` segment is a keyword argument (C2
   *  §3.2) — additive to the positional form shown alongside it. */
  signature: string;
  /** C2 §3.3's Category column verbatim. */
  category: string;
  status: CatalogStatus;
}

/** The generated catalog (`functionCatalog.json`), narrowed to the four
 *  fields this lane's consumers read — see the module doc for why
 *  `description`/`units` are not carried through. Order follows the
 *  generated file's own name-sorted order; nothing here re-sorts it. */
export const MATH_FUNCTIONS: CatalogEntry[] = GENERATED_FUNCTIONS.map((entry) => ({
  name: entry.name,
  signature: entry.signature,
  category: entry.category,
  status: entry.status,
}));

/** The subset of `ipc/workbook.ts`'s `MathBuiltinDto` this module's
 *  self-check needs — `list_math_builtins` (C3 §3.4, ledger R64.2). Kept
 *  narrow (name + status only) rather than importing the full DTO, since
 *  this module owns no IPC dependency of its own (the caller fetches and
 *  passes the list in). */
export interface RemoteMathBuiltin {
  name: string;
  status: "implemented" | "not_implemented";
}

/** One disagreement between this module's hand-transcribed `MATH_FUNCTIONS`
 *  and the engine's own `list_math_builtins` catalog. */
export interface FunctionCatalogMismatch {
  /** `"missing_locally"`: the engine has this builtin, this transcription
   *  doesn't (a completion gap, not a correctness bug — the function still
   *  works, this file's own list is just stale). `"missing_remotely"`: this
   *  transcription names a builtin the engine does not — a copy/paste or
   *  spelling error, or a builtin the engine has since removed.
   *  `"status_mismatch"`: both have `name`, but one says `"implemented"`
   *  and the other `"notImplemented"`/`"not_implemented"`. */
  kind: "missing_locally" | "missing_remotely" | "status_mismatch";
  name: string;
  /** Present only for `"status_mismatch"`: `"local=<x> remote=<y>"`. */
  detail?: string;
}

/**
 * Compares this module's hand-transcribed `MATH_FUNCTIONS` (C2 §3.3,
 * transcribed by hand per that section's own assignment rule — see this
 * module's doc comment) against `list_math_builtins`'s wire catalog (C3
 * §3.4). Pure and total: never throws, returns `[]` when the two agree on
 * every name's presence and status. A caller (`Notebook/index.tsx`) runs
 * this once at notebook open and surfaces any non-empty result as a
 * warning, never a thrown error (CLAUDE.md §5: a transcription drift is
 * not a reason to block the editor) and never patches `MATH_FUNCTIONS`
 * from the remote list at runtime (this file's own transcription is the
 * one this lane's `CodePane`/`mathMode.ts` completion reads; silently
 * overwriting it from a live fetch would make completion depend on session
 * order rather than this committed file).
 *
 * @param local Defaults to `MATH_FUNCTIONS`; a parameter only so this
 *   function's tests can exercise it against small fixtures instead of the
 *   full 75-entry table.
 */
export function diffFunctionCatalog(
  remote: RemoteMathBuiltin[],
  local: CatalogEntry[] = MATH_FUNCTIONS
): FunctionCatalogMismatch[] {
  const remoteByName = new Map(remote.map((r) => [r.name, r]));
  const localByName = new Map(local.map((l) => [l.name, l]));
  const mismatches: FunctionCatalogMismatch[] = [];

  for (const l of local) {
    const r = remoteByName.get(l.name);
    if (r === undefined) {
      mismatches.push({ kind: "missing_remotely", name: l.name });
      continue;
    }
    const localStatus = l.status === "implemented" ? "implemented" : "not_implemented";
    if (localStatus !== r.status) {
      mismatches.push({ kind: "status_mismatch", name: l.name, detail: `local=${localStatus} remote=${r.status}` });
    }
  }

  for (const r of remote) {
    if (!localByName.has(r.name)) {
      mismatches.push({ kind: "missing_locally", name: r.name });
    }
  }

  return mismatches;
}
