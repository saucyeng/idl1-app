import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ColourField } from "@/components/ui/colour-field";
import { Field, FieldGroup } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { SelectField, SwitchField, TextField, type SelectFieldOption } from "@/components/ui/select-field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NoteBlock } from "@/components/brand/NoteBlock";
import {
  FFT_AVERAGINGS,
  FFT_DETRENDS,
  FFT_WINDOW_FUNCTIONS,
  generate,
  HISTOGRAM_NORMALISATIONS,
  MARK_NAMES,
  SPECTRUM_MARK_NAMES,
  CHART_KINDS,
  type FftParams,
  type FftPlotProps,
  type HistogramParams,
  type HistogramPlotProps,
  type MarkProps,
  type PlotProps,
  type ScatterParams,
  type ScatterPlotProps,
  type YAxisProps,
  type SpectrumMarkProps,
  type TimePlotProps,
} from "../plotForm";
import { MAX_HISTOGRAM_BINS } from "@/ipc/histogram";
import { MAX_SCATTER_POINTS } from "@/ipc/scatter";
import {
  addMark,
  advanceFormState,
  fftScalingSelectOptions,
  INITIAL_FORM_STATE,
  moveMark,
  overlapPercent,
  removeMark,
  resetToFormCode,
  setChartType,
  setColorLegend,
  setTimeXField,
  setZeroLine,
  suggestAxisLabel,
  suggestSpectrumAxisLabel,
  updateFftParams,
  updateFftXAxisType,
  updateHistogramParams,
  updateMark,
  updateScatterParams,
  timeXFieldOf,
  yScaleChoiceOf,
  yScaleSelectOptions,
  updateXAxis,
  updateYAxis,
  type PropertiesFormState,
} from "../model/propertiesForm";
import { TIME_CHART_X_AXIS_OPTIONS } from "../model/xMode";
import type { PropertiesFormChannelOption, PropertiesFormLapOption, PropertiesFormProps } from "./PropertiesForm.types";

/** The `windowSize`/`hopSize` sample counts the Properties panel's select
 *  offers directly (C2 §5.3's twelfth-listed control 5), each comfortably
 *  below `model/fftRequest.ts`'s `MAX_FFT_BINS`. A stored value outside this
 *  list (a hand-edit, or an older workbook) still displays correctly through
 *  the accompanying free numeric entry -- opening the pane never silently
 *  changes it. */
const FFT_WINDOW_SIZE_OPTIONS: readonly number[] = [1024, 2048, 4096, 8192, 16384];

/** The select value standing for "Whole record" -- a real option, not an
 *  unset state, so it does not use `SELECT_FIELD_UNSET`. */
const WHOLE_RECORD = "all";

/** The select value standing for "a stored window size this list does not
 *  offer" -- shown, never silently rounded to a neighbour. */
const CUSTOM_WINDOW_SIZE = "custom";

/** `values` as select options with a display label applied. */
function options<T extends string | number>(values: readonly T[], label: (value: T) => string): SelectFieldOption[] {
  return values.map((value) => ({ value: String(value), label: label(value) }));
}

/**
 * The Properties pane (design §6, D13): a form over `plotForm`'s `PlotProps`
 * that generates idiomatic Plot code and reflects the subset it can parse
 * back out of `code`. Every control writes through the same path — build
 * the next `PlotProps`, `generate` it, hand the string to `onChange` — this
 * component never mutates `code` directly and never calls `parse`/`generate`
 * itself outside that one path (both live in `../model/propertiesForm.ts`,
 * this component's whole logic surface besides DOM wiring).
 *
 * **Ruling R212 item 5** replaced this pane's hand-written
 * `<label>Text <input/></label>` pairs with the shared primitives under
 * `components/ui/` — `Field`/`FieldGroup`, `NumberField` (unit suffix and
 * drag-to-scrub), `SelectField`, `TextField`, `SwitchField` and
 * `ColourField` — all at `tokens.css`'s `--nb-*` density scale. **What the
 * form edits did not change**: every control commits the same `PlotProps`
 * patch through the same `model/propertiesForm.ts` function it always did,
 * and that module's tests are untouched.
 *
 * When `code` falls outside the subset `plotForm.parse` recognises, the
 * pane greys its controls, shows "custom code", and offers "Reset to form",
 * which — after a visible confirm step warning that the custom code will be
 * discarded — regenerates from the last props a successful parse produced
 * for this cell, or the form's default single-mark seed if parse has never
 * once succeeded here (design §6; this task's brief).
 *
 * **Chart type** (L6 Task 20, C2 §5.3) is the pane's first control for
 * both chart types: a segmented `Time`/`FFT` switch that regenerates from
 * the target type's defaults while preserving the first mark's channel
 * selection (R79 Q6, R80 Q6) — no confirmation, unlike "Reset to form",
 * since switching back undoes it in one click.
 *
 * Axis-label suggestion (ruling R65): picking the **first** mark's channel
 * seeds `y.label` with `suggestAxisLabel` (`"<label> (<unit>)"` from
 * `channels[].unit`, C1 §4.1) whenever `y.label` is not already set — a
 * one-time seed into an ordinary editable field, never a locked or
 * recomputed display (C2 §1: "no v3 construct converts units"). Only the
 * first mark drives this, not every mark's channel, since `PlotProps` has
 * one `y.label` for the whole plot regardless of mark count — a documented
 * simplification, not every mark getting its own suggestion. There is no
 * quantity→unit table in TypeScript (R65), so `unitsPreference` has no
 * effect here; see `PropertiesFormProps.unitsPreference`'s own doc comment.
 * An FFT cell's y-label seeds the same way, per scaling (R79 Q5,
 * `suggestSpectrumAxisLabel`), on the channel pick and on a scaling change.
 *
 * No prop beyond `PropertiesFormProps`' five fields is read: no context, no
 * IPC, no DOM global beyond the JSX this component itself renders.
 */
