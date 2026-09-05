import { DEFAULT_PREFS, parsePrefs, serializePrefs, type Prefs } from "./prefs";

/** Storage seam behind {@link createPrefsStore}. A `localStorage`
 *  implementation and an in-memory one for tests, so nothing in the store or
 *  its callers changes when the eventual `get_settings`/`set_settings`
 *  command replaces the `localStorage` one (R53 Q1). */
export interface PrefsBackend {
  /** Reads the raw persisted document, or `null` if there is none yet.
   *  Never throws — a backend that cannot read reports that as `null`. */
  read(): string | null;
  /** Persists the raw document. May throw; {@link createPrefsStore} is the
   *  only caller and always wraps this call. */
  write(text: string): void;
}

/** A `PrefsBackend` over the WebView's `localStorage`. Every call is wrapped
 *  in try/catch — a WebView can refuse storage (private mode, cleared site
 *  data, a policy) — so a refusal surfaces as "no stored value" on read and
 *  as a thrown error on write, never as an uncaught exception from this
 *  module itself. */
export function localStorageBackend(): PrefsBackend {
  const key = "idl1.settings.prefs.v1";
  return {
    read(): string | null {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(text: string): void {
      // Intentionally not caught here: createPrefsStore.set() is the single
      // place that catches a write failure and turns it into a reported
      // result, so a thrown error is not swallowed twice.
      window.localStorage.setItem(key, text);
    },
  };
}

/** A `PrefsBackend` held in memory, for tests. `seed`, if given, is the raw
 *  text an initial `read()` returns — pass corrupt JSON or `undefined` to
 *  exercise {@link createPrefsStore}'s leniency without touching real
 *  storage. */
export function memoryBackend(seed?: string): PrefsBackend {
  let stored: string | null = seed ?? null;
  return {
    read(): string | null {
      return stored;
    },
    write(text: string): void {
      stored = text;
    },
  };
}

/** The result of {@link PrefsStore.set} — a failed backend write is reported
 *  here, never swallowed, so a caller can tell the user their change did not
 *  reach disk (even though it is still visible in {@link PrefsStore.get}). */
export interface SetResult {
  /** `false` when the backend's `write` threw; the in-memory value still
   *  updated regardless, so the user's typing is never discarded. */
  ok: boolean;
  /** The error the backend's `write` threw, when `ok` is `false`. */
  error?: unknown;
}

/** A subscriber notified with the new {@link Prefs} value after a
 *  successful or failed {@link PrefsStore.set} — in-memory state always
 *  changes, so subscribers always hear about it. */
export type PrefsListener = (prefs: Prefs) => void;

/** The prefs store's public surface: synchronous read/write over an
 *  in-memory cache, backed by a {@link PrefsBackend}. */
export interface PrefsStore {
  /** The current in-memory value. Never throws, even if the backend's last
   *  `read()` returned something unreadable — that case falls back to
   *  {@link DEFAULT_PREFS}. */
  get(): Prefs;
  /** Applies a partial patch over the current value (shallow per top-level
   *  key: a supplied `engine`/`ui` replaces that whole half) and persists it
   *  through the backend. */
  set(patch: Partial<Prefs>): SetResult;
  /** Registers `listener` to be called after every `set()` with the new
   *  value. Returns a function that unsubscribes it. */
  subscribe(listener: PrefsListener): () => void;
}

/** Builds a {@link PrefsStore} over `backend`. Reads the backend once at
 *  construction to seed the in-memory cache; every `get()` after that reads
 *  the cache, never the backend directly, so a backend whose `read()` would
 *  throw is only ever asked once. */
export function createPrefsStore(backend: PrefsBackend): PrefsStore {
  let current: Prefs = readInitial(backend);
  const listeners = new Set<PrefsListener>();

  function readInitial(source: PrefsBackend): Prefs {
    let raw: string | null;
    try {
      raw = source.read();
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
    get(): Prefs {
      return current;
    },
    set(patch: Partial<Prefs>): SetResult {
      const next: Prefs = {
        ...current,
        ...patch,
      };
      current = next;

      let result: SetResult;
      try {
        backend.write(serializePrefs(next));
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
