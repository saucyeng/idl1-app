import { ChevronDown } from "lucide-react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { PulsingDot } from "../../../components/brand/PulsingDot";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { formatDurationMs } from "../Data/format";
import type { ConnectionInfo, DeviceControlCommand, DeviceStatus } from "../../../ipc/device";
import type { ConnectionState } from "./connection";
import { heroStateFrom, heroView } from "./hero";
import { recordingDuration } from "./liveStatus";
import { NOT_POLLED, statusTiles } from "./statusTiles";
import type { StatusTile, TileTone } from "./statusTiles";

/** Props for {@link HeroCard}. */
export interface HeroCardProps {
  /** The Device tab's scan/connect state (`connection.ts`). */
  connectionState: ConnectionState;
  /** The last known `device_status` read, or null before the first poll
   *  returns for this connection. */
  status: DeviceStatus | null;
  /** True once `statusPoll.ts`'s `isLinkLost` has fired (R78 Q2): the poll
   *  keeps running and `connectionState.connections` is unchanged either way
   *  — this is purely a "something might be wrong" note, not a state
   *  transition. */
  linkLost: boolean;
  /** The `device_control` command currently in flight, or null — the CTA
   *  and every discovered-device row disable themselves while one is
   *  pending, same rule as `DeviceControls`. */
  pending: DeviceControlCommand | null;
  /** Milliseconds since this session first observed `status.logging` go
   *  true, or null before a recording has started. Wall-clock display state
   *  only (`index.tsx`'s ticking `setInterval`) — the *fallback* source
   *  `liveStatus.ts`'s `recordingDuration` uses when `status` carries no
   *  device-reported `logging_elapsed_s` yet (ruling R113). */
  elapsedMs: number | null;
  /** Starts a BLE scan (`bleScan`, unchanged from the pre-restyle
   *  `device-tab__hero` section). */
  onScan: () => void;
  /** Connects to one discovered device. */
  onConnect: (deviceId: string) => void;
  /** Disconnects the current managed connection. */
  onDisconnect: (deviceId: string) => void;
  /** Makes an already-connected device the active one (decision 86) — a
   *  pure state change, no IPC, one tap. */
  onSwitchActive: (deviceId: string) => void;
  /** Sends `start_recording`/`stop_recording` (`deviceControl`). */
  onControl: (command: DeviceControlCommand) => void;
}

/** Tailwind text-colour class per {@link TileTone}. Colour is owned here,
 *  at the call site, not by the pure tile logic (FLUTTER-UI-SURVEY §7). */
const TONE_CLASS: Record<TileTone, string> = {
  good: "text-good",
  warn: "text-hivis",
  bad: "text-brand-accent",
  dim: "text-fg-dim",
  plain: "text-fg",
};

/** A connected device's advertised name, or its id when the device
 *  advertised none. */
function connectionLabel(connection: ConnectionInfo): string {
  return connection.name.trim() === "" ? connection.device_id : connection.name;
}

/** One cell of the status grid: a small label over the reading. */
function Tile({ tile }: { tile: StatusTile }) {
  return (
    <div
      className="flex min-w-0 flex-col gap-0.5 rounded-[var(--radius-structural)] border border-rule px-2 py-1.5 font-mono"
      title={tile.value === NOT_POLLED ? `${tile.label}: not polled yet` : undefined}
    >
      <span className="truncate text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">{tile.label}</span>
      <span className={`truncate text-sm ${TONE_CLASS[tile.tone]}`}>{tile.value}</span>
    </div>
  );
}

/**
 * A real device picker (decision 64/86, wave-3 lane D task 1): the
 * dropdown trigger names the active device (or "Not connected"); its
 * content lists every already-connected device as a one-tap radio switch
 * (decision 86 — no IPC, `onSwitchActive` alone) above a "Discovered"
 * section of devices seen this scan window that aren't connected yet, each
 * with its own Connect action, plus a "Scan for devices" row and — rare
 * enough to live here rather than on the card — Disconnect for the active
 * device.
 */
