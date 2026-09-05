import type { Dispatch } from "react";

import { formatDateMs, formatDurationMs } from "./format";
import type { DataFilters, FilterAction } from "./filters";

/** One dismissible chip: its label and the action that removes just that
 *  facet value. */
interface Chip {
  key: string;
  label: string;
  onDismiss: () => void;
}

/** `Date: <day>` when the range is a single day, else `Date: start → end` —
 *  idl0's `_ActiveChipRow._dateLabel`. */
function dateChipLabel(range: { startMs: number; endMs: number }): string {
  const start = formatDateMs(range.startMs);
  const end = formatDateMs(range.endMs);
  return start === end ? `Date: ${start}` : `Date: ${start} → ${end}`;
}

/** `Lap <mm:ss>–<mm:ss>` (or `h:mm:ss` past an hour) — idl0's
 *  `_ActiveChipRow._formatMs`, reusing `formatDurationMs` rather than a
 *  second clock formatter. */
function lapTimeChipLabel(range: { startMs: number; endMs: number }): string {
  return `Lap ${formatDurationMs(range.startMs)}–${formatDurationMs(range.endMs)}`;
}

/** Builds the ordered chip list for the currently active facets — one chip
 *  per active facet value, in the same section order `FilterRail` renders
 *  (idl0's `_ActiveChipRow`). No Track chips — there is no Track facet at
 *  wave 2 (R54). */
function buildChips(filters: DataFilters, dispatch: Dispatch<FilterAction>): Chip[] {
  const chips: Chip[] = [];

  if (filters.dateRange !== null) {
    const range = filters.dateRange;
    chips.push({
      key: "date",
      label: dateChipLabel(range),
      onDismiss: () => dispatch({ type: "SET_DATE_RANGE", range: null }),
    });
  }

  for (const bike of filters.bikes) {
    chips.push({
      key: `bike:${bike}`,
      label: `Bike: ${bike === "" ? "(none)" : bike}`,
      onDismiss: () => dispatch({ type: "TOGGLE_BIKE", bike }),
    });
  }

  for (const rider of filters.riders) {
    chips.push({
      key: `rider:${rider}`,
      label: `Rider: ${rider === "" ? "(none)" : rider}`,
      onDismiss: () => dispatch({ type: "TOGGLE_RIDER", rider }),
    });
  }

  for (const tag of filters.tags) {
    chips.push({
      key: `tag:${tag}`,
      label: `Tag: ${tag === "" ? "(none)" : tag}`,
      onDismiss: () => dispatch({ type: "TOGGLE_TAG", tag }),
    });
  }

  for (const venue of filters.venues) {
    chips.push({
      key: `venue:${venue}`,
      label: `Venue: ${venue === "" ? "(none)" : venue}`,
      onDismiss: () => dispatch({ type: "TOGGLE_VENUE", venue }),
    });
  }

  if (filters.lapTimeMs !== null) {
    const range = filters.lapTimeMs;
    chips.push({
      key: "lapTimeMs",
      label: lapTimeChipLabel(range),
      onDismiss: () => dispatch({ type: "SET_LAP_TIME_RANGE", range: null }),
    });
  }

  for (const source of filters.sources) {
    chips.push({
      key: `source:${source}`,
      label: `.${source}`,
      onDismiss: () => dispatch({ type: "TOGGLE_SOURCE", source }),
    });
  }

  if (filters.searchText !== "") {
    chips.push({
      key: "searchText",
      label: `"${filters.searchText}"`,
      onDismiss: () => dispatch({ type: "SET_SEARCH_TEXT", text: "" }),
    });
  }

  return chips;
}

/** Props for [[ActiveChips]]. */
export interface ActiveChipsProps {
  filters: DataFilters;
  dispatch: Dispatch<FilterAction>;
}

/** One dismissible chip per active facet value plus "Clear all" — idl0's
 *  `_ActiveChipRow` semantics, including the `mm:ss`-family lap-range label
 *  and the `start → end` date label. Renders nothing when no facet is
 *  active (the caller only mounts this row when `hasAnyActiveFilter`, same
 *  as idl0). "Clear all" resets every facet but leaves `view` and sort
 *  untouched (`CLEAR_ALL`). */
export function ActiveChips({ filters, dispatch }: ActiveChipsProps) {
  const chips = buildChips(filters, dispatch);
  if (chips.length === 0) return null;

  return (
    <div role="toolbar" aria-label="Active filters" className="data-active-chips">
      <ul>
        {chips.map((chip) => (
          <li key={chip.key}>
            <button type="button" onClick={chip.onDismiss}>
              {chip.label} ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => dispatch({ type: "CLEAR_ALL" })}>
        Clear all
      </button>
    </div>
  );
}
