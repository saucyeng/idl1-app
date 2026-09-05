import { useState } from "react";

import "./settings.css";
import DataSection from "./DataSection";
import ProfileSection from "./ProfileSection";
import { localStorageBackend, createPrefsStore } from "./prefsStore";
import { SECTIONS, defaultSectionId, sectionById } from "./sections";
import SyncSection from "./SyncSection";
import UnitsSection from "./UnitsSection";

/** The single {@link PrefsStore} instance every Settings section reads from
 *  and writes to, over the real `localStorage` (R53 Q1) — one store per
 *  page load, shared across sections rather than re-read per section, so a
 *  write from one section is visible to another without a round trip. */
const prefsStore = createPrefsStore(localStorageBackend());

/** The Settings tab: a section list plus a detail pane.
 *
 * Task 1 built the shell with every section as a placeholder. Task 3 fills
 * in Profile and Units; Task 4 fills in Data directory; Task 5 fills in
 * Sync; Task 6 fills in Chart controls, How-tos and About. Layout switches
 * from a two-pane list-plus-detail view to one stacked scroll view via a CSS
 * media query (`settings.css`), not by measuring the viewport in
 * JavaScript. */
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
        {selected.id === "profile" ? (
          <ProfileSection store={prefsStore} />
        ) : selected.id === "units" ? (
          <UnitsSection store={prefsStore} />
        ) : selected.id === "data" ? (
          <DataSection store={prefsStore} />
        ) : selected.id === "sync" ? (
          <SyncSection store={prefsStore} />
        ) : (
          <p>Built in a later task.</p>
        )}
      </div>
    </div>
  );
}
