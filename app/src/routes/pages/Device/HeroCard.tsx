import { Bluetooth, EllipsisVertical, Settings } from "lucide-react";

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
import type { DeviceConfig } from "./config/model";
import type { ConnectionState } from "./connection";
import { heroStateFrom, heroView } from "./hero";
import { recordingDuration } from "./liveStatus";
import ModuleGrid from "./ModuleGrid";
import { moduleTiles } from "./moduleTiles";
import type { ModuleTile } from "./moduleTiles";
import type { CatalogVerdict } from "../Settings/firmwareCatalog";
import NewSessionsBanner from "./NewSessionsBanner";

/** The buried screens the ⋮ menu opens. */
export type LoggerSubView = "files" | "config";

/** Props for {@link HeroCard}. */
export interface HeroCardProps {
  /** The Device tab's scan/connect state (`connection.ts`). */
  connectionState: ConnectionState;
  /** The last known `device_status` read, or null before the first poll
   *  returns for this connection. */
  status: DeviceStatus | null;
  /** True once `statusPoll.ts`'s `isLinkLost` has fired (R78 Q2). */
  linkLost: boolean;
  /** The `device_control` command currently in flight, or null. */
  pending: DeviceControlCommand | null;
  /** Milliseconds since this session first observed `status.logging` go
   *  true, or null — the fallback when the device reports no elapsed time
   *  (ruling R113). */
  elapsedMs: number | null;
  /** The logger's configuration with any unsent edits, or null before the
   *  read-back arrives or when it failed. Source of the rider and bike chips. */
  loggerConfig: DeviceConfig | null;
  /** The configuration the module tiles describe (the same draft), or null. */
  tileConfig: DeviceConfig | null;
  /** The firmware catalog's verdict on the logger, for the Firmware tile. */
  firmwareVerdict: CatalogVerdict | null;
  /** True while the launch auto-connect to the last logger is in flight. */
  autoConnecting: boolean;
  /** Session ids already in the library (new-sessions banner). */
  knownSessionIds: Set<string>;
  /** Refreshes `knownSessionIds` after an import. */
  onImported: () => void;
  onScan: () => void;
  onConnect: (deviceId: string) => void;
  onDisconnect: (deviceId: string) => void;
  /** Makes an already-connected logger the active one (decision 86). */
  onSwitchActive: (deviceId: string) => void;
  /** Sends a `device_control` command. */
  onControl: (command: DeviceControlCommand) => void;
  /** Opens a buried screen. */
  onOpen: (view: LoggerSubView) => void;
  /** Opens a module tile's settings. */
  onModule: (tile: ModuleTile) => void;
  /** Opens the rider and bike sheet. */
  onIdentity: () => void;
}

/** A connected logger's advertised name, or its id when it advertised none. */
function connectionLabel(connection: ConnectionInfo): string {
  return connection.name.trim() === "" ? connection.device_id : connection.name;
}

/** Big rider and bike chips, read from the logger's own configuration
 *  (`bike_profile`). Before the read arrives they say so rather than
 *  showing a placeholder name. */
function IdentityChips({ config, onOpen }: { config: DeviceConfig | null; onOpen: () => void }) {
  const rider = config === null ? "…" : config.bike_profile.default_rider.trim() || "Not set";
  const bike = config === null ? "…" : config.bike_profile.name.trim() || "Not set";
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          ["Rider", rider],
          ["Bike", bike],
        ] as const
      ).map(([label, value]) => (
        <button
          key={label}
          type="button"
          onClick={onOpen}
          className="flex min-h-16 min-w-0 flex-col items-start justify-center rounded-[var(--radius-card)] border border-rule bg-surface px-3 text-left"
        >
          <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">{label}</span>
          <span className="w-full truncate text-lg font-semibold text-fg">{value}</span>
        </button>
      ))}
    </div>
  );
}

/** The ⋮ menu: everything rare. Switching between connected loggers,
 *  connecting a discovered one, scanning, the buried screens, manual WiFi
 *  and disconnect. */
