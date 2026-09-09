import type { MarkProps } from "../plotForm/types";

/** One pictogram's own props — a small square glyph, coloured by
 *  `currentColor` (the picker button sets `text-*` around it, same
 *  convention as every other icon-as-text glyph in this app; never a hex
 *  literal). */
interface IconProps {
  className?: string;
}

/** `MARK_NAMES`' five pictograms (decision 83: "idl0 pictograms carry
 *  over"). **No pictogram asset exists anywhere in this repo** — idl0's
 *  own picker (`chart_type_catalog.dart`) used Material Design glyphs
 *  (`Icons.show_chart`, `Icons.scatter_plot`, …), themselves a bundled
 *  font, not an image file this app could import; there is nothing to
 *  carry over as an asset. These five are drawn as inline SVG instead —
 *  offline-first (CLAUDE.md §3: no CDN, ever), no new dependency, and
 *  small enough that a miniature of the mark itself reads faster than a
 *  generic chart glyph would. Report note: if a real pictogram asset set
 *  turns up later (exported from idl0's design source, say), swap these
 *  for `<img>`s against that asset without changing `ChartTypePicker.tsx`'s
 *  own contract — it only imports `CHART_TYPE_ICONS[mark]`. */
function LineIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <polyline points="1,12 5,6 9,9 15,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <circle cx="3" cy="11" r="1.4" fill="currentColor" />
      <circle cx="7" cy="5" r="1.4" fill="currentColor" />
      <circle cx="11" cy="9" r="1.4" fill="currentColor" />
      <circle cx="14" cy="3" r="1.4" fill="currentColor" />
    </svg>
  );
}

function AreaIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <polygon points="1,13 1,10 5,6 9,9 15,3 15,13" fill="currentColor" opacity="0.35" />
      <polyline points="1,10 5,6 9,9 15,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <rect x="1" y="8" width="3" height="6" fill="currentColor" />
      <rect x="6.5" y="3" width="3" height="11" fill="currentColor" />
      <rect x="12" y="6" width="3" height="8" fill="currentColor" />
    </svg>
  );
}

function RuleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

/** Maps every {@link MarkProps.mark} value to its pictogram component —
 *  kept exhaustive by the `Record` type itself (a mark added to
 *  `plotForm/types.ts` without an entry here is a compile error). */
export const CHART_TYPE_ICONS: Record<MarkProps["mark"], (props: IconProps) => React.JSX.Element> = {
  lineY: LineIcon,
  dot: DotIcon,
  areaY: AreaIcon,
  rectY: BarIcon,
  ruleY: RuleIcon,
};
