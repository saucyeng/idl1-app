# DRAFT — Ride form and ride analysis (desktop first, then mobile)

Status: draft for Isaac, 2026-10-14. Spec-first: no code lands against this
until the open questions in §9 are answered. Builds on R228 (in-app agent,
desktop subscription through Claude Code, API key elsewhere) and the
2026-09-19 gaps draft (`2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md`).

## 1. What Isaac asked for

- After a ride is downloaded, a form opens, Strava-style, already filled in
  where the data allows: venue, track, lap count, and basic facts such as
  duration and exertion. The rider mostly just writes notes in plain
  language.
- The notes drive the analysis. Example from the last ride: *"bled the fork
  bleeders after 2 laps — how much did the front soften? Fuelled up 2 laps
  from the end — was the extra mass measurable?"*
- The analysis decides what is worth calculating, calculates it, and writes
  a ride report. The conversation can continue: ask about the physics, add
  charts to the report.
- Runs on the phone with an API key (paid per use), and on the desktop on
  Isaac's subscription. **Built and tuned on the desktop first**, so a new
  pipeline doesn't burn API credits.
- Transcripts are kept, read-only, as a long-term record of rider feedback
  and of why setup decisions were made.

## 2. The central constraint: no Python on the phone

The 2026-09-19 motocross analysis was done with ad-hoc Python
(`laps.py`, `susp.py`, `corners.py`, …). None of that can run on a phone.

**On the phone, the model's only programming language is the workbook.** It
expresses every calculation as workbook maths and plot cells (C2), which
`idl-rs` evaluates identically on desktop and phone. The ride report *is* a
workbook (`workbooks/<ride>.idl1wb`): prose cells for the write-up, maths
cells for the numbers, plot cells for the charts. "Add a chart" in the
discussion means "add a cell".

This keeps the repo's existing principles intact: Rust does every number,
the workbook is a file, the app is a live viewer of it.

**How Python knowledge becomes engine features.** On the desktop, Python
stays allowed (Isaac, 2026-10-14: no artificial limits). The agent prefers
workbook cells, and whenever it reaches for Python because the engine
can't do something, it adds that capability to a gaps list. Recurring gaps
become Rust builtins in due time (the gaps draft's P1/P3 items are
the first batch: `resample`, `"t:lap"` reductions, `airborne()`,
transmissibility, …). The experiment is therefore also the porting plan:
it measures exactly which Python habits the engine still lacks.

## 3. Pipeline

| Stage | Where | Model? | Output |
|---|---|---|---|
| 0. Facts | Rust, at import | No | venue/track match, lap count, lap times, duration, HR summary |
| 1. Ride form | App | Optional (title, tidy notes) | metadata + free-text notes in `session.json` |
| 2. Plan | Model | Yes, one call | notes → timed events + a list of questions worth answering, each as workbook cells |
| 3. Compute | Rust | No | the cells evaluated; a compact results digest |
| 4. Report | Model | Yes, one call | prose cells written around the computed numbers |
| 5. Discussion | Model + Rust | Per message | answers; optionally new cells, then re-evaluated |

Stages 2–4 are the "one call, no general tools" design from 2026-10-14,
reframed: the model's only action is writing workbook cells, and Rust runs
them between two calls. No open-ended agent loop.

### 3.1 Stage 0 — facts (no model)

Already computed today or nearly so:

- **Venue and track:** `track_visits` matching against the track library
  (C1 §6). An unknown venue is "unknown", never guessed.
- **Laps:** `laps` in `session.json`; count, best, average.
- **Duration, distance, moving time:** from GPS.
- **Exertion (measured):** HR average / max / time in zones, when an HR strap
  was paired. Absent otherwise.

### 3.2 Stage 1 — ride form

Opens after a ride is downloaded and imported (depends on the one-tap
download, §9 Q1). Fields, mapped onto existing `session.json` fields where
they exist (C1 §6):

| Field | Source | `session.json` |
|---|---|---|
| Title | prefilled "Venue · date", editable | `short_comment` |
| Venue / track | stage 0, editable | `venue_name`, `track_visits` |
| Bike / setup | last-used bike; the running setup sheet (R190) shown as a card you can tap into | `bike`, `bike_profile_snapshot` |
| Conditions | rider picks (chips) | **new**, see §9 Q3 |
| How it felt | rider picks, Strava's "perceived exertion" | **new** |
| Notes | free text | `long_comment` |

Setup changes are tracked **from the notes**, not by editing the sheet:
"bled the fork after 2 laps" becomes an event (§3.3), and the running
setup sheet is the last sheet plus the events since. Tapping the sheet card
is for looking things up or correcting it.

### 3.3 Stage 2 — notes become timed events

The model turns notes into **events anchored to the ride**, written to a new
additive `session.json` field (C1 change, §8):

```jsonc
"events": [
  { "kind": "setup_change", "after_lap": 2, "text": "bled fork bleeders" },
  { "kind": "mass_change",  "after_lap": 8, "text": "fuelled up", "delta_kg": null }
]
```

The model guesses missing quantities (how much fuel) and states the guess;
the rider corrects it in the discussion ("closer to 1.75 gal"), and the
corrected value is written back to the event. The analysis is a two-way
conversation that fixes its own assumptions, not a one-shot form. Events are what make before/after
comparisons possible across the whole history, not only in this report.

