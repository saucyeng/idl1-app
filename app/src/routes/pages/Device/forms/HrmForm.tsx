import { useState } from "react";

import { bleScan } from "../../../../ipc/device";
import type { DeviceDiscovered } from "../../../../ipc/device";
import { clearHrm, setHrm } from "../config/edit";
import type { DeviceConfig } from "../config/model";
import { BLE_ADDRESS_RE, validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";
import { describeIpcError } from "../errors";
import { filterHrmCandidates, hiddenByFilterCount } from "./hrmFilter";

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
 * Forget. The scan list defaults to devices advertising the standard
 * heart-rate service (`hrmFilter.ts`'s `filterHrmCandidates`, decision 68 —
 * this closes the parity gap this doc comment used to name; the filter
 * became buildable once `DeviceDiscovered.service_uuids` landed), with a
 * "Show all devices" toggle for a strap that didn't advertise its service
 * list in the scan record this app saw. A discovered device's own
 * identifier is written into `device_address` verbatim; on a platform
 * where that identifier is not the colon-separated uppercase-hex MAC
 * SPEC §8 states, `validateConfig` reports it as an invalid address rather
 * than this form silently reformatting or rejecting it — visible, not
 * silent, matching ruling R58's cost-if-wrong stance.
 */
export default function HrmForm({ config, onConfigChange, onClose }: HrmFormProps) {
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DeviceDiscovered[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showAllDevices, setShowAllDevices] = useState(false);

  const visibleDiscovered = filterHrmCandidates(discovered, showAllDevices);
  const hiddenCount = hiddenByFilterCount(discovered, showAllDevices);

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
        <label>
          <input type="checkbox" checked={showAllDevices} onChange={(e) => setShowAllDevices(e.target.checked)} />
          Show all devices
        </label>
      )}
      {visibleDiscovered.length > 0 && (
        <ul>
          {visibleDiscovered.map((device) => (
            <li key={device.device_id}>
              {device.name || device.device_id} ({device.rssi_dbm} dBm){" "}
              <button type="button" onClick={() => onSelectDiscovered(device)}>
                Select
              </button>
            </li>
          ))}
        </ul>
      )}
      {!scanning && hiddenCount > 0 && visibleDiscovered.length === 0 && (
        <p role="status">
          {hiddenCount} device{hiddenCount === 1 ? "" : "s"} found, none look like heart-rate straps. Try &quot;Show all
          devices&quot;.
        </p>
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
