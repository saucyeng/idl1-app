/** "GPS Lap Gate" how-to article — splitting a session into laps from a
 *  GPS-defined gate line.
 *
 * Carried from idl0's `assets/howtos/lap_gate.md`, rewritten for idl1's
 * Data tab (session selection, idl0's "Runs" tab) and Notebook tab (chart
 * viewing and editing, idl0's "Analyze" tab). Bundled with the app
 * (CLAUDE.md §3: no CDN, ever). */
export default function GpsLapGate() {
  return (
    <article className="idl1-settings__howto">
      <h3>GPS Lap Gate</h3>
      <p>
        A GPS lap gate lets the app automatically detect each time you cross the start/finish line, splitting a
        session into individual laps with accurate timing.
      </p>

      <h4>How it works</h4>
      <p>
        You define a short line segment on the map (the &quot;gate&quot;) by placing two GPS coordinates. The
        app detects each crossing by intersecting the gate line against the GPS track recorded by the device.
      </p>

      <h4>1. Open a session</h4>
      <p>
        Select a session in the <strong>Data</strong> tab, then open it in the <strong>Notebook</strong> tab. The
        session&apos;s GPS track is visible on a GPS map chart.
      </p>

      <h4>2. Place the gate</h4>
      <p>
        Open the session&apos;s lap-gate editor and place two points on the map to define the gate line — set
        them across the track at your preferred start/finish location.
      </p>

      <h4>3. Choose a lap mode</h4>
      <ul>
        <li><strong>Circuit:</strong> the gate is the start/finish line. Each crossing ends one lap and starts the next.</li>
        <li><strong>Point-to-point:</strong> the gate is the start only. Use this for stages where the finish is elsewhere.</li>
      </ul>

      <h4>4. Apply and review</h4>
      <p>
        Apply the gate. The app re-detects laps automatically, and lap times appear in the lap table alongside
        the session&apos;s charts. The fastest lap is highlighted.
      </p>

      <h4>Tips</h4>
      <ul>
        <li>Place the gate on a straight section of track where GPS accuracy is highest.</li>
        <li>Avoid placing it in wooded sections where GPS signal may drift.</li>
        <li>If laps are not detected, confirm the GPS track actually passes through the gate line.</li>
      </ul>
    </article>
  );
}