### 3.4 Worked example (what a good answer looks like)

- **Fork bleed after lap 2:** compare laps 1–2 against laps 3+ on fork
  travel (distribution, sag under braking) and fork-lower vs frame
  acceleration (transmissibility). Report the change with its lap-to-lap
  spread, so a difference smaller than the noise is called out as such.
- **Fuel added:** a first guess of 3 L is ~2.2 kg; corrected to 1.75 US gal
  (6.6 L) it is ~4.9 kg, about 2.7 % of a ~180 kg bike + rider, so ride
  frequency should drop about 1.3 % (f ∝ 1/√m). That is likely near or
  below lap-to-lap variation. The right report gives the estimate, says
  whether the data resolves it, and suggests what would (static sag before
  and after). "Not measurable, here's why" is a correct result.

## 4. What the model is given

- **Primer (fixed, versioned in the repo):** the data model (C1 channels,
  units, time model), the workbook language (the generated builtin catalog,
  R249), sensor mounting (IMU0 frame, IMU1 fork lower, IMU2 swingarm; their
  ranges and clipping), and a short chassis-dynamics reference.
- **This ride:** stage-0 facts, form fields, events, the bike's setup sheet.
- **History (bounded):** the previous rides on the same bike or track,
  summarised, plus prior transcripts' conclusions (§7).
- **Never:** raw sample arrays.

## 5. Where the code lives (CLAUDE.md §2)

- `core`: stage-0 facts, the results digest, evaluating model-written cells
  (already exists: workbook evaluation), the event schema.
- `transport`: one `ModelBackend` trait, two implementations: the local
  `claude` CLI in headless mode (desktop, subscription) and the Claude API
  over HTTPS (phone, key). This is the only part that differs between them.
- `idl-rs-tauri`: async commands with progress over a `Channel` (R201).
- `app/src`: the form, the report view (the existing workbook viewer), the
  discussion pane.
- `cli`: the same stages as verbs, so the desktop experiment and CI can run
  them without the app.

## 6. Desktop experiment first (before any app code)

1. The data root's `AGENTS.md` (exists, R228; generated by
   `core/src/store/agents_md.rs`) gains the primer and the rules: prefer
   the CLI and workbook cells; Python is allowed, and every use of it
   because the engine fell short is added to the gaps list.
2. Isaac runs it from the existing "Ask an agent" terminal on his
   subscription, on real rides, with real notes.
3. We tune the primer and fix the engine gaps it finds until the reports
   are good.
4. Only then is the same primer wired into stages 2–4 in the app, first on
   the desktop backend (still subscription), then the API backend on the
   phone.

## 7. Transcripts

- One append-only file per conversation, stored with the session:
  `sessions/<id>/transcripts/<utc-start>-<device>.jsonl`. It records
  messages, the cells the model wrote, and the model and primer version.
- Read-only once closed. Continuing elsewhere means "read the transcript
  and continue", which starts a new file that names the old one.
- Synced over LAN as a **new C4 file class**: identity is the file name,
  conflict rule is "none possible" (append-only, one writer per file). The
  desktop agent can read every phone conversation about a session.

## 8. Contract changes this needs

- C1 §6: `events`, `conditions`, `feel` (additive, no schema bump).
- C4 §6: the `transcripts` file class.
- C3: the analysis commands.
- C6: CLI verbs for the stages (R230's verb list is closed, so new verbs
  need a ruling).

## 9. Decisions and open questions

Decided 2026-10-14:

- **One-tap download: yes** (reverses R53). See §10 for the transfer
  changes it needs.
- **Weather lookup:** out of scope for now; conditions are rider-picked.
- **Exertion:** out of scope for now. The idea to keep is area under the
  HR curve (a training-load style number), when an HR strap is paired.
- **Quantities:** the model guesses, the rider corrects (§3.3).
- **Unit: the session**, as it is today. One form and one report per
  downloaded session; events anchor to the session's own lap numbers. No
  new day/moto grouping.

Open:

1. **Firmware change for fast return to recording (§10).** Should a press
   of the logger's record button while it is in WiFi mode drop WiFi and
   start recording immediately?

## 10. Background download (prerequisite for the form)

What exists: the logger serves `/download` with HTTP `Range`, and the app
already resumes from the received offset (IDL0_SPEC §6.1). WiFi and
recording are mutually exclusive in firmware: `CMD_START_LOGGING` is
refused while the AP is up (IDL0_SPEC §10.4).

What Isaac wants: download in chunks whenever the logger is idle and the
phone is near, resume across interruptions, never get in the way of
recording, with a setting to turn it off, and back to recording within
~1 s (2–3 s acceptable).

- **App side (no firmware change):** a background transfer that enters
  WiFi mode only while the logger is idle, downloads until a time budget or
  a stop request, exits with `/wifi_off`, and picks up at the saved offset
  next time. A setting turns it off. Partial files are never imported.
- **The 1 s target:** today's exit is `/wifi_off` (~0.5 s flush, then AP
  teardown), BLE re-advertising, the phone reconnecting, then
  `CMD_START_LOGGING`. That is likely several seconds and depends on the
  phone. Meeting ~1 s reliably needs the logger's own record button to
  pre-empt WiFi in firmware (§9 Q2), so starting a recording never waits
  on the phone.
- **Not yet known:** actual transfer throughput and what limits it. Worth
  measuring before tuning.
