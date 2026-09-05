import { useState } from "react";

import { bleScan } from "../../../../ipc/device";
import type { DeviceDiscovered } from "../../../../ipc/device";
import { clearHrm, setHrm } from "../config/edit";
import type { DeviceConfig } from "../config/model";
import { BLE_ADDRESS_RE, validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";
import { describeIpcError } from "../errors";

/** Props for {@link HrmForm}. */
export interface HrmFormProps {
  /** The config this form reads from and edits. */
  config: DeviceConfig;
  /** Called with the whole next `DeviceConfig` after every edit. */
  onConfigChange: (next: DeviceConfig) => void;
  /** Closes the form. */
  onClose: () => void;
}

/** Scan window passed to `bleScan` (C3 §3.8), in milliseconds — same
 *  duration as the Device tab's own device-discovery scan
 *  (`Device/index.tsx`'s `SCAN_TIMEOUT_MS`). */
const HRM_SCAN_TIMEOUT_MS = 10_000;

/** Filters `issues` to the ones whose `path` starts with `prefix`. */
function issuesFor(issues: ValidationIssue[], prefix: string): ValidationIssue[] {
  return issues.filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`));
}

/** Renders one `ValidationIssue` as a labelled line. */
function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="device-form__issues">
      {issues.map((issue) => (
        <li key={issue.path + issue.message} data-severity={issue.severity}>
          {issue.severity === "error" ? "Error: " : "Warning: "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Heart Rate Monitor source form (SPEC §23.3.6): the enable flag, a
 * "Search nearby" BLE scan the user picks a strap from, manual
 * uppercase-hex address entry, an informational device-name field, and
 * Forget. `bleScan`'s `DeviceDiscovered` shape carries no service-UUID
 * filter (C3 §3.8), so this form cannot narrow the scan to heart-rate
 * straps specifically — it lists every discovered BLE device and leaves
 * the pick to the user (Parity gap, `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`).
 * A discovered device's own identifier is written into `device_address`
 * verbatim; on a platform where that identifier is not the colon-separated
 * uppercase-hex MAC SPEC §8 states, `validateConfig` reports it as an
 * invalid address rather than this form silently reformatting or rejecting
 * it — visible, not silent, matching ruling R58's cost-if-wrong stance.
 */
export default function HrmForm({ config, onConfigChange, onClose }: HrmFormProps) {
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DeviceDiscovered[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const issues = validateConfig(config);
  const hrm = config.heart_rate_monitor ?? { enabled: false, device_address: "", device_name: "" };

  function onSearchNearby(): void {
    setScanning(true);
    setScanError(null);
    setDiscovered([]);
    bleScan(HRM_SCAN_TIMEOUT_MS, (device) => setDiscovered((prev) => [...prev, device]))
      .then(() => setScanning(false))
      .catch((err: { kind: string; message: string }) => {
        setScanning(false);
        setScanError(describeIpcError(err));
      });
  }

  function onSelectDiscovered(device: DeviceDiscovered): void {
    onConfigChange(setHrm(config, { enabled: true, device_address: device.device_id, device_name: device.name }));
  }

  return (
    <div className="device-form device-form--hrm" role="dialog" aria-label="Heart rate monitor settings">
      <h3>Heart rate monitor</h3>

      <label>
        <input type="checkbox" checked={hrm.enabled} onChange={(e) => onConfigChange(setHrm(config, { enabled: e.target.checked }))} />
        Enabled
      </label>

      <button type="button" onClick={onSearchNearby} disabled={scanning}>
        {scanning ? "Searching…" : "Search nearby"}
      </button>
      {scanError !== null && <p role="alert">{scanError}</p>}
      {discovered.length > 0 && (
        <ul>
          {discovered.map((device) => (
            <li key={device.device_id}>
              {device.name || device.device_id} ({device.rssi_dbm} dBm){" "}
              <button type="button" onClick={() => onSelectDiscovered(device)}>
                Select
              </button>
            </li>
          ))}
        </ul>
      )}

      <label>
        Device address
        <input
          type="text"
          value={hrm.device_address}
          onChange={(e) => onConfigChange(setHrm(config, { device_address: e.target.value.toUpperCase() }))}
        />
      </label>
      {hrm.device_address !== "" && !BLE_ADDRESS_RE.test(hrm.device_address) && (
        <p className="device-form__issues">Not a valid BLE address (6 uppercase hex bytes, colon-separated, e.g. AA:BB:CC:DD:EE:FF)</p>
      )}
      <IssueList issues={issuesFor(issues, "heart_rate_monitor.device_address")} />

      <label>
        Device name
        <input type="text" value={hrm.device_name} onChange={(e) => onConfigChange(setHrm(config, { device_name: e.target.value }))} />
      </label>

      <p>Logs HR_BPM (channel 22) and HR_RR (channel 23) while enabled (SPEC §8).</p>

      <button type="button" onClick={() => onConfigChange(clearHrm(config))}>
        Forget
      </button>
      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
