/** Seconds left until `expiresAtMs`, never negative (the QR pairing
 *  panel's countdown). */
export function secondsLeft(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}
