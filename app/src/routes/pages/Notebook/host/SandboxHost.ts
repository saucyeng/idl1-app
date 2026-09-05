/**
 * The thin host-side object that owns one notebook's sandboxed `<iframe>`
 * (design §6). Not unit-tested (CLAUDE.md §4 — it renders/owns a live
 * `<iframe>`); the pure protocol validation and watchdog scheduling it
 * delegates to are tested in `protocol.test.ts`/`watchdog.test.ts`.
 */
import {
  channelPayload,
  evalInlineMessage,
  isHostMessage,
  layoutMessage,
  transformMessage,
  type HostToSandboxMessage,
  type HostVarPayload,
  type SandboxCell,
} from "./protocol";
import { OutboundQueue } from "./outboundQueue";
import { replayInitAndHostVars, replaySetCells } from "./rebuildReplay";
import { createWatchdog, type Watchdog } from "./watchdog";

/** One queued outbound message plus the transfer list it must be posted with. */
interface OutboundEnvelope {
  message: HostToSandboxMessage;
  transfer: Transferable[];
}

/**
 * The sandbox document's path, relative to the app's configured base URL
 * (`import.meta.env.BASE_URL`, default `/`). Resolves in both dev and build
 * because it names the *source-relative* path Vite mirrors into the build
 * output verbatim for HTML entries (confirmed empirically: a `vite build`
 * with this task's `vite.config.ts` `notebookSandbox` entry (R56) emits
 * `dist/src/routes/pages/Notebook/sandbox/index.html`, its `<script>` tag
 * already pointing at the hashed, fully-bundled `notebookSandbox-*.js`);
 * Vite's dev server serves the same path directly from disk. A `?url`/
 * `new URL(..., import.meta.url)` import of the `.ts` entry was tried and
 * does not work for this (see R56): it does not bundle bare-specifier
 * imports (`d3`, `@observablehq/*`), only a real second HTML entry does.
 */
const SANDBOX_PATH = "src/routes/pages/Notebook/sandbox/index.html";

/** Called once per completed `postMessage` round trip the host cares about. */
export interface SandboxHostCallbacks {
  /**
   * A cell finished and rendered inside the sandbox's own DOM (R69 item
   * (a)); `heightPx` is that cell's rendered container height, in CSS px,
   * for the host to size its own gesture-capturing frame
   * (`components/ChartCell.tsx`) to match. No HTML crosses this boundary —
   * the sandbox never hands the host a string to inject.
   */
  onCellRendered: (cellId: string, heightPx: number) => void;
  /** A cell threw; `message` is the error text. */
  onCellError: (cellId: string, message: string) => void;
  /** An inline `${…}` span resolved. */
  onInlineResult: (spanId: string, text: string) => void;
  /** An inline `${…}` span's evaluation threw (R66 item 2, distinct from `onCellError`). */
  onSpanError: (spanId: string, message: string) => void;
  /**
   * Called once per rebuild, after the new iframe's `init`/JSON-host-var
   * replay has been queued but before `setCells` (see `rebuild()`'s doc
   * comment — review-task5c.md Critical finding: calling this *before*
   * `init` would queue its `setHostVar` messages ahead of the message that
   * creates the sandbox's `SandboxRuntime`, and they would be silently
   * dropped by `sandbox/main.ts`'s no-op-before-`init` handler). A rebuilt
   * sandbox's channel host variables cannot be restored from a cached copy
   * the way JSON host variables can — the two `ArrayBuffer`s a prior
   * `setChannelHostVar` call transferred are detached once `postMessage`
   * moves them (review-task5b.md Major finding). The caller (the chart
   * layer, `model/channelRebind.ts`) already holds the decoded tiles
   * backing every bound channel in its `TileCache`, so re-deriving and
   * calling `setChannelHostVar` again for each one costs no IPC (P2, P7).
   */
  onChannelsInvalidated: () => void;
}

/**
 * Creates and owns one sandboxed iframe for one notebook. `container` is
 * the DOM element the iframe is appended into. The iframe is torn down and
 * rebuilt (state lost, per-notebook — design §6) whenever the watchdog
 * trips.
 */
