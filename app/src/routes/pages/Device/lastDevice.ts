/**
 * Storage seam for the Device tab's last-used device id (decision 64:
 * "open the app, it connects automatically"). This is a **device
 * preference, not workbook state** — unlike `Selection` (decision 48), it
 * persists across app restarts rather than living only in a session.
 *
 * There is no `AppSettings`/C3 field for this yet (`app/src/ipc/app.ts`) —
 * adding one is a Rust `idl-rs`/`idl-rs-tauri` change this TS-only lane may
 * not make (CLAUDE.md §2, dispatch: "TypeScript only — never run cargo").
 * `localStorage` is the seam until one lands, the same pattern
 * `Settings/prefsStore.ts` already uses for a setting not yet backed by
 * `settings.json` (R53 Settings Q1/Q2) — the eventual swap to a real
 * `get_settings`/`set_settings` round trip is a one-line factory change,
 * since every caller already awaits {@link LastDeviceBackend.read}/`write`.
 */
export interface LastDeviceBackend {
  /** Reads the persisted device id, or `null` if none is stored yet or the
   *  backend can't be read. Never rejects. */
  read(): Promise<string | null>;
  /** Persists `deviceId` as the one to auto-connect to on next launch. May
   *  reject; callers treat a rejection as best-effort (a failed write here
   *  only means the *next* launch won't auto-connect, never a crash now). */
  write(deviceId: string): Promise<void>;
}

/** The `localStorage` key `localStorageLastDeviceBackend` reads/writes. */
const STORAGE_KEY = "idl1.device.lastDeviceId.v1";

/** A {@link LastDeviceBackend} over the WebView's `localStorage`, wrapping
 *  every call in try/catch — a WebView can refuse storage (private mode,
 *  cleared site data, a policy) — so a refusal surfaces as "no stored
 *  value" on read and a rejected `write()`, never an uncaught exception. */
export function localStorageLastDeviceBackend(): LastDeviceBackend {
  return {
    async read(): Promise<string | null> {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    async write(deviceId: string): Promise<void> {
      window.localStorage.setItem(STORAGE_KEY, deviceId);
    },
  };
}

/** A {@link LastDeviceBackend} held in memory, for tests. `seed`, if given,
 *  is what an initial `read()` resolves to. */
export function memoryLastDeviceBackend(seed: string | null = null): LastDeviceBackend {
  let stored: string | null = seed;
  return {
    async read(): Promise<string | null> {
      return stored;
    },
    async write(deviceId: string): Promise<void> {
      stored = deviceId;
    },
  };
}

/**
 * Whether an auto-connect attempt should be started right now (wave-2
 * operating brief §4's effects rule: the decision lives in a pure,
 * unit-tested function, not inline in the mount effect).
 *
 * True only when: a last-used device id is on record, no attempt has been
 * made yet this app session (`attempted` — set once the effect fires,
 * regardless of outcome, so a re-render or a state change never triggers a
 * second attempt), and the connection state is still at its untouched
 * initial shape (`connection.ts`'s `initialConnectionState`) — if the user
 * has already started scanning, connecting, or is otherwise mid-flow by the
 * time the stored id resolves, auto-connect stands down rather than
 * interrupting them (philosophy 72: no surprise mid-operation).
 */
export function shouldAutoConnect(lastDeviceId: string | null, attempted: boolean, connectionsCount: number, phase: string): boolean {
  if (attempted || lastDeviceId === null) return false;
  return connectionsCount === 0 && phase === "idle";
}
