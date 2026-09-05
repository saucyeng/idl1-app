# L6 Task 4 — implementer brief (the cell scan — `.idl1wb` text ↔ cells, in TypeScript)

You are the implementer for L6 Task 4 of the idl1 rewrite — a narrow,
**non-authoritative** fence scan over the C2 §2 grammar, giving the editors
byte ranges per cell without a round trip to Rust per keystroke. TDD, ONE
commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. HEAD must be Task 3's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.** You will read (not build) one Rust
  file for reference — see Step 2 below.
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 4` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 400–461); C2 §2 in full
  (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`, lines 43–208
  — §2.1 kinds, §2.2 cell id, §2.3 fence info grammar, §2.4 ordering and
  prose attachment, §2.5 the worked example) — quoted below for the parts
  you need most, but read the source for full context; **ruling R52's Q3**
  (`runs/2026-09-03/decisions.md`, the `## 2026-09-05 — R52` entry) — this
  brief already applies it, quoted below so you don't have to cross-reference.

## Ruling applied: R52 Q3 — this scan is non-authoritative (already decided, do not re-litigate)

R52 ruled Q3 `(a)`: cell segmentation for the editor is a narrow TS fence
scan, non-authoritative; Rust remains the only evaluator. Rationale
(R52's own words): "It maps cell id → byte range for clicks, which is
'pixels or clicks → app/src' (CLAUDE.md §2)." Concretely, this module:

- **Does** find fence-open/fence-close lines and the byte ranges they
  delimit, so the Code and Properties panes can address one cell's body
  without re-parsing the whole document on every keystroke.
- **Does not** parse math expressions, YAML front matter, or table JSON —
  Rust's `eval_workbook` is the sole authority on cell ids, kinds, and
  errors (C3 §3.4). If this module's scan and Rust's ever disagree about
  where a cell's body starts or ends, Rust wins; this module exists only to
  give the editor something fast and good-enough to click into before the
  next `eval_workbook` round trip confirms it.

If a future ruling reverses Q3, this task's file is deleted and replaced by
a stub over IPC need N2 (`parse_workbook_cells`) — nothing downstream would
change shape, since `scanCells`'s return type is exactly what N2 would
return instead. That is not this task's problem; just know the module's
job description is "fast, good-enough, browser-side" and stop there.

## The fence grammar you are scanning (C2 §2.2/§2.3, verbatim)

```ebnf
fence_open   ::= "```" cell_kind (" " attr)* "\n"
cell_kind    ::= "math" | "table" | "js"
attr         ::= "id=" hex8
hex8         ::= /[0-9a-f]{8}/
fence_body   ::= /.*/                    (* kind-specific grammar, §3/§4/§5 *)
fence_close  ::= "```" "\n"
cell         ::= fence_open fence_body fence_close
```

Example: ` ```js id=3fa9c12e `.

Key rules from C2 §2.2 you must honour:
- **A fence with no `id=` attribute is legal** (hand-authored or freshly
  agent-written; the id is assigned on first save by whichever writer
  touches it next — not this module's job).
- **`id` is captured only when it matches `/^[0-9a-f]{8}$/`.** Anything else
  in that attribute position is reported as `idRaw` with `id: null`, per
  ruling R21, so the UI can show C2's `InvalidCellId` rather than silently
  minting a new one.
- **An unrecognised `key=value` attribute is preserved verbatim** in
  `infoLine` (round-tripped, not interpreted) — the grammar's
  `(" " attr)*` reserves room for a future space-separated attribute
  beyond `id=hex8`.
- **Prose is not a cell** — §2.1: "prose (plain Markdown, no fence, no id)
  … is a span, not a cell." A document with zero fenced cells is legal.

From C2 §2.4 (ordering and prose attachment): "a prose span belongs to the
fenced cell that immediately follows it," as that cell's `prose_before`
text, from the end of the previous fenced cell (or the end of front matter
for the first span) up to the next fence-open. Trailing prose after the
*last* fenced cell belongs to that last cell as `prose_after` — a field
only the final cell can carry.

**Front matter** is the leading `---`-delimited block (see C2 §2.5's
worked example, lines 129–208, for its literal shape) — this scan finds its
span (so the editors know where the body starts) but does not parse its
YAML content; that is Rust's job.

## The one subtlety: inert fences must not be mistaken for cells

A fence is only a *cell* if its info string is exactly `math`, `table`, or
`js` (optionally followed by ` id=hex8` and/or an unrecognised
` key=value`). A fence with any other info string (`json`, `bash`, no info
string at all) is an ordinary Markdown code fence — **inert**, not a cell,
and must not be reported by `scanCells`.

The harder case: a ` ```js ` line can appear **inside** an inert fence that
uses more backticks to escape its content — e.g. a ` ````markdown ` block
(four backticks) containing a nested ` ```js ` example (three backticks) as
literal text being *shown*, not executed. Your scanner must track whether
it is currently inside such an inert fence and, if so, not treat a
nested-looking fence line as a cell open. Mirror
`rust/core/src/workbook/v3/cell.rs`'s `scan_cells` function's handling of
this case — **read that file** (it exists in the `rust/` submodule
initialised into this worktree; you are reading it for reference only,
never building it) and say in your doc comment that you mirrored it, noting
any place your TS scan's behaviour differs and why.

## The task

**Files:**
- Create: `Notebook/model/cells.ts`, `Notebook/model/cells.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  interface ScannedCell {
    id: string | null;       // captured hex8, or null if absent/invalid
    idRaw: string | null;    // the raw id= attribute value, even if invalid (R21)
    kind: "math" | "table" | "js";
    infoLine: string;        // the fence-open line's full attribute text, verbatim
    bodyRange: [number, number];       // byte offsets into the UTF-8 encoding, [start, end)
    proseBeforeRange: [number, number] | null;
    proseAfterRange: [number, number] | null;  // only ever set on the last cell
  }
  interface ScannedDoc {
    frontMatterRange: [number, number] | null;
    cells: ScannedCell[];
  }
  function scanCells(markdown: string): ScannedDoc;
  function replaceCellBody(markdown: string, cellId: string, newBody: string): string;
  ```
  Adjust field names only if they conflict with something already landed
  elsewhere in `Notebook/` (nothing should, since this is the first `model/`
  file) — otherwise keep them exactly as above so later tasks (6, 13) can
  cite them by these names.
- Consumes nothing. Pure.

**Ranges are byte offsets over the UTF-8 encoding**, matching Rust's
`scan_cells` convention — **not JS string indices** (a JS string index
counts UTF-16 code units, which diverges from UTF-8 byte offsets the moment
a multi-byte character, e.g. an emoji or non-ASCII letter in a prose span,
appears before the point being indexed). Encode the document once with
`TextEncoder` and index into the resulting `Uint8Array`; document this
choice explicitly in `cells.ts`'s module doc comment, since it is the one
place a naive implementer would reach for `.indexOf`/`.slice` on the raw
string and get silently wrong offsets on non-ASCII input.

**Spec discipline:** no spec change needed — C2 §2.2/§2.4 is the spec.

- [ ] **Step 1: Write the failing tests**

  - `scanCells — the C2 §2.5 worked example — finds one math cell and one js cell with their ids`

    Use the literal worked example from C2 §2.5 (read
    `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` lines
    129–208 for its exact text, including the front-matter block and the
    `g` constant's removal per R37 — copy it verbatim into your test
    fixture, do not paraphrase it).
  - `scanCells — a fence with no id attribute — reports the cell with id null`
  - `scanCells — an inert fence (json, bash, no info string) — is not reported as a cell`
  - `scanCells — a fence-like line inside an inert code block — is not reported as a cell`

    This is the subtlety above — construct a fixture with an outer
    four-backtick (or otherwise inert) fence containing a literal
    ` ```js ` line as content, and assert `scanCells` does not report it.
  - `scanCells — prose between two cells — attaches to the following cell as proseBefore (C2 §2.4)`
  - `scanCells — trailing prose after the last cell — attaches to that cell as proseAfter`
  - `scanCells — a document with zero fenced cells — returns no cells and the whole body as prose`

    ("the whole body as prose" — assert `cells: []`; deciding whether/how
    to surface the whole-document prose span is your call as long as no
    `ScannedCell` is fabricated to hold it — a document with no cells has no
    `proseBefore`/`proseAfter` owner, per C2 §2.4's own note that this case
    falls back to plain three-way text merge with no cell involved.)
  - `scanCells — an unrecognised key=value fence attribute — is preserved verbatim in infoLine`
  - `replaceCellBody — a js cell's body replaced — every other byte of the document is unchanged`
  - `replaceCellBody — an unknown cell id — returns the document unchanged`

  10 tests total, A/A/A with blank lines between sections, names exactly as
  above.

- [ ] **Step 2: Read the Rust reference implementation**

  ```bash
  cat "../rust/core/src/workbook/v3/cell.rs"
  ```
  (path relative to this worktree's `app/` — adjust if the submodule layout
  differs; find it with `find .. -path "*/workbook/v3/cell.rs"` if the exact
  path is wrong). Read `scan_cells` and note: how it tracks inert-fence
  nesting, how it captures the id attribute, how it handles a document with
  no front matter. You are not required to match its internal structure —
  only its externally observable behaviour on the cases this task tests.

- [ ] **Step 3: Implement `cells.ts`**

  A line-oriented scan. Front matter is the leading `---`-delimited block.
  After it, a line matching ` ```(math|table|js)( +key=value)*$ ` (where one
  `key=value` may be `id=hex8`) opens a cell; the next line that is exactly
  ` ``` ` closes it. Track an "inside an inert fence" flag so a ` ```js `
  line encountered while inside a longer-backtick-run inert fence is not
  mistaken for a cell open (Step 2's reference). `id` is captured into the
  `id` field only when it matches `/^[0-9a-f]{8}$/`; the raw attribute value
  (whatever follows `id=` up to the next space or the line end) always goes
  into `idRaw` regardless of validity, per R21.

- [ ] **Step 4: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/cells
  ```
  Expected: 10 passed, 0 failed.

- [ ] **Step 5: CHANGELOG**

  ```
  - **Notebook cell scan (L6 Task 4).** Pure TS fence scan over C2 §2.2/§2.4 giving the editors byte ranges per cell; Rust's parser stays authoritative for evaluation.
  ```

- [ ] **Step 6: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/cells.ts src/routes/pages/Notebook/model/cells.test.ts ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: pure cell scan over the C2 §2 fence grammar
  ```

## Do not

- Do not parse math expressions, YAML front matter content, or table JSON
  bodies — this module finds byte ranges only. Any code that inspects a
  cell body's *content* beyond finding where it starts and ends is out of
  scope for this task (and arguably a Q3 regression — flag it to yourself
  and remove it before committing).
- Do not use JS string indices (`.length`, `.indexOf`, `.slice` on the raw
  `string`) for any range you return — encode via `TextEncoder` first and
  index the byte array, per the "Ranges are byte offsets" note above. A
  reviewer will construct a non-ASCII test case if your tests don't already
  cover one convincingly.
- Do not fabricate an `id` when one is missing or invalid — `id: null` (with
  `idRaw` set if something was present but invalid) is the correct output;
  minting a new id is explicitly Rust's job on save (C2 §2.2's
  "Assignment"), not this scan's.
- Do not build or run any cargo command to "double check" against
  `cell.rs` — reading the file with `cat`/your file tools is sufficient and
  is all this task needs.

## Style / hygiene

Doc comment on every exported symbol, including the UTF-8-byte-offset
choice on `cells.ts`'s module doc comment; `// TODO(idl0):` never bare
`// TODO`; A/A/A tests with blank lines between sections.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts, expect 10); confirmation ranges are UTF-8
byte offsets (paste the relevant line of your doc comment); a one-line
summary of what you found in `rust/core/src/workbook/v3/cell.rs`'s
inert-fence handling and how your TS scan mirrors it (or differs, and why);
per-step done/deviated; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).
