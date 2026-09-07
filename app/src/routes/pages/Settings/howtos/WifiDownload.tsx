/** "WiFi Download" how-to article — pulling sessions off the device over its
 *  own WiFi access point.
 *
 * Carried from idl0's `assets/howtos/wifi_download.md`, rewritten for
 * idl1's Device tab (idl0's separate "Runs" tab and its Download panel;
 * idl1 moves the device file list to the Device tab — L7a's Data-tab plan
 * files it there under "Moved to L7b" — and leaves import into the session
 * library a separate manual step, since the two tabs don't call each other
 * in wave 2). Bundled with the app (CLAUDE.md §3: no CDN, ever).
 *
 * **Accuracy note (2026-09-05, Task 6 review fix).** `listDeviceFiles`
 * already drives the device into WiFi mode itself (`ControlCommand::WifiOn`,
 * `rust/tauri/src/commands/device.rs`) — there is no separate "turn WiFi on"
 * button in the app, unlike idl0. This article no longer describes one. */
import { HOWTO_ARTICLE_CLASSES } from "./proseClasses";

export default function WifiDownload() {
  return (
    <article className={HOWTO_ARTICLE_CLASSES}>
      <h3>WiFi Download</h3>
      <p>
        The device hosts its own WiFi access point so you can download sessions without an internet connection.
        This guide covers connecting to the device&apos;s access point and transferring files.
      </p>

      <h4>1. Join the device network</h4>
      <p>
        Open the <strong>Device</strong> tab and connect to your device over Bluetooth first, if you haven&apos;t
        already. On your computer or phone, connect to the device&apos;s WiFi network — the SSID is
        {" "}
        <code>IDL-XXXXXX</code> and the password is printed on the device label. You may see a
        &quot;no internet&quot; warning — this is expected. Keep the connection active.
      </p>

      <h4>2. List and download sessions</h4>
      <p>
        In the Device tab&apos;s files list, request the list of files on the device&apos;s SD card — this also
        brings the device&apos;s access point up, so no separate "enable WiFi" step is needed. Select a file and
        download it. A progress indicator shows bytes transferred in real time.
      </p>

      <h4>3. Import the download</h4>
      <p>
        A completed download is saved to disk but is not yet in your session library — switch to the
        {" "}
        <strong>Data</strong> tab and import it from there. This is a separate, manual step in this build; the
        Device tab tells you the file downloaded and where to import it.
      </p>

      <h4>4. Rejoin your regular network</h4>
      <p>
        After downloading, reconnect to your regular network. The app continues to work with the downloaded
        data offline.
      </p>

      <h4>Troubleshooting</h4>
      <ul>
        <li>
          <strong>File list is empty:</strong> confirm the device LED is solid blue (access-point mode active) and
          your machine is connected to the device&apos;s network.
        </li>
        <li>
          <strong>Download stalls:</strong> retry the transfer. If it continues to fail, confirm nothing switched
          the connection away from the device&apos;s network mid-transfer.
        </li>
        <li>
          <strong>Large sessions:</strong> a one-hour session at default settings is roughly 155&nbsp;MB.
        </li>
      </ul>
    </article>
  );
}
