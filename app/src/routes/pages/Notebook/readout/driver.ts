/**
 * The per-frame readout loop (video overlay spec §7b, C3 §3.7.1), under
 * "nothing on the interaction path waits on IPC": the caller hands it every
 * cursor time and never awaits it; at most one `read_readout` is in flight,
 * and while one is, only the newest time asked for is kept and sent next.
 * An answer for a handle that has since been replaced is dropped. Pure: the
 * read and the sink are injected.
 */
import type { ReadoutTail, ReadoutValues } from "../../../../ipc/readout";

/** What {@link makeReadoutDriver} needs. */
export interface ReadoutDriverDeps {
  /** `ipc/readout.ts`'s `readReadout`, or a test double. */
  read(handle: number, tUs: number, tail: ReadoutTail | null): Promise<ReadoutValues>;
  /** Called with each answer that is still current. */
  onValues(values: ReadoutValues): void;
  /** Called when a read fails; the readouts keep their last values. */
  onError?(error: unknown): void;
}

/** The handle {@link makeReadoutDriver} returns. */
export interface ReadoutDriver {
  /** Points the loop at a new handle and tail (or none): drops what is queued. */
  setHandle(handle: number | null, tail: ReadoutTail | null): void;
  /** Asks for the readouts at `tUs` (µs); sent now, or after the read in flight. */
  request(tUs: number): void;
}

/** Builds the loop. */
export function makeReadoutDriver(deps: ReadoutDriverDeps): ReadoutDriver {
  let handle: number | null = null;
  let tail: ReadoutTail | null = null;
  let inFlight = false;
  let queued: number | null = null;

  const send = (tUs: number) => {
    if (handle === null) return;
    const asked = handle;
    inFlight = true;
    deps.read(asked, tUs, tail).then(
      (values) => {
        if (asked === handle) deps.onValues(values);
        finish();
      },
      (error) => {
        if (asked === handle) deps.onError?.(error);
        finish();
      }
    );
  };

  const finish = () => {
    inFlight = false;
    if (queued !== null) {
      const next = queued;
      queued = null;
      send(next);
    }
  };

  return {
    setHandle(next, nextTail) {
      handle = next;
      tail = nextTail;
      queued = null;
    },
    request(tUs) {
      if (handle === null) return;
      if (inFlight) queued = tUs;
      else send(tUs);
    },
  };
}
