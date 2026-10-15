import { getSettings, setSettings } from "../../../ipc/app";
import { createPrefsStore, localStorageBackend } from "./prefsStore";
import { settingsBackend } from "./settingsBackend";

/** The `ui` half's own storage. Shared between {@link prefsStore}'s
 *  `settingsBackend` and Settings' one-time migration so both act on the
 *  same `localStorage` document (R78 L7c Task 8). */
export const localHalf = localStorageBackend();

/** The app's single {@link PrefsStore}: every Settings section, and the
 *  Logger screen's firmware panel, read from and write to it. The `engine`
 *  half (`rider_name`, `unit_system`) round-trips through
 *  `get_settings`/`set_settings` (C3 §3.10); the `ui` half stays in
 *  `localStorage` (R78 L7c Task 8, R53 Settings Q1/Q2 — SPEC §27.1). */
export const prefsStore = createPrefsStore(settingsBackend({ getSettings, setSettings, local: localHalf }));
