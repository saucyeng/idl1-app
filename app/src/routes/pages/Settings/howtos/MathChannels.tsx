/** "Math Channels" how-to article — deriving new channels via expressions.
 *
 * Carried from idl0's `assets/howtos/math_channels.md`, rewritten for
 * idl1's workbook model (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`):
 * idl0's separate "Maths" tab with a dedicated expression editor is gone —
 * math channels are now `math` cells written directly in the notebook
 * document that opens with each session (the Notebook tab, L6), mixed with
 * prose and charts rather than kept in a separate screen. */
import { HOWTO_ARTICLE_CLASSES } from "./proseClasses";

export default function MathChannels() {
  return (
    <article className={HOWTO_ARTICLE_CLASSES}>
      <h3>Math Channels</h3>
      <p>
        Math channels let you create derived signals by writing expressions over the raw sensor channels.
        Results are computed on demand and can be charted alongside raw data in the notebook.
      </p>

      <h4>Where they live</h4>
      <p>
        A math channel is a math cell in the session&apos;s notebook document — a fenced block of
        {" "}
        <code>name = expression</code> lines, interleaved with prose and charts rather than kept in a separate
        editor screen.
      </p>

      <h4>Writing an expression</h4>
      <p>
        Raw channels are referenced by name in square brackets, for example <code>[IMU0_AccelZ]</code>. A cell
        can define more than one named channel; definitions across the whole notebook share one namespace, so a
        cell can reference a channel defined in another cell.
      </p>

      <h4>Example expressions</h4>
      <table>
        <thead>
          <tr>
            <th>Expression</th>
            <th>What it computes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Fork velocity = integrate([IMU0_AccelZ])</code></td>
            <td>Fork velocity (mm/s) from Z-axis accelerometer</td>
          </tr>
          <tr>
            <td><code>Shock travel = integrate(integrate([IMU1_AccelZ]))</code></td>
            <td>Shock travel (mm) via double integration</td>
          </tr>
          <tr>
            <td><code>Speed kmh = [GPS_SpeedKmh]</code></td>
            <td>GPS speed, already in km/h</td>
          </tr>
          <tr>
            <td><code>Lateral G squared = [IMU0_AccelX]^2 + [IMU0_AccelY]^2</code></td>
            <td>Lateral + longitudinal G squared</td>
          </tr>
        </tbody>
      </table>

      <h4>Using math channels in charts</h4>
      <p>
        Once a math cell evaluates, its named outputs appear in the channel picker when adding a chart, the same
        way raw session channels do. Math channels are evaluated lazily — the expression is stored, not the
        computed values, so a chart updates automatically if you edit the expression later.
      </p>
    </article>
  );
}
