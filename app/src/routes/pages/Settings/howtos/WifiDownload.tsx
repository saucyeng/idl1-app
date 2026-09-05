/** "WiFi Download" how-to article — pulling sessions off the device over its
 *  own WiFi access point.
 *
 * Carried from idl0's `assets/howtos/wifi_download.md`, rewritten for
 * idl1's Data tab (idl0's separate "Runs" tab and its Download panel).
 * Bundled with the app (CLAUDE.md §3: no CDN, ever). */
export default function WifiDownload() {
  return (
    <article className="idl1-settings__howto">
      <h3>WiFi Download</h3>
      <p>
        The device hosts its own WiFi access point so you can download sessions without an internet connection.
        This guide covers connecting to the device&apos;s access point and transferring files.
      </p>

      <h4>1. Enable WiFi on the device</h4>
      <p>
        From the <strong>Device</strong> tab, turn WiFi on. The device starts its access point — the SSID is
        {" "}
        <code>IDL-XXXXXX</code> and the password is printed on the device label (or shown in the Bluetooth
        status panel).
      </p>

      <h4>2. Join the device network</h4>
      <p>
        On your computer or phone, connect to the <code>IDL-XXXXXX</code> network. You may see a
        &quot;no internet&quot; warning — this is expected. Keep the connection active.
      </p>

      <h4>3. Download sessions</h4>
      <p>
        Switch to the <strong>Data</strong> tab. It automatically discovers the device and lists the sessions
        available on its SD card. Select a session and download it. A progress indicator shows bytes transferred
        in real time.
      </p>

      <h4>4. Verify the download</h4>
      <p>
        Once complete, the session appears in the session library on the Data tab. Open it to confirm the
        metadata (date, duration, channel count) looks correct before disconnecting from the device&apos;s
        access point.
      </p>

      <h4>5. Rejoin your regular network</h4>
      <p>
        After downloading, reconnect to your regular network. The app continues to work with the downloaded
        data offline.
      </p>

      <h4>Troubleshooting</h4>
      <ul>
        <li>
          <strong>Device not listed:</strong> confirm the device LED is solid blue (access-point mode active) and
          your machine is connected to the correct network.
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
