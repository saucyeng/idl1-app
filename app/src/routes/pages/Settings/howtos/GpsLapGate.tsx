/** "GPS Lap Gate" how-to article — splitting a session into laps from a
 *  GPS-defined gate line.
 *
 * Carried from idl0's `assets/howtos/lap_gate.md`, rewritten for idl1's
 * Data tab (session selection, idl0's "Runs" tab) and Notebook tab (chart
 * viewing, idl0's "Analyze" tab). Bundled with the app (CLAUDE.md §3: no
 * CDN, ever).
 *
 * **Not yet available (2026-09-05, Task 6 review fix).** No lap-gate
 * editor, gate-placement UI, or lap-table population exists in idl1's wave
 * 2 build. R53 Data Q4 rules that the Data tab's lap counts and lap tables
 * render "—"/empty honestly, since no wave-1 import path populates them
 * yet — lap indexing at import time is on the Rust track backlog after the
 * write-amendment lane. Neither L6's nor L7a's wave-2 plans build a gate
 * editor. This article now describes the *design* rather than a shipped
 * flow, and says so up front. */
export default function GpsLapGate() {
  return (
    <article className="idl1-settings__howto">
      <h3>GPS Lap Gate</h3>
      <p className="idl1-settings__howto-warning">
        Not yet available. Lap-gate placement, lap detection and the lap table are not built in this release —
        this article describes how the feature is designed to work once they land.
      </p>
      <p>
        A GPS lap gate is meant to let the app automatically detect each time you cross a start/finish line,
        splitting a session into individual laps with accurate timing.
      </p>

      <h4>How it is meant to work</h4>
      <p>
        You would define a short line segment on the map (the &quot;gate&quot;) by placing two GPS coordinates.
        The app would detect each crossing by intersecting the gate line against the GPS track recorded by the
        device.
      </p>

      <h4>Planned lap modes</h4>
      <ul>
        <li><strong>Circuit:</strong> the gate is the start/finish line. Each crossing ends one lap and starts the next.</li>
        <li><strong>Point-to-point:</strong> the gate is the start only. Useful for stages where the finish is elsewhere.</li>
      </ul>

      <h4>What you can do today</h4>
      <p>
        Until this lands, a session&apos;s lap count and lap table show as empty rather than a guess. Lap
        indexing at import time already exists in the core engine (gate synthesis and lap renumbering); it is
        not yet wired into an editor or into the import path used in this build.
      </p>
    </article>
  );
}
