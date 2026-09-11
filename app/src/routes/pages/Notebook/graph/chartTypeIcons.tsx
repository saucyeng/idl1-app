import type { ChartTypeId } from "./chartTypeCatalog";

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

/** The FFT cell's pictogram (R215 item 1): a decaying magnitude spectrum
 *  with one resonant peak — the shape a suspension channel's spectrum
 *  actually makes, so the row reads as "frequency, not time" beside the
 *  five time marks. */
function FftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <polyline
        points="1,13 3,11 4.5,4 6,11 8,12 10,9.5 12,12 15,12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

/** The histogram cell's pictogram (R215 item 2): a bell-ish run of bars
 *  over a baseline -- a distribution, told apart from the `rectY` time
 *  mark's three separated bars by being contiguous and by having no gaps,
 *  which is exactly what distinguishes the two pictures. */
function HistogramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <rect x="1" y="11" width="2.4" height="3" fill="currentColor" />
      <rect x="3.8" y="7" width="2.4" height="7" fill="currentColor" />
      <rect x="6.6" y="3" width="2.4" height="11" fill="currentColor" />
      <rect x="9.4" y="6" width="2.4" height="8" fill="currentColor" />
      <rect x="12.2" y="10" width="2.4" height="4" fill="currentColor" />
    </svg>
  );
}

/** The scatter cell's pictogram (R215 item 3): a ring of dots around a
 *  faint circle -- the G-G friction circle, which is what tells this apart
 *  from the `dot` time mark's four rising points. */
function ScatterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <circle cx="8" cy="3" r="1.1" fill="currentColor" />
      <circle cx="12" cy="6" r="1.1" fill="currentColor" />
      <circle cx="11" cy="11" r="1.1" fill="currentColor" />
      <circle cx="5" cy="10.5" r="1.1" fill="currentColor" />
      <circle cx="4.5" cy="5.5" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** The lap variance trace's pictogram (R215 item 4): three traces
 *  diverging from a shared origin at the left -- laps superimposed on one
 *  lap-relative axis, which is exactly what the lap-relative x binding
 *  makes the picture do, and what tells it apart from the plain line
 *  mark's single stroke. */
function VarianceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <polyline points="1,8 5,6 9,7 15,4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="1,8 5,10 9,9 15,12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <polyline points="1,8 5,8.5 9,11 15,9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
    </svg>
  );
}

/** The map cell's pictogram (R217 item 1): a closed loop with a gate line
 *  across it -- a track, which is what tells it apart from any trace over
 *  an axis. No basemap in the glyph, because there is none in the chart. */
function MapIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <path
        d="M4 12 C1.5 9, 2.5 4, 6 3.2 C9.5 2.4, 13 4, 13.4 7 C13.8 10, 10.5 13.2, 7.5 12.6 C6.3 12.4, 5 12.8, 4 12 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line x1="2.2" y1="10.8" x2="5.4" y2="12.8" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
    </svg>
  );
}

/** The lap-progression cell's pictogram (R217 item 3): four points falling
 *  then rising over a baseline -- one value per lap, which is what tells it
 *  apart from the dense time-series line. */
function LapIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      <line x1="1.5" y1="13" x2="14.5" y2="13" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <polyline points="3,9 6.5,5.5 10,7 13.5,3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="3" cy="9" r="1.2" fill="currentColor" />
      <circle cx="6.5" cy="5.5" r="1.2" fill="currentColor" />
      <circle cx="10" cy="7" r="1.2" fill="currentColor" />
      <circle cx="13.5" cy="3.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** The spectrogram cell's pictogram (R217 item 4): a grid of cells at
 *  varying density -- a heatmap over time and frequency, which is what
 *  tells it apart from the FFT cell's single spectrum curve. */
function SpectrogramIcon({ className }: IconProps) {
  const cells: { x: number; y: number; o: number }[] = [];
  const opacities = [0.2, 0.45, 0.9, 0.55, 0.3, 0.75, 0.95, 0.4, 0.25, 0.6, 0.35, 0.85];
  for (let i = 0; i < 12; i++) {
    cells.push({ x: 2 + (i % 4) * 3.2, y: 2.5 + Math.floor(i / 4) * 3.2, o: opacities[i] });
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={className} aria-hidden="true">
      {cells.map((c) => (
        <rect key={`${String(c.x)}-${String(c.y)}`} x={c.x} y={c.y} width="2.8" height="2.8" fill="currentColor" opacity={c.o} />
      ))}
    </svg>
  );
}

/** Maps every {@link ChartTypeId} to its pictogram component — kept
 *  exhaustive by the `Record` type itself (a chart type added to
 *  `chartTypeCatalog.ts` without an entry here is a compile error). */
export const CHART_TYPE_ICONS: Record<ChartTypeId, (props: IconProps) => React.JSX.Element> = {
  lineY: LineIcon,
  dot: DotIcon,
  areaY: AreaIcon,
  rectY: BarIcon,
  ruleY: RuleIcon,
  fft: FftIcon,
  histogram: HistogramIcon,
  scatter: ScatterIcon,
  map: MapIcon,
  lap: LapIcon,
  spectrogram: SpectrogramIcon,
  variance: VarianceIcon,
};
