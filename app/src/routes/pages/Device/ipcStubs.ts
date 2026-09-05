/**
 * Placeholder for a Device-tab command C3 does not have yet
 * (`runs/2026-09-05/lanes/l7/IPC-NEEDS.md` needs 8–11, 13). Every stub in
 * this file rejects with this, never with an `IpcError`-shaped value — C3
 * §2's kind vocabulary is additive-only, and a `not_implemented` kind would
 * put a placeholder in a signed contract. Replacing a stub with the real
 * wrapper, once the Rust track lands the command, is an import-path change
 * in the caller, not a change to this file's shape.
 */
export class NotImplementedError extends Error {
  /** The C3 §3.8/§3.10 command name this stub stands in for. */
  command: string;

  constructor(command: string) {
    super(`${command} is not implemented yet`);
    this.command = command;
  }
}

/** Stands in for `device_status` (IPC need 8) until the Rust track lands it. */
export async function deviceStatus(_deviceId: string): Promise<never> {
  throw new NotImplementedError("device_status");
}

/** Stands in for `device_control` (IPC need 9) until the Rust track lands it. */
export async function deviceControl(_deviceId: string, _command: string): Promise<never> {
  throw new NotImplementedError("device_control");
}

/** Stands in for `pull_config` (IPC need 10) until the Rust track lands it. */
export async function pullConfig(_deviceId: string): Promise<never> {
  throw new NotImplementedError("pull_config");
}

/** Stands in for `list_profiles` (IPC need 11) until the Rust track lands it. */
export async function listProfiles(): Promise<never> {
  throw new NotImplementedError("list_profiles");
}

/** Stands in for `save_profile` (IPC need 11) until the Rust track lands it. */
export async function saveProfile(_profile: Record<string, unknown>): Promise<never> {
  throw new NotImplementedError("save_profile");
}

/** Stands in for `delete_profile` (IPC need 11) until the Rust track lands it. */
export async function deleteProfile(_profileId: string): Promise<never> {
  throw new NotImplementedError("delete_profile");
}

/** Stands in for `connect_device` (IPC need 13, a managed link) until the
 *  Rust track lands it. Not used by this task — `ble_connect` is the real,
 *  landed command Task 1 calls (R53 Device Q4). */
export async function connectDevice(_deviceId: string): Promise<never> {
  throw new NotImplementedError("connect_device");
}

/** Stands in for `disconnect_device` (IPC need 13) until the Rust track
 *  lands it. See `connectDevice`'s note. */
export async function disconnectDevice(_deviceId: string): Promise<never> {
  throw new NotImplementedError("disconnect_device");
}
