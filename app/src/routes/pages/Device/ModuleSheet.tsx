import type { ReactNode } from "react";

import { BrandSheet } from "../../../components/brand/BrandSheet";
import { NoteBlock } from "../../../components/brand/NoteBlock";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { cn } from "../../../lib/utils";
import type { DeviceControlCommand, DeviceStatus } from "../../../ipc/device";
import { imuPartial, setGps, setImuEnabled, setImuHg, setImuHgShared, setImuRate, setImuSlot } from "./config/edit";
import type { ImuSlotKey } from "./config/edit";
import type { DeviceConfig } from "./config/model";
import { ACCEL_RANGES_G, GPS_DYNAMIC_MODELS, GYRO_RANGES_DPS, HG_ODR_HZ, HG_RANGES_G, IMU_ODR_HZ } from "./config/validate";
import AddChannelPicker from "./forms/AddChannelPicker";
import AnalogForm from "./forms/AnalogForm";
import DigitalForm from "./forms/DigitalForm";
import HrmForm from "./forms/HrmForm";
import WheelForm from "./forms/WheelForm";
import type { ModuleTile } from "./moduleTiles";

/** GPS rates offered as buttons, Hz. SPEC §8 allows any integer 1–10; these
 *  are the useful ones, and a config holding another value still shows it. */
const GPS_RATES_HZ = [1, 2, 5, 10] as const;

/** Props for {@link ModuleSheet}. */
export interface ModuleSheetProps {
  /** The tile whose sheet is open, or null when closed. */
  tile: ModuleTile | null;
  onClose: () => void;
  status: DeviceStatus | null;
  /** The settings draft (the logger's config plus unsent edits), or null
   *  when the logger's config could not be read. */
  draft: DeviceConfig | null;
  onDraftChange: (next: DeviceConfig) => void;
  /** Re-reads the logger's config after a failed read. */
  onRetryRead: () => void;
  /** Connected logger's name, id and firmware, for the Bluetooth sheet. */
  logger: { name: string; deviceId: string; firmware: string | null };
  /** Sends a `device_control` command (WiFi on/off). */
  onControl: (command: DeviceControlCommand) => void;
  /** True while a control command is in flight. */
  busy: boolean;
  onOpenFiles: () => void;
  onDisconnect: () => void;
}

