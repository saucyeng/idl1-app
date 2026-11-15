/**
 * Which host variables a `js` cell is given as inputs.
 *
 * A cell re-runs whenever one of its inputs changes, and the sandbox gives
 * every cell every bound name. That is tolerable for values that change on
 * a settle, and ruinous for one that changes on every video frame: the
 * overlay's `cursor` (video overlay spec §3) would re-draw every chart in
 * the notebook 60 times a second. So a **frame-rate** name is given only to
 * a cell whose source text mentions it; every other name goes to every
 * cell, as before.
 *
 * "Mentions" is a whole-word match anywhere in the source. That includes a
 * comment or a string, which costs a cell some re-runs and nothing else.
 *
 * Narrowing the other names the same way is wanted too (one channel's new
 * data re-draws every chart today), but a cell reading a spectrum, a scoped
 * channel or a GPS trace is keyed by a name that is not an identifier and
 * may rely on those re-runs; that needs its own check first.
 *
 * Pure: no DOM, no Runtime.
 */

/** Host variables that change at display rate. */
export const FRAME_RATE_NAMES: ReadonlySet<string> = new Set(["cursor", "Readout"]);

/** Characters that may continue a JS identifier, for the whole-word test. */
const WORD_CHAR_RE = /[A-Za-z0-9_$]/;

/** Whether `name` occurs in `code` with no identifier character on either side. */
function mentions(code: string, name: string): boolean {
  let from = 0;
  for (;;) {
    const at = code.indexOf(name, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : code[at - 1];
    const after = at + name.length >= code.length ? "" : code[at + name.length];
    if (!WORD_CHAR_RE.test(before) && !WORD_CHAR_RE.test(after)) return true;
    from = at + 1;
  }
}

/**
 * The subset of `boundNames` the cell with source `code` takes as inputs,
 * in `boundNames`' order: every name, less each frame-rate name the source
 * never mentions.
 *
 * @param code The cell's fenced source text.
 * @param boundNames Every host-variable name that is a legal identifier.
 */
export function cellInputNames(code: string, boundNames: readonly string[]): string[] {
  return boundNames.filter((name) => !FRAME_RATE_NAMES.has(name) || mentions(code, name));
}
