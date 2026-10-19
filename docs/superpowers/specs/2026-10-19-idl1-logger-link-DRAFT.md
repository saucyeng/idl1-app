# idl1 — Logger link: one owner, intent, events (DRAFT)

Status: DRAFT for Isaac's review, 2026-10-19. Spec-first: nothing below is
built until the open decisions (§9) are answered. Replaces the app's current
connection handling (Logger screen reducer, status poll, `reconnectAfterRestart`,
`shell/loggerLink.ts`, the OTA reconnect loop, `device_status`'s ad-hoc link)
and amends SPEC §6, §7.2, §10.4 and C3 §3.8 when built.

## 1. Why

The field runs of 2026-10-16 showed every failure came from the seams between
pieces that each own part of the link:

| Symptom | Seam |
|---|---|
| 35 s to reconnect after a download | The 1 Hz status read opened and closed its own Bluetooth link while the reconnect built another; on Android closing one tore down the other. |
| Screen showed "logging" / "WiFi on" after the logger rebooted | Connection state lives in the Logger screen's memory; status is polled, so a dead link shows the last answer. |
| Firmware update stuck on "attempt 1" | The OTA flow has its own reconnect loop with no shared notion of "the logger is gone". |
| Leaving and re-entering the Logger tab re-ran auto-download | The screen's state resets on every mount; Rust's real link does not. |
| Record during a download took 35 s | Record had to wait for the screen's reconnect, which waited for imports. |

Two sources of truth (Rust holds the link; the screen holds a copy of what it
thinks the link is) plus three loops (poll, reconnect, handoff) that don't
know about each other. Fixing each seam one by one is what muddied it.

## 2. What "seamless" means here (the AirPods bar)

AirPods feel instant because of four properties, all of which apply:

1. **The pairing is the relationship.** After the first pair you never press
   "connect". The phone always *wants* its device and connects whenever it can.
2. **One owner.** The OS owns the link; apps observe it. Nothing else races it.
3. **Events, not polling.** The phone learns of a disconnect from the radio
   (supervision timeout), not from a missed poll; the accessory pushes state.
4. **The accessory makes itself easy to find when it expects the phone.** It
   advertises fast right after any event that broke the link (case opened, ear
   in), and slowly otherwise to save battery.

## 3. Principles

- **P1 — One owner per logger.** A single Rust task (the *link actor*) owns the
  Bluetooth link, the WiFi session and every operation on that logger. No other
  code opens a radio link. The UI holds no connection state; it renders the
  actor's state stream.
- **P2 — Intent, not commands.** The UI sets intent: *want this logger
  connected*, *want it recording*, *want these files*. The actor reconciles
  actual toward intent. Reconnecting is not a special path: it is what
  reconciliation does whenever intent is "connected" and the link isn't.
- **P3 — Events, not polling.** Status arrives by notification (the logger
  already publishes at 1 Hz and on every change). Link loss is the radio's
  disconnect event. Nothing reads status on a timer.
- **P4 — Each side returns to Bluetooth on its own.** Either end, alone, gets
  back to "advertising / seeking" within seconds of WiFi ending for any reason:
  done, cancelled, error, phone walked away, app killed.
- **P5 — Record preempts everything, from any state.**
- **P6 — Fail toward Bluetooth.** Any error in a WiFi session ends the session;
  any error on the Bluetooth link drops to *Seeking*. There is no stuck state:
  every state has a timeout that leads back to Seeking.

## 4. Link actor states (app side)

```
            ┌──────────── forget ─────────────┐
            ▼                                 │
        [Idle] ── want connected ──► [Seeking] ◄──────────────┐
                                        │   ▲                  │
                         advert seen /  │   │ link lost        │
                         pending connect│   │ (radio event)    │
                                        ▼   │                  │
                                   [Connecting]                │
                                        │                      │
                       GATT up, MTU, subscribed to status      │
                                        ▼                      │
                                     [Ready] ──────────────────┤
                                        │  ▲                   │
                        WiFi job queued │  │ BLE back          │
                                        ▼  │                   │
                               [WiFi: Requesting]              │
                                        │ AP joined, /ping ok  │
                                        ▼                      │
                               [WiFi: Linked]  (BLE still up)  │
                                        │ /handoff accepted    │
                                        ▼                      │
                               [WiFi: Handed off] ── jobs ─┐   │
                                        │                  │   │
                     done / cancel / error / WiFi lost     │   │
                                        ▼                  │   │
                                    [Returning] ───────────┴───┘
```

| State | Entered when | Leaves to | Timeout → |
|---|---|---|---|
| Idle | No intent (user disconnected, never paired) | Seeking on "want connected" | — |
| Seeking | Intent is "connected", no link | Connecting when the logger is seen | none: waits at no cost (see §6) |
| Connecting | Advert seen or pending connect fires | Ready; Seeking on failure | 10 s → Seeking |
| Ready | Link up and subscribed to status | WiFi: Requesting on a job; Seeking on link loss | — |
| WiFi: Requesting | `CMD_WIFI_ON` sent | Linked; Returning on failure | 45 s (Android's approval dialog the first time) → Returning |
| WiFi: Linked | AP joined and `/ping` answered | Handed off; jobs run here if the logger refuses the handoff | — |
| WiFi: Handed off | `/handoff` accepted, logger dropped BLE | Returning when the jobs end, fail, are cancelled, or WiFi drops | no bytes for 20 s → Returning |
| Returning | WiFi session over (any cause) | Ready | 0.5 s, then a pending connect; 10 s fast phase → Seeking |

Every state but Idle/Seeking/Ready has a timeout, and every timeout leads back
toward Seeking. Nothing waits forever except Seeking, which costs nothing.

**What the UI sees** — one stream per logger, sent on every change:

```
LinkView {
  phase:   idle | seeking | connecting | ready | wifi_requesting | wifi_linked | handed_off | returning
  status:  last DeviceStatus, with `as_of` (ms) — rendered dim with "last seen 12 s ago" unless phase = ready
  job:     null | { kind: download | firmware | config, file, done_bytes, total_bytes, files_done, files_total }
  pending: null | "record" | "stop" | "power_off"   — intent not yet carried out
  error:   null | the last failure, typed (C3 shape)
}
```

The Logger screen, the Data tab's download list, the firmware sheet and the
ride form all read this one stream. None of them keeps its own copy.

## 5. Operations (intent → actor)

| UI asks | In Ready | In a WiFi state | In Seeking / Returning |
|---|---|---|---|
| Record | `CMD_START_LOGGING` | `POST /record` (new, §7): the logger ends WiFi mode and starts recording at once; actor → Returning | queued; sent the moment the link is Ready |
| Stop | `CMD_STOP_LOGGING` | n/a (WiFi can't run while recording) | queued |
| Download files | starts a WiFi session | added to the running session | queued |
| Cancel | — | ends the session after the file in flight → Returning | drops the queued job |
| Firmware push | starts a WiFi session; after the push the logger reboots → Returning (boot wait) | — | queued |
| Power off | `CMD_POWER_OFF`; intent → Idle | `POST /power_off`, or Record-style end then power off | queued |
| Disconnect | intent → Idle; link closed | session ended first | intent → Idle |

The banner, the record button and the firmware sheet stop owning flows; they
send intent and render `LinkView`.

## 6. Reconnecting quickly (app side)

- **Returning** (we know the logger is about to advertise): direct connect
  attempts at 0.5 s and then back to back for 10 s (Android `connectGatt`
  with `autoConnect=false`, which connects within one advertising interval when
  the logger is advertising).
- **Seeking** (we don't know when it will be back): one *pending* connect that
  the Bluetooth controller holds open (Android `autoConnect=true`; desktop: a
  filtered scan that connects on first sight). It completes on its own the
  moment the logger advertises in range: no app timers, no battery cost.
- **Triggers that restart the fast phase**: app comes to the foreground,
  Bluetooth adapter turns on, a WiFi session ends, the logger's boot is
  expected (after a firmware push or a config commit).
- The old status read every second, and `device_status`'s connect-read-close
  path, are removed.

## 7. Logger side (firmware)

Already right: Bluetooth resumes advertising within ~0.1 s of WiFi mode
ending, by every path (log of 2026-10-16).

Changes:

1. **Fast advertising when the phone is expected.** 20 ms advertising interval
   for 30 s after boot, after WiFi mode ends and after any disconnect; then
   152.5 ms (Apple's accessory guideline values). Today the stack default is
   used throughout. Cost: a few mA for 30 s; not during logging (advertising
   only runs while no phone is connected).
2. **Leave WiFi when the phone leaves.** No station on the AP for 5 s → end WiFi
   mode (today: 5 minutes). After a handoff, no HTTP request for 60 s → end WiFi
   mode (today: 5 minutes). The 5-minute rule stays as the outer bound.
3. **`POST /record`** — ends WiFi mode and starts a session, exactly as the
   button does today (F7), answering `200` first. Lets Record work instantly
   during a download.
4. **`POST /power_off`** — the same shutdown as `CMD_POWER_OFF`, for a logger
   that is handed off.
5. **Status notify on every change** (mode, WiFi, recording, SD), not only on
   the 1 Hz tick, so the app needs no reads.

## 8. What goes away

- `startStatusPoll` and its 1 Hz reads; `device_status`'s ad-hoc link.
- `reconnectAfterRestart`, `RESTART_*` constants, the OTA reconnect loop
  (the actor's Returning-with-boot-wait covers both).
- `shell/loggerLink.ts` (the actor *is* the link state).
- The Logger screen's `connectionReducer` as a source of truth (kept only as a
  view of `LinkView`, or removed).
- Per-screen guards added on 2026-10-16 (`autoHeld`, `running`, poll pausing):
  the actor serialises jobs, so they are unnecessary.

## 9. Open decisions (Isaac)

1. **Background.** Should the app stay connected with the phone locked in a
   pocket during a ride (live status, Record from the lock screen later)?
   Android needs a visible notification for that (foreground service).
   - (a) Connected only while the app is open; reconnects instantly on open.
   - (b) Stay connected in the background, with a small "idl1 · logger
     connected" notification. Also keeps a download going if you switch apps,
     which you asked for earlier.
2. **Which loggers.** You have more than one. Does the phone auto-connect
   (a) to the last logger used, (b) to every logger it has paired, or (c) to
   loggers you mark "mine"?
3. **`POST /record` and `POST /power_off`** over WiFi (§7.3–4) — new wire
   endpoints. OK?
4. **Advertising cadence** (§7.1) — 20 ms for 30 s, then 152.5 ms. OK, or do
   you want a slower idle rate for battery?

## 10. Build order

1. Firmware §7 (small; one beta).
2. Rust link actor in `idl-rs-tauri` over the existing `idl-transport` BLE and
   WiFi traits; `link_*` commands and the `LinkView` channel (C3 amendment);
   tests for every transition in §4 against stub transports, timeouts under
   paused time.
3. Android pending connect (`autoConnect=true`) and the foreground service if
   decision 1 is (b).
4. UI onto `LinkView`; delete §8.
5. Field checklist: download with cancel; Record mid-download; walk out of
   range and back; kill the app mid-download; firmware push; power off and
   wake; logger reboot while connected; two loggers.
