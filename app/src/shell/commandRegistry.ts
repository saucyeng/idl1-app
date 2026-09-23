import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The shell-wide command registry the title bar's menus and the keyboard
 * shortcuts both resolve against (ruling R220 item 1: "the real commands
 * that exist today ... nothing invents a command that does not exist").
 *
 * Same publish/subscribe shape as `shell/toolbarSlot.ts` and its siblings,
 * and a sibling module for the same reason: a slot publishes a DOM node, a
 * registry publishes callables, and two concepts sharing a convention stay
 * two modules.
 *
 * A route registers the handlers it owns while it is mounted — `File ▸
 * Save workbook` is the Notebook page's own save, `File ▸ Import files` is
 * the Data page's own import — because those handlers close over state that
 * only lives in those pages (R109's rule). Nothing is registered on the
 * shell's behalf: a command with no registration renders disabled in its
 * menu, which is how "the command does not exist right now" is said out
 * loud rather than by an item that silently does nothing.
 *
 * Mount-and-hide (R93) means every route is mounted whether or not its tab
 * is active, so a registration is *not* a statement about visibility: the
 * Notebook page registers Save from the moment the app starts. Commands
 * that only make sense against an open document unregister themselves when
 * that document closes — {@link useCommand}'s `available` argument.
 */

/** `arg` is `workbook.openPath`'s one use (ruling R244/R249: a Recent-
 *  workbook row runs it with the catalog id to open) — every other handler
 *  in the registry takes none and ignores it. The smallest argument support
 *  that works: one optional string, not a typed-per-command payload. */
type Handler = (arg?: string) => void;

const handlers = new Map<string, Handler>();

/** Recomputed on every mutation so `useSyncExternalStore` can return it by
 *  reference — a fresh `Set` per `getSnapshot` call would re-render for
 *  ever. */
let snapshot: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();

function notify(): void {
  snapshot = new Set(handlers.keys());
  for (const listener of listeners) listener();
}

/** Registers `handler` under `id`, replacing any previous handler for it.
 *  Prefer {@link useCommand} from a component — this is the non-React entry
 *  point, and the one the hook is built on. */
export function registerCommand(id: string, handler: Handler): void {
  handlers.set(id, handler);
  notify();
}

/** Removes `id`'s handler, if `handler` is still the registered one. The
 *  identity test matters under React's `StrictMode` double-invoke, where a
 *  remount registers the new handler before the old effect's cleanup runs;
 *  an unconditional `delete` would drop the live registration. */
export function unregisterCommand(id: string, handler: Handler): void {
  if (handlers.get(id) !== handler) return;
  handlers.delete(id);
  notify();
}

/** Runs `id`'s handler, passing `arg` through (ignored by every handler but
 *  `workbook.openPath`'s). Returns whether one was registered — a caller
 *  that fired from a keyboard shortcut uses this to decide whether to
 *  consume the key press or let it through to the focused control. */
export function runCommand(id: string, arg?: string): boolean {
  const handler = handlers.get(id);
  if (handler === undefined) return false;
  handler(arg);
  return true;
}

/** The currently registered ids. Stable by reference between mutations. */
export function getRegisteredCommands(): ReadonlySet<string> {
  return snapshot;
}

/** Subscribes `handler` to registration changes. Returns an unsubscribe. */
export function subscribeCommands(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the registered command ids, re-rendering whenever one is
 *  added or removed. The menu bar's only subscription. */
export function useRegisteredCommands(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeCommands, getRegisteredCommands, getRegisteredCommands);
}

/**
 * Registers `handler` under `id` for as long as the calling component is
 * mounted and `available` is true.
 *
 * `handler` is read through a ref, so a caller may pass a fresh closure
 * every render (the usual case — it closes over that render's state)
 * without churning the registry and re-rendering every menu.
 *
 * @param id The command id, from `menuModel.ts`'s `MENU_COMMAND_IDS`.
 * @param available False while the command cannot run — no document open,
 *  a save already in flight. The entry then leaves the registry and its
 *  menu item greys out.
 * @param handler What the command does.
 */
export function useCommand(id: string, available: boolean, handler: Handler): void {
  // The "latest ref" pattern: the registry holds one stable callable for
  // the whole mount, which forwards to whatever closure the most recent
  // render produced. Without it, a handler closing over this render's
  // state would have to sit in the effect's dependency array — a function
  // prop, which the operating brief §4 rules out — and every keystroke in
  // the page would re-register the command and re-render the menu bar.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!available) return;
    const stable = (arg?: string) => latest.current(arg);
    registerCommand(id, stable);
    return () => unregisterCommand(id, stable);
  }, [id, available]);
}
