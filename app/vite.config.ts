import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAllowedOrigins, defineConfig, type IndexHtmlTransformHook, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src");

/** The Notebook sandbox's own Vite entry (this file's `build.rollupOptions.
 *  input.notebookSandbox`, R56) — not a React page (`sandbox/index.html`'s
 *  own doc comment: it is loaded only as an origin-isolated `<iframe
 *  sandbox="allow-scripts">`'s document, R69). Matched against
 *  `IndexHtmlTransformContext.filename` below, which is an absolute
 *  filesystem path — `endsWith` on the POSIX-slash suffix is
 *  separator-safe on Windows because `path.sep` never appears inside this
 *  literal suffix itself. */
const SANDBOX_HTML_SUFFIX = "src/routes/pages/Notebook/sandbox/index.html";

/**
 * Strips `@vitejs/plugin-react`'s dev-only React Fast Refresh preamble
 * `<script>` back out of the sandbox's own HTML entry, which is not a React
 * app (`sandbox/index.html` mounts `main.ts` directly, no JSX). The plugin
 * has no per-entry `include`/`exclude` for its `transformIndexHtml` hook
 * (only for the JS/TSX transform) — it injects the preamble into *every*
 * configured HTML input unconditionally in dev. Left in place, that
 * preamble is what broke the sandbox (2026-09-07, Isaac's WebView console):
 * the sandbox iframe's document has an opaque, `null` origin (R69 forbids
 * `allow-same-origin`), so the preamble's `import ... from "/@react-refresh"`
 * is a cross-origin module fetch from a `null` origin, which the dev
 * server's default CORS allowlist (`defaultAllowedOrigins`, below) does not
 * cover — the resulting failure took the whole sandbox document's module
 * graph down with it (`main.ts` failed for the identical reason; see the
 * `server.cors` change below for that half).
 *
 * This must intercept *before* Vite's own tag-injection step, not clean up
 * after: `transformIndexHtml` hooks that return tag descriptors (as
 * `@vitejs/plugin-react`'s does) are accumulated across every hook and
 * stringified into the page exactly once, at the end of Vite's own
 * `applyHtmlTransforms` — a later hook's returned *string* is not consulted
 * for its own tag list, and cannot remove tags an earlier hook already
 * queued. So this wraps each of `react()`'s own plugin objects'
 * `transformIndexHtml` hooks and short-circuits them for the sandbox path,
 * rather than post-processing the rendered HTML.
 *
 * Build is unaffected either way: `@vitejs/plugin-react` already never
 * injects the preamble outside `serve` (`calculateSkipFastRefresh` keys off
 * the Vite `command`, not `NODE_ENV`) — this wrapper is a no-op during
 * `vite build`, confirmed by reading `@vitejs/plugin-react`'s own source
 * rather than by building (this task has no cargo/Tauri access to smoke a
 * full `tauri build`; a `vite build` alone was run and produced the
 * expected output).
 */
function reactWithoutSandboxPreamble(): PluginOption[] {
  const plugins = react() as Plugin[];
  for (const plugin of plugins) {
    const hook = plugin.transformIndexHtml;
    if (hook === undefined) continue;
    const original = typeof hook === "function" ? hook : hook.handler;
    const guarded: IndexHtmlTransformHook = function (html, ctx) {
      if (ctx.filename.replaceAll(path.sep, "/").endsWith(SANDBOX_HTML_SUFFIX)) return undefined;
      return original.call(this, html, ctx);
    };
    plugin.transformIndexHtml = typeof hook === "function" ? guarded : { ...hook, handler: guarded };
  }
  return plugins;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [reactWithoutSandboxPreamble(), tailwindcss()],

  // shadcn's `@/*` import alias (docs/vendor/shadcn/vite.mdx, existing-project path)
  resolve: {
    alias: {
      "@": srcDir,
    },
  },

  // A second Vite entry for the Notebook's sandboxed iframe (design §6):
  // its own HTML page so Vite bundles `sandbox/main.ts`'s full module graph
  // (Runtime, Plot, d3, Inputs, htl all resolved) into a real, separately
  // loadable script — `?url`/bare `new URL(..., import.meta.url)` on a
  // TS entry do not resolve bare imports, only this multi-page form does
  // (R56).
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        notebookSandbox: "src/routes/pages/Notebook/sandbox/index.html",
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // 4. The Notebook sandbox's `<iframe sandbox="allow-scripts">` (R69,
    //    `host/SandboxHost.ts`) has an opaque origin — the browser sends
    //    `Origin: null` for its module-script fetches even though the URL
    //    itself is same-host (`http://localhost:1420/...`). Vite's own
    //    default `server.cors` allowlist (`defaultAllowedOrigins`) is a
    //    scheme+host+port regex that a literal `null` origin can never
    //    match, so every one of those fetches (`main.ts` and its whole
    //    module graph — Runtime, Plot, d3, Inputs, htl) got no
    //    `Access-Control-Allow-Origin` header and failed outright — this is
    //    the dev-only cause of the blank Notebook column Isaac hit
    //    (2026-09-07, confirmed from the WebView console: `ERR_FAILED` on
    //    `sandbox/main.ts` and on `/@react-refresh`, the latter fixed above
    //    by not injecting it into this entry at all). Adding the literal
    //    string `"null"` alongside Vite's own default keeps every other
    //    origin restriction exactly as strict as before — this only opens
    //    the door for the one opaque-origin request this app's own sandbox
    //    iframe deliberately makes (R69's opaque origin is unaffected: no
    //    `allow-same-origin` is added anywhere by this change, so the
    //    sandbox still cannot read `window.__TAURI_INTERNALS__` or its
    //    host's DOM — only the dev server's response headers changed).
    //    `server.cors` is a `vite dev`-only option; it does not exist in a
    //    `vite build`'s static output or apply to Tauri's own production
    //    asset responses, so this cannot change production behaviour
    //    either way.
    cors: { origin: [defaultAllowedOrigins, "null"] },
  },
}));
