/**
 * The Properties form's logic for the overlay readouts (video overlay spec
 * §7c, C2 §5.3 `readout_cell`): seeds for a new readout, the channel a
 * chart-type switch carries, and the gauge range's conversion between what
 * is stored (the channel's recorded unit, Isaac 2026-11-15) and what the
 * form shows (the person's display units). Pure.
 */
import type { ReadoutProps } from "../plotForm/readout";
import { displayConversion, type DisplayUnits } from "../readout/units";

/** One channel the form can pick, with its recorded unit. */
export interface ReadoutChannelOption {
  id: string;
  label: string;
  unit?: string;
}

/** Default typed ranges, in recorded units, by recorded unit (spec §7a:
 *  speed 0–40 mph, heart rate 60–200 bpm). Anything else starts at 0–100. */
const DEFAULT_RANGES: Record<string, [number, number]> = {
  "km/h": [0, 64.37376],
  "m/s": [0, 17.8816],
  bpm: [60, 200],
};

/** The default typed range for a channel recorded in `unit`. */
export function defaultGaugeRange(unit: string | undefined): [number, number] {
  return (unit !== undefined ? DEFAULT_RANGES[unit] : undefined) ?? [0, 100];
}

/** A new readout of `kind` on `channelId` (the carried channel). A g-g's y
 *  takes the next channel in `channels` that is not x. */
export function defaultReadout(
  kind: ReadoutProps["readout"],
  channelId: string,
  channels: readonly ReadoutChannelOption[]
): ReadoutProps {
  const channel = channels.find((c) => c.id === channelId);
  if (kind === "gauge") {
    const [min, max] = defaultGaugeRange(channel?.unit);
    return { readout: "gauge", channel: channelId, range: { kind: "fixed", min, max }, ...(channel ? { label: channel.label } : {}) };
  }
  if (kind === "number") {
    return { readout: "number", channel: channelId, ...(channel ? { label: channel.label } : {}) };
  }
  const y = channels.find((c) => c.id !== channelId)?.id ?? channelId;
  return { readout: "gg", xChannel: channelId, yChannel: y, limit: 1.5, rings: 0.5, tailS: 2 };
}

/** The channel a chart-type switch away from `props` carries. */
export function readoutChannel(props: ReadoutProps): string {
  return props.readout === "gg" ? props.xChannel : props.channel;
}

/** A recorded-unit value as the form shows it, rounded to 4 decimals so a
 *  stored 64.37376 km/h reads as 40 mph, not 40.0000001. */
export function toDisplay(value: number, unit: string | undefined, display: DisplayUnits): number {
  const c = displayConversion(unit ?? null, display);
  return Number((value * c.scale + c.offset).toFixed(4));
}

/** A value typed in display units, back to the channel's recorded unit. */
export function fromDisplay(shown: number, unit: string | undefined, display: DisplayUnits): number {
  const c = displayConversion(unit ?? null, display);
  return Number(((shown - c.offset) / c.scale).toFixed(6));
}

/** The unit label the form shows next to a gauge range for `unit`. */
export function displayUnitLabel(unit: string | undefined, display: DisplayUnits): string | undefined {
  return displayConversion(unit ?? null, display).unit ?? undefined;
}
