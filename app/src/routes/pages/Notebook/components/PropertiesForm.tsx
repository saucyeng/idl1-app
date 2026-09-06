import { useState } from "react";

import {
  FFT_AVERAGINGS,
  FFT_DETRENDS,
  FFT_SCALINGS,
  FFT_WINDOW_FUNCTIONS,
  generate,
  MARK_NAMES,
  SPECTRUM_MARK_NAMES,
  Y_AXIS_TYPES,
  type FftParams,
  type FftPlotProps,
  type MarkProps,
  type PlotProps,
  type SpectrumMarkProps,
  type TimePlotProps,
} from "../plotForm";
import {
  addMark,
  advanceFormState,
  INITIAL_FORM_STATE,
  moveMark,
  overlapPercent,
  removeMark,
  resetToFormCode,
  setChartType,
  setColorLegend,
  suggestAxisLabel,
  suggestSpectrumAxisLabel,
  updateFftParams,
  updateFftXAxisType,
  updateMark,
  updateXAxis,
  updateYAxis,
  type PropertiesFormState,
} from "../model/propertiesForm";
import type { PropertiesFormChannelOption, PropertiesFormLapOption, PropertiesFormProps } from "./PropertiesForm.types";

/** The `windowSize`/`hopSize` sample counts the Properties panel's
 *  `<select>` offers directly (C2 §5.3's twelfth-listed control 5), each
 *  comfortably below `model/fftRequest.ts`'s `MAX_FFT_BINS`. A stored value
 *  outside this list (a hand-edit, or an older workbook) still displays
 *  correctly through the accompanying free numeric entry -- opening the
 *  pane never silently changes it. */
const FFT_WINDOW_SIZE_OPTIONS: readonly number[] = [1024, 2048, 4096, 8192, 16384];

/**
 * The Properties pane (design §6, D13): a form over `plotForm`'s `PlotProps`
 * that generates idiomatic Plot code and reflects the subset it can parse
 * back out of `code`. Every control writes through the same path — build
 * the next `PlotProps`, `generate` it, hand the string to `onChange` — this
 * component never mutates `code` directly and never calls `parse`/`generate`
 * itself outside that one path (both live in `../model/propertiesForm.ts`,
 * this component's whole logic surface besides DOM wiring).
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
      <div className="properties-form properties-form-custom" aria-disabled="true">
        <p className="properties-form-custom-label">Custom code</p>
        <p className="properties-form-custom-hint">
          This cell&rsquo;s code is outside the form&rsquo;s supported subset, so it can&rsquo;t be edited here.
        </p>
        {!confirmingReset ? (
          <button type="button" onClick={() => setConfirmingReset(true)}>
            Reset to form
          </button>
        ) : (
          <div className="properties-form-reset-confirm">
            <p>Resetting to form will discard this custom code. This can&rsquo;t be undone.</p>
            <button type="button" onClick={handleResetConfirmed}>
              Discard custom code and reset
            </button>
            <button type="button" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  const props = view.props;

  return (
    <div className="properties-form">
      <ChartTypeControl chart={props.chart} onChange={(next) => commit(setChartType(props, next, channels))} />
      {props.chart === "fft" ? (
        <FftPropertiesForm props={props} channels={channels} onChange={commit} />
      ) : (
        <TimePropertiesForm props={props} channels={channels} laps={laps} onChange={commit} />
      )}
    </div>
  );
}

/** Control 1 (C2 §5.3): the chart-type segmented control, `Time`/`FFT`,
 *  first for both chart types (R79 Q6: switching has no confirmation). */
