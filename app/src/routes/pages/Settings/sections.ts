/** A single entry in the Settings tab's section list.
 *
 * idl1's Settings tab has nine sections. Relative to idl0's seven: Google
 * Drive is dropped permanently (idl1 syncs peer-to-peer over the LAN
 * instead, see `sync`); `data` (data-directory override, C4 §1) is new;
 * `firmware` is the OTA update path (SPEC §27.7 as amended for idl1,
 * rulings R197/R198) — a catalog check against the configured repository
 * plus the manual `.bin` push; `theme` is new (UI-DIRECTION decision 5,
 * 31). */
export interface SettingsSection {
  /** Stable identifier, used for routing/selection and as a React key.
   *  Never shown to the user directly. */
  id: string;
  /** Short label shown in the section list. */
  label: string;
  /** One-line description shown under the label in the section list. */
  description: string;
}

/** The Settings tab's sections, in display order.
 *
 * `profile` is first and is this tab's {@link defaultSectionId}. */
export const SECTIONS: readonly SettingsSection[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Rider name and other identity fields.",
  },
  {
    id: "units",
    label: "Units",
    description: "Imperial or metric units across the app.",
  },
  {
    id: "data",
    label: "Data directory",
    description: "Where session data is stored on this machine.",
  },
  {
    id: "sync",
    label: "Sync",
    description: "LAN peer pairing and sync status.",
  },
  {
    id: "firmware",
    label: "Firmware",
    description: "Device firmware updates over the air.",
  },
  {
    id: "controls",
    label: "Chart controls",
    description: "Reference for the notebook chart's mouse and key controls.",
  },
  {
    id: "theme",
    label: "Theme",
    description: "Appearance and notebook output register.",
  },
  {
    id: "howTos",
    label: "How-tos",
    description: "Short guides for common tasks.",
  },
  {
    id: "about",
    label: "About",
    description: "App and engine version information.",
  },
];

/** The section id selected when the Settings tab first opens. */
export const defaultSectionId: string = SECTIONS[0].id;

/** Looks up a section by id.
 *
 * @param id - A {@link SettingsSection.id} value, or any string.
 * @returns The matching section, or `undefined` if `id` names no section.
 *  Never throws — an unknown id (e.g. a stale bookmark) is the caller's
 *  cue to fall back to {@link defaultSectionId}, not a crash. */
export function sectionById(id: string): SettingsSection | undefined {
  return SECTIONS.find((section) => section.id === id);
}
