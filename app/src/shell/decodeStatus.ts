import { useEffect, useState } from "react";

import { onDecodeProgress } from "../ipc/decode_progress";
import { applyDecodeProgress, decodeSummary, NO_DECODES, type DecodeProgressState, type DecodeSummary } from "../state/decodeProgress";

/**
 * The status bar's own subscription to `decode_progress` (C3 §3.2, ruling
 * R221 item 1(b)) — what the shell shows while the engine is reading
 * channels out of `data.parquet`.
 *
 * `null` means nothing slow is decoding, which is almost always: the engine
 * only reports a decode that has already been running about 200 ms, so the
 * chip appears for a session that is actually taking time and for nothing
 * else. Same shape as {@link useDeviceLink} and `ImportStatusChip`'s own
 * hook — the bar's items subscribe for themselves rather than being fed from
 * a page, since a decode can be started by any route.
 */
export function useDecodeStatus(): DecodeSummary | null {
  const [state, setState] = useState<DecodeProgressState>(NO_DECODES);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void onDecodeProgress((event) => setState((prev) => applyDecodeProgress(prev, event))).then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return decodeSummary(state);
}
