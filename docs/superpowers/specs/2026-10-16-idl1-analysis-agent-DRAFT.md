# DRAFT — How the analysis agent works

Status: for Isaac's review, 2026-10-16. Nothing is built from this until he
has read it. It turns the ride-analysis draft (2026-10-14, §2–7) into the
agent's working rules, now that the ride form and the bike log exist.

## 1. The role in one line

A ride engineer, not an oracle: it reads your ride notes, works out which
questions the data can answer, measures them, and tells you what it found,
how sure it is, and when the data can't tell.

## 2. What it is given

| Input | What | Never |
|---|---|---|
| **Primer** (fixed, versioned in the repo, written into the data folder) | The data model and units, the sensors and where they are mounted (frame, fork lower, swingarm) with their ranges and clipping, the workbook language, a short chassis-dynamics reference, and these rules | — |
| **This ride** | Facts (laps, times, heart rate, distance), your title and notes, the bike-log entries the ride took, the setup sheet it started with | Raw sample arrays in the prompt: it measures through tools |
| **History** (bounded) | Earlier rides on the same bike, summarised: their notes, setup, and the conclusions of earlier conversations | Everything at once: only what is relevant to the questions |

## 3. What it may do

- **Compute** through the engine: the CLI and workbook cells. On the
  desktop it may also use Python, but every time it does because the engine
  can't, it adds a line to a **gaps list**. Recurring gaps become engine
  features; that is how the phone, which runs only workbook cells, catches
  up.
- **Write** only two kinds of thing:
  - the ride **report**, which is a workbook: prose around numbers, every
    number produced by a cell you can open;
  - **proposals** for the bike log, which you accept with a tap (§5).
- **Never** edits a session, a log file, the bike log or the setup sheet
  directly.

## 4. The loop

1. **Notes → questions.** "Bled the fork after lap 2" becomes: did the
   front soften? Measured how (travel distribution, fork vs frame
   acceleration), compared what (laps 1–2 against 3 onward), and what size
   of change would matter.
2. **Measure.** Each question becomes workbook cells, run by the engine.
3. **Report.** For each question: the estimate, the lap-to-lap spread, and
   a verdict: a real change, within the noise, or not measurable with this
   data (and what would measure it, e.g. static sag before and after).
4. **Discuss.** You correct its assumptions ("closer to 1.75 gal of
   fuel"); it updates the numbers and says what changed.

## 5. Setup changes from your notes

When your ride note mentions a setup change, the agent proposes a bike-log
entry: "bled the fork after lap 2" becomes a note placed at lap 2; "+1 LSC
fork" becomes a change of fork LSC from 10 to 9 clicks (`+` closes one
click, counted from fully closed). You see each proposal and tap to accept
or dismiss. Nothing reaches the sheet without your tap.

## 6. Honesty rules (in the primer, checked in review)

- Compare every difference against lap-to-lap variation; a difference
  smaller than the noise is reported as such.
- State every guessed quantity as a guess, with how to correct it.
- "Not measurable, here's why" is a correct and complete answer.
- No number without the cell that produced it.

## 7. Records

- Each conversation is kept, append-only, with the ride
  (`sessions/<id>/transcripts/`), read-only once closed: a long-term record
  of your feedback and of why setup decisions were made. They sync to the
  desktop like everything else (a new file class: a later decision).
- Its conclusions are what "history" (§2) summarises for later rides.

## 8. Order of work

1. **Desktop first, on your subscription.** The primer goes into the data
   folder; you run the existing "Ask an agent" terminal on real rides and
   notes. We tune the primer and close engine gaps until the reports are
   good. No API cost.
2. Then the same primer wired into the app on the desktop.
3. Then the phone, with an API key.

## 9. Questions for Isaac

1. **History scope:** earlier rides on the same bike only, or also other
   bikes at the same track?
2. **Gaps list:** a file in the data folder (`agent-gaps.md`) that I read
   when planning engine work, or somewhere else?
3. **Proposals (§5):** tap to accept each one (as drawn), or accept all at
   once with a review list?
