# L6 Task 11 — implementer brief (the Code pane — CodeMirror 6 with markdown, JS and math modes)

You are the implementer for L6 Task 11 of the idl1 rewrite — the pure math
tokenizer C2 §8-4 assigns to this lane, the 69-entry function catalog
transcription, and the CodeMirror 6 `CodePane` component that switches
language by cell kind. TDD, ONE commit, then report.

## Before dispatch: confirm Q1's shell task landed

This task is **blocked on Open Question Q1** (npm dependencies) per the
plan. R52 ruled Q1 → (a): eight packages including `codemirror ^6.0.2`,
`@codemirror/lang-javascript ^6.2.5`, `@codemirror/lang-markdown ^6.5.2`
added to `app/package.json` by a lead shell task. **Before starting, check
`app/package.json` on `main` for these three packages** (this lane may never
add them itself — operating brief §2, `package.json` is lead-owned):

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app" && grep -n "codemirror\|@codemirror" app/package.json
```

**If they are absent — STOP and report.** Do not add them yourself, do not
implement `mathMode.ts`/`functionCatalog.ts` against an assumed API without
the real package installed (`npx tsc --noEmit` would not even resolve the
imports), and do not substitute a different editor library.

## Before anything else (once Q1 is confirmed applied): verify Task 10 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
git submodule status  # rust/ initialised is fine; do not build it
```

You need a commit adding `Notebook/model/cursor.ts` (Task 10). **If it is
missing — STOP and report.** This task does not depend on Task 10's exports,
but the lane is strictly sequenced (one worktree, one branch, tasks run in
order) — if the worktree's HEAD isn't Task 10's commit, something is out of
order and needs the lead's attention before you continue. Also merge `main`
into the branch first if `app/package.json` changed there since the last
merge (the CHANGELOG merge rule, operating brief §4: keep both bullets under
`[Unreleased]`, STOP on any other conflict).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting (after the `main`
  merge above, if one was needed).
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency beyond the three CodeMirror packages Q1 already
  authorised on `main`** — if you find you need a fourth CodeMirror-family
  package (e.g. `@codemirror/view`, `@codemirror/state`, `@codemirror/
  commands`, `@codemirror/autocomplete`) that Q1's shell task did not add,
  check whether it is already a transitive dependency the three named
  packages pull in (likely — `codemirror` itself is the "kitchen sink"
  meta-package per its own docs) before treating it as a new dependency
  needing a lead ruling.
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 11` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 783–830); C2 §3.1 "Definition syntax" and §3.3 "Builtin catalog" in
  full (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`, lines
  212–342, 342–440) — the source-of-truth **table** for `MATH_FUNCTIONS`
  (the plan names `rust/core/src/math/eval.rs`'s dispatch as the deeper
  source of truth, but this task transcribes the **contract table**, which
  mirrors it — do not open `rust/` to cross-check; that crosses the "no
  cargo, no rust/ reads needed" boundary and the contract table is what C2
  §8-4 assigns you); C2 §8-4 (the open question that assigns math-mode
  implementation to L6, `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`
  §8); `docs/vendor/codemirror-6/system-guide.md` and
  `docs/vendor/codemirror-6/lang-javascript-README.md` /
  `lang-markdown-README.md` (read the `StreamLanguage`/`LanguageSupport` API
  section before writing `mathMode.ts` — verify the exact export names and
  factory signatures against the vendored docs, not from memory).

## Interfaces (from the plan, Task 11)

