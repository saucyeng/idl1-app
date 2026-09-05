import type { AnalogChannel, DeviceConfig, DigitalChannel } from "./model";

/** One choice in the "+ Add channel…" picker (SPEC §8 Q5): the two
 *  hardware-pinned wheel slots (toggled, not created), a new draft analog
 *  channel, and a new draft digital marker. `level`/`pwm` digital kinds are
 *  never offered — SPEC §8 reserves them in the schema but Spec 1 firmware
 *  does not ship them in the app's picker. */
export interface AddChannelOption {
  /** `"wheel_front"` / `"wheel_rear"` / `"analog"` / `"marker"` — the
   *  picker's own choice identifier, not a config key. */
  key: string;
  label: string;
  /** Why this choice is greyed out, or `null` when it is available. */
  disabledReason: string | null;
}

/** Generates a key of the form `"${prefix}_N"` that does not collide with
 *  any key in `existingKeys`, starting at `N = 1` and incrementing past
 *  every taken number — never idl0's literal `"__new__"`, which collides
 *  on a second add of the same kind. */
function uniqueKey(prefix: string, existingKeys: ReadonlySet<string>): string {
  let n = 1;
  while (existingKeys.has(`${prefix}_${n}`)) {
    n++;
  }
  return `${prefix}_${n}`;
}

/**
 * Builds a new draft `AnalogChannel` with a unique key and SPEC §8's
 * example-shape defaults (`enabled: true`, `scale: 1`, `offset: 0`).
 * `adc_pin` is `null` (unassigned) — SPEC §8 fixes no pin-numbering scheme,
 * so the app never auto-selects a pin (ruling R58); the user assigns one
 * through `AnalogForm`'s pin input, and `validateConfig` blocks a push
 * until they do.
 */
export function newAnalogChannel(config: DeviceConfig): AnalogChannel {
  const existingKeys = new Set(config.analog.channels.map((c) => c.key));
  return {
    key: uniqueKey("analog", existingKeys),
    label: "",
    adc_pin: null,
    units: "",
    scale: 1,
    offset: 0,
    enabled: true,
  };
}

/**
 * Builds a new draft `DigitalChannel` of kind `"marker"` with a unique key
 * and SPEC §8's example-shape defaults (`active_low: true`,
 * `debounce_ms: 20`, `enabled: true`). `gpio_pin` is `null` (unassigned),
 * same rule and rationale as {@link newAnalogChannel}'s `adc_pin`.
 */
export function newDigitalMarker(config: DeviceConfig): DigitalChannel {
  const existingKeys = new Set(config.digital.channels.map((c) => c.key));
  return {
    key: uniqueKey("marker", existingKeys),
    label: "",
    kind: "marker",
    gpio_pin: null,
    active_low: true,
    debounce_ms: 20,
    enabled: true,
  };
}

/**
 * Lists the "+ Add channel…" picker's four choices against `config`'s
 * current state: both wheel slots (disabled once already enabled — a slot
 * is toggled, not duplicated), a new analog channel, and a new digital
 * marker (both always available, since a config can hold any number of
 * draft channels).
 */
export function addChannelOptions(config: DeviceConfig): AddChannelOption[] {
  return [
    {
      key: "wheel_front",
      label: "Wheel front",
      disabledReason: config.wheel_speed.front.enabled ? "Wheel front is already enabled" : null,
    },
    {
      key: "wheel_rear",
      label: "Wheel rear",
      disabledReason: config.wheel_speed.rear.enabled ? "Wheel rear is already enabled" : null,
    },
    { key: "analog", label: "Analog channel", disabledReason: null },
    { key: "marker", label: "Marker button", disabledReason: null },
  ];
}
