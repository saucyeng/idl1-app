# L8w Task 4c — implementer brief (prose `CellOutput.html`, ruling R69 item 4)

You are the implementer for L8w Task 4c: `eval_workbook`'s per-cell prose
text (`prose_before`/`prose_after`, C2 §2.4) gets rendered to HTML by core's
already-vendored `pulldown-cmark`, with each `${…}` inline span (C2 §5.2)
left as a `<span data-span-id="…"></span>` placeholder for the sandbox to
fill later (L6 Task 13b, not this task). Sequenced **after Task 4b**
(plan: `docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`,
"Added by the lead 2026-09-05 (R69) -- Task 4c"). TDD, **two commits** (rust
worktree, then the app worktree for the C3 spec amendment), then report.

## GATE — verify before opening either worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where — two worktrees, two commits, both already exist by the time this runs

**Rust changes:** worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Task 4b's commit is already on this
branch — build on top.
- **Files:** create a new core module (recommended:
  `rust/core/src/workbook/v3/prose.rs` — a new file, since rendering is a
  distinct concern from `js_cell.rs`'s own stated scope, "parsing/evaluating
  the JavaScript itself is L6's job; this module only finds byte spans" —
  implementer's call if a different location fits better, document it),
  `rust/core/src/workbook/v3/mod.rs` (register + re-export),
  `rust/tauri/src/commands/workbook.rs` (`CellOutput`, `eval_workbook_via`).
  No `lib.rs` change (no new command, no signature change to `eval_workbook`
  itself — only its return type's shape).

**C3 spec amendment (spec-during):** the **same** idl1-app worktree Task 4b
created (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`) — do **not** create a second one; Task
4b's commit should already be there. If it somehow isn't (Task 4b not yet
merged to this branch), stop and report rather than improvising.
- **Files:** modify `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
  only (the `CellOutput` interface block, C3 §3.4).
- Do **not** touch `app/src/` — the L6 consumer (Task 13b, not yet briefed)
  is a separate lead-dispatched task, per this lane's standing scope rule.

Work only in these two worktrees. Never push.

## Read first

`CLAUDE.md` §2 ("Rust = numbers, JS = pictures" — this task renders text to
markup, still core's job, no pixels involved), §4, §5, §8; the plan's
"Added by the lead 2026-09-05 (R69) -- Task 4c" section (quoted above);
ruling **R69** in full (`runs/2026-09-03/decisions.md`, search "R69: cell
outputs render inside the sandbox iframe" — item 4 is this task's charter,
but read the whole ruling for why: the host/sandbox security boundary this
task's escaping decision serves); ruling **R21**/**R22** (search "R21: L3
Tasks 6-9" and the C3 `CellOutput` post-sign notes at
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` lines ~665-683 —
read this block closely, see "A pre-existing spec inconsistency" below);
`rust/core/src/workbook/v3/cell.rs` (`CellDoc.prose_before`/`prose_after` —
what you're rendering) and its module doc comment; `rust/core/src/workbook/
v3/js_cell.rs` **in full** — `find_inline_exprs`/`InlineExpr` is the C2
§5.2 span scanner you reuse, not reimplement (see "What's already landed"
below); `rust/tauri/src/commands/workbook.rs`'s `CellOutput` struct and
`eval_workbook_via` (the `.zip(doc.cells.iter())` loop — `cell_doc` is
already in scope there with `.id`/`.prose_before`/`.prose_after`);
`app/src/routes/pages/Notebook/components/ProseSpan.tsx` and its use in
`app/src/routes/pages/Notebook/components/CellList.tsx` /
`app/src/routes/pages/Notebook/index.tsx` — the **current, client-side**
span-id-prefix convention (`${cell.id}-before` / `${cell.id}-after`, then
`:{ordinal}`) this task's placeholder ids must match (see "Placeholder id
convention" below).

## What's already landed — reuse it, don't reimplement it

`rust/core/src/workbook/v3/js_cell.rs`'s `find_inline_exprs(prose: &str) ->
Vec<InlineExpr>` **already implements C2 §5.2's `${…}` scanner correctly**:
brace-depth-aware (nested `{}`/string-literal-aware, not a naive first-`}`
match), and — importantly, more correct than the current TS scanner — it
**skips `${…}` occurrences pulldown-cmark reports as inline code or inside
a code block** (inert, L3-R24), landed but with **zero callers anywhere in
the codebase today** (`grep -rn "find_inline_exprs" core/src tauri/src`
turns up only its own definition and the `mod.rs` re-export). This task is
the first real consumer. **Do not write a second `${…}` scanner** — call
`find_inline_exprs`, and build your placeholder substitution from its
`Vec<InlineExpr>` (already sorted in document order — the scan is a single
left-to-right byte walk).

**Known, pre-existing, out-of-scope divergence worth stating in your
report, not fixing:** `ProseSpan.tsx`'s `extractInlineSpans` uses a plain
`/\$\{([^}]*)\}/g` regex with **no** inert-code-span awareness — a `${x}`
written inside backticks is (incorrectly) still matched client-side today,
while `find_inline_exprs` correctly skips it. For prose containing an inert
`${…}` inside code, this task's placeholder numbering and the current TS
scanner's numbering would disagree. This is an existing TS-side gap (not
introduced by this task, not this lane's file to fix — `app/src/` is out of
scope) that whoever writes L6 Task 13b needs to know about: once the
sandbox consumes this task's `html` field as the source of truth, that
divergence stops mattering (TS's own scan of the raw text becomes
unnecessary) — but until then, note it, don't silently paper over it, and
don't attempt a `find_inline_exprs`-matching fix in `ProseSpan.tsx` (out of
this lane's directory).

## A pre-existing spec inconsistency you are closing

C3 §3.4's `CellOutput` interface's `kind` field carries this post-sign note
(R21): *"prose has no fence id and never gets its own `CellOutput` entry;
it travels as `prose_before`/`prose_after` (C2 §2.4) on the fenced cell
it's attached to."* But the interface block **does not actually list**
`prose_before`/`prose_after` (or any prose field) anywhere — the claim in
the comment was never implemented. Today, prose reaches the frontend by an
entirely separate path (the client re-scans `read_workbook`'s raw markdown
itself, `app/src/routes/pages/Notebook/model/cells.ts`'s
`proseBeforeRange`/`proseAfterRange`) — `eval_workbook`'s `CellOutput`
carries no prose at all. This task is what actually gives `CellOutput` a
prose field for the first time; say so plainly in your CHANGELOG bullet
(this isn't scope creep, it's finishing something R21's own comment already
claimed was true).

## Interface — core

```rust
/// Renders one block of prose Markdown (`CellDoc::prose_before`/
/// `prose_after`, C2 §2.4) to HTML via `pulldown-cmark`, with every `${…}`
/// inline span (C2 §5.2, found via [`find_inline_exprs`] -- not
/// re-scanned) replaced by a `<span data-span-id="{span_id_prefix}:{i}">
/// </span>` placeholder, `i` 0-indexed in document order -- matching
/// `ProseSpan.tsx`'s `extractInlineSpans` numbering convention exactly so
/// a consumer that already knows how to fill spans by that convention
/// needs no new plumbing (see the brief's "Placeholder id convention").
///
/// Raw HTML the author typed in `text` (a literal `<script>`, `<b>`, an
/// HTML comment -- CommonMark's "raw HTML" grammar) is **escaped, not
/// passed through** -- see the doc comment on the private HTML-escaping
/// step below for why `pulldown_cmark::html::push_html`'s default
/// (verbatim passthrough) is not used here unmodified.
pub fn render_prose_html(text: &str, span_id_prefix: &str) -> String
```

## Interface — C3 / `CellOutput` (**Question 1 — confirm before landing**)

The plan's own Task 4c text says "`eval_workbook`'s prose `CellOutput`
gains `html: string`" (singular). But C2 §2.4 and the already-landed
`CellDoc` struct carry prose as **two** independent, optional fields
(`prose_before`, `prose_after` — only the *last* cell in a document ever
has a non-`None` `prose_after`). A single `html` field on `CellOutput`
doesn't obviously map onto that without deciding which of the two it means,
or whether it means both concatenated (losing the "attaches before vs.
after this cell" distinction `CellList.tsx` currently renders as two
separate DOM regions around each cell).

This brief's recommendation — **do not implement until confirmed** —
mirrors `CellDoc` one-to-one:
```ts
interface CellOutput {
  cell_id: string;
  kind: "math" | "table" | "js";
  value: unknown | null;
  defs: CellDefResult[];
  errors: IpcError[];
  prose_before_html: string | null;   // NEW -- rendered HTML of prose_before, null when CellDoc.prose_before is None
  prose_after_html: string | null;    // NEW -- only ever non-null on the last cell (C2 §2.4); null otherwise
}
```
Rust: `pub prose_before_html: Option<String>`, `pub prose_after_html:
Option<String>`, computed in `eval_workbook_via`'s existing `.zip(doc.cells
.iter())` loop as `cell_doc.prose_before.as_deref().map(|t|
render_prose_html(t, &format!("{}-before", cell_doc.id)))` (and the `-after`
equivalent).

**Also flag, do not decide:** should `CellOutput` carry the span→expression
mapping (`js_expr` per `data-span-id`) alongside `html`, so the eventual
sandbox consumer (L6 Task 13b) doesn't need its own `${…}` scan of raw text
at all (closing the TS/core numbering divergence noted above at the root)?
The dispatch's scope names only `html: string` — this brief takes that
literally and does **not** add a spans/exprs field, but the gap is real:
without it, Task 13b's sandbox can only fill placeholders by re-deriving
`js_expr` per ordinal from the raw prose text itself (the same client-side
scan that has the inert-code-span bug). Worth the lead's five-second
confirmation that `html`-only is intentional for this task, with the
spans-plumbing question deferred to Task 13b's own brief.

## Key logic — the escape decision (this is specified, not open)

`pulldown_cmark::html::push_html` **passes raw HTML through unescaped by
design** — verified directly against the vendored 0.13.4 source
(`html.rs`: `Html(html) | InlineHtml(html) => { self.write(&html)?; }`,
no escaping call). This is correct, spec-following CommonMark behaviour for
a renderer with no security boundary to defend — but this app's `.idl1wb`
files can arrive from LAN sync (a peer's workbook, C4 §6), and R69's own
model is explicit that prose HTML lands somewhere a script tag or an
`onerror=` attribute would execute (the sandbox iframe, once Task 13b
wires it up). **Escape it**: walk the parsed event stream and turn every
`Event::Html`/`Event::InlineHtml` into an escaped `Event::Text` *before*
calling `push_html`, so raw HTML the author typed renders as visible
literal text (`&lt;script&gt;`), never as markup:

```rust
fn escape_html_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}
```
Hand-rolled deliberately, not a new dependency: the escaper `html.rs`
itself uses (`pulldown_cmark_escape::escape_html`) lives in a **separate**
crate (`pulldown-cmark-escape`) that is not currently a dependency of
`core`, and this plan's own Tech Stack line says "no new Rust dependency."
Three characters need escaping; write the loop, don't add the crate.

Do not pre-escape the *whole* input text before parsing (would double the
ordinary escaping `push_html` already does correctly for plain `Event::Text`
runs — e.g. a literal `&` in prose would become `&amp;amp;`). Only the
`Html`/`InlineHtml` event branches get this treatment; every other event
(`Text`, `Code`, headings, emphasis, etc.) goes through `push_html`
unmodified — its own escaping there is already correct.

## Key logic — full pipeline

```rust
use pulldown_cmark::{html, Event, Options, Parser};
use super::find_inline_exprs;

pub fn render_prose_html(text: &str, span_id_prefix: &str) -> String {
    // 1. Find spans with the existing, correct scanner -- do not rescan.
    let spans = find_inline_exprs(text);

    // 2. Substitute each span's exact byte range (already given by
    //    InlineExpr) with a plain-alphanumeric sentinel token, unique to
    //    this call, so the markdown parser sees ordinary text there (no
    //    markdown-special characters, no risk of the sentinel itself
    //    forming accidental emphasis/HTML syntax).
    let nonce = uuid::Uuid::new_v4().simple().to_string(); // `uuid` already a core dependency
    let sentinel = |i: usize| format!("IDL1WBSPAN{nonce}_{i}");
    let mut with_sentinels = String::with_capacity(text.len());
    let mut cursor = 0usize;
    for (i, span) in spans.iter().enumerate() {
        with_sentinels.push_str(&text[cursor..span.start]);
        with_sentinels.push_str(&sentinel(i));
        cursor = span.end;
    }
    with_sentinels.push_str(&text[cursor..]);

    // 3. Parse + render, neutralising raw HTML per the escape decision above.
    let events: Vec<Event> = Parser::new_ext(&with_sentinels, Options::empty())
        .map(|ev| match ev {
            Event::Html(s) | Event::InlineHtml(s) => Event::Text(escape_html_text(&s).into()),
            other => other,
        })
        .collect();
    let mut out = String::new();
    html::push_html(&mut out, events.into_iter());

    // 4. Swap each sentinel for its real placeholder element, in order.
    //    Sentinels contain no markdown/HTML-special characters, so they
    //    survive steps 2-3 byte-identical and this plain string replace is
    //    exact -- no risk of a partial/false match against real content.
    for i in 0..spans.len() {
        out = out.replace(&sentinel(i), &format!(r#"<span data-span-id="{span_id_prefix}:{i}"></span>"#));
    }
    out
}
```

(`Options::empty()` matches `cell.rs`'s/`js_cell.rs`'s own existing
precedent — do not enable extra pulldown-cmark options like tables/strikethrough
unless a fixture actually needs one; document if you add any.)

## Placeholder id convention — must match the existing frontend exactly

`app/src/routes/pages/Notebook/index.tsx:264,268` and
`components/CellList.tsx:64,74` already call `extractInlineSpans(text,
\`${cell.id}-before\`)` / `` `${cell.id}-after` ``, producing span ids
`` `${prefix}:${ordinal}` `` (e.g. `"a1b2c3d4-before:0"`). Pass
`span_id_prefix = &format!("{}-before", cell_doc.id)` and `&format!("{}-after",
cell_doc.id)` from `eval_workbook_via` so this task's `data-span-id` values
land in the exact string space the existing (soon-to-be-superseded) client
code already expects, in case any interim consumer keys off it before Task
13b lands. If Task 13b's brief later needs a different convention, that's a
cheap rename on a brand-new field — not a reason to invent a different one
now with no anchor in the existing codebase.

## Tests — core (`rust/core/src/workbook/v3/prose.rs` or wherever you place it)

1. **`render_prose_html_heading_bold_and_two_spans_placeholders_in_document_order`**
   (or similar A/A/A name): input with a heading, bold text, and two `${…}`
   spans (e.g. `"# Title\n\nSome **bold ${a} text** and ${b}.\n"`). Assert:
   the heading renders inside `<h1>...</h1>` containing "Title"; the bold
   text renders inside `<strong>`; `data-span-id="prefix:0"` appears
   **before** `data-span-id="prefix:1"` in the output string (order); no
   literal `${` remains anywhere in the output (full substitution); exact
   full-string assertion if you can pin pulldown-cmark's precise output
   deterministically, substring/ordering assertions otherwise — document
   which.
2. **Raw HTML is escaped, not passed through.** Input containing a literal
   inline HTML tag pulldown-cmark recognises (e.g. `"Some <b>bold</b> text"`
   or an HTML comment `"<!-- hi -->"`). Assert the output contains the
   **literal, escaped** text (`&lt;b&gt;`) and does **not** contain an
   unescaped `<b>` tag — this is the test that actually proves the escape
   step works, not just "compiles the same as before."
3. **No spans → no placeholder substitution, ordinary rendering.** Plain
   prose with no `${…}` renders through untouched (sanity check that the
   sentinel machinery is a no-op when `spans` is empty).
4. **An inert `${…}` inside a code span is not treated as a placeholder**
   (reuses `find_inline_exprs`'s own already-tested behaviour — one thin
   test here confirming `render_prose_html` doesn't break that guarantee,
   not a re-test of `find_inline_exprs` itself, which has its own test
   module already).

**Test filter:** `cargo test -p idl-rs render_prose_html`

## Tests — tauri (`commands/workbook.rs`)

Extend `eval_workbook_via`'s existing test fixtures with a workbook whose
first cell has non-empty `prose_before` containing a heading and a span;
assert the returned `CellOutput.prose_before_html` (or whatever field name
Question 1 settles) is `Some(html)` where `html` matches
`render_prose_html`'s own output for that exact text and prefix (hand-call
`render_prose_html` in the test to build the expected string — don't
hand-write a second copy of the expected HTML). Assert `prose_after_html`
is `None` for a cell that isn't the last one in the document (C2 §2.4).

**Test filter:** `cargo test -p idl-rs-tauri eval_workbook_via` (per the
already-logged crate gotcha — `commands::workbook::eval_workbook` matches
nothing; use the test-fn prefix or `commands::workbook::` module instead).

**`pub`-change check:** `cargo check -p idl-rs-cli --tests` (new `pub fn`
in `core`) **and** `cargo check -p idl-rs-tauri` (new fields on a
`serde::Serialize` struct — every construction site is in the same file,
already updated by you).

## C3 §3.4 amendment (quoted — what you are amending)

Current (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
~line 667):
```ts
interface CellOutput {
  cell_id: string;
  kind: "math" | "table" | "js";             // "prose" removed -- ...
  value: unknown | null;
  defs: CellDefResult[];
  errors: IpcError[];
}
```
Amend to (pending Question 1's confirmation of field names) — add a
post-sign note in this file's existing style, citing R69 and noting the
R21-comment-vs-shape gap this task closes:
```ts
interface CellOutput {
  cell_id: string;
  kind: "math" | "table" | "js";
  value: unknown | null;
  defs: CellDefResult[];
  errors: IpcError[];
  prose_before_html: string | null;  // added post-sign (2026-09-05, R69 item 4) --
                                      // rendered HTML of this cell's prose_before (C2 2.4);
                                      // null when there is none. ${...} spans (C2 5.2)
                                      // appear as <span data-span-id="{cell_id}-before:{i}"></span>
                                      // placeholders, i 0-indexed in document order, for
                                      // the sandbox to fill (R69). Raw HTML the author
                                      // typed is escaped, never passed through.
  prose_after_html: string | null;   // same, prose_after -- non-null only on the last cell (C2 2.4)
}
```

## The task, in order

- [ ] **Step 1:** confirm the gate; open the rust worktree (reuse Task 4b's).
- [ ] **Step 2:** get Question 1 answered (field shape) before writing the
      `CellOutput`/C3 changes — the core `render_prose_html` function and
      its tests do not depend on the answer and can be written first.
- [ ] **Step 3:** write core's `render_prose_html` + its tests (Tests —
      core, above).
- [ ] **Step 4:** `cargo test -p idl-rs render_prose_html`, confirm
      non-zero `passed`.
- [ ] **Step 5:** wire `CellOutput`'s new field(s) and `eval_workbook_via`'s
      computation, per Question 1's answer; write the command-level test.
- [ ] **Step 6:** `cargo test -p idl-rs-tauri eval_workbook_via`, confirm
      non-zero `passed`.
- [ ] **Step 7:** `cargo check -p idl-rs-cli --tests` and `cargo check -p
      idl-rs-tauri`, both clean.
- [ ] **Step 8:** commit in the rust worktree, explicit paths (list every
      file you touched — `core/src/workbook/v3/prose.rs` (or your chosen
      path), `core/src/workbook/v3/mod.rs`,
      `tauri/src/commands/workbook.rs`) — message
      `core+tauri: prose CellOutput.html -- pulldown-cmark rendering with span placeholders (C3 3.4, R69)`.
      Single line, no AI attribution trailer.
- [ ] **Step 9:** amend C3 §3.4's `CellOutput` block in the existing idl1-app
      worktree; commit — `git add docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
      — message `docs: C3 3.4 CellOutput prose html post-sign amendment (R69)`.
- [ ] **Step 10:** report back.

## Do not

- Do not write a second `${…}` scanner — reuse `find_inline_exprs`.
- Do not add `pulldown-cmark-escape` (or any new crate) as a dependency —
  hand-roll the three-character escape.
- Do not pre-escape the whole input text before parsing (double-escaping
  bug — see "Key logic — the escape decision").
- Do not touch `js_cell.rs`'s existing scanner logic or tests.
- Do not touch `app/src/` in either worktree — the sandbox/frontend
  consumer is L6 Task 13b, not yet briefed.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.
- Do not decide Question 1 yourself if you reach it without an answer —
  stop and report (CLAUDE.md §1).

## Style / hygiene

Doc comments explaining *why* raw HTML is escaped (cite R69, the sandbox
security boundary) so a future reader doesn't "simplify" it back to
`push_html`'s default. A/A/A tests, blank line between arrange/act/assert,
names `thing — condition — result`. No `cargo fmt`. Match `cell.rs`/
`js_cell.rs`'s existing style by hand (CLAUDE.md §7) — they're the two
closest precedents in this exact directory.

## Spec discipline (say it out loud in your report)

**Spec-during** — C3 §3.4's `CellOutput` amended in the same task, per R69
item 4's own framing ("additive C3 §3.4, L8w Task 4c").

## Open questions — need the lead's ruling before certain steps

**Question 1 (blocking Steps 5/9 only, not Steps 2-4):** confirm
`CellOutput` gains **two** fields, `prose_before_html: string | null` and
`prose_after_html: string | null` (mirroring `CellDoc` exactly), rather
than the plan text's literal singular `html: string` — and confirm whether
a spans→`js_expr` mapping should travel alongside `html` for Task 13b's
future sandbox consumer, or whether that consumer is expected to re-derive
`js_expr` per span itself (from the raw prose text it already has via
`read_workbook`, using `find_inline_exprs`-equivalent logic client-side,
which does not exist yet — today's `ProseSpan.tsx` scanner is the less
correct regex one). This brief's recommendation: two fields, no spans/exprs
field in this task (defer that question to Task 13b's own brief) — but
this changes the signed C3 contract shape, so confirm before Steps 5/9.

## Report back (concise)

Two commit hashes (rust, then app) + `git show --stat` for each; the
`cargo test -p idl-rs render_prose_html` and `cargo test -p idl-rs-tauri
eval_workbook_via` result lines with their `passed` counts; both `cargo
check` results; confirmation no `app/src/` file appears in either diff;
confirmation `js_cell.rs` is untouched; Question 1's answer (or an explicit
flag that Steps 2-4 are done and Steps 5/9 are blocked pending it).

## Lead ruling 2026-09-05 (R70)

Shape: `CellOutput` gains `prose_before_html: Option<String>`, `prose_after_html: Option<String>` (mirroring `CellDoc` one-to-one) and `prose_spans: Vec<{ id: String, expr: String }>` in document order from `find_inline_exprs` (the only scanner). Each span renders as `<span data-span-id="<id>"></span>`; ids are stable per (cell, index). Raw HTML escaped as the brief specifies. Amend C3 section 3.4 accordingly (spec-during). The sandbox consumer is L6; no `app/src` edit here.
