import { useEffect, useState } from "react";

import { SectionHead } from "@/components/brand/SectionHead";
import { cn } from "@/lib/utils";
import AboutSection from "./AboutSection";
import ControlsSection from "./ControlsSection";
import DataSection from "./DataSection";
import FirmwareSection from "./FirmwareSection";
import HowTosSection from "./HowTosSection";
import { MIGRATION_FLAG_KEY, runPrefsMigration, type MigrationOutcome, type SkippedField } from "./prefsMigration";
import ProfileSection from "./ProfileSection";
import { createPrefsStore, localStorageBackend } from "./prefsStore";
import { createPortal } from "react-dom";

import { useSidebarSlotNode } from "../../../shell/sidebarSlot";
import { SECTIONS, defaultSectionId, sectionById } from "./sections";
import { settingsBackend } from "./settingsBackend";
import SyncSection from "./SyncSection";
import ThemeSection from "./ThemeSection";
import UnitsSection from "./UnitsSection";
import { getSettings, setSettings } from "../../../ipc/app";
import { useAppState } from "../../../state/AppState";

/** The `ui` half's own storage. Shared between {@link prefsStore}'s
 *  `settingsBackend` and the one-time migration below so both act on the
 *  same `localStorage` document (R78 L7c Task 8). */
const localHalf = localStorageBackend();

/** The single {@link PrefsStore} instance every Settings section reads from
 *  and writes to. The `engine` half (`rider_name`, `unit_system`) round-trips
 *  through `get_settings`/`set_settings` (C3 §3.10); the `ui` half stays in
 *  `localStorage` (R78 L7c Task 8, R53 Settings Q1/Q2 — SPEC §27.1). */
const prefsStore = createPrefsStore(settingsBackend({ getSettings, setSettings, local: localHalf }));

/** Reads whether the one-time `localStorage` → `settings.json` import has
 *  already run on this machine. Wrapped in try/catch — a WebView can refuse
 *  storage, in which case the migration simply runs again next launch,
 *  which is harmless (`settings.json` wins on conflict). */
