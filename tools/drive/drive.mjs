#!/usr/bin/env node
// Dev-only tool: launch the installed idl1 desktop app with WebView2's DevTools
// port open, and drive it over CDP with playwright-core. Never shipped, never
// compiled in: the port is opened only through WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
// set on the launched process. Spec: docs/superpowers/specs/2026-10-16-idl1-video-DRAFT.md §8.
//
//   node tools/drive/drive.mjs <command> [args]   (see `help`)
//
// The app keeps running between commands; `launch` writes {pid, port, exe} to
// <os.tmpdir()>/idl1-drive.json and every other command reads it.

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Where `launch` records the running app: {pid, port, exe, startedAt}. */
const STATE_FILE = path.join(os.tmpdir(), "idl1-drive.json");
/** Default DevTools port (TCP). */
const DEFAULT_PORT = 9333;
/** How long `launch` waits for the DevTools endpoint, in ms. */
const LAUNCH_TIMEOUT_MS = 30_000;
/** Minimum free memory commit before launching, in GB (lane brief, R13). */
const MIN_FREE_COMMIT_GB = 2;
/** Default timeout for one page action, in ms. */
const ACTION_TIMEOUT_MS = 10_000;

const HELP = `idl1 drive — launch and drive the installed idl1 desktop app (dev only)

  launch [--exe <path>] [--port <n>] [--force]   start idl1 with DevTools on 127.0.0.1:<port> (default ${DEFAULT_PORT})
  status                                         print the state file, page URL and title
  screenshot [<file.png>] [--full]               save a PNG of the page (default: temp dir)
  eval <js>                                      evaluate an expression in the page, print the result as JSON
  click <target>                                 click a selector or visible text (see below)
  type <target> <text>                           fill an input with text
  press <key>                                    press a key on the page (e.g. Escape, Control+2)
  console [--ms <n>] [--clear]                   print console messages captured since attach
  close                                          close the app (WM_CLOSE, then force after 5 s)

A <target> that starts with css= text= role= xpath= # . [ or contains >> is a Playwright
selector. Anything else is visible text: an exact button/tab/link/menuitem name first,
then exact text, then a name substring (icon buttons: "Data" matches "Data (Ctrl+2)"),
then a text substring. The first visible match is used.

Exe lookup: --exe, then $IDL1_EXE, then the uninstall registry entry, then the usual
install folders. State file: ${STATE_FILE}`;

// ---- small helpers --------------------------------------------------------

/** Typed failure for the CLI: printed as `error: <message>`, exit code 1. */
class DriveError extends Error {}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && ["exe", "port", "ms"].includes(key)) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpVersion(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Free memory commit in GB (Windows only; null elsewhere or on failure). */
function freeCommitGb() {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"],
      { encoding: "utf8" },
    );
    return Number(out.trim()) / 1024 / 1024; // KB -> GB
  } catch {
    return null;
  }
}

// ---- finding the installed exe -------------------------------------------