function LoggerMenu({
  connectionState,
  status,
  busy,
  onScan,
  onConnect,
  onDisconnect,
  onSwitchActive,
  onControl,
  onOpen,
}: Pick<HeroCardProps, "connectionState" | "status" | "onScan" | "onConnect" | "onDisconnect" | "onSwitchActive" | "onControl" | "onOpen"> & {
  busy: boolean;
}) {
  const { connections, discovered, activeDeviceId, phase } = connectionState;
  const active = connections.find((c) => c.device_id === activeDeviceId) ?? null;
  const connectedIds = new Set(connections.map((c) => c.device_id));
  const notConnected = discovered.filter((d) => !connectedIds.has(d.device_id));
  const wifiOn = status?.wifi_on === true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" className="size-11 shrink-0 p-0" aria-label="Logger menu">
          <EllipsisVertical className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {active && (
          <>
            <DropdownMenuItem onSelect={() => onOpen("files")}>Sessions on logger</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpen("config")}>Logger settings</DropdownMenuItem>
            <DropdownMenuItem disabled={busy || status?.logging === true} onSelect={() => onControl(wifiOn ? "wifi_off" : "wifi_on")}>
              {wifiOn ? "Turn WiFi off" : "Turn WiFi on"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {connections.length > 1 && (
          <>
            <DropdownMenuLabel>Switch logger</DropdownMenuLabel>
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
        {notConnected.length > 0 && <DropdownMenuLabel>Found nearby</DropdownMenuLabel>}
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
        <DropdownMenuItem
          disabled={phase === "scanning"}
          onSelect={(e) => {
            e.preventDefault();
            onScan();
          }}
        >
          {phase === "scanning" ? "Scanning…" : "Scan for loggers"}
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

/** Not connected: one big Find button, then every logger the scan found as
 *  a large row to tap. */
function FindLogger({
  connectionState,
  autoConnecting,
  onScan,
  onConnect,
}: Pick<HeroCardProps, "connectionState" | "autoConnecting" | "onScan" | "onConnect">) {
  const { discovered, phase } = connectionState;
  const scanning = phase === "scanning";
  const connecting = phase === "connecting" || autoConnecting;
  const label = connecting ? "Connecting to your logger…" : scanning ? "Looking for loggers…" : "Find logger";
  return (
    <div className="flex flex-col gap-3">
      <Button type="button" emphasis="info" filled onClick={onScan} disabled={scanning || connecting} className="h-20 w-full gap-3 text-xl">
        {(scanning || connecting) && <PulsingDot className="text-bg" />}
        <Bluetooth className="size-6" aria-hidden />
        {label}
      </Button>
      {discovered.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Loggers found nearby">
          {discovered.map((device) => (
            <li key={device.device_id}>
              <Button type="button" onClick={() => onConnect(device.device_id)} disabled={connecting} className="h-14 w-full justify-between px-4 text-base">
                <span className="truncate font-mono">{device.name || device.device_id}</span>
                <span className="shrink-0 font-mono text-sm text-fg-dim">{device.rssi_dbm} dBm</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Logger dashboard (navigation map v4, 2026-10-14). Top to bottom: the
 * logger's name with its ⋮ menu, a full-width rectangular record button with
 * the live timer, big rider and bike chips read from the logger, the
 * new-sessions banner, then a four-column grid of module tiles. Built to fit
 * one phone screen. With no logger connected it shows {@link FindLogger}.
 */
export default function HeroCard(props: HeroCardProps) {
  const { connectionState, status, linkLost, pending, elapsedMs, loggerConfig, tileConfig, onControl } = props;
  const active = connectionState.connections.find((c) => c.device_id === connectionState.activeDeviceId) ?? null;
  const state = heroStateFrom(active !== null, status?.logging === true);
  const view = heroView(state);
  const busy = pending !== null || connectionState.phase === "connecting";
  const duration = recordingDuration(status, elapsedMs);
  const firmware = status?.firmware ?? active?.firmware_version ?? null;

  return (
    <section className="device-hero flex flex-col gap-3">
      {connectionState.phase === "failed" && connectionState.error && (
        <NoteBlock className="border-brand-accent text-brand-accent" role="alert">
          {connectionState.error}
        </NoteBlock>
      )}

      {active === null ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-mono text-lg text-fg">Logger</h2>
            <LoggerMenu {...props} busy={busy} />
          </div>
          <FindLogger {...props} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate font-mono text-xl font-semibold text-fg">{connectionLabel(active)}</h2>
              {firmware !== null && firmware !== "" && <span className="shrink-0 font-mono text-xs text-fg-dim">FW {firmware}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Logger settings one tap away (Isaac, 2026-10-15: it was
                  easy to forget behind the menu). */}
              <Button type="button" size="sm" className="size-11 shrink-0 p-0" aria-label="Logger settings" onClick={() => props.onOpen("config")}>
                <Settings className="size-5" aria-hidden />
              </Button>
              <LoggerMenu {...props} busy={busy} />
            </div>
          </div>

          <Button
            type="button"
            emphasis={view.emphasis}
            filled
            onClick={() => onControl(state === "recording" ? "stop_recording" : "start_recording")}
            disabled={busy}
            className="h-20 w-full gap-3 text-xl"
          >
            {view.pulsing && <PulsingDot className="text-bg" />}
            {pending === "wifi_off" && state === "idle" ? "Leaving WiFi…" : view.label}
            {view.showTimer && duration.ms !== null && (
              <span className={`font-mono tabular-nums${duration.source === "client" ? " opacity-70" : ""}`}>{formatDurationMs(duration.ms)}</span>
            )}
          </Button>

          {linkLost && (
            <NoteBlock className="border-hivis text-hivis" role="status">
              Link lost? The logger hasn&apos;t answered the last few status checks. Still trying.
            </NoteBlock>
          )}

          <IdentityChips config={loggerConfig} onOpen={props.onIdentity} />

          {state !== "recording" && (
            <NewSessionsBanner deviceId={active.device_id} knownSessionIds={props.knownSessionIds} onImported={props.onImported} />
          )}

          <ModuleGrid tiles={moduleTiles({ status, config: tileConfig, linkLost, firmwareVerdict: props.firmwareVerdict })} onOpen={props.onModule} />
        </>
      )}
    </section>
  );
}