/** A labelled group of big buttons, one selected. Wraps to the sheet's width. */
function Choice<T extends string | number>({
  label,
  options,
  value,
  format,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  // A value read from the logger that isn't one of the offered buttons is
  // still shown, selected, rather than silently dropped.
  const shown = options.includes(value) ? options : [...options, value];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">{label}</span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5" role="radiogroup" aria-label={label}>
        {shown.map((option) => (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={option === value}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              "h-11 rounded-[var(--radius-structural)] border px-2 font-mono text-sm disabled:opacity-50",
              option === value ? "border-hivis bg-surface-2 text-fg" : "border-rule bg-surface text-fg-dim",
            )}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A full-width row with a label, optional detail and a switch. */
function SwitchRow({ label, detail, checked, onChange, disabled }: { label: string; detail?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-card)] border border-rule bg-surface px-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-base font-medium text-fg">{label}</span>
        {detail && <span className="text-xs text-fg-dim">{detail}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="data-[size=default]:h-7 data-[size=default]:w-12 [&_[data-slot=switch-thumb]]:size-6" />
    </label>
  );
}

/** Label/value rows for live readings. */
function Readings({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-sm text-fg-dim">{k}</dt>
          <dd className="text-right font-mono text-sm text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shown in place of settings when the logger's config couldn't be read. */
function NoConfig({ onRetryRead }: { onRetryRead: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <NoteBlock className="border-hivis text-hivis">Couldn&apos;t read this logger&apos;s settings, so they can&apos;t be changed yet.</NoteBlock>
      <Button type="button" className="h-11" onClick={onRetryRead}>
        Read settings again
      </Button>
    </div>
  );
}

/** Note under every settings sheet: edits wait for Send. */
function DraftNote() {
  return <p className="text-xs text-fg-dim">Changes wait on the Logger screen until you tap Send to logger, which restarts the logger.</p>;
}

function ImuBody({ slotKey, tile, draft, onDraftChange, status }: { slotKey: ImuSlotKey; tile: ModuleTile; draft: DeviceConfig; onDraftChange: (c: DeviceConfig) => void; status: DeviceStatus | null }) {
  const slot = draft.imu[slotKey];
  const live = status?.[slotKey] ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Readings rows={[["Status", live ?? "unknown"]]} />
      <SwitchRow
        label={`Record ${tile.label.toLowerCase()} IMU`}
        detail="All six channels: 3-axis accel and gyro"
        checked={slot.enabled}
        onChange={(on) => onDraftChange(setImuEnabled(draft, slotKey, on))}
      />
      {imuPartial(slot) && (
        <NoteBlock className="border-hivis text-hivis">
          Only some channels are on in the logger&apos;s settings.{" "}
          <button type="button" className="underline" onClick={() => onDraftChange(setImuEnabled(draft, slotKey, true))}>
            Record all six
          </button>
        </NoteBlock>
      )}
      <Choice label="Accel range" options={ACCEL_RANGES_G} value={slot.accel_range_g} format={(g) => `±${g} g`} disabled={!slot.enabled} onChange={(g) => onDraftChange(setImuSlot(draft, slotKey, { accel_range_g: g }))} />
      <Choice label="Gyro range" options={GYRO_RANGES_DPS} value={slot.gyro_range_dps} format={(d) => `${d}°/s`} disabled={!slot.enabled} onChange={(d) => onDraftChange(setImuSlot(draft, slotKey, { gyro_range_dps: d }))} />
      <Choice label="Sample rate — shared by all IMUs" options={IMU_ODR_HZ} value={draft.imu.sample_rate_hz} format={(hz) => `${hz} Hz`} onChange={(hz) => onDraftChange(setImuRate(draft, hz))} />
      {slotKey !== "imu0" && (
        <>
          <SwitchRow
            label="Record high-g accel"
            detail="3 more channels, ±32–320 g, for big impacts"
            checked={slot.hg_enabled === true}
            disabled={!slot.enabled}
            onChange={(on) => onDraftChange(setImuHg(draft, slotKey, on))}
          />
          <Choice label="High-g range — shared by both pods" options={HG_RANGES_G} value={draft.imu.hg_range_g} format={(g) => `±${g} g`} disabled={!slot.enabled || slot.hg_enabled !== true} onChange={(g) => onDraftChange(setImuHgShared(draft, { hg_range_g: g }))} />
          <Choice label="High-g rate — shared by both pods" options={HG_ODR_HZ} value={draft.imu.hg_sample_rate_hz} format={(hz) => `${hz} Hz`} disabled={!slot.enabled || slot.hg_enabled !== true} onChange={(hz) => onDraftChange(setImuHgShared(draft, { hg_sample_rate_hz: hz }))} />
        </>
      )}
      <DraftNote />
    </div>
  );
}

function GpsBody({ draft, onDraftChange, status }: { draft: DeviceConfig; onDraftChange: (c: DeviceConfig) => void; status: DeviceStatus | null }) {
  const hdop = status?.gps_hdop_x100 ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Readings
        rows={[
          ["Fix", status?.gps ?? "unknown"],
          ["Satellites", status?.gps_sats === null || status?.gps_sats === undefined ? "—" : String(status.gps_sats)],
          ["HDOP", hdop === null ? "—" : (hdop / 100).toFixed(2)],
        ]}
      />
      <Choice label="Rate" options={GPS_RATES_HZ as readonly number[]} value={draft.gps.sample_rate_hz} format={(hz) => `${hz} Hz`} onChange={(hz) => onDraftChange(setGps(draft, { sample_rate_hz: hz }))} />
      <Choice label="Dynamic model" options={GPS_DYNAMIC_MODELS} value={draft.gps.dynamic_model} format={(m) => m} onChange={(m) => onDraftChange(setGps(draft, { dynamic_model: m }))} />
      <SwitchRow label="SBAS corrections" detail="Satellite-based augmentation, where available" checked={draft.gps.sbas_enabled} onChange={(on) => onDraftChange(setGps(draft, { sbas_enabled: on }))} />
      <DraftNote />
    </div>
  );
}

/**
 * The sheet a Logger dashboard module tile opens (2026-10-14): live readings
 * at the top, then that module's settings as big buttons and switches. The
 * settings edit the dashboard's draft; nothing is sent until **Send to
 * logger**. IMU sheets offer one on/off switch that records all six
 * channels (Isaac, 2026-10-14: "all 6 channels or nothing"). Heart rate,
 * analog, digital, wheel and Add still use the older forms inside the sheet.
 */
export default function ModuleSheet(props: ModuleSheetProps) {
  const { tile, onClose, status, draft, onDraftChange, onRetryRead } = props;
  const forms = (body: (d: DeviceConfig) => ReactNode) => (draft === null ? <NoConfig onRetryRead={onRetryRead} /> : body(draft));

  function body(t: ModuleTile): ReactNode {
    const [kind, sub] = t.key.split(":");
    switch (kind) {
      case "battery":
        return <Readings rows={[["Charge", status?.battery_pct === null || status?.battery_pct === undefined ? "unknown" : `${status.battery_pct}%`]]} />;
      case "sd":
        return (
          <div className="flex flex-col gap-4">
            <Readings
              rows={[
                ["Card", status?.sd ?? "unknown"],
                ["Free", status?.sd_free_mib === null || status?.sd_free_mib === undefined ? "—" : `${(status.sd_free_mib / 1024).toFixed(1)} GiB`],
              ]}
            />
            <Button type="button" className="h-12" onClick={props.onOpenFiles}>
              Sessions on logger
            </Button>
          </div>
        );
      case "bluetooth":
        return (
          <div className="flex flex-col gap-4">
            <Readings
              rows={[
                ["Logger", props.logger.name || props.logger.deviceId],
                ["Address", props.logger.deviceId],
                ["Firmware", props.logger.firmware ?? "unknown"],
              ]}
            />
            <Button type="button" className="h-12" onClick={props.onDisconnect}>
              Disconnect
            </Button>
          </div>
        );
      case "wifi": {
        const on = status?.wifi_on === true;
        return (
          <div className="flex flex-col gap-4">
            <SwitchRow
              label="Logger WiFi"
              detail="Downloads turn it on and off by themselves; Record turns it off."
              checked={on}
              disabled={props.busy || status?.logging === true}
              onChange={(v) => props.onControl(v ? "wifi_on" : "wifi_off")}
            />
          </div>
        );
      }
      case "gps":
        return forms((d) => <GpsBody draft={d} onDraftChange={onDraftChange} status={status} />);
      case "imu0":
      case "imu1":
      case "imu2":
        return forms((d) => <ImuBody slotKey={kind} tile={t} draft={d} onDraftChange={onDraftChange} status={status} />);
      case "hr":
        return forms((d) => <HrmForm config={d} onConfigChange={onDraftChange} onClose={onClose} />);
      case "analog":
        return forms((d) => <AnalogForm config={d} channelKey={sub} onConfigChange={onDraftChange} onClose={onClose} />);
      case "digital":
        return forms((d) => <DigitalForm config={d} channelKey={sub} onConfigChange={onDraftChange} onClose={onClose} />);
      case "wheel":
        return forms((d) => <WheelForm config={d} onConfigChange={onDraftChange} onClose={onClose} />);
      case "add":
        return forms((d) => <AddChannelPicker config={d} onConfigChange={onDraftChange} onClose={onClose} />);
      default:
        return null;
    }
  }

  return (
    <BrandSheet open={tile !== null} onOpenChange={(open) => !open && onClose()} title={tile?.label ?? ""} className="max-h-[85dvh]">
      {tile !== null && body(tile)}
    </BrandSheet>
  );
}
