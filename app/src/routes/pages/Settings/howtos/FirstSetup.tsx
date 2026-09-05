/** "First Setup" how-to article — pairing a device and recording a first
 *  session.
 *
 * Carried from idl0's `assets/howtos/first_setup.md`, rewritten for idl1's
 * four-tab shell (`routes/types.ts`): idl0's separate Device/Runs tabs
 * collapse into idl1's Device tab (pairing, config push, file download) and
 * Data tab (importing a downloaded file into the session library, then
 * viewing it) — see
 * `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §10. Bundled
 * with the app (CLAUDE.md §3: no CDN, ever); idl0's "Full reference" link
 * (an `example.com` placeholder) is not carried across.
 *
 * **Accuracy note (2026-09-05, Task 6 review fix).** Three passages
 * described features as working today that are not, per L7b's wave-2 plan
 * (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7b-device-tab.md`)
 * Parity gaps table and its own "no C3 command" list: config push is BLE,
 * not WiFi (SPEC §7.2); IMU calibration is deferred to wave 3 (no BLE
 * calibration command, no procedure UI); recording start/stop has no C3
 * command yet and is stubbed. All three are now stated plainly rather than
 * described as working. */
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
        connected, the firmware version appears on the Device tab. (Live status — battery, GPS fix, sensor
        health — is not available in this build; there is no command exposing it yet.)
      </p>

      <h4>3. Push a configuration</h4>
      <p>
        The device ships with a default configuration. Review the bike profile, IMU sample rate, GPS rate and
        wheel speed settings, then push the configuration to send it. Configuration is sent over Bluetooth Low
        Energy (SPEC §7.2) — WiFi is used only for downloading session files, not for pushing configuration —
        and the device reboots to apply the change.
      </p>

      <h4>4. Calibrate the IMUs (not yet available)</h4>
      <p>
        idl0 supported an in-app IMU calibration procedure that captured the gravity vector and computed a
        rotation matrix mapping the sensor&apos;s body frame to the vehicle frame. idl1 does not have this yet —
        it needs a Bluetooth calibration command and a UI for a physical procedure, both deferred to a later
        release. Mount the device carefully in its intended orientation for now; the orientation and bias
        configuration fields are preserved untouched through a config push.
      </p>

      <h4>5. Record a session (not yet available)</h4>
      <p>
        idl1 does not yet have a command to start or stop a recording from the app — this build has no way to
        trigger a recording remotely. Recording still happens on the device itself; use its own controls, if it
        has any, or record a session the same way you would test the device standalone. The session is written
        to the device&apos;s SD card either way and is ready to download once it exists.
      </p>

      <h4>6. Download the session</h4>
      <p>
        Switch to the <strong>Device</strong> tab, join the device&apos;s WiFi network when prompted, and
        download the session file from the device&apos;s file list. A completed download is saved to disk but is
        not yet in your session library — switch to the <strong>Data</strong> tab and import it from there as a
        separate step. Once imported, the session is ready for analysis in the <strong>Notebook</strong> tab.
      </p>
    </article>
  );
}