function ChartTypeControl({ chart, onChange }: { chart: "time" | "fft"; onChange: (next: "time" | "fft") => void }) {
  return (
    <div className="properties-form-chart-type" role="group" aria-label="Chart type">
      <button type="button" aria-pressed={chart === "time"} onClick={() => onChange("time")}>
        Time
      </button>
      <button type="button" aria-pressed={chart === "fft"} onClick={() => onChange("fft")}>
        FFT
      </button>
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
  onChange,
}: {
  domain: [number, number] | undefined;
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

  return (
    <label>
      Domain
      <input
        type="number"
        value={minText}
        onChange={(e) => {
          setMinText(e.target.value);
          commit(e.target.value, maxText);
        }}
      />
      <input
        type="number"
        value={maxText}
        onChange={(e) => {
          setMaxText(e.target.value);
          commit(minText, e.target.value);
        }}
      />
    </label>
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
      <section className="properties-form-marks">
        <h3>Marks</h3>
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
        <button type="button" onClick={() => onChange(addMark(props, channels[0]?.id ?? ""))}>
          Add mark
        </button>
      </section>

      <section className="properties-form-x-axis">
        <h3>X axis</h3>
        <label>
          Label
          <input
            type="text"
            value={props.x?.label ?? ""}
            onChange={(e) => onChange(updateXAxis(props, { label: e.target.value === "" ? undefined : e.target.value }))}
          />
        </label>
        <DomainFields domain={props.x?.domain} onChange={(domain) => onChange(updateXAxis(props, { domain }))} />
      </section>

      <section className="properties-form-y-axis">
        <h3>Y axis</h3>
        <label>
          Label
          <input
            type="text"
            value={props.y?.label ?? ""}
            onChange={(e) => onChange(updateYAxis(props, { label: e.target.value === "" ? undefined : e.target.value }))}
          />
        </label>
        <DomainFields domain={props.y?.domain} onChange={(domain) => onChange(updateYAxis(props, { domain }))} />
        <label>
          Scale
          <select
            value={props.y?.type ?? ""}
            onChange={(e) => onChange(updateYAxis(props, { type: e.target.value === "" ? undefined : (e.target.value as NonNullable<TimePlotProps["y"]>["type"]) }))}
          >
            <option value="">(default)</option>
            {Y_AXIS_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </section>

      <LegendControl props={props} onChange={onChange} />
    </>
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
  return (
    <div className="properties-form-mark-row">
      <label>
        Channel
        <select value={mark.channel} onChange={(e) => onChannelChange(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mark type
        <select value={mark.mark} onChange={(e) => onPatch({ mark: e.target.value as MarkProps["mark"] })}>
          {MARK_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Scope
        <select
          value={mark.lap === null || mark.lap === undefined ? "session" : String(mark.lap)}
          onChange={(e) => onPatch({ lap: e.target.value === "session" ? null : Number(e.target.value) })}
        >
          <option value="session">Session</option>
          {laps.map((lap) => (
            <option key={lap.number} value={lap.number}>
              Lap {lap.number}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stroke colour
        <input
          type="text"
          value={mark.stroke ?? ""}
          onChange={(e) => onPatch({ stroke: e.target.value === "" ? undefined : e.target.value })}
        />
      </label>
      <label>
        Stroke width (px)
        <input
          type="number"
          value={mark.strokeWidth ?? ""}
          onChange={(e) => onPatch({ strokeWidth: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
      </label>
      <button type="button" onClick={onMoveUp} disabled={!canMoveUp}>
        Move up
      </button>
      <button type="button" onClick={onMoveDown} disabled={!canMoveDown}>
        Move down
      </button>
      <button type="button" onClick={onRemove} disabled={!canRemove}>
        Remove mark {index + 1}
      </button>
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
  const windowSizeSelectValue = fft.windowSize === "all" ? "all" : windowSizeIsStandard ? String(fft.windowSize) : "custom";

  return (
    <>
      <section className="properties-form-mark">
        <h3>Spectrum</h3>
        <label>
          Channel
          <select value={mark.channel} onChange={(e) => handleChannelChange(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mark type
          <select value={mark.mark} onChange={(e) => onChange({ ...props, mark: { ...mark, mark: e.target.value as SpectrumMarkProps["mark"] } })}>
            {SPECTRUM_MARK_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stroke colour
          <input
            type="text"
            value={mark.stroke ?? ""}
            onChange={(e) => onChange({ ...props, mark: { ...mark, stroke: e.target.value === "" ? undefined : e.target.value } })}
          />
        </label>
        <label>
          Stroke width (px)
          <input
            type="number"
            value={mark.strokeWidth ?? ""}
            onChange={(e) => onChange({ ...props, mark: { ...mark, strokeWidth: e.target.value === "" ? undefined : Number(e.target.value) } })}
          />
        </label>
      </section>

      <section className="properties-form-fft-params">
        <h3>FFT parameters</h3>
        <label>
          Window function
          <select value={fft.window} onChange={(e) => patchFft({ window: e.target.value as FftParams["window"] })}>
            {FFT_WINDOW_FUNCTIONS.map((w) => (
              <option key={w} value={w}>
                {w === "rectangular" ? "Rect" : w === "hann" ? "Hann" : "Hamming"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Window size (samples)
          <select
            value={windowSizeSelectValue}
            disabled={averagingIsNone}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") patchFft({ windowSize: "all" });
              else if (v !== "custom") patchFft({ windowSize: Number(v) });
            }}
          >
            {FFT_WINDOW_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="all">Whole record</option>
            {!windowSizeIsStandard && fft.windowSize !== "all" && <option value="custom">Custom…</option>}
          </select>
          {fft.windowSize !== "all" && (
            <input
              type="number"
              value={fft.windowSize}
              disabled={averagingIsNone}
              onChange={(e) => patchFft({ windowSize: Number(e.target.value) })}
            />
          )}
        </label>
        <label>
          Hop size (samples)
          {/* Window size disables its editable control with `disabled` (it always renders a
              select). Hop size has no such control once forced to "all" — under
              averaging: "none" it renders this read-only span instead, since there is no
              input to disable. Both mechanisms express the same "not editable" semantic. */}
          {fft.hopSize !== "all" ? (
            <input type="number" value={fft.hopSize} disabled={averagingIsNone} onChange={(e) => patchFft({ hopSize: Number(e.target.value) })} />
          ) : (
            <span>Whole record</span>
          )}
          {overlap !== null && <span className="properties-form-overlap">{`Overlap: ${overlap.toFixed(0)}%`}</span>}
        </label>
        <label>
          Detrend
          <select value={fft.detrend} onChange={(e) => patchFft({ detrend: e.target.value as FftParams["detrend"] })}>
            {FFT_DETRENDS.map((d) => (
              <option key={d} value={d}>
                {d === "none" ? "None" : d === "mean" ? "Mean" : "Linear"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Averaging
          <select value={fft.averaging} onChange={(e) => patchFft({ averaging: e.target.value as FftParams["averaging"] })}>
            {FFT_AVERAGINGS.map((a) => (
              <option key={a} value={a}>
                {a === "none" ? "None" : a === "mean" ? "Mean" : a === "median" ? "Median" : "Max"}
              </option>
            ))}
          </select>
          {averagingIsNone && <p className="properties-form-averaging-note">A single-segment FFT covers the whole record.</p>}
        </label>
        <label>
          Scaling
          <select value={fft.scaling} onChange={(e) => handleScalingChange(e.target.value as FftParams["scaling"])}>
            {FFT_SCALINGS.map((s) => (
              <option key={s} value={s}>
                {s === "magnitude" ? "Magnitude" : "Density"}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="properties-form-x-axis">
        <h3>Frequency axis</h3>
        <label>
          Scale
          <select value={props.x.type} onChange={(e) => onChange(updateFftXAxisType(props, e.target.value as "linear" | "log"))}>
            <option value="linear">Lin</option>
            <option value="log">Log</option>
          </select>
        </label>
        <label>
          Label
          <input
            type="text"
            value={props.x.label ?? ""}
            onChange={(e) => onChange(updateXAxis(props, { label: e.target.value === "" ? undefined : e.target.value }))}
          />
        </label>
        <DomainFields domain={props.x.domain} onChange={(domain) => onChange(updateXAxis(props, { domain }))} />
      </section>

      <section className="properties-form-y-axis">
        <h3>Magnitude axis</h3>
        <label>
          Label
          <input
            type="text"
            value={props.y?.label ?? ""}
            onChange={(e) => onChange(updateYAxis(props, { label: e.target.value === "" ? undefined : e.target.value }))}
          />
        </label>
        <DomainFields domain={props.y?.domain} onChange={(domain) => onChange(updateYAxis(props, { domain }))} />
        <label>
          Scale
          <select
            value={props.y?.type ?? ""}
            onChange={(e) => onChange(updateYAxis(props, { type: e.target.value === "" ? undefined : (e.target.value as NonNullable<FftPlotProps["y"]>["type"]) }))}
          >
            <option value="">(default)</option>
            {Y_AXIS_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </section>

      <LegendControl props={props} onChange={onChange} />
    </>
  );
}

/** Control 12: the colour-legend checkbox, unchanged and shared by both
 *  chart types (C2 §5.3's `color_opt` is the same shape for either). */
function LegendControl({ props, onChange }: { props: PlotProps; onChange: (next: PlotProps) => void }) {
  return (
    <section className="properties-form-color">
      <label>
        <input type="checkbox" checked={props.color !== undefined} onChange={(e) => onChange(setColorLegend(props, e.target.checked))} />
        Show colour legend
      </label>
    </section>
  );
}
