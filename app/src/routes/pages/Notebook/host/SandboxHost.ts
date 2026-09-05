/**
 * The thin host-side object that owns one notebook's sandboxed `<iframe>`
 * (design §6). Not unit-tested (CLAUDE.md §4 — it renders/owns a live
 * `<iframe>`); the pure protocol validation and watchdog scheduling it
 * delegates to are tested in `protocol.test.ts`/`watchdog.test.ts`.
 */
import { channelPayload, isHostMessage, type HostToSandboxMessage, type HostVarPayload, type SandboxCell } from "./protocol";
import { replayAfterRebuild } from "./rebuildReplay";
import { createWatchdog, type Watchdog } from "./watchdog";

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
  /** A cell finished and rendered; `html` is the serialized result. */
  onCellResult: (cellId: string, html: string) => void;
  /** A cell threw; `message` is the error text. */
  onCellError: (cellId: string, message: string) => void;
  /** An inline `${…}` span resolved. */
  onInlineResult: (spanId: string, text: string) => void;
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
  /** The last `init`/`setCells` payloads sent, replayed into a rebuilt
   *  iframe by `rebuild()` (`replayAfterRebuild`, review-task5.md Important
   *  finding: design §6's "state loss is the cost" means reactive state,
   *  not the notebook's own cells). */
  private lastInitRuntimeVersion: string | null = null;
  private lastCells: SandboxCell[] | null = null;
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
        break;
      case "pong":
        this.watchdog.onPong();
        break;
      case "cellResult":
        this.callbacks.onCellResult(message.cellId, message.html);
        break;
      case "cellError":
        this.callbacks.onCellError(message.cellId, message.message);
        break;
      case "inlineResult":
        this.callbacks.onInlineResult(message.spanId, message.text);
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
   */
  private createIframe(): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.src = `${import.meta.env.BASE_URL}${SANDBOX_PATH}`;
    this.container.appendChild(iframe);
    return iframe;
  }

  private postToSandbox(message: HostToSandboxMessage, transfer: Transferable[] = []): void {
    this.iframe.contentWindow?.postMessage(message, "*", transfer);
  }

  /** Sends `init`; the sandbox replies `ready` once its own `Runtime` exists. */
  init(runtimeVersion: string): void {
    this.lastInitRuntimeVersion = runtimeVersion;
    this.postToSandbox({ type: "init", runtimeVersion });
  }

  /** Replaces the sandbox's whole cell set. */
  setCells(cells: SandboxCell[]): void {
    this.lastCells = cells;
    this.postToSandbox({ type: "setCells", cells });
  }

  /** Binds a plain JSON host variable (`laps`, `session`, `constants`, …). */
  setHostVar(name: string, value: HostVarPayload): void {
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
   * Tears down the current iframe and builds a fresh one, then replays the
   * last `init`/`setCells` payloads into it (`replayAfterRebuild`) so the
   * notebook's cells survive a watchdog-triggered rebuild — only reactive
   * variable state is lost, per design §6.
   */
  private rebuild(): void {
    this.postToSandbox({ type: "teardown" });
    this.iframe.remove();
    this.iframe = this.createIframe();
    replayAfterRebuild((message) => this.postToSandbox(message), {
      lastInitRuntimeVersion: this.lastInitRuntimeVersion,
      lastCells: this.lastCells,
    });
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
