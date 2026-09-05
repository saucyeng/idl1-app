/** "First Setup" how-to article — pairing a device and recording a first
 *  session.
 *
 * Carried from idl0's `assets/howtos/first_setup.md`, rewritten for idl1's
 * four-tab shell (`routes/types.ts`): idl0's separate Device/Runs tabs
 * collapse into idl1's Device tab (pairing, config push, calibration,
 * recording) and Data tab (download, session library) respectively — see
 * `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §10. Bundled
 * with the app (CLAUDE.md §3: no CDN, ever); idl0's "Full reference" link
 * (an `example.com` placeholder) is not carried across. */
export default function FirstSetup() {
  return (
    <article className="idl1-settings__howto">
      <h3>First Setup</h3>
      <p>
        This guide walks you through pairing your device for the first time and recording your first session.
      </p>

      <h4>1. Power on the device</h4>
      <p>
        Hold the button on the device for two seconds until the LED flashes blue. The device begins advertising
        over Bluetooth Low Energy immediately.
      </p>

      <h4>2. Connect via Bluetooth</h4>
      <p>
        Open the <strong>Device</strong> tab. Scan and select your device from the list — it appears as
        {" "}
        <code>IDL-XXXXXX</code> where the suffix is the last three bytes of the device&apos;s MAC address. Once
        connected, battery level and firmware version appear on the Device tab.
      </p>

      <h4>3. Push a configuration</h4>
      <p>
        The device ships with a default configuration. Review the bike profile, IMU sample rate, GPS rate and
        wheel speed settings, then push the configuration to send it. Configuration is sent over WiFi: the app
        opens the device&apos;s access point automatically, pushes the settings, and reconnects over Bluetooth.
      </p>

      <h4>4. Calibrate the IMUs</h4>
      <p>
        Mount the device on your bike in its final orientation, then run IMU calibration from the Device tab.
        Hold the bike stationary on a level surface when prompted. Calibration captures the gravity vector and
        computes a rotation matrix mapping the sensor&apos;s body frame to the vehicle frame (X = forward, Y =
        left, Z = up). The result is stored on the device and applied to every future recording.
      </p>

      <h4>5. Record your first session</h4>
      <p>
        Start recording from the Device tab, ride normally, then stop recording when finished. The session is
        written to the device&apos;s SD card and is ready to download.
      </p>

      <h4>6. Download the session</h4>
      <p>
        Switch to the <strong>Data</strong> tab and connect to join the device&apos;s access point. Select the
        session file and download it. Once downloaded, the session appears in your session library and is ready
        for analysis in the <strong>Notebook</strong> tab.
      </p>
    </article>
  );
}
