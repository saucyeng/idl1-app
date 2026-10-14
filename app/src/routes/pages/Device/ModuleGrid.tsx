import { Activity, Battery, Bluetooth, Disc, HardDrive, HeartPulse, Move3d, Plus, Satellite, ToggleLeft, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../../../lib/utils";
import type { ModuleIcon, ModuleTile, ModuleTone } from "./moduleTiles";

/** Glyph per {@link ModuleIcon}. */
const ICONS: Record<ModuleIcon, LucideIcon> = {
  battery: Battery,
  sd: HardDrive,
  bluetooth: Bluetooth,
  wifi: Wifi,
  gps: Satellite,
  imu: Move3d,
  heart: HeartPulse,
  analog: Activity,
  digital: ToggleLeft,
  wheel: Disc,
  add: Plus,
};

/** Box border and icon colour per tone. Colour is owned here, at the call
 *  site, not by the pure tile logic. */
const TONE_CLASS: Record<ModuleTone, string> = {
  good: "border-good text-good",
  warn: "border-hivis text-hivis",
  bad: "border-brand-accent text-brand-accent",
  off: "border-rule text-fg-faint",
  idle: "border-rule text-fg",
};

/** Props for {@link ModuleGrid}. */
export interface ModuleGridProps {
  tiles: ModuleTile[];
  /** Opens a tile's settings. */
  onOpen: (tile: ModuleTile) => void;
}

/**
 * The Logger dashboard's home-screen grid: four columns of module tiles,
 * each an icon in a box coloured by health with one or two short lines of
 * reading text under its name. The whole tile is the tap target.
 */
export default function ModuleGrid({ tiles, onOpen }: ModuleGridProps) {
  return (
    <ul className="module-grid grid grid-cols-4 gap-x-2 gap-y-3" aria-label="Logger modules">
      {tiles.map((tile) => {
        const Icon = ICONS[tile.icon];
        const add = tile.icon === "add";
        return (
          <li key={tile.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(tile)}
              className="flex w-full min-w-0 flex-col items-center gap-1 rounded-[var(--radius-structural)] py-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg"
              aria-label={`${tile.label}: ${tile.lines.join(", ")}`}
              data-tone={tile.tone}
            >
              <span
                className={cn(
                  "grid size-14 place-items-center rounded-[14px] border-2 bg-surface",
                  add ? "border-dashed border-brand-accent text-brand-accent" : TONE_CLASS[tile.tone],
                )}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="w-full truncate text-xs font-medium text-fg">{tile.label}</span>
              {tile.lines.map((line, i) => (
                <span key={i} className="w-full truncate font-mono text-[11px] leading-tight text-fg-dim">
                  {line}
                </span>
              ))}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
