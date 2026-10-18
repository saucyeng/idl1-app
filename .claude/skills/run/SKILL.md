---
name: run
description: launch and drive the idl1 desktop app: screenshots, clicks, JS, console
---

# Run and drive idl1 (Windows desktop)

`tools/drive/drive.mjs` starts the **installed** idl1 (the nightly, not a dev build: no
cargo on this machine) with WebView2's DevTools port open, then attaches with
`playwright-core` over CDP. The app stays running between commands. Spec: video DRAFT §8.

## Setup (once per checkout)

    cd tools/drive && npm install        # playwright-core only, ~8 MB, no browser download

The nightly installs per-user to `%LOCALAPPDATA%\idl1\app.exe` (uninstall entry "idl1").
If it's missing, ask Isaac before installing it: `gh release download nightly -R saucyeng/idl1-app
-p "*windows-x64-setup.exe*"`, check the `.sha256`, run it with `/S`, then delete the installer.

## Commands

Before `launch`: `(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1MB` must be ≥ 2 (GB).
`launch` checks this and refuses below 2 unless you pass `--force`.

    node tools/drive/drive.mjs launch [--exe <path>] [--port 9333]
    node tools/drive/drive.mjs status
    node tools/drive/drive.mjs screenshot "$env:TEMP\idl1-home.png" [--full]
    node tools/drive/drive.mjs click Data            # visible text or aria-label ("Data (Ctrl+2)")
    node tools/drive/drive.mjs click "css=[aria-label^='Settings']"
    node tools/drive/drive.mjs type "[placeholder*='file.idl0']" "some text"
    node tools/drive/drive.mjs press Control+2
    node tools/drive/drive.mjs eval "document.title"  # JSON result; promises are awaited
    node tools/drive/drive.mjs console [--ms 1000] [--clear]
    node tools/drive/drive.mjs close                 # WM_CLOSE, forced after 5 s

- Read a screenshot back with the Read tool to see it.
- Targets: `css= text= role= xpath= # . [` or `>>` mean a Playwright selector; anything else
  is matched as text: exact role name, exact text, role-name substring, then text substring.
- How it works: `launch` sets `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`
  **on the spawned process only**. Never set it machine-wide and never compile it in. The port
  binds `127.0.0.1` (checked 2026-10-18). The state file `%TEMP%\idl1-drive.json` holds `{pid, port, exe}`.
- Run the commands from PowerShell. In the Bash tool, a command containing `eval` is refused by the
  worktree guard. In PowerShell, use single quotes inside the JS, because embedded `"` are mangled.

## Limits

- If idl1 is already open without the port, `launch` refuses: WebView2 would join that
  instance and ignore the port. Close it first.
- `console` shows only messages logged after drive attached. A hook (`window.__idl1DriveLog`)
  is installed at launch and on every command, and a page reload loses it. Startup logs are not
  captured.
- It drives your real data directory. Read-only navigation unless the task says otherwise: no
  imports, deletes or device connections.
- Not supported: Android. That comes later, through `adb forward tcp:<port>
  localabstract:webview_devtools_remote_<pid>`, and is only a note for now. Dev builds also
  aren't supported, though `--exe` accepts any idl1 exe.
- Video export check (§8 step 3): pull frames out of the MP4 with ffmpeg and Read them.
