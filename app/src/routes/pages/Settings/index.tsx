import { useState } from "react";

import "./settings.css";
import { SECTIONS, defaultSectionId, sectionById } from "./sections";

/** The Settings tab: a section list plus a detail pane.
 *
 * Task 1 builds the shell only — every section renders a placeholder.
 * Tasks 2–6 fill in Profile, Units, Data directory, Sync, Chart controls,
 * How-tos and About. Layout switches from a two-pane list-plus-detail view
 * to one stacked scroll view via a CSS media query (`settings.css`), not by
 * measuring the viewport in JavaScript. */
export default function Settings() {
  const [selectedId, setSelectedId] = useState<string>(defaultSectionId);

  const selected = sectionById(selectedId) ?? SECTIONS[0];

  return (
    <div className="idl1-settings">
      <ul className="idl1-settings__list">
        {SECTIONS.map((section) => (
          <li
            key={section.id}
            className={
              section.id === selected.id
                ? "idl1-settings__list-item idl1-settings__list-item--selected"
                : "idl1-settings__list-item"
            }
            onClick={() => setSelectedId(section.id)}
          >
            <div>{section.label}</div>
            <p className="idl1-settings__description">{section.description}</p>
          </li>
        ))}
      </ul>
      <div className="idl1-settings__detail">
        <h2>{selected.label}</h2>
        <p>{selected.description}</p>
        <p>Built in a later task.</p>
      </div>
    </div>
  );
}
