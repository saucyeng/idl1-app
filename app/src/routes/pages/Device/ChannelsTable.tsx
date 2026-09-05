import { Fragment, useState } from "react";

import type { DeviceConfig } from "./config/model";
import GpsForm from "./forms/GpsForm";
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

/** The form kind a source's gear control opens, or `null` for a source
 *  kind Task 7 still owns (analog, digital, HRM) — those gear controls
 *  stay disabled until Task 7 wires `AnalogForm`/`DigitalForm`/`HrmForm`. */
type FormKind = "imu" | "gps" | "wheel" | null;

/** Maps a `SourceView.sourceKey` to the form kind its gear control opens.
 *  The three IMU slots and both wheel slots share one form each (the IMU
 *  block's shared bus rate and the wheel form's two slots are edited
 *  together), so every key in a group opens the same form kind. */
function formKindForSourceKey(sourceKey: string): FormKind {
  if (sourceKey === "imu0" || sourceKey === "imu1" || sourceKey === "imu2") return "imu";
  if (sourceKey === "gps") return "gps";
  if (sourceKey === "wheel_front" || sourceKey === "wheel_rear") return "wheel";
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
 * opens that source's form (SPEC §23.3.1–.3): IMU, GPS and Wheel (Task 6)
 * are wired; Analog, Digital and HRM stay disabled pending Task 7's forms.
 */
export default function ChannelsTable({ sources, config, onConfigChange }: ChannelsTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<FormKind>(null);

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
                      const kind = formKindForSourceKey(source.sourceKey);
                      return (
                        <button
                          type="button"
                          aria-label={`Configure ${source.label}`}
                          disabled={kind === null}
                          onClick={() => setOpenForm(kind)}
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
    <OpenForm openForm={openForm} config={config} onConfigChange={onConfigChange} onClose={() => setOpenForm(null)} />
    </>
  );
}

/** Renders the currently-open source form, if any, below the table itself
 *  rather than nested in a row — the IMU/wheel forms cover three/two rows'
 *  worth of source keys at once, so a per-row popover would have no single
 *  anchor row. */
function OpenForm({ openForm, config, onConfigChange, onClose }: {
  openForm: FormKind;
  config: DeviceConfig;
  onConfigChange: (next: DeviceConfig) => void;
  onClose: () => void;
}) {
  if (openForm === "imu") return <ImuForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm === "gps") return <GpsForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  if (openForm === "wheel") return <WheelForm config={config} onConfigChange={onConfigChange} onClose={onClose} />;
  return null;
}