function readMigrationFlag(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

/** Marks the migration done. See {@link readMigrationFlag} for the failure
 *  mode this also tolerates. */
function writeMigrationFlag(): void {
  try {
    window.localStorage.setItem(MIGRATION_FLAG_KEY, "true");
  } catch {
    // Best-effort — see readMigrationFlag.
  }
}

/** Bumped on every mount of {@link Settings}. A migration result is applied
 *  only if this still matches the generation captured at the start of the
 *  effect that requested it — a result arriving after unmount (and a later
 *  remount) is dropped by comparing generations, never by cancelling
 *  in-flight work from the effect's cleanup (wave-2 operating brief §4). */
let migrationGeneration = 0;

/** Names of the two engine fields the migration touches, matched to
 *  {@link SkippedField.field} for {@link describeMigrationNotices}. */
const FIELD_LABELS: Record<SkippedField["field"], string> = {
  rider_name: "rider name",
  unit_system: "unit system",
};

/** Finds `field` in `skipped` and phrases the "kept, not overwritten" notice
 *  for it (R82, L7c Task 9), or `null` if that field was not skipped. */
function skippedFieldNotice(skipped: SkippedField[], field: SkippedField["field"]): string | null {
  const entry = skipped.find((candidate) => candidate.field === field);
  if (entry === undefined) {
    return null;
  }
  const label = FIELD_LABELS[field];
  return `Kept ${label} '${entry.onDisk}' from settings.json; your browser had '${entry.local}'.`;
}

/** Turns a {@link MigrationOutcome} into the two field-specific notices shown
 *  in {@link ProfileSection} and {@link UnitsSection} (R78 L7c Task 8, Q3): a
 *  failure is shown in both (either field could have been the one that
 *  needed importing); a success names the field it actually imported, or —
 *  when `settings.json` already held a different value for that field
 *  (R82, L7c Task 9) — names which value was kept and which was discarded. */
function describeMigrationNotices(outcome: MigrationOutcome | null): { profile: string | null; units: string | null } {
  if (outcome === null) {
    return { profile: null, units: null };
  }
  if (outcome.kind === "failed") {
    const message = "A saved setting from this browser could not be copied to the settings file. It will be retried next time you open the app.";
    return { profile: message, units: message };
  }
  if (outcome.kind === "migrated") {
    return {
      profile: outcome.imported.rider_name !== undefined
        ? "Your rider name was carried over from this browser's saved settings."
        : skippedFieldNotice(outcome.skipped, "rider_name"),
      units: outcome.imported.unit_system !== undefined
        ? "Your unit system was carried over from this browser's saved settings."
        : skippedFieldNotice(outcome.skipped, "unit_system"),
    };
  }
  if (outcome.kind === "nothing-to-migrate") {
    return {
      profile: skippedFieldNotice(outcome.skipped, "rider_name"),
      units: skippedFieldNotice(outcome.skipped, "unit_system"),
    };
  }
  return { profile: null, units: null };
}

/** The Settings tab: a section list plus a detail pane.
 *
 * Task 1 built the shell with every section as a placeholder. Task 3 fills
 * in Profile and Units; Task 4 fills in Data directory; Task 5 fills in
 * Sync; Task 6 fills in Chart controls, How-tos and About. Task 8 swaps the
 * `engine` half of {@link prefsStore} onto `settings.json` and runs the
 * one-time `localStorage` import once per mount (R78 L7c Task 8). Layout
 * switches from a two-pane list-plus-detail view to one stacked scroll view
 * via a CSS media query (`settings.css`), not by measuring the viewport in
 * JavaScript. */
export default function Settings() {
  const [selectedId, setSelectedId] = useState<string>(defaultSectionId);
  const [appState] = useAppState();
  const [migrationOutcome, setMigrationOutcome] = useState<MigrationOutcome | null>(null);

  useEffect(() => {
    const generation = ++migrationGeneration;
    void runPrefsMigration({
      isMigrated: readMigrationFlag,
      markMigrated: writeMigrationFlag,
      readLocal: () => localHalf.read(),
      writeLocal: (text) => localHalf.write(text),
      getSettings,
      setSettings,
    }).then((outcome) => {
      if (generation !== migrationGeneration) {
        return; // superseded by a later mount; drop rather than apply
      }
      setMigrationOutcome(outcome);
    });
  }, []);

  const selected = sectionById(selectedId) ?? SECTIONS[0];
  const migrationNotices = describeMigrationNotices(migrationOutcome);
  const sidebarNode = useSidebarSlotNode("settings");

  /* The section list. Ruling R220 item 1 makes it the Settings activity's
     sidebar content, so at widths that have a sidebar it is portaled there
     and this page shows only the selected section. Where there is no
     sidebar (narrow, R220 item 3) the same list renders inline above the
     section, which is the stacked layout `settings.css` already
     described. */
  const sectionList = (
    <ul className="flex shrink-0 flex-col gap-1 p-2">
      {SECTIONS.map((section) => (
        <li
          key={section.id}
          className={cn(
            "cursor-pointer rounded-[var(--radius-structural)] px-3 py-2 hover:bg-control",
            section.id === selected.id && "bg-control-active font-medium",
          )}
          onClick={() => setSelectedId(section.id)}
        >
          <div className="font-mono text-sm text-fg">{section.label}</div>
          <p className="font-mono text-xs text-fg-dim">{section.description}</p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 min-[720px]:items-start min-[720px]:overflow-hidden">
      {sidebarNode === null ? sectionList : createPortal(sectionList, sidebarNode)}
      <div className="flex min-w-0 w-full flex-1 flex-col gap-4 min-[720px]:h-full min-[720px]:max-w-[720px] min-[720px]:overflow-auto">
        <SectionHead>{selected.label}</SectionHead>
        <p className="font-mono text-xs text-fg-dim">{selected.description}</p>
        {selected.id === "profile" ? (
          <ProfileSection store={prefsStore} migrationNotice={migrationNotices.profile} />
        ) : selected.id === "units" ? (
          <UnitsSection store={prefsStore} migrationNotice={migrationNotices.units} />
        ) : selected.id === "data" ? (
          <DataSection store={prefsStore} />
        ) : selected.id === "sync" ? (
          <SyncSection store={prefsStore} />
        ) : selected.id === "firmware" ? (
          <FirmwareSection store={prefsStore} />
        ) : selected.id === "controls" ? (
          <ControlsSection />
        ) : selected.id === "theme" ? (
          <ThemeSection store={prefsStore} />
        ) : selected.id === "howTos" ? (
          <HowTosSection />
        ) : selected.id === "about" ? (
          <AboutSection engineVersion={appState.engineVersion} />
        ) : (
          <p>Built in a later task.</p>
        )}
      </div>
    </div>
  );
}