export default function PropertiesForm({ code, channels, laps, onChange }: PropertiesFormProps) {
  const [prevCode, setPrevCode] = useState(code);
  const [state, setState] = useState<PropertiesFormState>(() => advanceFormState(INITIAL_FORM_STATE, code));
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Re-derive form state whenever the `code` prop changes from outside
  // (e.g. a hand edit in the Code pane) — adjusting state during render
  // rather than in an effect, so there is no extra render's lag between a
  // `code` change and the pane reflecting it.
  if (code !== prevCode) {
    setPrevCode(code);
    setState((prev) => advanceFormState(prev, code));
  }

  const { view, lastKnownProps } = state;

  function commit(nextProps: PlotProps): void {
    onChange(generate(nextProps));
  }

  function handleResetConfirmed(): void {
    setConfirmingReset(false);
    onChange(resetToFormCode(lastKnownProps, channels));
  }

  if (view.isCustom || view.props === null) {
    return (
      <div className="properties-form idl-dense properties-form-custom flex flex-col gap-[var(--nb-gap)] p-[var(--nb-gap)]" aria-disabled="true">
        <NoteBlock>
          <p className="properties-form-custom-label font-mono text-[length:var(--nb-text-body)] text-fg">Custom code</p>
          <p className="properties-form-custom-hint font-mono text-[length:var(--nb-text-label)] text-fg-dim">
            This cell&rsquo;s code is outside the form&rsquo;s supported subset, so it can&rsquo;t be edited here.
          </p>
        </NoteBlock>
        {!confirmingReset ? (
          <Button type="button" size="sm" emphasis="normal" onClick={() => setConfirmingReset(true)}>
            Reset to form
          </Button>
        ) : (
          <div className="properties-form-reset-confirm flex flex-col gap-[var(--nb-pad)]">
            <p className="font-mono text-[length:var(--nb-text-label)] text-fg-dim">Resetting to form will discard this custom code. This can&rsquo;t be undone.</p>
            <div className="flex gap-[var(--nb-gap)]">
              <Button type="button" size="sm" emphasis="accent" onClick={handleResetConfirmed}>
                Discard custom code and reset
              </Button>
              <Button type="button" size="sm" emphasis="normal" onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const props = view.props;

  return (
    <div className="properties-form idl-dense flex flex-col gap-[var(--space-4)] p-[var(--nb-gap)]">
      <ChartTypeControl chart={props.chart} onChange={(next) => commit(setChartType(props, next, channels))} />
      {props.chart === "fft" && <FftPropertiesForm props={props} channels={channels} onChange={commit} />}
      {props.chart === "histogram" && <HistogramPropertiesForm props={props} channels={channels} onChange={commit} />}
      {props.chart === "scatter" && <ScatterPropertiesForm props={props} channels={channels} onChange={commit} />}
      {props.chart === "time" && <TimePropertiesForm props={props} channels={channels} laps={laps} onChange={commit} />}
    </div>
  );
}

/** The chart-type control's own labels, one per `CHART_KINDS` entry — the
 *  segmented control is too narrow for a blurb, so these are short by
 *  design; the graph card's picker (`graph/chartTypeCatalog.ts`) carries
 *  the fuller label and one-line description. Kept exhaustive by the
 *  `Record` type, so a chart kind added to `PlotProps` without a label
 *  here is a compile error. */
const CHART_KIND_LABELS: Record<PlotProps["chart"], string> = {
  time: "Time",
  fft: "FFT",
  histogram: "Histogram",
  scatter: "Scatter",
};

/** Control 1 (C2 §5.3): the chart-type segmented control, one item per
 *  `CHART_KINDS` entry (ruling R215 widens it past `Time`/`FFT`), first for
 *  every chart type (R79 Q6: switching has no confirmation). */
function ChartTypeControl({ chart, onChange }: { chart: PlotProps["chart"]; onChange: (next: PlotProps["chart"]) => void }) {
  return (
    <div className="properties-form-chart-type">
      <Field label="Chart type">
        {() => (
          <ToggleGroup
            type="single"
            density="tight"
            value={chart}
            aria-label="Chart type"
            onValueChange={(next) => {
              // Radix hands back `""` when the active item is re-clicked
              // (deselect). A chart always has a type, so that is a no-op
              // here rather than an unset state -- the same reason
              // `SelectField`'s unset sentinel is not used for it.
              if (CHART_KINDS.includes(next as PlotProps["chart"])) onChange(next as PlotProps["chart"]);
            }}
          >
            {CHART_KINDS.map((kind) => (
              <ToggleGroupItem key={kind} value={kind}>
                {CHART_KIND_LABELS[kind]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </Field>
    </div>
  );
}

/** Two-number `[min, max]` domain editor shared by the x and y axis
 *  sections (both chart types). Commits a domain only once both fields
 *  hold a finite number; clearing either field back to empty clears the
 *  whole domain (matches `updateXAxis`/`updateYAxis`'s "undefined patch
 *  value clears the field" convention) rather than committing a
 *  half-specified range `plotForm` cannot represent (`domain` is always
 *  `[number, number]`, never a single bound). */
function DomainFields({
  domain,
  unit,
  onChange,
}: {
  domain: [number, number] | undefined;
  /** The axis's unit suffix, when the caller knows it. */
  unit?: string;
  onChange: (domain: [number, number] | undefined) => void;
}) {
  const [minText, setMinText] = useState(domain === undefined ? "" : String(domain[0]));
  const [maxText, setMaxText] = useState(domain === undefined ? "" : String(domain[1]));

  function commit(nextMinText: string, nextMaxText: string): void {
    if (nextMinText === "" || nextMaxText === "") {
      onChange(undefined);
      return;
    }
    const min = Number(nextMinText);
    const max = Number(nextMaxText);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      onChange([min, max]);
    }
  }

  /** One bound's text, or `null` for an empty field — `NumberField`'s own
   *  "not set". The two bounds stay *text* state here rather than numbers
   *  so that clearing one field is distinguishable from typing a zero. */
  const asValue = (text: string): number | null => (text === "" ? null : Number(text));

  return (
    <>
      <NumberField
        label="Domain min"
        value={asValue(minText)}
        unit={unit}
        placeholder="auto"
        onChange={(next) => {
          const text = next === null ? "" : String(next);
          setMinText(text);
          commit(text, maxText);
        }}
      />
      <NumberField
        label="Domain max"
        value={asValue(maxText)}
        unit={unit}
        placeholder="auto"
        onChange={(next) => {
          const text = next === null ? "" : String(next);
          setMaxText(text);
          commit(minText, text);
        }}
      />
    </>
  );
}

/**
 * The y-axis scale control, shared by every chart kind (ruling R215 item
 * 5). Keyed on `model/propertiesForm.ts`'s own picker tokens rather than
 * on `YAxisProps.type`, because idl0's two signed scales — now Plot `pow`
 * scales — share the type `"pow"` and differ only by exponent, so a
 * picker keyed on `type` could not tell them apart.
 *
 * `axis` decides whether the signed scales are offered at all: they are
 * only meaningful where the values can be negative (a channel's own
 * value), not on a count, a fraction, or a spectrum magnitude.
 */
function YScaleControl({
  y,
  axis,
  onChange,
}: {
  y: YAxisProps | undefined;
  axis: "signed" | "non-negative";
  onChange: (patch: Pick<YAxisProps, "type" | "exponent">) => void;
}) {
  const current = yScaleChoiceOf(y);
  const choices = yScaleSelectOptions(y, axis);
  return (
    <SelectField
      label="Scale"
      value={current}
      options={choices.map((c) => ({ value: c.value, label: c.label }))}
      onChange={(value) => {
        const choice = choices.find((c) => c.value === value);
        if (choice !== undefined) onChange(choice.patch);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Time-cell body (controls 2-3, x/y axes, legend -- unchanged from before
// the FFT chart-type discriminant existed).
// ---------------------------------------------------------------------------

function TimePropertiesForm({
  props,
  channels,
  laps,
  onChange,
}: {
  props: TimePlotProps;
  channels: PropertiesFormChannelOption[];
  laps: PropertiesFormLapOption[];
  onChange: (next: PlotProps) => void;
}) {
  /** Handles a channel pick for the mark at `index`. For the first mark
   *  only (see the file-level doc comment on why just the first), also
   *  seeds `y.label` from {@link suggestAxisLabel} when the plot doesn't
   *  already have one set — never overwriting a label the author already
   *  typed or a suggestion from an earlier channel pick. */
  function handleMarkChannelChange(index: number, channelId: string): void {
    let next: PlotProps = updateMark(props, index, { channel: channelId });
    if (index === 0 && next.y?.label === undefined) {
      const channel = channels.find((c) => c.id === channelId);
      const suggestion = suggestAxisLabel(channel);
      if (suggestion !== undefined) {
        next = updateYAxis(next, { label: suggestion });
      }
    }
    onChange(next);
  }

  return (
    <>
      <FieldGroup title="Marks" className="properties-form-marks">
        {props.marks.map((mark, index) => (
          <MarkRow
            key={index}
            mark={mark}
            index={index}
            channels={channels}
            laps={laps}
            canRemove={props.marks.length > 0}
            canMoveUp={index > 0}
            canMoveDown={index < props.marks.length - 1}
            onPatch={(patch) => onChange(updateMark(props, index, patch))}
            onChannelChange={(channelId) => handleMarkChannelChange(index, channelId)}
            onRemove={() => onChange(removeMark(props, index))}
            onMoveUp={() => onChange(moveMark(props, index, index - 1))}
            onMoveDown={() => onChange(moveMark(props, index, index + 1))}
          />
        ))}
        <Button type="button" size="sm" emphasis="normal" onClick={() => onChange(addMark(props, channels[0]?.id ?? ""))}>
          Add mark
        </Button>
      </FieldGroup>

      <FieldGroup title="X axis" className="properties-form-x-axis">
        <TimeXAxisControl xField={timeXFieldOf(props)} onChange={(next) => onChange(setTimeXField(props, next))} />
        <TextField
          label="Label"
          value={props.x?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateXAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.x?.domain} onChange={(domain) => onChange(updateXAxis(props, { domain }))} />
      </FieldGroup>

      <FieldGroup title="Y axis" className="properties-form-y-axis">
        <TextField
          label="Label"
          value={props.y?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateYAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.y?.domain} onChange={(domain) => onChange(updateYAxis(props, { domain }))} />
        <YScaleControl y={props.y} axis="signed" onChange={(patch) => onChange(updateYAxis(props, patch))} />
        <SwitchField
          label="Zero line"
          checked={props.zeroLine === true}
          onChange={(checked) => onChange(setZeroLine(props, checked))}
        />
      </FieldGroup>

      <LegendControl props={props} onChange={onChange} />
    </>
  );
}

/**
 * A time chart's x-axis mode (ruling R215 items 4-5): which time column
 * every mark binds. Session time is the default; lap time (`x: "tr"`)
 * rebases each selected window to its own start so *n* laps superimpose,
 * which is what makes a lap-pair overlay and a lap variance trace readable.
 *
 * **Distance is rendered, disabled, with its reason** (R136,
 * `model/xMode.ts`'s `DISTANCE_X_MODE_DISABLED_REASON`) rather than hidden:
 * the control never conceals that the mode exists or why it cannot be
 * chosen. It has no `MarkProps.xField` spelling to select, so picking it is
 * not merely refused — it is unrepresentable.
 *
 * Plot-level, not per mark, because a plot has one x scale: two marks on
 * different time columns would draw one against the other's axis. The
 * grammar stores the binding per mark (it has no plot-level slot for it),
 * so this control writes every mark at once — see `setTimeXField`.
 */
function TimeXAxisControl({ xField, onChange }: { xField: "tr" | undefined; onChange: (next: "tr" | undefined) => void }) {
  const selected = xField ?? "t";
  const option = TIME_CHART_X_AXIS_OPTIONS.find((o) => o.value === selected);
  return (
    <SelectField
      label="Axis"
      value={selected}
      hint={option?.blurb}
      options={TIME_CHART_X_AXIS_OPTIONS.map((o) => ({
        value: o.value,
        label: o.disabledReason === undefined ? o.label : `${o.label} (unavailable)`,
        disabled: o.disabledReason !== undefined,
        title: o.disabledReason,
      }))}
      onChange={(value) => {
        // A disabled option cannot be committed, and `"distance"` has no
        // `MarkProps.xField` spelling to commit even if it could be.
        if (value === "t") onChange(undefined);
        else if (value === "tr") onChange("tr");
      }}
    />
  );
}

/** One mark's row of controls: channel, mark type, lap scope, stroke
 *  colour, stroke width, and reorder/remove buttons. `onPatch` builds the
 *  next `PlotProps` and commits it the same way every other control does —
 *  this component holds no `PlotProps` of its own. */
function MarkRow({
  mark,
  index,
  channels,
  laps,
  canRemove,
  canMoveUp,
  canMoveDown,
  onPatch,
  onChannelChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  mark: MarkProps;
  index: number;
  channels: PropertiesFormChannelOption[];
  laps: PropertiesFormLapOption[];
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: Partial<MarkProps>) => void;
  /** Channel picks go through this, not `onPatch`, so the first mark's pick
   *  can also seed `y.label` (see {@link PropertiesForm}'s doc comment). */
  onChannelChange: (channelId: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  // "Session" is a real scope, not an unset state, so it is an ordinary
  // option value rather than `SelectField`'s unset sentinel.
  const scopeValue = mark.lap === null || mark.lap === undefined ? "session" : String(mark.lap);

  return (
    <div className="properties-form-mark-row flex flex-col gap-[var(--nb-pad)] border-l border-rule pl-[var(--nb-gap)]">
      <SelectField
        label="Channel"
        value={mark.channel}
        options={channels.map((c) => ({ value: c.id, label: c.label }))}
        onChange={(value) => value !== undefined && onChannelChange(value)}
      />
      <SelectField
        label="Mark type"
        value={mark.mark}
        options={options(MARK_NAMES, (name) => name)}
        onChange={(value) => value !== undefined && onPatch({ mark: value as MarkProps["mark"] })}
      />
      <SelectField
        label="Scope"
        value={scopeValue}
        options={[{ value: "session", label: "Session" }, ...laps.map((lap) => ({ value: String(lap.number), label: `Lap ${lap.number}` }))]}
        onChange={(value) => onPatch({ lap: value === undefined || value === "session" ? null : Number(value) })}
      />
      <ColourField label="Stroke colour" value={mark.stroke} onChange={(value) => onPatch({ stroke: value })} />
      <NumberField
        label="Stroke width"
        unit="px"
        min={0}
        step={0.5}
        placeholder="auto"
        value={mark.strokeWidth ?? null}
        onChange={(value) => onPatch({ strokeWidth: value ?? undefined })}
      />
      <div className="flex justify-end gap-[var(--nb-pad)]">
        <Button type="button" size="sm" emphasis="normal" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label={`Move mark ${index + 1} up`}>
          ↑
        </Button>
        <Button type="button" size="sm" emphasis="normal" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label={`Move mark ${index + 1} down`}>
          ↓
        </Button>
        <Button type="button" size="sm" emphasis="normal" onClick={onRemove} disabled={!canRemove}>
          Remove mark {index + 1}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FFT-cell body (L6 Task 20, C2 §5.3 controls 2-12).
// ---------------------------------------------------------------------------

function FftPropertiesForm({
  props,
  channels,
  onChange,
}: {
  props: FftPlotProps;
  channels: PropertiesFormChannelOption[];
  onChange: (next: PlotProps) => void;
}) {
  const { mark } = props;
  const { fft } = mark;
  const averagingIsNone = fft.averaging === "none";

  /** Control 2: channel pick — also seeds `y.label` per scaling
   *  (R79 Q5) when it is not already set (same one-time-seed rule as the
   *  time cell's first-mark pick). */
  function handleChannelChange(channelId: string): void {
    let next: FftPlotProps = { ...props, mark: { ...mark, channel: channelId } };
    if (next.y?.label === undefined) {
      const channel = channels.find((c) => c.id === channelId);
      const suggestion = suggestSpectrumAxisLabel(channel, fft.scaling);
      if (suggestion !== undefined) next = updateYAxis(next, { label: suggestion }) as FftPlotProps;
    }
    onChange(next);
  }

  /** Control 9: scaling pick — reseeds `y.label` per the new scaling
   *  (R79 Q5) when it is not already set. */
  function handleScalingChange(scaling: FftParams["scaling"]): void {
    let next: FftPlotProps = updateFftParams(props, { scaling });
    if (next.y?.label === undefined) {
      const channel = channels.find((c) => c.id === mark.channel);
      const suggestion = suggestSpectrumAxisLabel(channel, scaling);
      if (suggestion !== undefined) next = updateYAxis(next, { label: suggestion }) as FftPlotProps;
    }
    onChange(next);
  }

  function patchFft(patch: Partial<FftParams>): void {
    onChange(updateFftParams(props, patch));
  }

  const overlap = overlapPercent(fft.windowSize, fft.hopSize);
  const windowSizeIsStandard = fft.windowSize !== "all" && (FFT_WINDOW_SIZE_OPTIONS as readonly number[]).includes(fft.windowSize);
  const windowSizeSelectValue = fft.windowSize === "all" ? WHOLE_RECORD : windowSizeIsStandard ? String(fft.windowSize) : CUSTOM_WINDOW_SIZE;

  return (
    <>
      <FieldGroup title="Spectrum" className="properties-form-mark">
        <SelectField
          label="Channel"
          value={mark.channel}
          options={channels.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(value) => value !== undefined && handleChannelChange(value)}
        />
        <SelectField
          label="Mark type"
          value={mark.mark}
          options={options(SPECTRUM_MARK_NAMES, (name) => name)}
          onChange={(value) => value !== undefined && onChange({ ...props, mark: { ...mark, mark: value as SpectrumMarkProps["mark"] } })}
        />
        <ColourField label="Stroke colour" value={mark.stroke} onChange={(value) => onChange({ ...props, mark: { ...mark, stroke: value } })} />
        <NumberField
          label="Stroke width"
          unit="px"
          min={0}
          step={0.5}
          placeholder="auto"
          value={mark.strokeWidth ?? null}
          onChange={(value) => onChange({ ...props, mark: { ...mark, strokeWidth: value ?? undefined } })}
        />
      </FieldGroup>

      <FieldGroup title="FFT parameters" className="properties-form-fft-params">
        <SelectField
          label="Window function"
          value={fft.window}
          options={options(FFT_WINDOW_FUNCTIONS, (w) => (w === "rectangular" ? "Rect" : w === "hann" ? "Hann" : "Hamming"))}
          onChange={(value) => value !== undefined && patchFft({ window: value as FftParams["window"] })}
        />
        <SelectField
          label="Window size"
          value={windowSizeSelectValue}
          disabled={averagingIsNone}
          options={[
            ...options(FFT_WINDOW_SIZE_OPTIONS, (n) => String(n)),
            { value: WHOLE_RECORD, label: "Whole record" },
            ...(!windowSizeIsStandard && fft.windowSize !== "all" ? [{ value: CUSTOM_WINDOW_SIZE, label: "Custom…" }] : []),
          ]}
          onChange={(value) => {
            if (value === WHOLE_RECORD) patchFft({ windowSize: "all" });
            else if (value !== undefined && value !== CUSTOM_WINDOW_SIZE) patchFft({ windowSize: Number(value) });
          }}
        />
        {fft.windowSize !== "all" && (
          <NumberField
            label="Window size"
            unit="samples"
            min={1}
            step={1024}
            disabled={averagingIsNone}
            value={fft.windowSize}
            onChange={(value) => value !== null && patchFft({ windowSize: value })}
          />
        )}
        {/* Window size disables its editable control with `disabled` (it
            always renders a select). Hop size has no such control once
            forced to "all" — under averaging: "none" it renders a read-only
            row instead, since there is no input to disable. Both mechanisms
            express the same "not editable" semantic. */}
        {fft.hopSize !== "all" ? (
          <NumberField
            label="Hop size"
            unit="samples"
            min={1}
            step={256}
            disabled={averagingIsNone}
            value={fft.hopSize}
            hint={overlap !== null ? `Overlap: ${overlap.toFixed(0)}%` : undefined}
            onChange={(value) => value !== null && patchFft({ hopSize: value })}
          />
        ) : (
          <Field label="Hop size" hint={overlap !== null ? `Overlap: ${overlap.toFixed(0)}%` : undefined}>
            {() => <span className="font-mono text-[length:var(--nb-text-label)] text-fg-faint">Whole record</span>}
          </Field>
        )}
        <SelectField
          label="Detrend"
          value={fft.detrend}
          options={options(FFT_DETRENDS, (d) => (d === "none" ? "None" : d === "mean" ? "Mean" : "Linear"))}
          onChange={(value) => value !== undefined && patchFft({ detrend: value as FftParams["detrend"] })}
        />
        <SelectField
          label="Averaging"
          value={fft.averaging}
          options={options(FFT_AVERAGINGS, (a) => (a === "none" ? "None" : a === "mean" ? "Mean" : a === "median" ? "Median" : "Max"))}
          hint={averagingIsNone ? "A single-segment FFT covers the whole record." : undefined}
          onChange={(value) => value !== undefined && patchFft({ averaging: value as FftParams["averaging"] })}
        />
        <SelectField
          label="Scaling"
          value={fft.scaling}
          className="w-36"
          options={options(fftScalingSelectOptions(fft.scaling), (s) => (s === "density" ? "Density (PSD)" : s === "spectrum" ? "Spectrum" : "Magnitude"))}
          onChange={(value) => value !== undefined && handleScalingChange(value as FftParams["scaling"])}
        />
      </FieldGroup>

      <FieldGroup title="Frequency axis" className="properties-form-x-axis">
        <SelectField
          label="Scale"
          value={props.x.type}
          options={[
            { value: "linear", label: "Lin" },
            { value: "log", label: "Log" },
          ]}
          onChange={(value) => value !== undefined && onChange(updateFftXAxisType(props, value as "linear" | "log"))}
        />
        <TextField
          label="Label"
          value={props.x.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateXAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.x.domain} unit="Hz" onChange={(domain) => onChange(updateXAxis(props, { domain }))} />
      </FieldGroup>

      <FieldGroup title="Magnitude axis" className="properties-form-y-axis">
        <TextField
          label="Label"
          value={props.y?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateYAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.y?.domain} onChange={(domain) => onChange(updateYAxis(props, { domain }))} />
        <YScaleControl y={props.y} axis="non-negative" onChange={(patch) => onChange(updateYAxis(props, patch))} />
      </FieldGroup>

      <LegendControl props={props} onChange={onChange} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Histogram-cell body (ruling R215 item 2, C2 §5.3, C3 §3.6).
// ---------------------------------------------------------------------------

/** The bin counts the Properties pane offers directly, each comfortably
 *  below C3 §3.6's `MAX_HISTOGRAM_BINS`. A stored value outside this list (a
 *  hand-edit, or a width-mode cell) still displays correctly through the
 *  accompanying free numeric entry — opening the pane never silently
 *  changes it, the same rule `FFT_WINDOW_SIZE_OPTIONS` follows. */
const HISTOGRAM_BIN_COUNT_OPTIONS: readonly number[] = [16, 32, 64, 128, 256];

/** The bin width a `count → width` switch seeds. A width is in the binned
 *  channel's own unit, which this pane does not know the scale of — there
 *  is no correct number here, only a starting one the author edits, so it
 *  is a plainly-round value rather than a conversion of the bin count it
 *  replaces (see `updateHistogramParams`' doc comment on why no conversion
 *  is attempted at all). */
const DEFAULT_BIN_WIDTH = 1;

function HistogramPropertiesForm({
  props,
  channels,
  onChange,
}: {
  props: HistogramPlotProps;
  channels: PropertiesFormChannelOption[];
  onChange: (next: PlotProps) => void;
}) {
  const { mark } = props;
  const { histogram } = mark;
  const isCount = histogram.binMode === "count";
  const channel = channels.find((c) => c.id === mark.channel);
  const binCountIsStandard = isCount && (HISTOGRAM_BIN_COUNT_OPTIONS as readonly number[]).includes(histogram.binValue);

  /** Channel pick — also seeds the **x** label (the bin-edge axis is in the
   *  channel's own unit, C1 §4.1) when it is not already set, the same
   *  one-time R65 seed a time cell's first mark does for `y`. A histogram's
   *  y axis is a count or a fraction and has no unit to suggest. */
  function handleChannelChange(channelId: string): void {
    let next: PlotProps = { ...props, mark: { ...mark, channel: channelId } };
    if (next.x?.label === undefined) {
      const suggestion = suggestAxisLabel(channels.find((c) => c.id === channelId));
      if (suggestion !== undefined) next = updateXAxis(next, { label: suggestion });
    }
    onChange(next);
  }

  function patchHistogram(patch: Partial<HistogramParams>): void {
    onChange(updateHistogramParams(props, patch));
  }

  return (
    <>
      <FieldGroup title="Distribution" className="properties-form-mark">
        <SelectField
          label="Channel"
          value={mark.channel}
          options={channels.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(value) => value !== undefined && handleChannelChange(value)}
        />
        <ColourField label="Fill colour" value={mark.fill} onChange={(value) => onChange({ ...props, mark: { ...mark, fill: value } })} />
        <NumberField
          label="Fill opacity"
          min={0}
          max={1}
          step={0.1}
          placeholder="auto"
          value={mark.fillOpacity ?? null}
          onChange={(value) => onChange({ ...props, mark: { ...mark, fillOpacity: value ?? undefined } })}
        />
      </FieldGroup>

      <FieldGroup title="Binning" className="properties-form-histogram-params">
        <SelectField
          label="Bins by"
          value={histogram.binMode}
          options={[
            { value: "count", label: "Count" },
            { value: "width", label: "Width" },
          ]}
          hint="Width is in the channel's own unit; the engine derives the bin count."
          onChange={(value) => {
            // A mode switch always carries a fresh `binValue`: a count and
            // a width are different quantities in different units, and
            // converting between them needs the data's own range, which
            // this pane does not have (`updateHistogramParams`).
            if (value === "count") patchHistogram({ binMode: "count", binValue: 64 });
            else if (value === "width") patchHistogram({ binMode: "width", binValue: DEFAULT_BIN_WIDTH });
          }}
        />
        {isCount && (
          <SelectField
            label="Bin count"
            value={binCountIsStandard ? String(histogram.binValue) : CUSTOM_WINDOW_SIZE}
            options={[
              ...options(HISTOGRAM_BIN_COUNT_OPTIONS, (n) => String(n)),
              ...(binCountIsStandard ? [] : [{ value: CUSTOM_WINDOW_SIZE, label: "Custom…" }]),
            ]}
            onChange={(value) => {
              if (value !== undefined && value !== CUSTOM_WINDOW_SIZE) patchHistogram({ binValue: Number(value) });
            }}
          />
        )}
        <NumberField
          label={isCount ? "Bin count" : "Bin width"}
          unit={isCount ? "bins" : (channel?.unit ?? undefined)}
          min={isCount ? 1 : undefined}
          max={isCount ? MAX_HISTOGRAM_BINS : undefined}
          step={isCount ? 1 : 0.1}
          value={histogram.binValue}
          hint={isCount ? `At most ${MAX_HISTOGRAM_BINS}.` : undefined}
          onChange={(value) => value !== null && patchHistogram({ binValue: value })}
        />
        <SwitchField
          label="Centre on zero"
          checked={histogram.symmetric}
          onChange={(checked) => patchHistogram({ symmetric: checked })}
        />
        <SelectField
          label="Y values"
          value={histogram.normalise}
          options={options(HISTOGRAM_NORMALISATIONS, (n) => (n === "counts" ? "Sample count" : "Share of window"))}
          hint="Share makes two windows of different lengths comparable."
          onChange={(value) => value !== undefined && patchHistogram({ normalise: value as HistogramParams["normalise"] })}
        />
      </FieldGroup>

      <FieldGroup title="Value axis" className="properties-form-x-axis">
        <TextField
          label="Label"
          value={props.x?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateXAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.x?.domain} unit={channel?.unit} onChange={(domain) => onChange(updateXAxis(props, { domain }))} />
      </FieldGroup>

      <FieldGroup title={histogram.normalise === "counts" ? "Count axis" : "Share axis"} className="properties-form-y-axis">
        <TextField
          label="Label"
          value={props.y?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateYAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.y?.domain} onChange={(domain) => onChange(updateYAxis(props, { domain }))} />
        <YScaleControl y={props.y} axis="non-negative" onChange={(patch) => onChange(updateYAxis(props, patch))} />
      </FieldGroup>

      <LegendControl props={props} onChange={onChange} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Scatter-cell body (ruling R215 item 3, C2 §5.3, C3 §3.5).
// ---------------------------------------------------------------------------

/** The point budgets the Properties pane offers directly, each at or below
 *  C3 §3.5's `MAX_SCATTER_POINTS`. A stored value outside this list still
 *  displays through the accompanying free numeric entry — opening the pane
 *  never silently changes it, the same rule the other two param sections
 *  follow. */
const SCATTER_POINT_BUDGET_OPTIONS: readonly number[] = [1024, 4096, 16384, 65536];

function ScatterPropertiesForm({
  props,
  channels,
  onChange,
}: {
  props: ScatterPlotProps;
  channels: PropertiesFormChannelOption[];
  onChange: (next: PlotProps) => void;
}) {
  const { mark } = props;
  const xChannel = channels.find((c) => c.id === mark.xChannel);
  const yChannel = channels.find((c) => c.id === mark.yChannel);
  const budgetIsStandard = (SCATTER_POINT_BUDGET_OPTIONS as readonly number[]).includes(mark.scatter.pointBudget);

  /** An axis's channel pick — also seeds that axis's own label from the
   *  newly-picked channel's unit (R65) when it is not already set. A
   *  scatter is the one chart kind where **both** axes carry a channel's
   *  unit, so both get the same one-time seed. */
  function handleChannelChange(axis: "x" | "y", channelId: string): void {
    const nextMark = axis === "x" ? { ...mark, xChannel: channelId } : { ...mark, yChannel: channelId };
    let next: PlotProps = { ...props, mark: nextMark };
    const suggestion = suggestAxisLabel(channels.find((c) => c.id === channelId));
    if (suggestion !== undefined) {
      if (axis === "x" && next.x?.label === undefined) next = updateXAxis(next, { label: suggestion });
      if (axis === "y" && next.y?.label === undefined) next = updateYAxis(next, { label: suggestion });
    }
    onChange(next);
  }

  function patchScatter(patch: Partial<ScatterParams>): void {
    onChange(updateScatterParams(props, patch));
  }

  return (
    <>
      <FieldGroup title="Channels" className="properties-form-mark">
        <SelectField
          label="X channel"
          value={mark.xChannel}
          options={channels.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(value) => value !== undefined && handleChannelChange("x", value)}
        />
        <SelectField
          label="Y channel"
          value={mark.yChannel}
          options={channels.map((c) => ({ value: c.id, label: c.label }))}
          hint={mark.xChannel === mark.yChannel ? "Both axes are the same channel, so every point sits on the diagonal." : undefined}
          onChange={(value) => value !== undefined && handleChannelChange("y", value)}
        />
        <ColourField label="Point colour" value={mark.fill} onChange={(value) => onChange({ ...props, mark: { ...mark, fill: value } })} />
        <NumberField
          label="Point radius"
          unit="px"
          min={0}
          step={0.5}
          placeholder="auto"
          value={mark.r ?? null}
          onChange={(value) => onChange({ ...props, mark: { ...mark, r: value ?? undefined } })}
        />
      </FieldGroup>

      <FieldGroup title="Cloud" className="properties-form-scatter-params">
        <SelectField
          label="Point budget"
          value={budgetIsStandard ? String(mark.scatter.pointBudget) : CUSTOM_WINDOW_SIZE}
          options={[
            ...options(SCATTER_POINT_BUDGET_OPTIONS, (n) => String(n)),
            ...(budgetIsStandard ? [] : [{ value: CUSTOM_WINDOW_SIZE, label: "Custom…" }]),
          ]}
          hint="The engine decimates to this by uniform stride."
          onChange={(value) => {
            if (value !== undefined && value !== CUSTOM_WINDOW_SIZE) patchScatter({ pointBudget: Number(value) });
          }}
        />
        <NumberField
          label="Point budget"
          unit="points"
          min={1}
          max={MAX_SCATTER_POINTS}
          step={512}
          value={mark.scatter.pointBudget}
          hint={`At most ${MAX_SCATTER_POINTS}.`}
          onChange={(value) => value !== null && patchScatter({ pointBudget: value })}
        />
        <SwitchField
          label="Equal aspect"
          checked={mark.scatter.equalAspect}
          onChange={(checked) => patchScatter({ equalAspect: checked })}
        />
      </FieldGroup>

      <FieldGroup title="X axis" className="properties-form-x-axis">
        <TextField
          label="Label"
          value={props.x?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateXAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.x?.domain} unit={xChannel?.unit} onChange={(domain) => onChange(updateXAxis(props, { domain }))} />
      </FieldGroup>

      <FieldGroup title="Y axis" className="properties-form-y-axis">
        <TextField
          label="Label"
          value={props.y?.label ?? ""}
          placeholder="auto"
          onChange={(value) => onChange(updateYAxis(props, { label: value === "" ? undefined : value }))}
        />
        <DomainFields domain={props.y?.domain} unit={yChannel?.unit} onChange={(domain) => onChange(updateYAxis(props, { domain }))} />
        <YScaleControl y={props.y} axis="signed" onChange={(patch) => onChange(updateYAxis(props, patch))} />
      </FieldGroup>

      <LegendControl props={props} onChange={onChange} />
    </>
  );
}

/** Control 12: the colour legend, shared by every chart type (C2 §5.3's
 *  `color_opt` is the same shape for all of them). A toggle switch since
 *  R212 item 5 — the same on/off semantic as the checkbox it replaces. */
function LegendControl({ props, onChange }: { props: PlotProps; onChange: (next: PlotProps) => void }) {
  return (
    <FieldGroup title="Legend" className="properties-form-color">
      <SwitchField label="Show colour legend" checked={props.color !== undefined} onChange={(checked) => onChange(setColorLegend(props, checked))} />
    </FieldGroup>
  );
}
