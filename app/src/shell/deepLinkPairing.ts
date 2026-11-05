import { useEffect } from "react";
import { toast } from "sonner";

import { pairWithLink, type PeerStatus } from "../ipc/sync";

/** The first QR pairing link (`idl1://pair?…`) among `urls`, else null. */
export function pairLinkFrom(urls: readonly string[] | null | undefined): string | null {
  return (urls ?? []).find((u) => u.trim().toLowerCase().startsWith("idl1://pair")) ?? null;
}

/** The `name` a pairing link carries, for the toast, else null. */
export function linkName(link: string): string | null {
  const q = link.indexOf("?");
  if (q < 0) return null;
  const name = new URLSearchParams(link.slice(q + 1)).get("name");
  return name !== null && name.trim() !== "" ? name.trim() : null;
}

/** Links already handled this run: the plugin can report the launch link
 *  both from `getCurrent` and from an `onOpenUrl` event. */
const handled = new Set<string>();

/** What pairing from a QR link needs: only the pairing call, so nothing
 *  here can start a transfer. */
export interface PairFromLinkDeps {
  pairWithLink: (link: string) => Promise<PeerStatus>;
}

/**
 * Pairs with the computer a QR link names, and nothing else: no sync.
 * Until 2026-11-05 it synced everything both ways at once, which on a new
 * device can mean whole libraries (Isaac: "that should be off by default,
 * particularly for new devices"). The new device is stored with automatic
 * sync off on both sides; what moves is chosen in Settings → Sync → Browse.
 * Returns the toast's title and description.
 */
export async function pairFromLink(link: string, deps: PairFromLinkDeps): Promise<{ title: string; description: string }> {
  const who = linkName(link) ?? "the computer";
  const peer = await deps.pairWithLink(link);
  return {
    title: `Paired with ${peer.name || who}`,
    description: "Nothing was transferred. Choose what to copy in Settings → Sync → Browse.",
  };
}

/** {@link pairFromLink} once per link, said in toasts. */
async function pairOnce(link: string): Promise<void> {
  if (handled.has(link)) return;
  handled.add(link);
  const who = linkName(link) ?? "the computer";
  const id = toast.loading(`Pairing with ${who}…`);
  try {
    const { title, description } = await pairFromLink(link, { pairWithLink });
    toast.success(title, { id, description });
  } catch (e) {
    toast.error(`Couldn't pair with ${who}`, { id, description: String((e as { message?: string }).message ?? e) });
  }
}

/**
 * Handles QR pairing links (2026-10-16): the phone's camera opens the app
 * with `idl1://pair?…`, and the app pairs (and, since 2026-11-05, does not
 * sync: see {@link pairFromLink}). Covers both
 * an app launched by the link and one already running. A no-op where the
 * deep-link plugin isn't available (tests, a browser).
 */
export function useDeepLinkPairing(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let live = true;
    void (async () => {
      try {
        const plugin = await import("@tauri-apps/plugin-deep-link");
        const first = pairLinkFrom(await plugin.getCurrent());
        if (live && first !== null) void pairOnce(first);
        const stop = await plugin.onOpenUrl((urls) => {
          const link = pairLinkFrom(urls);
          if (link !== null) void pairOnce(link);
        });
        if (live) unlisten = stop;
        else stop();
      } catch {
        // No deep-link plugin here: nothing to listen for.
      }
    })();
    return () => {
      live = false;
      if (unlisten !== null) unlisten();
    };
  }, []);
}