export class SandboxHost {
  private iframe: HTMLIFrameElement;
  private readonly watchdog: Watchdog;
  private nextPingNonce = 0;
  /** Holds every outbound message for the current iframe generation until
   *  that generation's own `ready` arrives (review-task5b.md Critical
   *  finding — see `outboundQueue.ts`'s doc comment for the race this
   *  closes). */
  private readonly outboundQueue = new OutboundQueue<OutboundEnvelope>();
  /** The generation id `startGeneration()` returned for the current `iframe`. */
  private generation = 0;
  /** The last `init`/`setCells` payloads sent, replayed into a rebuilt
   *  iframe by `rebuild()` (`replayAfterRebuild`, review-task5.md Important
   *  finding: design §6's "state loss is the cost" means reactive state,
   *  not the notebook's own cells). */
  private lastInitRuntimeVersion: string | null = null;
  private lastCells: SandboxCell[] | null = null;
  /** Last-sent value of every JSON-kind host variable, replayed after a
   *  rebuild (`replayAfterRebuild`, review-task5b.md Major finding). Never
   *  holds a `{kind:"channel"}` payload — see {@link SandboxHostCallbacks.onChannelsInvalidated}. */
  private readonly lastJsonHostVars = new Map<string, unknown>();
  private readonly onMessage = (event: MessageEvent): void => {
    // The sandbox iframe is untrusted input (design §6, the brief's own
    // words: "the host treats every postMessage it receives as untrusted
    // input, exactly the way a server treats a request body"). Nothing
    // below this check may read `event.data`'s fields.
    if (event.source !== this.iframe.contentWindow || !isHostMessage(event.data)) {
      return;
    }

    const message = event.data;
    switch (message.type) {
      case "ready":
        // Sent unconditionally once the sandbox document has loaded and
        // attached its own message listener (`sandbox/main.ts`) — not
        // gated on `init` (review-task5b.md Critical finding). Flushes
        // this generation's queued outbound messages, `init` included.
        this.outboundQueue.markReady(this.generation, (envelope) =>
          this.iframe.contentWindow?.postMessage(envelope.message, "*", envelope.transfer)
        );
        break;
      case "pong":
        this.watchdog.onPong();
        break;
      case "cellRendered":
        this.callbacks.onCellRendered(message.cellId, message.heightPx);
        break;
      case "cellError":
        this.callbacks.onCellError(message.cellId, message.message);
        break;
      case "inlineResult":
        this.callbacks.onInlineResult(message.spanId, message.text);
        break;
      case "spanError":
        this.callbacks.onSpanError(message.spanId, message.message);
        break;
    }
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: SandboxHostCallbacks
  ) {
    this.watchdog = createWatchdog({
      now: () => Date.now(),
      send: () => this.postToSandbox({ type: "ping", nonce: this.nextPingNonce++ }),
      onStalled: () => this.rebuild(),
    });
    this.iframe = this.createIframe();
    window.addEventListener("message", this.onMessage);
  }

  /**
   * Builds the `<iframe sandbox="allow-scripts">`. `allow-same-origin` must
   * never be added here — without it, the iframe's realm has no access to
   * `window.__TAURI_INTERNALS__` even if cell code somehow reached for it;
   * this is the actual security boundary (design §6), not a convention.
   *
   * Sized to fill `container` exactly (R69 item (a)/(c)): `container`'s own
   * styling (`Notebook/index.tsx`) covers the viewport with
   * `pointer-events: none`, and every cell's rendered container inside this
   * iframe is positioned in that same coordinate space by `sendLayout` --
   * an iframe with no explicit size defaults to 300x150 CSS px, which would
   * make every `layoutMessage` rect land outside its own bounds.
   */
  private createIframe(): HTMLIFrameElement {
    this.generation = this.outboundQueue.startGeneration();
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.src = `${import.meta.env.BASE_URL}${SANDBOX_PATH}`;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    this.container.appendChild(iframe);
    return iframe;
  }

  /** Queues `message` (with `transfer`) until this iframe generation's
   *  `ready` arrives, per {@link outboundQueue}; sent immediately once it
   *  has. */
  private postToSandbox(message: HostToSandboxMessage, transfer: Transferable[] = []): void {
    this.outboundQueue.send({ message, transfer }, (envelope) =>
      this.iframe.contentWindow?.postMessage(envelope.message, "*", envelope.transfer)
    );
  }

  /** Sends `init`, queued until the sandbox's load-time `ready` (see `sandbox/main.ts`). */
  init(runtimeVersion: string): void {
    this.lastInitRuntimeVersion = runtimeVersion;
    this.postToSandbox({ type: "init", runtimeVersion });
  }

  /** Replaces the sandbox's whole cell set. */
  setCells(cells: SandboxCell[]): void {
    this.lastCells = cells;
    this.postToSandbox({ type: "setCells", cells });
  }

  /** Binds a plain JSON host variable (`laps`, `session`, `constants`, …);
   *  cached (when `value.kind === "json"`) so a rebuild can replay it. */
  setHostVar(name: string, value: HostVarPayload): void {
    if (value.kind === "json") {
      this.lastJsonHostVars.set(name, value.value);
    }
    this.postToSandbox({ type: "setHostVar", name, value });
  }

