import { useEffect } from "react";
import { toast } from "sonner";

import { pairWithLink, syncNow } from "../ipc/sync";
import { describeSyncResult } from "../routes/pages/Settings/syncState";

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

/** Pairs with the computer a QR link names, then syncs with it, saying
 *  what happens in toasts. */
async function pairAndSync(link: string): Promise<void> {
  if (handled.has(link)) return;
  handled.add(link);
  const who = linkName(link) ?? "the computer";
  const id = toast.loading(`Pairing with ${who}…`);
  try {
    const peer = await pairWithLink(link);
    toast.loading(`Paired with ${peer.name || who}. Syncing…`, { id });
    const result = await syncNow(peer.peer_id, () => {});
    toast.success(`Synced with ${peer.name || who}`, { id, description: describeSyncResult(result) });
  } catch (e) {
    toast.error(`Couldn't pair with ${who}`, { id, description: String((e as { message?: string }).message ?? e) });
  }
}

/**
 * Handles QR pairing links (2026-10-16): the phone's camera opens the app
 * with `idl1://pair?…`, and the app pairs and syncs at once. Covers both
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
        if (live && first !== null) void pairAndSync(first);
        const stop = await plugin.onOpenUrl((urls) => {
          const link = pairLinkFrom(urls);
          if (link !== null) void pairAndSync(link);
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
