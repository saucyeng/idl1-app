import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ConnectionState } from "./connection";

/** Props for {@link DeviceList}. */
export interface DeviceListProps {
  state: ConnectionState;
  /** Starts a BLE scan — the page's own `onScan`, unchanged. */
  onScan: () => void;
  /** Connects to a discovered device by id. */
  onConnect: (deviceId: string) => void;
  /** Makes an already-connected device the one the page shows. */
  onSwitchActive: (deviceId: string) => void;
}

/** A discovered device's name, or its id when the advertisement carried
 *  none — a device with no name is still a device you can connect to, and a
 *  blank row would be unclickable in practice. */
function discoveredLabel(name: string, deviceId: string): string {
  return name.trim() === "" ? deviceId : name;
}

/**
 * The Device activity's sidebar content (ruling R220 item 1: "Device →
 * device list/status"): what is connected, what is in range, and the scan
 * that finds more.
 *
 * The page itself keeps the hero card, the controls, the file list and the
 * config editor — everything about *one* device. This list is the other
 * half of that: which device. Connected devices come first and stay in
 * connection order, because that list is stable and the one a user picks
 * from repeatedly; scan results below it move around as signal strength
 * changes, and a moving list is a bad place to aim at a thing you already
 * own.
 *
 * Every callback is the page's existing handler passed straight through —
 * this component holds no state and performs no IPC.
 */
export default function DeviceList({ state, onScan, onConnect, onSwitchActive }: DeviceListProps) {
  const connectedIds = new Set(state.connections.map((connection) => connection.device_id));
  const inRange = state.discovered.filter((device) => !connectedIds.has(device.device_id));
  const scanning = state.phase === "scanning";

  return (
    <div className="flex flex-col gap-3 p-2 font-mono text-sm">
      <Button type="button" size="sm" onClick={onScan} disabled={scanning}>
        {scanning ? "Scanning…" : "Scan for devices"}
      </Button>

      {state.connections.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="px-1 text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Connected</h3>
          {state.connections.map((connection) => {
            const active = connection.device_id === state.activeDeviceId;
            return (
              <button
                key={connection.device_id}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSwitchActive(connection.device_id)}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-structural)] px-2 py-1.5 text-left hover:bg-control",
                  active && "bg-control-active",
                )}
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-good" />
                <span className="min-w-0 flex-1 truncate text-fg">{connection.device_id}</span>
                <span className="shrink-0 text-label-2 text-fg-dim">{connection.firmware_version}</span>
              </button>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-1">
        <h3 className="px-1 text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">In range</h3>
        {inRange.length === 0 ? (
          <p className="px-2 py-1 text-xs text-fg-dim">
            {scanning ? "Looking for devices…" : "Nothing found yet. Scan to look for devices in range."}
          </p>
        ) : (
          inRange.map((device) => (
            <button
              key={device.device_id}
              type="button"
              onClick={() => onConnect(device.device_id)}
              className="flex items-center gap-2 rounded-[var(--radius-structural)] px-2 py-1.5 text-left hover:bg-control"
            >
              <span className="min-w-0 flex-1 truncate text-fg">{discoveredLabel(device.name, device.device_id)}</span>
              <span className="shrink-0 text-label-2 text-fg-dim">{device.rssi_dbm} dBm</span>
            </button>
          ))
        )}
      </section>

      {state.error !== null && (
        <p role="alert" className="px-2 text-xs text-brand-accent">
          {state.error}
        </p>
      )}
    </div>
  );
}