function regQuery(args) {
  try {
    return execFileSync("reg", ["query", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** Candidate exe paths from the uninstall registry entries whose DisplayName mentions idl1. */
function exesFromRegistry() {
  const roots = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ];
  const found = [];
  for (const root of roots) {
    const keys = regQuery([root, "/s", "/f", "idl1", "/d"])
      .split(/\r?\n/)
      .filter((l) => l.startsWith("HKEY_"));
    for (const key of keys) {
      for (const value of ["DisplayIcon", "InstallLocation"]) {
        const m = regQuery([key, "/v", value]).match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
        if (!m) continue;
        let p = m[1].trim().replace(/^"|"$/g, "").replace(/,\d+$/, "");
        if (value === "InstallLocation") {
          p = p.replace(/^"|"$/g, "");
          found.push(path.join(p, "idl1.exe"), path.join(p, "app.exe"));
        } else {
          found.push(p);
        }
      }
    }
  }
  return found;
}

function findExe(flagExe) {
  if (flagExe) return flagExe;
  if (process.env.IDL1_EXE) return process.env.IDL1_EXE;
  const local = process.env.LOCALAPPDATA ?? "";
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const candidates = [
    ...exesFromRegistry(),
    ...[path.join(local, "idl1"), path.join(local, "Programs", "idl1"), path.join(pf, "idl1")].flatMap((d) => [
      path.join(d, "idl1.exe"),
      path.join(d, "app.exe"),
    ]),
  ];
  const hit = candidates.find((p) => p.toLowerCase().endsWith(".exe") && fs.existsSync(p));
  if (!hit) {
    throw new DriveError(
      "idl1 is not installed (no uninstall entry, nothing in the usual folders). Install the nightly, or pass --exe / set IDL1_EXE.",
    );
  }
  return hit;
}

/** PIDs of running processes with this image name (Windows). */
function runningPids(exe) {
  if (process.platform !== "win32") return [];
  const image = path.basename(exe);
  try {
    const out = execFileSync("tasklist", ["/FI", `IMAGENAME eq ${image}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
    return out
      .split(/\r?\n/)
      .map((l) => l.split('","'))
      .filter((cols) => cols.length > 1 && cols[0].replace(/"/g, "").toLowerCase() === image.toLowerCase())
      .map((cols) => Number(cols[1]));
  } catch {
    return [];
  }
}

// ---- attaching ------------------------------------------------------------

async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    throw new DriveError("playwright-core is missing: run `npm install` in tools/drive first.");
  }
}

/** Wraps console.* and error events into window.__idl1DriveLog (idempotent; lost on reload). */
function installConsoleHook() {
  if (window.__idl1DriveLog) return;
  const log = (window.__idl1DriveLog = []);
  const push = (level, args) => {
    const text = args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return a.stack || String(a);
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(" ");
    log.push({ t: new Date().toISOString(), level, text });
    if (log.length > 1000) log.shift();
  };
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const orig = console[level].bind(console);
    console[level] = (...args) => { push(level, args); orig(...args); };
  }
  window.addEventListener("error", (e) => push("pageerror", [e.error ?? e.message]));
  window.addEventListener("unhandledrejection", (e) => push("pageerror", ["unhandled rejection:", e.reason]));
}

async function attach() {
  const state = readState();
  if (!state || !pidAlive(state.pid)) throw new DriveError("idl1 is not running under drive: run `launch` first.");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`);
  const pages = browser.contexts().flatMap((c) => c.pages()).filter((p) => !p.url().startsWith("devtools://"));
  if (pages.length === 0) throw new DriveError("connected, but the app has no page yet.");
  const page = pages[0];
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  await page.evaluate(installConsoleHook).catch(() => {});
  return { browser, page, state };
}

/** A target in Playwright selector syntax; anything else is matched as visible text. */
const SELECTOR_RE = /^(css|text|role|xpath|id|data-testid|internal:[\w-]+)=|^[#.[]|^\/\/|>>/;

async function resolveTarget(page, target) {
  const tries = SELECTOR_RE.test(target)
    ? [page.locator(target)]
    : [
        ...["button", "tab", "link", "menuitem"].map((role) => page.getByRole(role, { name: target, exact: true })),
        page.getByText(target, { exact: true }),
        // Icon buttons carry their name in aria-label, e.g. "Data (Ctrl+2)".
        ...["button", "tab", "link", "menuitem"].map((role) => page.getByRole(role, { name: target })),
        page.getByText(target),
      ];
  for (const loc of tries) {
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      if (await loc.nth(i).isVisible()) return loc.nth(i);
    }
  }
  throw new DriveError(`no visible element matches ${JSON.stringify(target)}`);
}

// ---- commands -------------------------------------------------------------

async function cmdLaunch(flags) {
  const port = Number(flags.port ?? DEFAULT_PORT);
  const existing = readState();
  if (existing && pidAlive(existing.pid) && (await cdpVersion(existing.port))) {
    console.log(`already running: pid ${existing.pid}, port ${existing.port}`);
    return;
  }
  const exe = findExe(flags.exe);
  const others = runningPids(exe);
  if (others.length > 0) {
    throw new DriveError(
      `${path.basename(exe)} is already running (pid ${others.join(", ")}) without the DevTools port; ` +
        "WebView2 would join that instance and ignore the port. Close it first.",
    );
  }
  const gb = freeCommitGb();
  if (gb !== null && gb < MIN_FREE_COMMIT_GB && !flags.force) {
    throw new DriveError(`only ${gb.toFixed(2)} GB memory commit free (< ${MIN_FREE_COMMIT_GB}); pass --force to launch anyway.`);
  }
  if (await cdpVersion(port)) throw new DriveError(`port ${port} already serves DevTools for something else; pass --port.`);

  const child = spawn(exe, [], {
    cwd: path.dirname(exe),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  });
  child.unref();
  const state = { pid: child.pid, port, exe, startedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  let version = null;
  while (Date.now() < deadline && !(version = await cdpVersion(port))) {
    if (!pidAlive(child.pid)) throw new DriveError(`idl1 exited during launch (pid ${child.pid}).`);
    await sleep(250);
  }
  if (!version) throw new DriveError(`DevTools did not answer on 127.0.0.1:${port} within ${LAUNCH_TIMEOUT_MS / 1000} s.`);

  const { browser, page } = await attach();
  await page.waitForLoadState("load").catch(() => {});
  console.log(`launched ${exe}\npid ${child.pid}, DevTools 127.0.0.1:${port} (${version.Browser})\npage ${page.url()}`);
  await browser.close();
}

async function cmdStatus() {
  const state = readState();
  if (!state) return console.log("not launched (no state file)");
  const alive = pidAlive(state.pid);
  console.log(JSON.stringify({ ...state, alive, stateFile: STATE_FILE }, null, 2));
  if (!alive) return;
  const { browser, page } = await attach();
  console.log(`page ${page.url()} — ${await page.title()}`);
  await browser.close();
}

async function cmdScreenshot(file, flags) {
  const out = path.resolve(file ?? path.join(os.tmpdir(), `idl1-${Date.now()}.png`));
  const { browser, page } = await attach();
  await page.screenshot({ path: out, fullPage: Boolean(flags.full) });
  console.log(out);
  await browser.close();
}

async function cmdEval(js) {
  if (!js) throw new DriveError("eval needs an expression");
  const { browser, page } = await attach();
  const result = await page.evaluate(js);
  console.log(result === undefined ? "undefined" : JSON.stringify(result, null, 2));
  await browser.close();
}

async function cmdClick(target) {
  if (!target) throw new DriveError("click needs a target");
  const { browser, page } = await attach();
  await (await resolveTarget(page, target)).click();
  console.log(`clicked ${JSON.stringify(target)}`);
  await browser.close();
}

async function cmdType(target, text) {
  if (!target || text === undefined) throw new DriveError("type needs a target and text");
  const { browser, page } = await attach();
  await (await resolveTarget(page, target)).fill(text);
  console.log(`typed into ${JSON.stringify(target)}`);
  await browser.close();
}

async function cmdPress(key) {
  if (!key) throw new DriveError("press needs a key");
  const { browser, page } = await attach();
  await page.keyboard.press(key);
  console.log(`pressed ${key}`);
  await browser.close();
}

async function cmdConsole(flags) {
  const { browser, page } = await attach();
  const live = [];
  page.on("console", (m) => live.push({ level: m.type(), text: m.text() }));
  page.on("pageerror", (e) => live.push({ level: "pageerror", text: String(e) }));
  await sleep(Number(flags.ms ?? 1000));
  const hooked = await page.evaluate(() => window.__idl1DriveLog ?? []);
  const seen = new Set(hooked.map((m) => m.text));
  for (const m of hooked) console.log(`${m.t} [${m.level}] ${m.text}`);
  for (const m of live) if (!seen.has(m.text)) console.log(`[cdp ${m.level}] ${m.text}`);
  if (hooked.length === 0 && live.length === 0) console.log("(no console messages captured)");
  if (flags.clear) await page.evaluate(() => { window.__idl1DriveLog.length = 0; });
  await browser.close();
}

async function cmdClose() {
  const state = readState();
  if (!state || !pidAlive(state.pid)) {
    fs.rmSync(STATE_FILE, { force: true });
    return console.log("not running");
  }
  const kill = (force) => {
    try {
      // Graceful = WM_CLOSE to the app window only; with /T taskkill also targets the
      // windowless WebView2 children and the app never closes (seen 2026-10-18).
      execFileSync("taskkill", ["/PID", String(state.pid), ...(force ? ["/T", "/F"] : [])], { stdio: "ignore" });
    } catch {}
  };
  kill(false);
  for (let i = 0; i < 20 && pidAlive(state.pid); i++) await sleep(250);
  const forced = pidAlive(state.pid);
  if (forced) kill(true);
  fs.rmSync(STATE_FILE, { force: true });
  console.log(`closed pid ${state.pid}${forced ? " (forced)" : ""}`);
}

// ---- main -----------------------------------------------------------------

const { positional, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = positional;
const commands = {
  launch: () => cmdLaunch(flags),
  status: () => cmdStatus(),
  screenshot: () => cmdScreenshot(rest[0], flags),
  eval: () => cmdEval(rest.join(" ")),
  click: () => cmdClick(rest.join(" ")),
  type: () => cmdType(rest[0], rest.slice(1).join(" ")),
  press: () => cmdPress(rest[0]),
  console: () => cmdConsole(flags),
  close: () => cmdClose(),
};

if (!command || command === "help" || !commands[command]) {
  console.log(HELP);
  process.exit(command && command !== "help" ? 1 : 0);
}
try {
  await commands[command]();
  process.exit(0);
} catch (e) {
  console.error(`error: ${e instanceof DriveError ? e.message : e?.stack ?? e}`);
  process.exit(1);
}
