import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

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
  },
}));
