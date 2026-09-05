import { describe, expect, it } from "vitest";

import { activeCount, filtersReducer, hasAnyActiveFilter, initialFilters } from "./filters";
import { defaultAscendingFor } from "./sort";

describe("filtersReducer", () => {
  it("filtersReducer — TOGGLE_BIKE on an unselected value — adds it; toggling again — removes it", () => {
    const afterAdd = filtersReducer(initialFilters, { type: "TOGGLE_BIKE", bike: "SV650" });
    const afterRemove = filtersReducer(afterAdd, { type: "TOGGLE_BIKE", bike: "SV650" });

    expect(afterAdd.bikes.has("SV650")).toBe(true);
    expect(afterRemove.bikes.has("SV650")).toBe(false);
  });

  it("filtersReducer — CLEAR_ALL — returns exactly initialFilters, view and sort preserved", () => {
    const withFacets = filtersReducer(initialFilters, { type: "TOGGLE_BIKE", bike: "SV650" });
    const withSearch = filtersReducer(withFacets, { type: "SET_SEARCH_TEXT", text: "portland" });
    const withView = filtersReducer(withSearch, { type: "SET_VIEW", view: "tracks" });
    const withSort = filtersReducer(withView, { type: "SET_SORT_FIELD", field: "name" });

    const cleared = filtersReducer(withSort, { type: "CLEAR_ALL" });

    expect(cleared).toEqual({ ...initialFilters, view: "tracks", sortField: "name", sortAscending: true });
  });

  it("filtersReducer — SET_VIEW — leaves every row-affecting facet untouched", () => {
    const withFacets: typeof initialFilters = {
      ...initialFilters,
      bikes: new Set(["SV650"]),
      riders: new Set(["Isaac"]),
      searchText: "wet",
    };

    const afterViewChange = filtersReducer(withFacets, { type: "SET_VIEW", view: "tracks" });

    expect(afterViewChange.bikes).toEqual(new Set(["SV650"]));
    expect(afterViewChange.riders).toEqual(new Set(["Isaac"]));
    expect(afterViewChange.searchText).toBe("wet");
  });

  it("filtersReducer — SET_SORT_FIELD — direction resets to that field's default", () => {
    const withDescendingDate = { ...initialFilters, sortField: "date" as const, sortAscending: true };

    const afterFieldChange = filtersReducer(withDescendingDate, { type: "SET_SORT_FIELD", field: "bestLap" });

    expect(afterFieldChange.sortField).toBe("bestLap");
    expect(afterFieldChange.sortAscending).toBe(defaultAscendingFor("bestLap"));
  });

  it("filtersReducer — SET_VIEW to the same view — returns the identical state (no-op)", () => {
    const result = filtersReducer(initialFilters, { type: "SET_VIEW", view: initialFilters.view });

    expect(result).toBe(initialFilters);
  });

  it("filtersReducer — SET_VIEW to tracks with a field the tracks view still offers — direction is kept, not reset", () => {
    const withLapCountAscending = { ...initialFilters, sortField: "lapCount" as const, sortAscending: true };

    const afterViewChange = filtersReducer(withLapCountAscending, { type: "SET_VIEW", view: "tracks" });

    expect(afterViewChange.sortField).toBe("lapCount");
    expect(afterViewChange.sortAscending).toBe(true);
  });

  it("filtersReducer — every remaining toggle/set action — applies its own field only", () => {
    let state = initialFilters;
    state = filtersReducer(state, { type: "SET_DATE_RANGE", range: { startMs: 0, endMs: 1000 } });
    state = filtersReducer(state, { type: "TOGGLE_TRACK", trackId: "t1" });
    state = filtersReducer(state, { type: "TOGGLE_RIDER", rider: "Isaac" });
    state = filtersReducer(state, { type: "TOGGLE_TAG", tag: "Practice" });
    state = filtersReducer(state, { type: "TOGGLE_VENUE", venue: "Portland" });
    state = filtersReducer(state, { type: "TOGGLE_SOURCE", source: "fit" });
    state = filtersReducer(state, { type: "SET_LAP_TIME_RANGE", range: { startMs: 0, endMs: 60_000 } });
    state = filtersReducer(state, { type: "SET_SEARCH_TEXT", text: "wet" });
    const beforeToggleDirection = state.sortAscending;
    state = filtersReducer(state, { type: "TOGGLE_SORT_DIRECTION" });

    expect(state.dateRange).toEqual({ startMs: 0, endMs: 1000 });
    expect(state.trackIds.has("t1")).toBe(true);
    expect(state.riders.has("Isaac")).toBe(true);
    expect(state.tags.has("Practice")).toBe(true);
    expect(state.venues.has("Portland")).toBe(true);
    expect(state.sources.has("fit")).toBe(true);
    expect(state.lapTimeMs).toEqual({ startMs: 0, endMs: 60_000 });
    expect(state.searchText).toBe("wet");
    expect(state.sortAscending).toBe(!beforeToggleDirection);
  });
});

describe("activeCount", () => {
  it("activeCount — three facets active — counts three, ignoring view and sort", () => {
    const filters = {
      ...initialFilters,
      bikes: new Set(["SV650"]),
      riders: new Set(["Isaac"]),
      searchText: "wet",
      view: "tracks" as const,
      sortField: "name" as const,
      sortAscending: true,
    };

    expect(activeCount(filters)).toBe(3);
  });
});

describe("hasAnyActiveFilter", () => {
  it("hasAnyActiveFilter — only view and sort set — false", () => {
    const filters = { ...initialFilters, view: "tracks" as const, sortField: "name" as const, sortAscending: true };

    expect(hasAnyActiveFilter(filters)).toBe(false);
  });
});
