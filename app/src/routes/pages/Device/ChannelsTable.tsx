import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { sheetSideFor } from "../../../components/overlays/sheetSide";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../../components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import type { DeviceConfig } from "./config/model";
import AddChannelPicker from "./forms/AddChannelPicker";
import AnalogForm from "./forms/AnalogForm";
import DigitalForm from "./forms/DigitalForm";
import GpsForm from "./forms/GpsForm";
import HrmForm from "./forms/HrmForm";
import ImuForm from "./forms/ImuForm";
import WheelForm from "./forms/WheelForm";
import type { SourceView } from "./sources";

/** Tracks `sheetSideFor(window.innerWidth)` (UI-3): a phone gets a bottom
 *  sheet, a desktop a right panel, for the per-source form the gear control
 *  opens. One resize listener shared by every `ChannelsTable` instance is
 *  unnecessary at this scale — the tab mounts one table — so this stays a
 *  small local hook rather than a second shared module. */
function useSheetSide(): "bottom" | "right" {
  const [side, setSide] = useState<"bottom" | "right">(() =>
    sheetSideFor(typeof window === "undefined" ? 1024 : window.innerWidth),
  );
  useEffect(() => {
    const onResize = () => setSide(sheetSideFor(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return side;
}

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
  const sheetSide = useSheetSide();

  return (
    <>
      <Table className="device-channels-table">
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Channels</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead aria-label="Configure" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => {
            const isExpanded = expandedKey === source.sourceKey;
            const enabledCount = source.channels.filter((c) => c.enabled).length;
            return (
              <Fragment key={source.sourceKey}>
                <TableRow>
                  <TableCell>
                    <Button
                      type="button"
                      emphasis="normal"
                      className="h-11 justify-start gap-1.5 px-1"
                      onClick={() => setExpandedKey(isExpanded ? null : source.sourceKey)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      {source.label}
                    </Button>
                  </TableCell>
                  <TableCell>{formatRateHz(source.sampleRateHz)}</TableCell>
                  <TableCell>
                    <Badge>
                      {enabledCount}/{source.channels.length}
                    </Badge>
                  </TableCell>
                  <TableCell>{source.enabled ? "On" : "Off"}</TableCell>
                  <TableCell>
                    {(() => {
                      const next = openFormForSourceKey(source.sourceKey, config);
                      return (
                        <Button
                          type="button"
                          size="icon"
                          className="h-11 w-11"
                          aria-label={`Configure ${source.label}`}
                          disabled={next === null}
                          onClick={() => setOpenForm(next)}
                        >
                          <Settings2 className="size-4" />
                        </Button>
                      );
                    })()}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Table className="device-channels-table__detail">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Units</TableHead>
                            <TableHead>Enabled</TableHead>
                            <TableHead>Scale</TableHead>
                            <TableHead>Offset</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {source.channels.map((channel) => (
                            <TableRow key={channel.name}>
                              <TableCell>{channel.name}</TableCell>
                              <TableCell>{channel.units}</TableCell>
                              <TableCell>{channel.enabled ? "On" : "Off"}</TableCell>
                              <TableCell>{formatConfigValue(channel.scale)}</TableCell>
                              <TableCell>{formatConfigValue(channel.offset)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <Button type="button" className="h-11" onClick={() => setOpenForm({ kind: "addChannel" })}>
        + Add channel…
      </Button>
      <Sheet open={openForm !== null} onOpenChange={(open) => !open && setOpenForm(null)}>
        <SheetContent side={sheetSide === "bottom" ? "bottom" : "right"} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{openForm !== null ? formTitle(openForm) : ""}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <OpenForm openForm={openForm} config={config} onConfigChange={onConfigChange} onClose={() => setOpenForm(null)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The per-source Sheet's title (UI-3's `sheetSideFor`: a bottom sheet on
 *  narrow, a right panel on wide — Open question 3's recommendation) — the
 *  `forms/*` components render `<h3>` headings of their own already, so
 *  this is a short label rather than a duplicate of that copy. */
function formTitle(openForm: NonNullable<OpenFormState>): string {
  switch (openForm.kind) {
    case "imu":
      return "IMU settings";
    case "gps":
      return "GPS settings";
    case "wheel":
      return "Wheel speed settings";
    case "hrm":
      return "Heart rate monitor";
    case "analog":
      return "Analog channel";
    case "digital":
      return "Digital channel";
    case "addChannel":
      return "Add channel";
    default: {
      const exhaustive: never = openForm;
      throw new Error(`unhandled OpenFormState: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Renders the currently-open form (or the add-channel picker), if any,
 *  inside the per-source `Sheet` — the IMU/wheel forms cover three/two
 *  rows' worth of source keys at once, so a per-row popover would have no
 *  single anchor row. `forms/*` themselves are unchanged (lane brief: they
 *  move inside the sheet as-is; editors stay pointer-first, decision 15). */
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
