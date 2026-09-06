/**
 * One monotonic run-sequence counter per `js` cell, shared by every
 * channel-window run for that cell -- an initial bind
 * ({@link "./channelBindDriver".runChannelBind}) and a gesture-settle
 * refetch ({@link "./channelBindDriver".runChannelSettle}) alike (fix for
 * `review-task13c.md`'s Major: the two calling effects in `index.tsx`
 * previously carried their own, independent staleness guards --
 * `boundIdentityRef` for the initial bind, `settleSeqRef` for a settle --
 * so a slow initial fetch resolving after a faster settle would overwrite
 * the settle's fresher viewport/registry state with the stale initial-span
 * one, because the initial bind's guard had no way to know a settle had
 * superseded it).
 *
 * Every run -- regardless of which effect started it -- calls {@link start}
 * once, before its first `await`, and captures the returned sequence
 * number; its `isStale` callback (passed to `runChannelBind`/
 * `runChannelSettle`) is then just "is my sequence number still the latest
 * one this sequencer has handed out for this cell" ({@link isCurrent}). The
 * only thing that decides whether a *new* initial bind should start at all
 * remains `index.tsx`'s `boundIdentityRef` (an unrelated question: "has
 * this cell's binding identity changed" -- a data question that has
 * nothing to do with which run, once started, is allowed to write).
 */
export class CellRunSequencer {
  private readonly latest = new Map<string, number>();

  /**
   * Allocates and returns the next run sequence number for `cellId`,
   * immediately becoming the new "current" run for that cell -- every
   * sequence number handed out earlier for `cellId`, no matter which kind
   * of run it belonged to, is superseded from this call onward.
   */
  start(cellId: string): number {
    const next = (this.latest.get(cellId) ?? 0) + 1;
    this.latest.set(cellId, next);
    return next;
  }

  /**
   * True iff `seq` (previously returned by {@link start} for `cellId`) is
   * still the latest run started for that cell, i.e. no later {@link start}
   * call for the same `cellId` -- from either an initial bind or a settle
   * -- has happened since. False means this run has been superseded and
   * must drop every remaining dispatch.
   */
  isCurrent(cellId: string, seq: number): boolean {
    return this.latest.get(cellId) === seq;
  }

  /**
   * Forgets `cellId` entirely (the cell was removed from the document).
   * Any run still in flight for it reads {@link isCurrent} as `false`
   * afterward, since `undefined` never equals a real sequence number.
   */
  delete(cellId: string): void {
    this.latest.delete(cellId);
  }
}
