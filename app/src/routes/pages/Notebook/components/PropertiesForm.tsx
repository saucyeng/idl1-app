import { useState } from "react";

import { generate, MARK_NAMES, Y_AXIS_TYPES, type MarkProps, type PlotProps } from "../plotForm";
import {
  addMark,
  advanceFormState,
  INITIAL_FORM_STATE,
  moveMark,
  removeMark,
  resetToFormCode,
  setColorLegend,
  updateMark,
  updateXAxis,
  updateYAxis,
  type PropertiesFormState,
} from "../model/propertiesForm";
import type { PropertiesFormProps } from "./PropertiesForm.types";

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
 * Axis-label auto-suggestion from C2 §3.4's unit table is intentionally
 * **not** wired here: that table keys on a channel's physical *quantity*
 * (Acceleration, Speed, ...), and `PropertiesFormProps.channels` carries
 * only `{id, label}` — no quantity metadata reaches this component. The
 * label fields below are plain editable text inputs with no suggested
 * default. See this task's report for the question this raises for the
 * lead (what identifies a channel's quantity, and where that data should
 * come from).
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
            onPatch={(patch) => commit(updateMark(props, index, patch))}
            onRemove={() => commit(removeMark(props, index))}
            onMoveUp={() => commit(moveMark(props, index, index - 1))}
            onMoveDown={() => commit(moveMark(props, index, index + 1))}
          />
        ))}
        <button type="button" onClick={() => commit(addMark(props, channels[0]?.id ?? ""))}>
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
            onChange={(e) => commit(updateXAxis(props, { label: e.target.value === "" ? undefined : e.target.value }))}
          />
        </label>
        <DomainFields
          domain={props.x?.domain}
          onChange={(domain) => commit(updateXAxis(props, { domain }))}
        />
      </section>

      <section className="properties-form-y-axis">
        <h3>Y axis</h3>
        <label>
          Label
          <input
            type="text"
            value={props.y?.label ?? ""}
            onChange={(e) => commit(updateYAxis(props, { label: e.target.value === "" ? undefined : e.target.value }))}
          />
        </label>
        <DomainFields
          domain={props.y?.domain}
          onChange={(domain) => commit(updateYAxis(props, { domain }))}
        />
        <label>
          Scale
          <select
            value={props.y?.type ?? ""}
            onChange={(e) =>
              commit(
                updateYAxis(props, {
                  type: e.target.value === "" ? undefined : (e.target.value as NonNullable<PlotProps["y"]>["type"]),
                })
              )
            }
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

      <section className="properties-form-color">
        <label>
          <input
            type="checkbox"
            checked={props.color !== undefined}
            onChange={(e) => commit(setColorLegend(props, e.target.checked))}
          />
          Show colour legend
        </label>
      </section>
    </div>
  );
}

/** Two-number `[min, max]` domain editor shared by the x and y axis
 *  sections. Commits a domain only once both fields hold a finite number;
 *  clearing either field back to empty clears the whole domain (matches
 *  `updateXAxis`/`updateYAxis`'s "undefined patch value clears the field"
 *  convention) rather than committing a half-specified range `plotForm`
 *  cannot represent (`XAxisProps.domain`/`YAxisProps.domain` are
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
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  mark: MarkProps;
  index: number;
  channels: { id: string; label: string }[];
  laps: { number: number }[];
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: Partial<MarkProps>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="properties-form-mark-row">
      <label>
        Channel
        <select value={mark.channel} onChange={(e) => onPatch({ channel: e.target.value })}>
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