  /**
   * Binds a decoded channel as a host variable. The two buffers are moved
   * (not copied) via `postMessage`'s transfer list (P7); the caller must not
   * read `t`/`v` again after this call.
   */
  setChannelHostVar(name: string, length: number, t: ArrayBuffer, v: ArrayBuffer): void {
    const { message, transfer } = channelPayload(name, length, t, v);
    this.postToSandbox(message, transfer);
  }

  /**
   * Asks the sandbox to (re-)evaluate one inline `${…}` prose span (C2
   * §5.2, added Task 13). Not replayed after a rebuild the way
   * `init`/`setCells`/JSON host vars are (`rebuild()`'s doc comment) — an
   * inline result is derived, disposable state, not a thing the notebook
   * would visibly regress without; the caller (`Notebook/index.tsx`) simply
   * re-sends it on the next trigger, same as any other cell.
   */
  evalInline(spanId: string, expr: string): void {
    this.postToSandbox(evalInlineMessage(spanId, expr));
  }

  /**
   * Sends one gesture frame's CSS transform for cell `cellId` (R69 item
   * (b)) — `postMessage`, not IPC, and not replayed after a rebuild
   * (`rebuild()`'s doc comment): a live gesture's transform is derived,
   * disposable state, and a rebuilt sandbox starts every bound channel's
   * picture untransformed at its last-settled viewport, same as before a
   * gesture began.
   */
  sendTransform(cellId: string, translateXPx: number, scaleX: number): void {
    this.postToSandbox(transformMessage(cellId, translateXPx, scaleX));
  }

  /**
   * Sends cell `cellId`'s current on-screen rectangle (`getBoundingClientRect()`,
   * viewport px) so the sandbox can position that cell's own rendered
   * container to appear under the host's same-rect gesture frame
   * (`components/ChartCell.tsx`). Not replayed after a rebuild — the
   * caller re-sends layout once the rebuilt iframe's `ready` (and this
   * cell's next `cellRendered`) round-trips, the same way it did on first
   * mount.
   */
  sendLayout(cellId: string, rect: { top: number; left: number; width: number }): void {
    this.postToSandbox(layoutMessage(cellId, rect));
  }

  /**
   * Tears down the current iframe and builds a fresh one, then replays the
   * last `init`/JSON-host-var/channel/`setCells` payloads into it so the
   * notebook's cells, their JSON host variables, and their bound channels
   * survive a watchdog-triggered rebuild — only truly reactive/derived
   * state is lost, per design §6. Every message posted here (via
   * `postToSandbox`) is queued by `outboundQueue` until the new iframe's own
   * `ready` arrives (review-task5b.md Critical finding) — it does not need
   * to wait for that itself.
   *
   * Order is `init` → JSON host vars (`replayInitAndHostVars`) →
   * `onChannelsInvalidated()` → `setCells` (`replaySetCells`) —
   * **not** `onChannelsInvalidated()` first (review-task5c.md Critical
   * finding). Queuing through `outboundQueue` makes every message here
   * race-safe against the not-yet-`ready` iframe, but race-safety alone
   * does not make *processing order* safe: `sandbox/main.ts`'s
   * `setHostVar` handler (which both a JSON host var and a channel host
   * var — `onChannelsInvalidated`'s `setChannelHostVar` calls — go
   * through) is a documented no-op until `init` has run and created the
   * `SandboxRuntime`. Calling `onChannelsInvalidated()` before `init` is
   * queued would silently drop every channel-restoration message to that
   * no-op, exactly the failure this ordering avoids. `setCells` is placed
   * last (not between JSON vars and channels) so a cell's first
   * post-rebuild run sees its bound channels' real values already applied,
   * not the runtime's hard-coded channel default — the same reasoning
   * `replayInitAndHostVars`/`replaySetCells`'s doc comments give for JSON
   * host vars preceding `setCells`.
   */
  private rebuild(): void {
    this.postToSandbox({ type: "teardown" });
    this.iframe.remove();
    this.iframe = this.createIframe();
    const state = {
      lastInitRuntimeVersion: this.lastInitRuntimeVersion,
      lastCells: this.lastCells,
      lastJsonHostVars: this.lastJsonHostVars,
    };
    replayInitAndHostVars((message) => this.postToSandbox(message), state);
    this.callbacks.onChannelsInvalidated();
    replaySetCells((message) => this.postToSandbox(message), state);
  }

  /** Advances the watchdog's clock; call this from a real `setInterval` in the caller. */
  tick(nowMs: number): void {
    this.watchdog.tick(nowMs);
  }

  /** Tears down the iframe and stops listening. Call when the notebook closes. */
  dispose(): void {
    this.postToSandbox({ type: "teardown" });
    window.removeEventListener("message", this.onMessage);
    this.iframe.remove();
  }
}
