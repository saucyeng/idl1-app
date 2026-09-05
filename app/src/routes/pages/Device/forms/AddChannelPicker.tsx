import { setWheelSlot, upsertAnalogChannel, upsertDigitalChannel } from "../config/edit";
import type { DeviceConfig } from "../config/model";
import { addChannelOptions, newAnalogChannel, newDigitalMarker } from "../config/newChannel";

/** Props for {@link AddChannelPicker}. */
export interface AddChannelPickerProps {
  /** The config the new channel/enabled slot is added to. */
  config: DeviceConfig;
  /** Called with the whole next `DeviceConfig` after a choice commits. */
  onConfigChange: (next: DeviceConfig) => void;
  /** Closes the picker. */
  onClose: () => void;
}

/**
 * The "+ Add channel…" picker (SPEC §8 Q5): `newChannel.ts`'s
 * `addChannelOptions` lists the four choices — Wheel front, Wheel rear
 * (toggled on, never duplicated as a new entry), Analog channel and Marker
 * button (each creates a new draft entry with an unassigned pin, ruling
 * R58) — and this component commits whichever one the user picks, then
 * closes itself. The new row then appears in `ChannelsTable` like any
 * other source; the user opens its own gear control to fill in the pin,
 * label and other fields `AnalogForm`/`DigitalForm` edit.
 */
export default function AddChannelPicker({ config, onConfigChange, onClose }: AddChannelPickerProps) {
  const options = addChannelOptions(config);

  function onChoose(key: string): void {
    if (key === "wheel_front" || key === "wheel_rear") {
      const side = key === "wheel_front" ? "front" : "rear";
      onConfigChange(setWheelSlot(config, side, { enabled: true }));
    } else if (key === "analog") {
      onConfigChange(upsertAnalogChannel(config, newAnalogChannel(config)));
    } else if (key === "marker") {
      onConfigChange(upsertDigitalChannel(config, newDigitalMarker(config)));
    }
    onClose();
  }

  return (
    <div className="device-form device-form--add-channel" role="dialog" aria-label="Add channel">
      <h3>Add channel</h3>
      <ul>
        {options.map((option) => (
          <li key={option.key}>
            <button type="button" disabled={option.disabledReason !== null} onClick={() => onChoose(option.key)}>
              {option.label}
            </button>
            {option.disabledReason !== null && <span> ({option.disabledReason})</span>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
