import { BatteryMedium, Cable, ChevronDown, HardDrive, HeartPulse, Radio, Satellite, Wifi } from "lucide-react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { PulsingDot } from "../../../components/brand/PulsingDot";
import { StatusIcon } from "../../../components/brand/StatusIcon";
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
import type { DeviceControlCommand, DeviceStatus } from "../../../ipc/device";
import type { ConnectionState } from "./connection";
import { heroStateFrom, heroView } from "./hero";

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
   *  only (`index.tsx`'s ticking `setInterval`) — never a value a pure
   *  module needs to reproduce. */
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

/** Text shown for a field the device genuinely did not report (`null` in
 *  `DeviceStatus`) — never a plausible-looking zero or "healthy" state it
 *  cannot back up (SPEC §23.10, lane brief "Do not"). */
const UNAVAILABLE = "unavailable";
/** Text shown when no `device_status` poll has returned yet at all —
 *  distinct from {@link UNAVAILABLE}, which means the device itself did not
 *  report that line. */
const NOT_POLLED_YET = "not polled yet";

/** Renders one `DeviceStatus` field as one of three distinct strings: the
 *  real value (via `format`) when `status` has it, {@link UNAVAILABLE} when
 *  `status` exists but this field is `null` (the device did not report the
 *  line), or {@link NOT_POLLED_YET} when `status` itself is `null` (no poll
 *  has returned yet). */
function fieldText<T>(status: DeviceStatus | null, read: (s: DeviceStatus) => T | null, format: (value: T) => string): string {
  if (status === null) return NOT_POLLED_YET;
  const value = read(status);
  if (value === null) return UNAVAILABLE;
  return format(value);
}

const SD_LABEL: Record<NonNullable<DeviceStatus["sd"]>, string> = {
  ok: "OK",
  full: "Full",
  error: "Error",
  absent: "Absent",
};

const GPS_LABEL: Record<NonNullable<DeviceStatus["gps"]>, string> = {
  fix: "Fix",
  no_fix: "No fix",
  absent: "Absent",
};

const IMU_LABEL: Record<NonNullable<DeviceStatus["imu"]>, string> = {
  ok: "OK",
  partial: "Partial",
  error: "Error",
  absent: "Absent",
};

/** Tailwind text-colour class for one status field's reading — `--good` for
 *  a healthy reading, `--accent` for an error/absent reading, `--fg-dim` for
 *  unknown/unpolled. Colour is owned by the call site (`StatusIcon` itself
 *  carries none), per FLUTTER-UI-SURVEY §7. */
function sdTone(sd: DeviceStatus["sd"]): string {
  if (sd === "ok") return "text-good";
  if (sd === "full" || sd === "error") return "text-brand-accent";
  return "text-fg-dim";
}

function gpsTone(gps: DeviceStatus["gps"]): string {
  if (gps === "fix") return "text-good";
  if (gps === "absent") return "text-fg-dim";
  return "text-hivis";
}

function imuTone(imu: DeviceStatus["imu"]): string {
  if (imu === "ok") return "text-good";
  if (imu === "error") return "text-brand-accent";
  if (imu === "partial") return "text-hivis";
  return "text-fg-dim";
}

/** Derives the SPEC §23.9 mode line (`Idle` / `Recording` / `WiFi`) from
 *  `logging`/`wifi_on`. Follows the same three-state pattern as
 *  {@link fieldText}: {@link NOT_POLLED_YET} before any poll, {@link
 *  UNAVAILABLE} when a poll returned but either input came back `null`
 *  (mode cannot be derived from a half-known state), otherwise the derived
 *  word. Recording takes priority over WiFi — SPEC §23.9 states the two are
 *  mutually exclusive, so this ordering only matters for a device caught
 *  mid-transition. */
function modeText(status: DeviceStatus | null): string {
  if (status === null) return NOT_POLLED_YET;
  if (status.logging === null || status.wifi_on === null) return UNAVAILABLE;
  if (status.logging) return "Recording";
  if (status.wifi_on) return "WiFi";
  return "Idle";
}

/**
 * A real device picker (decision 64/86, wave-3 lane D task 1): the
 * dropdown trigger names the active device (or "Not connected"); its
 * content lists every already-connected device as a one-tap radio switch
 * (decision 86 — no IPC, `onSwitchActive` alone) above a "Discovered"
 * section of devices seen this scan window that aren't connected yet, each
 * with its own Connect action, plus a "Scan for devices" row. Replaces the
 * pre-wave-3 inline discovered-list-while-disconnected rendering, which
 * only ever supported one device at a time.
 */
function DevicePicker({
  connectionState,
  busy,
  onScan,
  onConnect,
  onSwitchActive,
}: {
  connectionState: ConnectionState;
  busy: boolean;
  onScan: () => void;
  onConnect: (deviceId: string) => void;
  onSwitchActive: (deviceId: string) => void;
}) {
  const { connections, discovered, activeDeviceId, phase } = connectionState;
  const active = connections.find((c) => c.device_id === activeDeviceId) ?? null;
  const connectedIds = new Set(connections.map((c) => c.device_id));
  const notConnected = discovered.filter((d) => !connectedIds.has(d.device_id));
  const triggerLabel = active ? active.device_id : "Not connected";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" emphasis="normal" size="sm" className="h-11 min-w-0 gap-1 font-mono text-xs">
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
                  {c.device_id}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Device tab's hero card (plan Task 9, SPEC §23.10, UI-DIRECTION
 * Device, wired live by L7b Task 10, R77.4; N-device picker and auto-connect
 * by wave-3 lane D tasks 1–2): a full-width, ≥ 56 px CTA driven by {@link
 * heroView}'s three-state machine (Connect / Start recording / Stop with a
 * live timer), a real device picker ({@link DevicePicker}, decisions 64/86)
 * that connects to any discovered idl0 and switches the active one in one
 * tap, a colour-owned SD/GPS/IMU/HR/battery/firmware/WiFi status strip, and
 * the SPEC §23.9 mode line. A fabricated reading is worse than a blank one
 * (SPEC §23.10) — every field still goes through {@link fieldText}'s
 * three-state rule; the picker changes none of that logic.
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
    <section className="device-hero flex flex-col gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4">
      <Button
        type="button"
        emphasis={view.emphasis}
        filled
        onClick={onCta}
        disabled={ctaDisabled}
        className="h-14 w-full text-base"
      >
        {view.pulsing && <PulsingDot className="text-bg" />}
        {connectionState.phase === "scanning" && state === "disconnected" ? "Scanning…" : view.label}
        {view.showTimer && elapsedMs !== null && (
          <span className="font-mono tabular-nums">{formatDurationMs(elapsedMs)}</span>
        )}
      </Button>

      <div className="flex items-center justify-between gap-2 font-mono text-xs text-fg-dim">
        <DevicePicker connectionState={connectionState} busy={busy} onScan={onScan} onConnect={onConnect} onSwitchActive={onSwitchActive} />
        {active && (
          <Button type="button" emphasis="normal" size="sm" className="h-11" onClick={() => onDisconnect(active.device_id)}>
            Disconnect
          </Button>
        )}
      </div>

      {connectionState.phase === "failed" && connectionState.error && (
        <NoteBlock className="border-brand-accent text-brand-accent" role="alert">
          {connectionState.error}
        </NoteBlock>
      )}

      {linkLost && (
        <NoteBlock className="border-hivis text-hivis" role="status">
          Link lost? The device hasn&apos;t answered the last few status checks. Still trying — no action needed unless this
          persists.
        </NoteBlock>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <StatusIcon icon={Cable} label="Mode" value={modeText(status)} />
        <StatusIcon icon={HardDrive} label="SD" value={fieldText(status, (s) => s.sd, (v) => SD_LABEL[v])} className={sdTone(status?.sd ?? null)} />
        <StatusIcon icon={Satellite} label="GPS" value={fieldText(status, (s) => s.gps, (v) => GPS_LABEL[v])} className={gpsTone(status?.gps ?? null)} />
        <StatusIcon icon={Radio} label="IMU" value={fieldText(status, (s) => s.imu, (v) => IMU_LABEL[v])} className={imuTone(status?.imu ?? null)} />
        <StatusIcon icon={HeartPulse} label="HR" value={fieldText(status, (s) => s.hr, (v) => v)} />
        <StatusIcon icon={BatteryMedium} label="Battery" value={fieldText(status, (s) => s.battery_pct, (v) => `${v}%`)} />
        <StatusIcon icon={Wifi} label="WiFi" value={fieldText(status, (s) => s.wifi_on, (v) => (v ? "On" : "Off"))} />
      </div>

      {status?.firmware != null && <p className="font-mono text-xs text-fg-dim">FW v{status.firmware}</p>}
    </section>
  );
}
