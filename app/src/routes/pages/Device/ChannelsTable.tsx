import { Fragment, useState } from "react";

import type { DeviceConfig } from "./config/model";
import AddChannelPicker from "./forms/AddChannelPicker";
import AnalogForm from "./forms/AnalogForm";
import DigitalForm from "./forms/DigitalForm";
import GpsForm from "./forms/GpsForm";
import HrmForm from "./forms/HrmForm";
import ImuForm from "./forms/ImuForm";
import WheelForm from "./forms/WheelForm";
import type { SourceView } from "./sources";

/** Props for {@link ChannelsTable}. */
export interface ChannelsTableProps {
  /** One row per configurable source, in `listSources`'s stable order. */
  sources: SourceView[];
  /** The config `sources` was built from — passed through to whichever
   *  source form the gear control opens, since a form edits the whole
   *  `DeviceConfig`, not just one row's `SourceView`. */
  config: DeviceConfig;
  /** Called with the whole next `DeviceConfig` after a form commits an
   *  edit through `Device/config/edit.ts`. */
  onConfigChange: (next: DeviceConfig) => void;
}

/** Which form (or the "+ Add channel…" picker) is currently open below the
 *  table. `analog`/`digital` carry the specific `channelKey` they edit,
 *  since either kind can have any number of entries sharing one form
 *  component; every other kind has at most one instance in a config. */
type OpenFormState =
  | { kind: "imu" }
  | { kind: "gps" }
  | { kind: "wheel" }
  | { kind: "hrm" }
  | { kind: "analog"; channelKey: string }
  | { kind: "digital"; channelKey: string }
  | { kind: "addChannel" }
  | null;

/** Maps a `SourceView.sourceKey` to the form its gear control opens. The
 *  three IMU slots and both wheel slots share one form each (the IMU
 *  block's shared bus rate and the wheel form's two slots are edited
 *  together), so every key in a group opens the same form. An analog or
 *  digital entry's `sourceKey` is that entry's own config `key` (`sources.ts`),
 *  so it is looked up in `config` rather than matched against a fixed
 *  string. `null` only for a `sourceKey` that matches nothing in `config` —
 *  should not happen once `listSources` and this function agree, but never
 *  crashes if they briefly don't. */
function openFormForSourceKey(sourceKey: string, config: DeviceConfig): OpenFormState {
  if (sourceKey === "imu0" || sourceKey === "imu1" || sourceKey === "imu2") return { kind: "imu" };
  if (sourceKey === "gps") return { kind: "gps" };
  if (sourceKey === "wheel_front" || sourceKey === "wheel_rear") return { kind: "wheel" };
  if (sourceKey === "heart_rate_monitor") return { kind: "hrm" };
  if (config.analog.channels.some((c) => c.key === sourceKey)) return { kind: "analog", channelKey: sourceKey };
  if (config.digital.channels.some((c) => c.key === sourceKey)) return { kind: "digital", channelKey: sourceKey };
  return null;
}

/** Formats a nullable Hz rate for display: `"—"` for an event-driven
 *  source rather than a fabricated `0`. */
function formatRateHz(sampleRateHz: number | null): string {
  return sampleRateHz === null ? "—" : `${sampleRateHz} Hz`;
}

/** Formats an optional scale/offset value for display: `"—"` when the
 *  source's channel kind carries none (SPEC §23.3; R53 Device Q1 — never a
 *  registry-derived fallback). */
function formatConfigValue(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

/**
 * The Device tab's channels table (SPEC §23.3): one expandable row per
 * `SourceView`, showing its enable state, rate and channel count; expanding
 * a row lists its channels with name, units, enable state, and — only for
 * an analog entry — its own config-typed scale/offset. The gear control
 * opens that source's form (SPEC §23.3.1–.6): IMU, GPS, Wheel, Analog,
 * Digital and HRM are all wired. A "+ Add channel…" button below the table
 * opens `AddChannelPicker` (SPEC §8 Q5).
 */
export default function ChannelsTable({ sources, config, onConfigChange }: ChannelsTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<OpenFormState>(null);

  return (
    <>
      <table className="device-channels-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Rate</th>
            <th>Channels</th>
            <th>Enabled</th>
            <th aria-label="Configure" />
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const isExpanded = expandedKey === source.sourceKey;
            const enabledCount = source.channels.filter((c) => c.enabled).length;
            return (
              <Fragment key={source.sourceKey}>
                <tr>
                  <td>
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : source.sourceKey)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "▾" : "▸"} {source.label}
                    </button>
                  </td>
                  <td>{formatRateHz(source.sampleRateHz)}</td>
                  <td>
                    {enabledCount}/{source.channels.length}
                  </td>
                  <td>{source.enabled ? "On" : "Off"}</td>
                  <td>
                    {(() => {
                      const next = openFormForSourceKey(source.sourceKey, config);
                      return (
                        <button
                          type="button"
                          aria-label={`Configure ${source.label}`}
                          disabled={next === null}
                          onClick={() => setOpenForm(next)}
                        >
                          ⚙
                        </button>
                      );
                    })()}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={5}>
                      <table className="device-channels-table__detail">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Units</th>
                            <th>Enabled</th>
                            <th>Scale</th>
                            <th>Offset</th>
                          </tr>
                        </thead>
                        <tbody>
                          {source.channels.map((channel) => (
                            <tr key={channel.name}>
                              <td>{channel.name}</td>
                              <td>{channel.units}</td>
                              <td>{channel.enabled ? "On" : "Off"}</td>
                              <td>{formatConfigValue(channel.scale)}</td>
                              <td>{formatConfigValue(channel.offset)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    <button type="button" onClick={() => setOpenForm({ kind: "addChannel" })}>
      + Add channel…
    </button>
    <OpenForm openForm={openForm} config={config} onConfigChange={onConfigChange} onClose={() => setOpenForm(null)} />
    </>
  );
}

/** Renders the currently-open form (or the add-channel picker), if any,
 *  below the table itself rather than nested in a row — the IMU/wheel forms
 *  cover three/two rows' worth of source keys at once, so a per-row popover
 *  would have no single anchor row. */
function OpenForm({ openForm, config, onConfigChange, onClose }: {
  openForm: OpenFormState;
  config: DeviceConfig;
  onConfigChange: (next: DeviceConfig) => void;
  onClose: () => void;
}) {
  if (openForm === null) return null;
  if (openForm.kind === "imu") return <ImuForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm.kind === "gps") return <GpsForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm.kind === "wheel") return <WheelForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm.kind === "hrm") return <HrmForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm.kind === "analog") return <AnalogForm config={config} channelKey={openForm.channelKey} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm.kind === "digital") return <DigitalForm config={config} channelKey={openForm.channelKey} onConfigChange={onConfigChange} onClose={onClose} />;
  return <AddChannelPicker config={config} onConfigChange={onConfigChange} onClose={onClose} />;
}