function DevicePicker({
  connectionState,
  busy,
  onScan,
  onConnect,
  onDisconnect,
  onSwitchActive,
}: {
  connectionState: ConnectionState;
  busy: boolean;
  onScan: () => void;
  onConnect: (deviceId: string) => void;
  onDisconnect: (deviceId: string) => void;
  onSwitchActive: (deviceId: string) => void;
}) {
  const { connections, discovered, activeDeviceId, phase } = connectionState;
  const active = connections.find((c) => c.device_id === activeDeviceId) ?? null;
  const connectedIds = new Set(connections.map((c) => c.device_id));
  const notConnected = discovered.filter((d) => !connectedIds.has(d.device_id));
  const triggerLabel = active ? connectionLabel(active) : "Not connected";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" emphasis="normal" size="sm" className="h-11 min-w-0 gap-1 font-mono text-sm">
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {connections.length > 0 && (
          <>
            <DropdownMenuLabel>Connected</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activeDeviceId ?? undefined} onValueChange={onSwitchActive}>
              {connections.map((c) => (
                <DropdownMenuRadioItem key={c.device_id} value={c.device_id}>
                  {connectionLabel(c)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Discovered</DropdownMenuLabel>
        {notConnected.length === 0 && (
          <p className="px-2 py-1.5 font-mono text-xs text-fg-dim">
            {phase === "scanning" ? "Scanning…" : "No other devices found yet."}
          </p>
        )}
        {notConnected.map((device) => (
          <DropdownMenuItem
            key={device.device_id}
            disabled={busy}
            onSelect={(e) => {
              e.preventDefault(); // keep the menu open — connecting can take a moment
              onConnect(device.device_id);
            }}
          >
            {device.name || device.device_id} ({device.rssi_dbm} dBm)
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={phase === "scanning"}
          onSelect={(e) => {
            e.preventDefault();
            onScan();
          }}
        >
          {phase === "scanning" ? "Scanning…" : "Scan for devices"}
        </DropdownMenuItem>
        {active && (
          <DropdownMenuItem disabled={busy} onSelect={() => onDisconnect(active.device_id)}>
            Disconnect {connectionLabel(active)}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Device tab's hero card (plan Task 9, SPEC §23.10, UI-DIRECTION
 * Device, wired live by L7b Task 10, R77.4; N-device picker and auto-connect
 * by wave-3 lane D tasks 1–2). Top to bottom, sized to sit on one phone
 * screen with the rest of the tab: a device picker ({@link DevicePicker},
 * decisions 64/86) naming the active device beside its firmware version; a
 * three-column grid of status tiles (`statusTiles.ts`) with each IMU and
 * the satellite count on their own; and a full-width 64 px CTA driven by
 * {@link heroView}'s three-state machine (Connect / Start recording / Stop
 * with a live timer). A fabricated reading is worse than a blank one (SPEC
 * §23.10) — every tile goes through `statusTiles.ts`'s three-reading rule.
 */
export default function HeroCard({
  connectionState,
  status,
  linkLost,
  pending,
  elapsedMs,
  onScan,
  onConnect,
  onDisconnect,
  onSwitchActive,
  onControl,
}: HeroCardProps) {
  const active = connectionState.connections.find((c) => c.device_id === connectionState.activeDeviceId) ?? null;
  const state = heroStateFrom(active !== null, status?.logging === true);
  const view = heroView(state);
  const busy = pending !== null || connectionState.phase === "connecting";
  const duration = recordingDuration(status, elapsedMs);
  const firmware = status?.firmware ?? active?.firmware_version ?? null;

  function onCta(): void {
    if (state === "disconnected") {
      onScan();
      return;
    }
    if (state === "idle") {
      onControl("start_recording");
      return;
    }
    onControl("stop_recording");
  }

  const ctaDisabled =
    busy || (state === "disconnected" && connectionState.phase === "scanning");

  return (
    <section className="device-hero flex flex-col gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-3">
      <div className="flex items-center justify-between gap-2 font-mono text-xs text-fg-dim">
        <DevicePicker
          connectionState={connectionState}
          busy={busy}
          onScan={onScan}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onSwitchActive={onSwitchActive}
        />
        {active && firmware !== null && firmware !== "" && <span className="shrink-0">FW v{firmware}</span>}
      </div>

      {active && (
        // Decision 87: while recording the grid drops to the three IMUs and
        // the satellite count (`statusTiles`'s `recording` argument).
        <div className="device-hero__tiles grid grid-cols-3 gap-2">
          {statusTiles(status, state === "recording").map((tile) => (
            <Tile key={tile.key} tile={tile} />
          ))}
        </div>
      )}

      {connectionState.phase === "failed" && connectionState.error && (
        <NoteBlock className="border-brand-accent text-brand-accent" role="alert">
          {connectionState.error}
        </NoteBlock>
      )}

      {linkLost && (
        <NoteBlock className="border-hivis text-hivis" role="status">
          Link lost? The device hasn&apos;t answered the last few status checks. Still trying.
        </NoteBlock>
      )}

      <Button
        type="button"
        emphasis={view.emphasis}
        filled
        onClick={onCta}
        disabled={ctaDisabled}
        className="h-16 w-full text-lg"
      >
        {view.pulsing && <PulsingDot className="text-bg" />}
        {connectionState.phase === "scanning" && state === "disconnected" ? "Scanning…" : view.label}
        {view.showTimer && duration.ms !== null && (
          <span className={`font-mono tabular-nums${duration.source === "client" ? " text-fg-dim" : ""}`}>
            {formatDurationMs(duration.ms)}
          </span>
        )}
      </Button>
    </section>
  );
}
