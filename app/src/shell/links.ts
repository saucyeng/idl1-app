import { useSyncExternalStore } from "react";

import { linkKick, linkPair, linkWatch } from "../ipc/link";
import type { LinkView } from "../ipc/link";

/**
 * The app's view of its loggers' links (logger link design §4): the Rust
 * link actors own the links; this store only mirrors their `LinkView`
 * stream for the screens and keeps the list of paired loggers (the ones
 * the app wants connected), which survives restarts.
 */

/** The `localStorage` key for the paired list. */
const PAIRED_KEY = "idl1.pairedLoggers";

/** Paired logger ids from storage; empty when unreadable. */
export function readPaired(): string[] {
  try {
    const raw = window.localStorage.getItem(PAIRED_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writePaired(ids: string[]): void {
  try {
    window.localStorage.setItem(PAIRED_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: pairing still holds until the app restarts.
  }
}

/** `ids` with `id` added once, at the end. */
export function withPaired(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

/** `ids` without `id`. */
export function withoutPaired(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/** The store: views by device id, keyed in arrival order. */
let views: ReadonlyMap<string, LinkView> = new Map();
const listeners = new Set<() => void>();
let started = false;

/** Folds one view into `current`: replaces it, or removes a forgotten one. */
export function applyView(current: ReadonlyMap<string, LinkView>, view: LinkView): ReadonlyMap<string, LinkView> {
  const next = new Map(current);
  if (view.phase === "forgotten") next.delete(view.device_id);
  else next.set(view.device_id, view);
  return next;
}

function start(): void {
  if (started) return;
  started = true;
  void linkWatch((view) => {
    views = applyView(views, view);
    for (const l of listeners) l();
  }).catch(() => {
    started = false;
  });
  // Every paired logger is wanted from launch (Isaac, 2026-10-19).
  for (const id of readPaired()) void linkPair(id).catch(() => {});
  // Back in front: anything not connected tries now.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void linkKick().catch(() => {});
  });
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every logger's link, by device id. */
export function useLinks(): ReadonlyMap<string, LinkView> {
  return useSyncExternalStore(subscribe, () => views);
}

/** Pairs `deviceId`: remembered, and its actor started. */
export function pairLogger(deviceId: string): void {
  writePaired(withPaired(readPaired(), deviceId));
  void linkPair(deviceId).catch(() => {});
}

/** Forgets `deviceId` from the paired list (the caller stops its actor). */
export function unpairLogger(deviceId: string): void {
  writePaired(withoutPaired(readPaired(), deviceId));
}

/** Resolves with `deviceId`'s view once it is `ready`, or null after
 *  `timeoutMs`. */
export function waitForReady(deviceId: string, timeoutMs: number): Promise<LinkView | null> {
  start();
  return new Promise((resolve) => {
    const now = views.get(deviceId);
    if (now?.phase === "ready") {
      resolve(now);
      return;
    }
    const check = () => {
      const v = views.get(deviceId);
      if (v?.phase === "ready") {
        cleanup();
        resolve(v);
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
    function cleanup() {
      window.clearTimeout(timer);
      listeners.delete(check);
    }
    listeners.add(check);
  });
}
