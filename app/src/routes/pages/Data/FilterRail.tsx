import type { Dispatch } from "react";

import type { SessionSummary } from "../../../ipc/catalog";
import type { FacetCounts } from "./facets";
import type { DataFilters, FilterAction } from "./filters";
import { activeCount } from "./filters";

/** One option a multi-select facet group offers: the value stored in the
 *  matching `DataFilters` set, the label shown to the viewer, and its
 *  current match count. */
interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/** Builds one facet group's option list from a count map, sorted by label —
 *  idl0's `_StringFacet`. `""` (the synthetic "(none)" entry) sorts by its
 *  rendered label like every other option. */
function optionsFromCounts(counts: ReadonlyMap<string, number>): FacetOption[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value === "" ? "(none)" : value, count }))
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
}

/** One multi-select facet group: a heading and a checkbox list with per-option
 *  counts (idl0's `_MultiSelectFacet`). */
function FacetGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="data-facet-group">
      <legend>{title}</legend>
      {options.length === 0 ? (
        <p className="data-facet-empty">No options yet.</p>
      ) : (
        <ul>
          {options.map((option) => (
            <li key={option.value}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(option.value)}
                  onChange={() => onToggle(option.value)}
                />
                {option.label} ({option.count})
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

/** Local midnight `Date.now()`-relative Unix ms, `daysBack` days before local
 *  today (0 = today). Used only by the Date section's presets. */
function localDayStartMsAgo(daysBack: number): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack).getTime();
}

/** `YYYY-MM-DD` for `ms` in the viewer's local time zone — the value shape a
 *  native `<input type="date">` expects/emits. */
function dateInputValue(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear().toString().padStart(4, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses an `<input type="date">` value (`YYYY-MM-DD`) as local midnight;
 *  `null` for an empty/invalid value (the input was cleared). */
function parseDateInputValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

/** The Date facet: Today / Week / Month presets plus two custom-range date
 *  inputs (idl0's `_DateSection`, without the calendar picker widget —
 *  native `<input type="date">` fields stand in for it). */
function DateSection({ filters, dispatch }: { filters: DataFilters; dispatch: Dispatch<FilterAction> }) {
  const today = localDayStartMsAgo(0);

  function setPreset(daysBack: number) {
    dispatch({ type: "SET_DATE_RANGE", range: { startMs: localDayStartMsAgo(daysBack), endMs: today } });
  }

  return (
    <fieldset className="data-facet-group">
      <legend>Date</legend>
      <div className="data-date-presets">
        <button type="button" onClick={() => setPreset(0)}>
          Today
        </button>
        <button type="button" onClick={() => setPreset(6)}>
          Week
        </button>
        <button type="button" onClick={() => setPreset(29)}>
          Month
        </button>
        <button type="button" onClick={() => dispatch({ type: "SET_DATE_RANGE", range: null })}>
          Clear
        </button>
      </div>
      <div className="data-date-custom">
        <label>
          From{" "}
          <input
            type="date"
            value={filters.dateRange === null ? "" : dateInputValue(filters.dateRange.startMs)}
            onChange={(e) => {
              const startMs = parseDateInputValue(e.target.value);
              if (startMs === null) return;
              dispatch({
                type: "SET_DATE_RANGE",
                range: { startMs, endMs: filters.dateRange?.endMs ?? startMs },
              });
            }}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            value={filters.dateRange === null ? "" : dateInputValue(filters.dateRange.endMs)}
            onChange={(e) => {
              const endMs = parseDateInputValue(e.target.value);
              if (endMs === null) return;
              dispatch({
                type: "SET_DATE_RANGE",
                range: { startMs: filters.dateRange?.startMs ?? endMs, endMs },
              });
            }}
          />
        </label>
      </div>
    </fieldset>
  );
}

/** The Lap-time facet: a min/max minutes:seconds range (idl0's
 *  `_LapTimeSection`'s `RangeSlider`, as two mm:ss text pairs — the slider
 *  widget itself is not ported, per the brief's "port semantics, not the
 *  widget"). At wave 2 this keys off `SessionSummary.duration_ms`, the
 *  closest field a `SessionSummary` actually carries (R53 Data Q4). */
function LapTimeSection({ filters, dispatch }: { filters: DataFilters; dispatch: Dispatch<FilterAction> }) {
  function secondsOf(ms: number): number {
    return Math.floor(ms / 1000);
  }

  function setBound(bound: "startMs" | "endMs", totalSeconds: number) {
    const ms = Math.max(0, totalSeconds) * 1000;
    const current = filters.lapTimeMs ?? { startMs: 0, endMs: ms };
    dispatch({ type: "SET_LAP_TIME_RANGE", range: { ...current, [bound]: ms } });
  }

  return (
    <fieldset className="data-facet-group">
      <legend>Lap time</legend>
      <label>
        Min (s){" "}
        <input
          type="number"
          min={0}
          value={filters.lapTimeMs === null ? "" : secondsOf(filters.lapTimeMs.startMs)}
          onChange={(e) => setBound("startMs", Number(e.target.value))}
        />
      </label>
      <label>
        Max (s){" "}
        <input
          type="number"
          min={0}
          value={filters.lapTimeMs === null ? "" : secondsOf(filters.lapTimeMs.endMs)}
          onChange={(e) => setBound("endMs", Number(e.target.value))}
        />
      </label>
      {filters.lapTimeMs !== null ? (
        <button type="button" onClick={() => dispatch({ type: "SET_LAP_TIME_RANGE", range: null })}>
          Clear
        </button>
      ) : null}
    </fieldset>
  );
}

/** `.idl0 | .fit | .gpx | .csv` checkboxes — idl0's `_SourceFacet`, over C3's
 *  `source_format` vocabulary rather than idl0's `SessionSourceType` (the
 *  two are not the same enum — R53 Data Q2/plan Task 3 premise). */
const SOURCE_FORMATS: SessionSummary["source_format"][] = ["idl0", "fit", "gpx", "csv"];

function SourceSection({
  filters,
  counts,
  dispatch,
}: {
  filters: DataFilters;
  counts: FacetCounts;
  dispatch: Dispatch<FilterAction>;
}) {
  return (
    <fieldset className="data-facet-group">
      <legend>Source</legend>
      <ul>
        {SOURCE_FORMATS.map((source) => (
          <li key={source}>
            <label>
              <input
                type="checkbox"
                checked={filters.sources.has(source)}
                onChange={() => dispatch({ type: "TOGGLE_SOURCE", source })}
              />
              .{source} ({counts.sources.get(source) ?? 0})
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Props for [[FilterRail]]. */
export interface FilterRailProps {
  filters: DataFilters;
  /** Per-option match counts, computed by `facetCounts` over the currently
   *  loaded rows. */
  counts: FacetCounts;
  dispatch: Dispatch<FilterAction>;
}

/** The Data tab's filter rail: one facet group per row-affecting `DataFilters`
 *  field, in the order the brief names (date, bike, rider, tag, venue, lap
 *  time, source), plus a "Clear all" when any facet is active. Ported from
 *  idl0's `FilterRail` (semantics, not the widget tree) — see
 *  `docs/IDL0_SPEC.md` §24.4. Has-gates, has-GPS and Track are absent (R53
 *  Data Q2, R54) — there is no group for any of the three, stubbed or
 *  otherwise: a `SessionSummary` carries no track linkage, so a Track group
 *  could only ever exclude every row, which R54 rules is a trap rather than
 *  honest disclosure. Narrow-width presentation (bottom sheet, "FILTERS (n)"
 *  bar) is this component's own CSS/media-query concern; the markup here
 *  renders identically at every width and a stylesheet elsewhere narrows the
 *  chrome around it. */
export function FilterRail({ filters, counts, dispatch }: FilterRailProps) {
  return (
    <nav aria-label="Filters" className="data-filter-rail">
      <DateSection filters={filters} dispatch={dispatch} />
      <FacetGroup
        title="Bike"
        options={optionsFromCounts(counts.bikes)}
        selected={filters.bikes}
        onToggle={(bike) => dispatch({ type: "TOGGLE_BIKE", bike })}
      />
      <FacetGroup
        title="Rider"
        options={optionsFromCounts(counts.riders)}
        selected={filters.riders}
        onToggle={(rider) => dispatch({ type: "TOGGLE_RIDER", rider })}
      />
      <FacetGroup
        title="Tag"
        options={optionsFromCounts(counts.tags)}
        selected={filters.tags}
        onToggle={(tag) => dispatch({ type: "TOGGLE_TAG", tag })}
      />
      <FacetGroup
        title="Venue"
        options={optionsFromCounts(counts.venues)}
        selected={filters.venues}
        onToggle={(venue) => dispatch({ type: "TOGGLE_VENUE", venue })}
      />
      <LapTimeSection filters={filters} dispatch={dispatch} />
      <SourceSection filters={filters} counts={counts} dispatch={dispatch} />
      {activeCount(filters) > 0 ? (
        <button type="button" onClick={() => dispatch({ type: "CLEAR_ALL" })}>
          Clear all
        </button>
      ) : null}
    </nav>
  );
}
