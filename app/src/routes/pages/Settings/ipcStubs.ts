/** Raised by every stub in this file in place of a real IPC rejection.
 *
 * C3 §2's `IpcError` vocabulary is additive-only and signed; a placeholder
 * kind does not belong in it. Each stub instead throws this local error,
 * naming the real Tauri command it stands in for, so callers (and this
 * lane's own tests) can tell "not built yet" apart from a genuine
 * `IpcError` without the contract ever seeing a fake kind. Replacing a stub
 * with a real `app/src/ipc/*` wrapper is an import-path change only —
 * nothing about the caller's error handling needs to change first, since a
 * real rejection is always an `IpcError`, never a `NotImplementedError`. */
export class NotImplementedError extends Error {
  /** The Tauri command name this stub stands in for, e.g. `"get_settings"`. */
  command: string;

  constructor(command: string) {
    super(`${command} is not implemented yet`);
    this.name = "NotImplementedError";
    this.command = command;
  }
}

/** Exactly `idl_rs::store::settings::AppSettings` (C4 §1) — no translation
 *  layer, so the day `get_settings`/`set_settings` land the engine half of
 *  this shape maps one-to-one. */
export interface AppSettings {
  /** The `<data>` root override, or `null` when the platform default is in
   *  use (C4 §1). */
  data_dir: string | null;
  /** The rider's display name. `""` means not set (C4 §1) — there is no
   *  `null` for this field. */
  rider_name: string;
  /** Unit system used across the app. Engine default is `"imperial"`. */
  unit_system: "imperial" | "metric";
}

/** Stub for IPC need 6's `get_settings` (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`).
 *  Always rejects with {@link NotImplementedError} until the write-amendment
 *  Rust lane lands the real command; Task 2 persists to `localStorage`
 *  behind a `PrefsBackend` in the meantime.
 *
 * @returns Never resolves — always rejects. */
export async function getSettings(): Promise<AppSettings> {
  throw new NotImplementedError("get_settings");
}

/** Stub for IPC need 6's `set_settings`. See {@link getSettings}.
 *
 * @param settings - The settings to persist. Ignored — the stub always
 *  rejects before touching it.
 * @returns Never resolves — always rejects. */
export async function setSettings(settings: AppSettings): Promise<AppSettings> {
  void settings;
  throw new NotImplementedError("set_settings");
}

/** Exactly IPC need 7's `DataDirInfo` (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`). */
export interface DataDirInfo {
  /** The `<data>` root actually in use for this process (C4 §1). */
  resolved_path: string;
  /** The override from `settings.json`, or `null` when the platform
   *  default is in use. */
  override_path: string | null;
  /** `true` when `resolved_path` differs from what `override_path` would
   *  give — i.e. the override changed and the app has not restarted. */
  restart_required: boolean;
}

/** Stub for IPC need 7a's `get_data_dir`. See {@link getSettings}.
 *
 * @returns Never resolves — always rejects. */
export async function getDataDir(): Promise<DataDirInfo> {
  throw new NotImplementedError("get_data_dir");
}

/** Stub for IPC need 7b's `set_data_dir`. See {@link getSettings}.
 *
 * @param path - The new override path, or `null` to clear it. Ignored —
 *  the stub always rejects before touching it.
 * @returns Never resolves — always rejects. */
export async function setDataDir(path: string | null): Promise<DataDirInfo> {
  void path;
  throw new NotImplementedError("set_data_dir");
}
