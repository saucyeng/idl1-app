import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { PrefsStore } from "./prefsStore";

/** How long typing in the rider-name field pauses before the value is
 *  written to `store` (idl0's own debounce), so a keystroke never triggers
 *  a storage write. */
const RIDER_NAME_DEBOUNCE_MS = 500;

/** Props for {@link ProfileSection}. */
export interface ProfileSectionProps {
  /** The prefs store this section reads from and writes to. */
  store: PrefsStore;
  /** A one-line status message about the one-time `localStorage` →
   *  `settings.json` migration (R78 L7c Task 8, Q3), or `null` when there is
   *  nothing to say. Owned by `index.tsx`, which runs the migration once for
   *  the whole tab and knows whether `rider_name` was the field imported (or
   *  the import failed). */
  migrationNotice?: string | null;
}

/** The Profile section: the rider-name field, idl0's "Profile" screen
 *  ported onto the {@link PrefsStore}.
 *
 * The field itself updates on every keystroke so typing feels immediate;
 * the write to `store` is debounced at {@link RIDER_NAME_DEBOUNCE_MS} so
 * typing does not thrash storage. `store.get()`/`set()` are async (the
 * eventual `get_settings`/`set_settings` command is `invoke`-based), so the
 * initial value is seeded in an effect rather than read synchronously at
 * render time — the field starts blank for one paint while that read is in
 * flight. */
export default function ProfileSection({ store, migrationNotice = null }: ProfileSectionProps) {
  const [riderName, setRiderName] = useState<string>("");
  const [writeFailed, setWriteFailed] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void store.get().then((prefs) => {
      if (!cancelled) {
        setRiderName(prefs.engine.rider_name);
      }
    });
    return () => {
      cancelled = true;
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    };
  }, [store]);

  function handleChange(value: string): void {
    setRiderName(value);
    setWriteFailed(false);

    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void store.get().then((current) =>
        store.set({ engine: { ...current.engine, rider_name: value } }).then((result) => {
          if (!result.ok) {
            setWriteFailed(true);
          }
        }),
      );
    }, RIDER_NAME_DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="idl1-settings-rider-name" className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
        Rider name
      </label>
      <Input
        id="idl1-settings-rider-name"
        type="text"
        className="max-w-sm"
        value={riderName}
        onChange={(event) => handleChange(event.target.value)}
      />
      <p className="font-mono text-xs text-fg-faint">
        Pre-filled into new sessions.
      </p>
      {writeFailed ? (
        <p role="status" className="font-mono text-xs text-brand-accent">
          Your rider name could not be saved to this device. It will keep showing until you leave this screen.
        </p>
      ) : null}
      {migrationNotice !== null ? (
        <p role="status" className="font-mono text-xs text-fg-dim">
          {migrationNotice}
        </p>
      ) : null}
    </div>
  );
}