- Produces:
  ```ts
  /** C2 §3.1's identifier/number/operator/comment tokens for one line of a
   *  math cell's source, for CodeMirror's StreamLanguage highlighting. Pure
   *  — no CodeMirror imports in this file; StreamLanguage wraps it in
   *  CodePane.tsx. */
  type MathTokenKind =
    | "keyword"       // const, and, or, not
    | "identifier"
    | "channelRef"    // [Channel Name] (C2 §3.1)
    | "cellRef"       // {cell} or {col[]} (table-cell reference, C2 §4)
    | "number"
    | "operator"      // + - * / < > <= >= == !=
    | "function"      // a MATH_FUNCTIONS name immediately before '('
    | "comment"       // # ... (not a label comment)
    | "labelComment"; // # label: ... (C2 §3.1's display-name form)
  interface MathToken { kind: MathTokenKind; text: string; start: number; end: number; }
  function tokenizeMath(line: string): MathToken[];

  type CatalogStatus = "implemented" | "notImplemented";
  interface CatalogEntry { name: string; signature: string; category: string; status: CatalogStatus; }
  const MATH_FUNCTIONS: CatalogEntry[]; // C2 §3.3's 69 entries, transcribed verbatim
  ```
  `CodePane` (component, not unit-tested — CLAUDE.md §4):
  ```ts
  interface CodePaneProps {
    kind: "prose" | "math" | "table" | "js";
    code: string;
    onChange(nextCode: string): void; // debounced by this component (P6) before calling
    channelIds: string[];             // for completion
    definitionNames: string[];        // for completion
  }
  ```
- Consumes CodeMirror 6 at the M0 pins (`codemirror`,
  `@codemirror/lang-javascript`, `@codemirror/lang-markdown`, and whatever
  `StreamLanguage`/`LanguageSupport` live in per the vendored docs — likely
  `@codemirror/language`, already a transitive dependency of the three named
  packages; confirm against `docs/vendor/codemirror-6/system-guide.md`
  rather than guessing the package name).

## The task

**Files:**
- Create: `Notebook/model/mathMode.ts`, `Notebook/model/mathMode.test.ts`,
  `Notebook/components/CodePane.tsx`, `Notebook/model/functionCatalog.ts`

**Spec discipline:** no spec change needed — C2 §8-4 explicitly assigns the
mode's implementation to this lane within the grammar C2 already fixes.

- [ ] **Step 1: Write the failing tests** (`mathMode.test.ts` — pure)

  - `tokenizeMath — a definition line — yields identifier, equals and expression tokens`
  - `tokenizeMath — a const line — tags const as a keyword, not an identifier`
  - `tokenizeMath — a bracketed channel reference containing spaces — is one channel token (C2 §3.1)`
  - `tokenizeMath — a table cell reference {name} and {col[]} — are cell-reference tokens`
  - `tokenizeMath — the keyword operators and, or, not — are operator tokens, not identifiers`
  - `tokenizeMath — a trailing # label: comment — is tagged as a display-name comment, distinct from a plain comment`
  - `tokenizeMath — a known catalog function name before an open paren — is a function token`
  - `tokenizeMath — an unknown name before an open paren — is an identifier, not a function`
  - `MATH_FUNCTIONS — the catalog — contains all 69 of C2 §3.3's names`
  - `MATH_FUNCTIONS — every NotImplemented entry — is marked so it can be shown greyed`

  10 tests, matching the plan's Step 1 list exactly. A/A/A with blank lines
  between sections. The two `MATH_FUNCTIONS` tests belong in
  `mathMode.test.ts` per the plan's file list even though the catalog itself
  lives in `functionCatalog.ts` — import it there; do not split the test
  file unless a lead ruling says otherwise (a mechanical convenience, not
  worth stopping for).

