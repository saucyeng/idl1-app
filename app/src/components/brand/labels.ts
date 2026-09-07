/** Uppercase mono labels never wrap (UI-DIRECTION "Type", new rule): a label
 *  longer than `maxChars` is replaced by its known abbreviation
 *  (IMPERIAL → IMP, …); an unknown long label is returned unchanged and
 *  reported by `unabbreviated()` so the table can be extended, never broken
 *  mid-word by the browser.
 */

/** Known label → abbreviation pairs, matched case-insensitively. Extend this
 *  table as `unabbreviated()` surfaces new long labels in real screens. */
const KNOWN_ABBREVIATIONS: Record<string, string> = {
  IMPERIAL: "IMP",
};

/** Returns `label` unchanged if it fits with room under `maxChars`
 *  (`length < maxChars`), otherwise its known abbreviation, otherwise
 *  `label` unchanged (an unknown long label is never broken mid-word, only
 *  reported by `unabbreviated`). */
export function abbreviateLabel(label: string, maxChars: number): string {
  if (label.length < maxChars) {
    return label;
  }

  const abbreviation = KNOWN_ABBREVIATIONS[label.toUpperCase()];

  return abbreviation ?? label;
}

/** Labels from `labels` that exceed `maxChars` and have no entry in the
 *  known-abbreviation table — the list to extend `abbreviateLabel`'s table
 *  with next. */
export function unabbreviated(labels: string[], maxChars: number): string[] {
  return labels.filter((label) => label.length >= maxChars && !(label.toUpperCase() in KNOWN_ABBREVIATIONS));
}
