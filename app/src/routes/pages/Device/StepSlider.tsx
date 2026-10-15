import { cn } from "../../../lib/utils";
import type { DeviceConfig } from "./config/model";
import { describeLoad, LOAD_LIMIT_MEASURED, loggerLoad, type LoadRating } from "./loggerLoad";

/** The index in `options` nearest to `value` (exact match first). */
export function nearestIndex(options: readonly number[], value: number): number {
  const exact = options.indexOf(value);
  if (exact >= 0) return exact;
  let best = 0;
  for (let i = 1; i < options.length; i += 1) {
    if (Math.abs(options[i] - value) < Math.abs(options[best] - value)) best = i;
  }
  return best;
}

/** Thumb diameter, px. The dot row is inset by half of it on each side, so
 *  each dot sits exactly where the thumb's centre lands for that index. */
const THUMB_PX = 24;

/** The range input's thumb, drawn the same in Chromium (Android, Windows)
 *  and Firefox. */
const THUMB_CLASSES =
  "[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-hivis " +
  "[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-hivis";

/**
 * A slider that snaps to a fixed set of values (2026-10-15, replacing the
 * grid of boxes for rates and ranges): a dot at every allowed value along
 * the track, filled up to the current one, the current value large on the
 * right, and the values under the dots when there are few enough to fit
 * (otherwise just the two ends). A value read from the logger that isn't in
 * the set (a stale `config.json`) is shown as such, with the thumb at the
 * nearest allowed value; moving it picks a real one.
 */
export function StepSlider({
  label,
  options,
  value,
  format,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly number[];
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const index = nearestIndex(options, value);
  const offList = !options.includes(value);
  const last = Math.max(1, options.length - 1);
  const labelEach = options.length <= 5;
  const inset = { left: THUMB_PX / 2, right: THUMB_PX / 2 };
  return (
    <div className={cn("flex flex-col gap-1", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">{label}</span>
        <span className={cn("font-mono text-lg", offList ? "text-brand-accent" : "text-fg")}>{format(value)}</span>
      </div>
      <div className="relative h-10">
        <span aria-hidden className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2" style={inset} />
        <span aria-hidden className="absolute top-1/2" style={inset}>
          {options.map((option, i) => (
            <span
              key={option}
              className={cn(
                "absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                i <= index && !offList ? "border-hivis bg-hivis" : "border-rule bg-surface",
              )}
              style={{ left: `${(i / last) * 100}%` }}
            />
          ))}
        </span>
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={index}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={format(value)}
          onChange={(event) => onChange(options[Number(event.target.value)])}
          className={cn("absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default", THUMB_CLASSES)}
        />
      </div>
      {labelEach ? (
        <div className="relative h-4 font-mono text-xs text-fg-faint" style={{ marginLeft: THUMB_PX / 2, marginRight: THUMB_PX / 2 }}>
          {options.map((option, i) => (
            <span key={option} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i / last) * 100}%` }}>
              {format(option)}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex justify-between font-mono text-xs text-fg-faint">
          <span>{format(options[0])}</span>
          <span>{format(options[options.length - 1])}</span>
        </div>
      )}
      {offList && <span className="text-xs text-brand-accent">Not supported by this logger. Pick a value; it ignores this one.</span>}
    </div>
  );
}

const RATING_CLASS: Record<LoadRating, string> = {
  good: "bg-good",
  warn: "bg-hivis",
  bad: "bg-brand-accent",
};

const RATING_TEXT: Record<LoadRating, string> = {
  good: "Comfortable",
  warn: "Near the limit",
  bad: "Over the limit: expect dropped samples",
};

/**
 * The logger's sampling load for `config` (`loggerLoad.ts`): a bar against
 * the limit, coloured green, amber or red, with the count. The limit is an
 * unmeasured estimate until a bench test replaces it, and the meter says so.
 */
export function LoadMeter({ config }: { config: DeviceConfig }) {
  const load = loggerLoad(config);
  return (
    <div className="flex flex-col gap-1" role="status" aria-label="Logger load">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Logger load</span>
        <span className="text-xs text-fg-dim">{RATING_TEXT[load.rating]}</span>
      </div>
      <span aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <span className={cn("block h-full", RATING_CLASS[load.rating])} style={{ width: `${Math.min(100, load.fraction * 100)}%` }} />
      </span>
      <span className="font-mono text-xs text-fg-faint">
        {describeLoad(load)}
        {LOAD_LIMIT_MEASURED ? "" : " (limit not measured yet)"}
      </span>
    </div>
  );
}