- [ ] **Step 2: Implement**

  `functionCatalog.ts`: transcribe C2 §3.3's table row by row —
  `{name, signature, category, status}` — the "and, or, not" keyword
  operators are **not** catalog entries (they're C2 §3.2 grammar operators,
  tokenized as `"operator"` per the test list above, not `"function"`); don't
  conflate the two. Every `NotImplemented` row in the contract table carries
  `status: "notImplemented"` verbatim — do not invent a status the contract
  doesn't state, and do not silently drop a `NotImplemented` entry from the
  transcription just because it can't be called yet (`CodePane`'s completion
  still lists it, greyed, per the plan's Step 2 "known catalog function
  names").

  `mathMode.ts`: a hand-written line tokenizer (regex-per-token-kind is fine
  here — unlike `plotForm/parse.ts`, this is a highlighter, not a
  correctness-critical parser deciding custom-vs-form; a tokenizer that
  mis-highlights a rare construct is a cosmetic bug, not a silent-wrong-value
  bug). Bracketed channel references (`[Channel Name]`, C2 §3.1) must be
  captured as one token even when they contain spaces — do not split on
  whitespace before checking for an unclosed `[`. `{cell}`/`{col[]}`
  references (C2 §4) are a second, distinct bracket form — don't conflate
  `[...]` and `{...}` tokenization.

  `CodePane.tsx`: one `EditorView` per open cell, language chosen by `kind`
  (`prose` → `@codemirror/lang-markdown`; `js`/`table` → `@codemirror/
  lang-javascript` per the plan's explicit note that `table` cells use the
  JS-mode JSON path since C2 §4's body is a JSON object; `math` → a
  `StreamLanguage` wrapping `tokenizeMath`). `onChange` fires **debounced**
  (P6) — pick and document a debounce interval (a few hundred ms is typical;
  state your choice) — the component never calls IPC itself; the parent
  (a later task) decides when a debounced change triggers `evalWorkbook`.
  Verify the exact `StreamLanguage`/`LanguageSupport` construction against
  `docs/vendor/codemirror-6/system-guide.md` before writing it — if the
  vendored doc's API shape disagrees with the plan's sketch, the vendored
  doc wins (it's the real library surface) and you note the deviation in
  your report.

  Completion source: `MATH_FUNCTIONS` (name + signature as detail text) plus
  `channelIds` plus `definitionNames`, all supplied as props — do not fetch
  or hardcode a session's channel list here.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/mathMode
  ```
  Expected: 10 passed, 0 failed.

- [ ] **Step 4: CHANGELOG**

  ```
  - **CodeMirror Code pane; C2 §8-4 math tokenizer (L6 Task 11).** Markdown/JS/math language modes by cell kind; the 69-function catalog transcribed from C2 §3.3 for highlighting and completion.
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/model/mathMode.ts src/routes/pages/Notebook/model/mathMode.test.ts src/routes/pages/Notebook/model/functionCatalog.ts src/routes/pages/Notebook/components/CodePane.tsx ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: CodeMirror Code pane with markdown/js/math modes; C2 §8-4 math tokenizer
  ```

## Do not

- Do not add a fourth CodeMirror package (or any package) to `package.json`
  yourself — it is lead-owned. If the three named packages don't transitively
  provide something you need, STOP and report rather than editing
  `package.json`.
- Do not guess at `StreamLanguage`'s API from memory or from a different
  CodeMirror major version — verify against
  `docs/vendor/codemirror-6/system-guide.md` and report if it disagrees with
  the plan's sketch.
- Do not call `evalWorkbook`, `invoke`, or any `ipc/*` function from
  `CodePane.tsx` — it only reports debounced text changes via `onChange`
  (P1, P6). Evaluation timing is a later task's decision.
- Do not conflate `and`/`or`/`not` (operator tokens per C2 §3.2 grammar) with
  `MATH_FUNCTIONS` catalog entries (C2 §3.3) — they are different tables in
  the contract.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol; `// TODO(idl0):` never bare `// TODO`;
A/A/A tests with blank lines between sections; every numeric value in a doc
comment carries its unit (`MathToken.start`/`end` in UTF-16 code units of the
single `line` argument — state explicitly whether this file uses code units
or UTF-8 bytes, since it operates on one line at a time via CodeMirror's own
line-oriented `StreamLanguage` API rather than `model/cells.ts`'s
whole-document byte-offset convention; the two conventions are legitimately
different here and a reviewer needs the doc comment to say so, not assume
Task 4's convention carries over unchanged).

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(expect 10 passed); confirmation the three CodeMirror packages were present
in `app/package.json` before you started (paste the grep); the debounce
interval you chose for `onChange` and why; whether `StreamLanguage`'s actual
API matched the plan's sketch or required a deviation (cite the vendored doc
line you checked against); which package `StreamLanguage`/`LanguageSupport`
actually come from; per-step done/deviated; anything ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).


## Lead correction 2026-09-05

The "verify Q1 landed" gate above is stale: `codemirror`, `@codemirror/lang-javascript` and `@codemirror/lang-markdown` (and the other R52 Q1 packages) ARE on `main` (`app/package.json`, shell task 1, merge `51c5050`). After `git merge main` and `npm install --no-audit --no-fund` in the worktree, verify with `ls node_modules/codemirror node_modules/@codemirror` and proceed; STOP only if they are genuinely absent after the install.
