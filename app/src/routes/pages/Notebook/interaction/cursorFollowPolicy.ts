/**
 * Pure gesture-verb decision for the worksheet's shared cursor
 * (direction-2 decision 51; plan `runs/2026-09-08/w32-time-plan.md` Task
 * 2). Given the kind of pointer event and the cursor's current pinned
 * state, decides which one of `cursorBus.ts`'s four operations (or none)
 * applies -- `ChartCell.tsx`'s pointer handlers call this instead of
 * branching inline, so the decision is unit-tested independently of
 * rendering (CLAUDE.md §4: "test decision logic, not markup").
 *
 * The four rules, from decision 51/56 and R134 item 7:
 * - **hover, unpinned** -- moves the cursor (`publish`).
 * - **hover, pinned** -- never moves it (`nothing`); a pin freezes the
 *   cursor until explicitly released.
 * - **click, unpinned** -- pins the cursor at the click (`pin`).
 * - **click, pinned, at the same instant already pinned** -- releases it
 *   (`unpin`); clicking a *different* instant while pinned re-pins there
 *   (`pin`), i.e. the click always sets where the pointer is, and only
 *   toggles off when that place is already where the pin sits.
 *
 * No React, no DOM -- `pixelX`/`viewport` go in, a verb comes out; pixel→
 * time conversion reuses `model/cursor.ts`'s existing `cursorRequestFor` so
 * this module and the settle-time readout never disagree on the mapping.
 */
import { cursorRequestFor } from "../model/cursor";
import type { Viewport } from "../model/viewport";

/** The two pointer-event kinds this policy distinguishes. A drag is neither -- `ChartCell.tsx` never calls this policy while a pan/zoom-rect gesture owns the pointer. */
export type CursorFollowEvent = "hover" | "click";

/** The verb {@link cursorFollowPolicy} decided on -- the caller applies it to `cursorBus.ts`'s matching method (and, for `pin`/`unpin`, mirrors it into React state; see that module's own doc comment on why). */
export type CursorFollowVerb = { kind: "publish"; tUs: number | null } | { kind: "pin"; tUs: number } | { kind: "unpin" } | { kind: "nothing" };

/**
 * Decides the cursor verb for one pointer event.
 *
 * @param eventKind `"hover"` for a plain pointer move, `"click"` for a
 *   release that counted as a click (`ChartCell.tsx`'s own
 *   `CLICK_MAX_MOVEMENT_PX` gate runs before this is called).
 * @param pinned Whether the worksheet cursor is currently pinned --
 *   `cursorTUs !== null` at the caller (`Notebook/index.tsx`'s existing
 *   shared-cursor state; this policy does not read `cursorBus`'s own
 *   `pinned` field, so it stays correct even before the bus has been told
 *   about a pin from elsewhere, e.g. another chart's click).
 * @param pinnedTUs The currently pinned instant (µs), or `null` when
 *   unpinned -- only consulted for the click/same-place-unpins rule.
 * @param pixelX The pointer's CSS-px position in the chart's plotted area,
 *   or `null` when the pointer has left the chart entirely (a
 *   `pointerleave`, always treated as a hover event: `hover` with `pixelX:
 *   null` publishes `tUs: null`, hiding the follow cursor).
 * @param viewport The live viewport `pixelX` is measured against.
 */
export function cursorFollowPolicy(eventKind: CursorFollowEvent, pinned: boolean, pinnedTUs: number | null, pixelX: number | null, viewport: Viewport): CursorFollowVerb {
  const request = pixelX === null ? null : cursorRequestFor(viewport, pixelX, []);
  const tUs = request === null ? null : request.tUs;

  if (eventKind === "hover") {
    if (pinned) return { kind: "nothing" };
    return { kind: "publish", tUs };
  }

  // click
  if (tUs === null) return { kind: "nothing" };
  if (pinned && pinnedTUs === tUs) return { kind: "unpin" };
  return { kind: "pin", tUs };
}
