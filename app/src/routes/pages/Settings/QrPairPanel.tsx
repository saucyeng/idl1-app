import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Button } from "../../../components/ui/button";
import { pairingLink } from "../../../ipc/sync";
import type { PairingLink } from "../../../ipc/sync";
import { secondsLeft } from "./qrPair";

/**
 * "Pair a phone" with a QR code (2026-10-16, Isaac: click sync on the
 * computer, snap the QR with the phone). The code carries this computer's
 * id, name, LAN addresses and a one-time pairing code; the phone's camera
 * opens the app with it and the app pairs and syncs by itself. The six
 * digits are shown too, for typing by hand.
 */
export function QrPairPanel() {
  const [offer, setOffer] = useState<PairingLink | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (offer === null) return;
    const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [offer]);

  async function start(): Promise<void> {
    setError(null);
    try {
      const next = await pairingLink();
      setSvg(await QRCode.toString(next.link, { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
      setOffer(next);
      setNowMs(Date.now());
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    }
  }

  const left = offer === null ? 0 : secondsLeft(offer.expires_at_ms, nowMs);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Pair a phone</h3>
      {offer === null || left === 0 ? (
        <Button type="button" className="h-11 w-fit px-4" onClick={() => void start()}>
          {offer === null ? "Show pairing QR code" : "Code expired: show a new one"}
        </Button>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          {svg !== null && (
            // The SVG is generated here from this app's own link text, never
            // from outside input.
            <div className="size-56 shrink-0 bg-white p-1" aria-label="Pairing QR code" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
          )}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-fg">Scan it with the phone&apos;s camera and open the link in idl1.</p>
            <p className="font-mono text-2xl tracking-widest text-fg">{offer.code}</p>
            <p className="font-mono text-xs text-fg-dim">Expires in {left} s · {offer.addrs.join(", ")}</p>
          </div>
        </div>
      )}
      {error !== null && <p className="font-mono text-xs text-brand-accent">{error}</p>}
    </div>
  );
}
