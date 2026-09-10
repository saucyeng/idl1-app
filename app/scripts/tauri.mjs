// Wrapper for the Tauri CLI that makes `dev` impossible to run against the
// real library (ruling R196).
//
// Tauri derives `app_data_dir()` from the bundle identifier, so a `tauri dev`
// with the release config opens, writes to and can delete from the same
// `%APPDATA%\com.saucyeng.idl1` folder a shipped build uses — the finding
// that opened `runs/2026-09-10/DELETE-AUDIT.md`. `tauri.dev.conf.json` is a
// `--config` overlay carrying the dev identifier.
//
// A `"tauri:dev"` npm script alone would have left `npm run tauri dev`
// unprotected, which is exactly the command a developer who has not read
// `docs/CI.md` types. Routing the plain `tauri` script through here means the
// overlay is added whichever way dev is started. Every other subcommand,
// `build` included, is passed through untouched, so release bundles are
// unaffected.

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const DEV_OVERLAY = ["--config", "src-tauri/tauri.dev.conf.json"];

// Only a dev subcommand — `tauri dev`, and `tauri android dev` / `tauri ios
// dev`, which have the same hazard — and only when the caller has not
// already passed a config of their own: an explicit `--config` is a
// deliberate choice and must not be silently doubled.
const devAt = args[0] === "dev" ? 1 : (args[0] === "android" || args[0] === "ios") && args[1] === "dev" ? 2 : 0;
const hasOwnConfig = args.includes("--config") || args.includes("-c");
const finalArgs =
  devAt > 0 && !hasOwnConfig ? [...args.slice(0, devAt), ...DEV_OVERLAY, ...args.slice(devAt)] : args;

const child = spawn("tauri", finalArgs, { stdio: "inherit", shell: true });
child.on("exit", (code, signal) => {
  process.exit(signal !== null ? 1 : (code ?? 0));
});
