import { useEffect, useRef, useState } from "react";

import type { PrefsStore } from "./prefsStore";

/** How long typing in the rider-name field pauses before the value is
 *  written to `store` (idl0's own debounce), so a keystroke never triggers
 *  a storage write. */
const RIDER_NAME_DEBOUNCE_MS = 500;

/** Props for {@link ProfileSection}. */
export interface ProfileSectionProps {
  /** The prefs store this section reads from and writes to. */
  store: PrefsStore;
}

/** The Profile section: the rider-name field, idl0's "Profile" screen
 *  ported onto the {@link PrefsStore}.
 *
 * The field itself updates on every keystroke so typing feels immediate;
 * the write to `store` is debounced at {@link RIDER_NAME_DEBOUNCE_MS} so
 * typing does not thrash storage. */
export default function ProfileSection({ store }: ProfileSectionProps) {
  const [riderName, setRiderName] = useState<string>(store.get().engine.rider_name);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleChange(value: string): void {
    setRiderName(value);

    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      const current = store.get();
      store.set({ engine: { ...current.engine, rider_name: value } });
    }, RIDER_NAME_DEBOUNCE_MS);
  }

  return (
    <div className="idl1-settings__section">
      <label htmlFor="idl1-settings-rider-name">Rider name</label>
      <input
        id="idl1-settings-rider-name"
        type="text"
        value={riderName}
        onChange={(event) => handleChange(event.target.value)}
      />
      <p className="idl1-settings__hint">
        Pre-filled into new sessions.
      </p>
    </div>
  );
}
