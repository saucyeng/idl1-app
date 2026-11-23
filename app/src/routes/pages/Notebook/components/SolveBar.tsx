import { useEffect, useRef, useState } from "react";

import { NoteBlock } from "@/components/brand/NoteBlock";

import { cancelSolvePhysics, isSolveCancelled, solvePhysics } from "../../../../ipc/physics";
import { solveBarText, solvedText, type SolveBarState } from "../model/physicsSolve";

/** Props for {@link SolveBar}. */
export interface SolveBarProps {
  /** The primary window's ride. */
  sessionId: string;
  /** The primary window's span, µs since the ride's first sample; `null` while unresolved. */
  span: { startUs: number; endUs: number } | null;
  /** Called after a solve finished, so the notebook evaluates again and reads the new channels. */
  onSolved: () => void;
}

const BUTTON = "shrink-0 rounded-[var(--radius-structural)] border border-rule px-2 py-1 font-mono text-label-2 text-fg-dim hover:text-fg disabled:opacity-50";

/**
 * The notebook's Solve bar (2026-11-23): runs the physics solver over the
 * selected window so travel, steer and flex exist there, with progress and
 * Cancel. Shown only when the workbook reads those channels (the caller
 * decides, `readsSolverChannels`). The solve runs in the engine; nothing here
 * waits on it while drawing (R201).
 */
export function SolveBar({ sessionId, span, onSolved }: SolveBarProps) {
  const [state, setState] = useState<SolveBarState>({ kind: "idle" });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
