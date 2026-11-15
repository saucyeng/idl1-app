import { invoke } from "@tauri-apps/api/core";

import type { Window } from "./workbook";

/** `open_readout`'s return (C3 §3.7.1). */
export interface ReadoutHandle {
  /** u32, opaque; valid until closed or replaced. */
  handle: number;
  /** name -> unit label, null when unknown. */
  units: Record<string, string | null>;
  /** name -> exact [min, max] over the window, null with no finite sample. */
  extent: Record<string, [number, number] | null>;
}

/** `read_readout`'s optional tail (C3 §3.7.1). */
export interface ReadoutTail {
  /** Points back from the cursor, 1..=1024. */
  count: number;
  /** Spacing, µs, > 0 (one video frame). */
  step_us: number;
}

/** `read_readout`'s return (C3 §3.7.1). */
export interface ReadoutValues {
  /** µs, echoes the request. */
  t_us: number;
  /** name -> nearest recorded sample at t_us, null outside its span. */
  values: Record<string, number | null>;
  /** name -> [k-1] is the sample at t_us - k * step_us; present only when asked for. */
  tail?: Record<string, (number | null)[]>;
}

/** Resolves `names` once (a workbook definition, else a session channel)
 *  for per-frame reads (C3 §3.7.1). Settle-bound: on a change of names,
 *  primary window or evaluation, never per frame. */
export async function openReadout(workbookId: string, window: Window, names: string[]): Promise<ReadoutHandle> {
  return invoke<ReadoutHandle>("open_readout", { workbookId, window, names });
}

/** Reads every name of `handle` at `tUs` (µs on the primary window's
 *  session clock), with the tail when asked (C3 §3.7.1). Per frame: the
 *  caller never awaits it in a draw and keeps one call in flight, newest
 *  wins ("nothing on the interaction path waits on IPC"). */
export async function readReadout(handle: number, tUs: number, tail: ReadoutTail | null = null): Promise<ReadoutValues> {
  return invoke<ReadoutValues>("read_readout", { handle, tUs, tail });
}

/** Releases `handle` (C3 §3.7.1); an unknown handle is not an error. */
export async function closeReadout(handle: number): Promise<void> {
  await invoke<void>("close_readout", { handle });
}
