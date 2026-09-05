import { DEFAULT_PREFS, parsePrefs, serializePrefs, type Prefs } from "./prefs";

/** Storage seam behind {@link createPrefsStore}. A `localStorage`
 *  implementation and an in-memory one for tests. Both methods are
 *  `Promise`-returning so this interface can be swapped for a real
 *  `invoke`-based Tauri command (`get_settings`/`set_settings`) without a
 *  second interface change later — the eventual swap is a one-line factory
 *  change (a new `tauriSettingsBackend()` alongside `localStorageBackend()`),
 *  since every caller already awaits {@link PrefsStore.get}/`set` (R53 Q1). */
export interface PrefsBackend {
  /** Reads the raw persisted document, or `null` if there is none yet.
   *  Never rejects — a backend that cannot read reports that as `null`. */
  read(): Promise<string | null>;
  /** Persists the raw document. May reject; {@link createPrefsStore} is the
   *  only caller and always wraps this call. */
  write(text: string): Promise<void>;
}

/** A `PrefsBackend` over the WebView's `localStorage`. `localStorage` itself
 *  has no async API, so each call still runs its `localStorage` access
 *  synchronously internally, wrapping the result (or a thrown error) in a
 *  resolved/rejected `Promise` to satisfy {@link PrefsBackend}. Every read is
 *  additionally wrapped in try/catch — a WebView can refuse storage (private
 *  mode, cleared site data, a policy) — so a refusal surfaces as "no stored
 *  value" on read and as a rejected `write()`, never as an uncaught
 *  exception from this module itself. */
export function localStorageBackend(): PrefsBackend {
  const key = "idl1.settings.prefs.v1";
  return {
    async read(): Promise<string | null> {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async write(text: string): Promise<void> {
      // Intentionally not caught here: createPrefsStore.set() is the single
      // place that catches a write failure and turns it into a reported
      // result, so a rejection is not swallowed twice.
      window.localStorage.setItem(key, text);
    },
  };
}

/** A `PrefsBackend` held in memory, for tests. `seed`, if given, is the raw
 *  text an initial `read()` resolves to — pass corrupt JSON or `undefined`
 *  to exercise {@link createPrefsStore}'s leniency without touching real
 *  storage. */
export function memoryBackend(seed?: string): PrefsBackend {
  let stored: string | null = seed ?? null;
  return {
    async read(): Promise<string | null> {
      return stored;
    },
    async write(text: string): Promise<void> {
      stored = text;
    },
  };
}

/** The result of {@link PrefsStore.set} — a failed backend write is reported
 *  here, never swallowed, so a caller can tell the user their change did not
 *  reach disk (even though it is still visible in {@link PrefsStore.get}). */
export interface SetResult {
  /** `false` when the backend's `write` rejected; the in-memory value still
   *  updated regardless, so the user's typing is never discarded. */
  ok: boolean;
  /** The error the backend's `write` rejected with, when `ok` is `false`. */
  error?: unknown;
}

/** A subscriber notified with the new {@link Prefs} value after a
 *  successful or failed {@link PrefsStore.set} — in-memory state always
 *  changes, so subscribers always hear about it. */
export type PrefsListener = (prefs: Prefs) => void;

/** The prefs store's public surface: an in-memory cache backed by a
 *  {@link PrefsBackend}, read/written through `Promise`-returning methods so
 *  the backend can be a real IPC call. */
export interface PrefsStore {
  /** The current value. Waits for the backend's initial read (issued once,
   *  at construction) to finish, then resolves with the in-memory cache —
   *  never rejects, even if that initial read failed or returned something
   *  unreadable, which falls back to {@link DEFAULT_PREFS}. */
  get(): Promise<Prefs>;
  /** Applies a partial patch over the current value (shallow per top-level
   *  key: a supplied `engine`/`ui` replaces that whole half), updates the
   *  in-memory cache immediately, and persists it through the backend. */
  set(patch: Partial<Prefs>): Promise<SetResult>;
  /** Registers `listener` to be called after every `set()` with the new
   *  value. Returns a function that unsubscribes it. Synchronous — this is
   *  plain callback registration, not an IO call. */
  subscribe(listener: PrefsListener): () => void;
}

/** Builds a {@link PrefsStore} over `backend`. Issues exactly one
 *  `backend.read()` at construction to seed the in-memory cache; every
 *  `get()`/`set()` after that awaits that same read (already settled, in
 *  practice, by the time a caller's first `get()` resolves) rather than
 *  reading the backend again, so a backend whose `read()` would reject is
 *  only ever asked once. */
export function createPrefsStore(backend: PrefsBackend): PrefsStore {
  let current: Prefs = DEFAULT_PREFS;
  const listeners = new Set<PrefsListener>();

  const initialRead: Promise<void> = readInitial(backend).then((prefs) => {
    current = prefs;
  });

  async function readInitial(source: PrefsBackend): Promise<Prefs> {
    let raw: string | null;
    try {
      raw = await source.read();
    } catch {
      return DEFAULT_PREFS;
    }
    if (raw === null) {
      return DEFAULT_PREFS;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return DEFAULT_PREFS;
    }
    return parsePrefs(parsedJson);
  }

  return {
    async get(): Promise<Prefs> {
      await initialRead;
      return current;
    },
    async set(patch: Partial<Prefs>): Promise<SetResult> {
      await initialRead;
      const next: Prefs = {
        ...current,
        ...patch,
      };
      current = next;

      let result: SetResult;
      try {
        await backend.write(serializePrefs(next));
        result = { ok: true };
      } catch (error) {
        result = { ok: false, error };
      }

      for (const listener of listeners) {
        listener(current);
      }
      return result;
    },
    subscribe(listener: PrefsListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
