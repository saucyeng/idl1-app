# Lane brief — one session display name (R169)

**Worktree:** `../idl1-app-worktrees/session-label`, branch `session-label`,
off superproject `main`. App-only TypeScript. **Do not touch `rust/`**, do
not commit on `main`, never push.

**Spec discipline:** no spec change needed — this is display text, no wire,
no stored data. `CHANGELOG.md` gets a line.

## The problem

Three formatters name the same session three different ways. Read R169 in
`runs/2026-09-06/RULINGS-DIGEST.md` first; the full entry is in
`runs/2026-09-03/decisions.md`.

| where | empty venue | date |
|---|---|---|
| `app/src/routes/pages/Data/sessionRow.ts::venueLabel` | `(none)` | never |
| `app/src/shell/topBarSelection.ts::sessionLabel` | `(none)` | `· YYYY-MM-DD`, omitted when `timestamp_utc_ms === 0` |
| `app/src/routes/pages/Notebook/model/report/document.ts::sessionDisplayName` | `Session` | never |

## Tasks

### Task 1 — move both formatters into `state/selection.ts`

`app/src/state/selection.ts` already holds `describeWindow`, whose
caller-supplied `sessionName` parameter is the seam these copies grew in.
Put both functions there, immediately beside it:

- `venueLabel(venueName: string): string` — moved verbatim from
  `Data/sessionRow.ts`, doc comment updated to say it is now the single
  spelling of the `(none)` text.
- `sessionLabel(s: SessionSummary): string` — moved from
  `shell/topBarSelection.ts`, **unchanged in behaviour** (venue plus local
  calendar date, date omitted when `timestamp_utc_ms === 0`, C1 §3.1),
  except that its `(none)` literal is replaced by a `venueLabel` call.

Keep them as two functions. Venue-without-date is a real second need (a
table with its own date column), not a duplicate — R169 says so explicitly.

Move their tests with them, into `state/selection.test.ts`. Do not weaken
or drop a test in the move; if a test's name references its old home,
rename the name, not the assertion.

### Task 2 — the three callers

- `shell/topBarSelection.ts` — delete its `sessionLabel`; `shell/TopBar.tsx`
  imports from `state/selection` instead. `topBarSelection.ts` keeps
  everything else it owns.
- `routes/pages/Data/sessionRow.ts` — delete its `venueLabel` and import it
  from `state/selection`. Its other consumers (`sessionDetail.ts`,
  `trackRow.ts`) currently import `venueLabel` *from `sessionRow`* — point
  them at the new home directly rather than leaving a pass-through
  re-export. A re-export is a fourth name for the same thing.
- `routes/pages/Notebook/model/report/document.ts` — delete
  `sessionDisplayName` entirely and call `sessionLabel`. **This is a
  behaviour change and it is the point of the lane**: a report window's
  label now carries the date and says `(none)` for an unrecorded venue,
  matching the top-bar chip it was printed from. Update
  `document.test.ts`'s expected strings accordingly, and add one test named
  for *why*: a report window label and a top-bar chip for the same session
  are the same text.

Check the direction of every import you add: `shell/` → `state/`,
`routes/` → `state/`. Nothing may import a page from a page, and
`state/selection.ts` must not import from `shell/` or `routes/`. If you
find an import that would have to go the wrong way, **stop and ask** —
do not work around it.

### Task 3 — no fourth copy

Grep the app for any other place that formats a session into human text
(`venue_name` readers are the giveaway). Report what you find. **Do not
fold anything else in without asking**: R169 is explicit that two
formatters which merely both produce text are not duplicates — the test is
whether they name *the same thing* for *the same reader*.

## Gate

From `app/`: `npx tsc --noEmit`, then `npx vitest run`. Main's baseline is
**177 files / 1748 tests, all passing** — your run must be all-passing with
a count at or above that.

## Rules

`CLAUDE.md` standing orders are binding: Arrange/Act/Assert with blank lines
between, test names `thing — condition — result`, a doc comment on every
public symbol, no AI attribution trailers, never push. Commit per task. If a
placement or behaviour is not stated here — **stop and ask**; do not infer.

## Report back (≤ 12 lines)

Tasks done, the gate's file/test counts, what task 3's grep found, and any
import-direction problem you hit.
