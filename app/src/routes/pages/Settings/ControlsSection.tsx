import { CONTROL_GROUPS } from "./controls";

/** The Chart controls section: a read-only reference of the notebook
 *  chart's mouse-wheel, mouse and keyboard shortcuts ({@link CONTROL_GROUPS}).
 *
 * **Provisional (R53 Q2).** The visible banner below is required, not
 * decorative — the table is idl0's until L6's notebook lane lands its own
 * bindings, and a settings screen listing shortcuts that might not match
 * the shipped chart is exactly the kind of confidently-wrong documentation
 * this banner exists to prevent. */
export default function ControlsSection() {
  return (
    <div className="idl1-settings__section">
      <p className="idl1-settings__hint idl1-settings__hint--provisional">
        Provisional — bindings land with the Notebook lane.
      </p>
      {CONTROL_GROUPS.map((group) => (
        <div key={group.title} className="idl1-settings__controls-group">
          <h3>{group.title}</h3>
          <table className="idl1-settings__controls-table">
            <tbody>
              {group.rows.map(([action, keystroke]) => (
                <tr key={action}>
                  <th>{action}</th>
                  <td>{keystroke}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
