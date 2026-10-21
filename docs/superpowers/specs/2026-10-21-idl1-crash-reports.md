# Local crash reports

Status: approved by Isaac 2026-10-21 ("perfect local crash reporting. add it
to the next build"). Spec-first.

## Why

The phone app crashed ~10 s into every search for a logger, and the only
way to see why was a USB cable and `adb logcat`. A report the app keeps
itself, and offers to send, makes the next crash a message instead of a
debugging session.

## Privacy

Nothing leaves the device unless the user taps **Share** (Android's share
sheet) or **Copy**. There is no server, no account, no telemetry, and so no
privacy policy to write. A report holds the app version, the platform, the
time, the thread, the panic message and location, and a backtrace — no
session data, no logger names, no locations.

## What is caught

| Source | How | File |
|---|---|---|
| A Rust panic, on any platform | `std::panic` hook, installed at startup; writes before the default hook runs (and before any abort) | `panic-<ms>.txt` |
| An uncaught Kotlin exception (Android) | `Thread.setDefaultUncaughtExceptionHandler`, chained to the previous handler | `kotlin-<ms>.txt` |
| Anything else that killed the app (Android 11+) | `ActivityManager.getHistoricalProcessExitReasons` at the next launch: `REASON_CRASH`, `REASON_CRASH_NATIVE`, `REASON_ANR` newer than the last one seen; skipped when a `panic-`/`kotlin-` report lies within 10 s of it (same crash) | `exit-<ms>.txt` |

`<ms>` is milliseconds since the Unix epoch. JavaScript errors are not
crashes (`GlobalErrorBanner` already shows them) and are not reported.

## Where

`<app data dir>/crash/` — the platform app-data directory, **not** `<data>`,
so reports survive a missing data root and never sync. A report the user
has dealt with moves to `crash/seen/`; nothing is deleted.

## IPC (C3 §3.13)

- `crash_reports() -> CrashReport[]` (async): reports in `crash/`, newest
  first, at most 10, each text capped at 64 KiB. On Android it first runs the
  exit-reason pass so a native crash from the last run is included.
  `CrashReport = { id: string, at_ms: number, text: string }`; `id` is the
  file name.
- `dismiss_crash_reports(ids: string[])` (async): moves those reports to
  `crash/seen/`. An id that is not a plain file name in `crash/` is
  `invalid_argument`.
- `share_crash_report(text: string)` (async, Android): opens the share sheet
  with the text. Elsewhere `unsupported_platform`; the desktop UI copies to
  the clipboard instead.

## UI

On launch, if `crash_reports()` returns anything, a banner sits above the
status bar (wide) or the tab bar (narrow): "idl1 closed unexpectedly last
time" with **Share** (Android) or **Copy** (desktop), and ×. Share or Copy
sends every pending report as one text; either, or ×, dismisses them.
