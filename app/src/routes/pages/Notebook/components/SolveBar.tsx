import { useEffect, useRef, useState } from "react";

import { NoteBlock } from "@/components/brand/NoteBlock";

import { cancelSolvePhysics, isSolveCancelled, solvePhysics } from "../../../../ipc/physics";
import { autoSolveOnSelect, solveIfNeeded } from "../model/autoSolve";
import { solveBarText, solvedText, type SolveBarState } from "../model/physicsSolve";

/** Props for {@link SolveBar}. */
export interface SolveBarProps {
  /** The primary window's ride. */
  sessionId: string;
  /** The primary window's span, µs since the ride's first sample; `null` while unresolved. */
  span: { startUs: number; endUs: number } | null;
  /** Called after a solve finished, so the notebook evaluates again and reads the new channels. */
  onSolved: () => void;
  /** Whether the window is a lap: "when I select a lap" solves laps only, never a whole ride
   *  (2026-11-23: the notebook reopening on a whole ride started a solve of all of it). */
  isLap: boolean;
}

const BUTTON = "shrink-0 rounded-[var(--radius-structural)] border border-rule px-2 py-1 font-mono text-label-2 text-fg-dim hover:text-fg disabled:opacity-50";

/**
 * The notebook's Solve bar (2026-11-23): runs the physics solver over the
 * selected window so travel, steer and flex exist there, with progress and
 * Cancel. Shown only when the workbook reads those channels (the caller
 * decides, `readsSolverChannels`). The solve runs in the engine; nothing here
 * waits on it while drawing (R201).
 */
export function SolveBar({ sessionId, span, onSolved, isLap }: SolveBarProps) {
  const [state, setState] = useState<SolveBarState>({ kind: "idle" });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // "Solve travel automatically: when I select a lap": once per window (the bar is keyed by it),
  // solve it unless it is already solved. Decided only once the span has held still for a second:
  // right after a lap is selected the span can still be the previous window's (the whole ride),
  // and an automatic solve of that is minutes of work nobody asked for (2026-11-23).
  const autoTried = useRef(false);
  useEffect(() => {
    if (!isLap || span === null || autoTried.current) return;
    const timer = setTimeout(() => {
    autoTried.current = true;
    void autoSolveOnSelect().then((on) => {
      if (!on || !mounted.current) return;
      setState({ kind: "solving", done: 0, total: null });
      solveIfNeeded(sessionId, span.startUs, span.endUs, (done, total) => {
        if (mounted.current) setState({ kind: "solving", done, total });
      })
        .then((solved) => {
          if (!mounted.current) return;
          setState(solved ? { kind: "done", text: "Solved this window automatically." } : { kind: "idle" });
          if (solved) onSolved();
        })
        .catch((error: unknown) => {
          if (!mounted.current) return;
          setState(isSolveCancelled(error) ? { kind: "idle" } : { kind: "failed", text: `Automatic solve failed: ${String((error as { message?: unknown })?.message ?? error)}` });
        });
    });
    }, 1000);
    return () => clearTimeout(timer);
  }, [sessionId, isLap, span?.startUs, span?.endUs]);

  const solve = () => {
    if (span === null) return;
    setState({ kind: "solving", done: 0, total: null });
    solvePhysics(sessionId, span.startUs, span.endUs, (p) => {
      if (mounted.current) setState({ kind: "solving", done: p.done, total: p.total ?? null });
    })
      .then((summary) => {
        if (!mounted.current) return;
        setState({ kind: "done", text: solvedText(summary) });
        onSolved();
      })
      .catch((error: unknown) => {
        if (!mounted.current) return;
        const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
        setState(isSolveCancelled(error) ? { kind: "idle" } : { kind: "failed", text: `Solve failed: ${message}` });
      });
  };

  const text = solveBarText(state);
  return (
    <NoteBlock role="status" className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">
        {text ?? "Travel, steer and flex come from the physics solver. Solve the selected window to see them (about 2 s of solving per second of riding)."}
      </span>
      <span className="flex shrink-0 gap-2">
        {state.kind === "solving" ? (
          <button type="button" className={BUTTON} onClick={() => void cancelSolvePhysics()}>
            Cancel
          </button>
        ) : (
          <button type="button" className={BUTTON} disabled={span === null} onClick={solve}>
            {state.kind === "done" ? "Solve again" : "Solve"}
          </button>
        )}
      </span>
    </NoteBlock>
  );
}
