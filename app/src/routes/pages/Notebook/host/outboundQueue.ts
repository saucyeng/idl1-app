/**
 * Pure "hold outbound sandbox messages until the iframe is ready" queue,
 * split out so it can be unit-tested without a live iframe (`SandboxHost`
 * itself is not unit-tested, CLAUDE.md §4).
 *
 * Fixes review-task5b.md's Critical finding: `SandboxHost.rebuild()`
 * previously posted `init`/`setCells` (via `replayAfterRebuild`)
 * synchronously, immediately after creating the new iframe — before that
 * iframe had navigated, run its module script, and attached its own
 * `message` listener. A `postMessage` delivered before that listener
 * exists is dropped, not queued for a listener that attaches later, so the
 * replay this fixed was, on real rebuild timing, very likely to be lost to
 * the exact race it was meant to close.
 *
 * Each iframe "generation" gets its own logical queue lifetime:
 * `startGeneration()` is called once per newly created iframe and returns
 * that generation's id; `markReady()` only flushes when passed the
 * *current* generation's id, so a `ready` message that arrives from a
 * torn-down previous iframe (still in flight in the event loop when a
 * second rebuild starts a third generation before the first one's `ready`
 * lands) can never flush into a newer generation's queue.
 */
export class OutboundQueue<Message> {
  private currentGeneration = 0;
  private ready = false;
  private readonly pending: Message[] = [];

  /**
   * Starts a new generation: discards any messages still queued for the
   * previous generation (they were addressed to an iframe that no longer
   * exists) and marks the queue not-ready until this generation's `ready`
   * arrives.
   *
   * @returns The new generation's id, to be passed back into
   *  {@link markReady} to authenticate that generation's `ready` message.
   */
  startGeneration(): number {
    this.currentGeneration += 1;
    this.ready = false;
    this.pending.length = 0;
    return this.currentGeneration;
  }

  /**
   * Sends `message` immediately via `sendNow` if the queue is already
   * ready for the current generation; otherwise holds it until
   * {@link markReady} flushes it, in the order `send` was called.
   */
  send(message: Message, sendNow: (message: Message) => void): void {
    if (this.ready) {
      sendNow(message);
    } else {
      this.pending.push(message);
    }
  }

  /**
   * Marks `generation` ready and flushes every message held for it, in
   * order, via `sendNow`. A no-op if `generation` is not the current
   * generation (a stale `ready`) or if this generation was already marked
   * ready (a duplicate `ready` cannot re-flush).
   */
  markReady(generation: number, sendNow: (message: Message) => void): void {
    if (generation !== this.currentGeneration || this.ready) {
      return;
    }
    this.ready = true;
    for (const message of this.pending) {
      sendNow(message);
    }
    this.pending.length = 0;
  }
}
