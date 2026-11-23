/**
 * The names a notebook's readouts read, found in the cells' source before
 * any cell runs (video overlay spec §7c), so the host can `open_readout`
 * them. Names are string literals in the call (`Readout.gauge("speed", …)`);
 * a name built at run time is not found, and that readout draws a dash.
 * The g-g's `tail_s` is read the same way, as a numeric literal. Pure.
 */

/** What the host needs from every readout in the notebook. */
export interface ReadoutScan {
  /** Every name read, in first-seen order, once each. */
  names: string[];
  /** The longest g-g tail asked for, seconds; 0 with no g-g or no tail. */
  tailS: number;
}

const STRING = String.raw`"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'`;
const SINGLE_RE = new RegExp(String.raw`\bReadout\s*\.\s*(?:gauge|number|trace)\s*\(\s*(?:${STRING})`, "g");
const WINDOW_RE = /\bwindow_s\s*:\s*(\d+(?:\.\d+)?|\.\d+)/g;
const SMOOTH_RE = /\bsmooth_s\s*:\s*(\d+(?:\.\d+)?|\.\d+)/g;
const VERTICAL_RE = new RegExp(String.raw`\bvertical\s*:\s*(?:${STRING})`, "g");
/** A trace's span when its call gives no `window_s`, s (`frame.ts`'s default). */
const DEFAULT_TRACE_WINDOW_S = 8;
const GG_RE = new RegExp(String.raw`\bReadout\s*\.\s*gg\s*\(\s*(?:${STRING})\s*,\s*(?:${STRING})`, "g");
const TAIL_RE = /\btail_s\s*:\s*(\d+(?:\.\d+)?|\.\d+)/g;

/** Undoes the JS escapes a name literal may carry (`\"`, `\\`). */
function unescape(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/** Scans every cell's source in `codes` for readout calls. */
export function scanReadouts(codes: readonly string[]): ReadoutScan {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    if (raw === undefined) return;
    const name = unescape(raw);
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  let tailS = 0;
  for (const code of codes) {
    for (const m of code.matchAll(SINGLE_RE)) add(m[1] ?? m[2]);
    for (const m of code.matchAll(GG_RE)) {
      add(m[1] ?? m[2]);
      add(m[3] ?? m[4]);
    }
    if (/\bReadout\s*\.\s*gg\b/.test(code)) {
      for (const m of code.matchAll(TAIL_RE)) tailS = Math.max(tailS, Number(m[1]));
      for (const m of code.matchAll(VERTICAL_RE)) add(m[1] ?? m[2]);
    }
    // A smoothed gauge averages its tail.
    for (const m of code.matchAll(SMOOTH_RE)) tailS = Math.max(tailS, Number(m[1]));
    // A trace's line is its tail: `window_s` seconds back, 8 when not given.
    if (/\bReadout\s*\.\s*trace\b/.test(code)) {
      const windows = [...code.matchAll(WINDOW_RE)].map((m) => Number(m[1]));
      tailS = Math.max(tailS, ...(windows.length > 0 ? windows : [DEFAULT_TRACE_WINDOW_S]));
    }
  }
  return { names, tailS };
}

/** The tail's point count for `tailS` seconds at `fps` frames per second,
 *  capped at C3 §3.7.1's 1024; 0 means no tail is asked for. */
export function tailCount(tailS: number, fps: number): number {
  if (!(tailS > 0) || !(fps > 0)) return 0;
  return Math.min(1024, Math.max(1, Math.round(tailS * fps)));
}
