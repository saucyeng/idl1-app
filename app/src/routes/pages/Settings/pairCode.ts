import type { ValidationIssue } from "./dataDir";

/** Strips spaces and common separators (`-`, `_`) from a raw pairing-code
 *  input, e.g. from a field the user might type into with grouping for
 *  readability. Does not validate the result — call {@link validatePairCode}
 *  on the return value before submitting it to `pairPeer` (C3 §3.9).
 *
 * @param raw - The raw text typed into the pairing-code field.
 * @returns `raw` with spaces, hyphens and underscores removed. */
export function normalizePairCode(raw: string): string {
  return raw.replace(/[\s\-_]+/g, "");
}

/** Validates a normalized pairing code before it is sent to `pair_peer`
 *  (design §7's 6-digit code, C3 §3.9). C3 §3.9 backs a bad code with
 *  `invalid_argument` for "wrong length/non-digit," but this checks the same
 *  rule client-side first so a typo never becomes a round trip.
 *
 * @param code - A pairing code, expected already normalized via
 *  {@link normalizePairCode}.
 * @returns Zero or more issues. Empty means the code is exactly six digits. */
export function validatePairCode(code: string): ValidationIssue[] {
  if (code.length === 0) {
    return [
      {
        path: "pairCode",
        severity: "error",
        message: "Enter the 6-digit pairing code shown on the other device.",
      },
    ];
  }

  if (code.length !== 6) {
    return [
      {
        path: "pairCode",
        severity: "error",
        message: "The pairing code must be 6 digits.",
      },
    ];
  }

  if (!/^\d{6}$/.test(code)) {
    return [
      {
        path: "pairCode",
        severity: "error",
        message: "The pairing code must contain digits only.",
      },
    ];
  }

  return [];
}
