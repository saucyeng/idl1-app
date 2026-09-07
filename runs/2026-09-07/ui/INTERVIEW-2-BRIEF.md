# UI interview, round 2 — brief for the interviewer agent

Round 1 produced `runs/2026-09-06/ui/UI-DIRECTION.md` (37 decisions, status
final, amended by R107). That covered the shell: chrome, columns, type,
colour, density, the four tabs as they exist today. Round 2 covers what
round 1 deliberately deferred — the maths graph, and the behaviours and
philosophies that decide how the app *feels* rather than how it looks.

## Rules for the interviewer

- Interview Isaac. Ask questions, wait for answers, do not design in his
  place and do not fill silence with your own preference. If he says
  "you pick", say what you'd pick and why in one sentence, then record it
  as *your* call, marked as such.
- Read before asking: `runs/2026-09-06/ui/UI-DIRECTION.md`,
  `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §§4–6, and
  the Flutter app's source/screenshots for prior art. Never ask about
  something already decided in round 1; if an answer contradicts a round-1
  decision, flag the contradiction rather than silently overriding it.
- Output format is round 1's exactly: numbered decisions, one heading per
  area, each decision a single imperative sentence a lane can implement
  without asking a follow-up. Uncertain items go in an `## Open` section,
  never as a vague decision. Write to
  `runs/2026-09-07/ui/UI-DIRECTION-2.md`, status `draft` until Isaac says
  final.
- Never say "modern", "clean", "intuitive". A decision that could describe
  any app is not a decision.

## Areas, in priority order

### A. The maths graph (the big one)
The reserved column and wave-3 lane. It is a node graph over channels and
derived definitions: sources, operators, outputs, feeding the notebook's
cells. Interview toward: what a node *is* to Isaac (a channel? an
expression? a whole workbook cell?); whether the graph is authoritative
and the notebook a view of it, or the reverse, or both edit one model;
what you do most often in it and what that gesture should cost; how a
node shows it is stale, running, errored, or unresolved; how big a real
graph gets; what happens to the graph when a session with different
channels is selected; whether subgraphs/groups are needed on day one;
what is directly on-canvas versus in the properties column.

### B. Selection and cross-tab state
What "the current session" means globally, whether each tab keeps its own
selection, what a lap selection does to every other view, and what
survives a restart.

### C. Time, cursors and linked views
Hover/scrub behaviour across charts, whether a cursor is shared, what
zoom is shared and what is per-chart, and what the notebook does while
you scrub.

### D. Errors, staleness and trust
How the app tells you a number is out of date versus wrong versus
not-yet-computed — the "time is recorded, not assumed" principle made
visible. What is allowed to silently show stale data and what must not.

### E. Device tab refinements
`runs/2026-09-05/QUESTIONS-FOR-ISAAC.md` item 12 is a standing list of
device-tab calls from direction decision 35. Walk it with him and record
each answer as a numbered decision here.

### F. Philosophy check
Round 1 set a look. Ask what the app should feel like to *live in* over a
season — what it must never do, what it should remember, what it should
refuse to guess. Record these as constraints lanes can be held to, not as
adjectives.
