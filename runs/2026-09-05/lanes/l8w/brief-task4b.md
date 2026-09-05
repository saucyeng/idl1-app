# L8w Task 4b — implementer brief (`WorkbookEvent.hash`, ruling R67)

You are the implementer for L8w Task 4b: the workbook file watcher gains a
`hash: string` field on every `WorkbookEvent` it emits — the sha256 of the
file's bytes after the change — so the notebook UI can suppress an event
that merely echoes its own successful save. Sequenced **after Task 5**
(plan: `docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`,
"Added by the lead 2026-09-05 (R67) -- Task 4b"). TDD, **two commits** (rust
worktree first, then the app worktree for the C3 spec amendment), then
report.

## GATE — verify before opening either worktree

Same gate as Tasks 1-4 (already passed at the L8w four-task gate,
`runs/2026-09-03/decisions.md` "L8w four-task gate (after Task 4): PASS" —
re-verify anyway, cheap):
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where — two worktrees, two commits

**Rust changes** (all of them): worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Tasks 1-5 are already on this branch —
build on top, do not start fresh.
- **Files:** modify `tauri/src/commands/workbook.rs` only. No other rust
  file changes (no `lib.rs` edit — this task adds a struct field, not a new
  command).

**C3 spec amendment** (spec-during, per R67's own text): a **fresh**
idl1-app worktree, off `main` — it does not exist yet (`git worktree list`
in the shared checkout shows only `wave2-l6-notebook` under
`idl1-app-worktrees/`, nothing for L8w). Create it before this half of the
task:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git worktree add -b wave2-l8w-write-amendment "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l8w-write-amendment" main
```
- **Files:** modify `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
  only (the `WorkbookEvent` interface block, C3 §3.4).
- Do **not** touch `app/src/` in this worktree — the UI swap (the L6
  `isSelfWrite` seam, `app/src/ipc/workbook.ts`'s `WorkbookEvent` type) is a
  **lead shell task**, not this lane's, per the lane's standing scope rule
  (`review-STANDING.md`: "This lane never touches `app/src/routes/`,
  `app/src/ipc/`, `app/src/state/`"). Confirm no `app/src/` file appears in
  your diff before committing.

Work only in these two worktrees. Do not touch the shared checkout
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` beyond reading it.
Never push.

## Read first

`CLAUDE.md` §2, §4, §5, §8; the plan's "Added by the lead 2026-09-05 (R67)
-- Task 4b" section (quoted above); `runs/2026-09-05/lanes/l8w/BRIEF.md` and
`review-STANDING.md`; `brief-task4.md` (this task's sibling — same file,
same `_via` idiom, copy its structure); ruling **R67** in full
(`runs/2026-09-03/decisions.md`, search "R67: `WorkbookEvent` gains
`hash`") and **R44** (search "R44 (Q6)" — the `based_on_hash`/`conflict`
ruling `save_workbook`'s `hash` return already satisfies); C3 §3.4's
`save_workbook` and `watch_workbook` entries (`docs/superpowers/specs/
2026-09-03-idl1-c3-ipc-surface.md`, lines ~708-741, quoted below); C4 §4
("Atomic writes" — this is the section R67 and the plan mean by "C4 §4"; it
has no separate "file watching" numbered section — its "Watcher scope"
subsection at the end is the self-write-suppression text); the landed
`tauri/src/watcher.rs` in full (`ExpectedHashSet`, `WorkbookWatcher::new` —
read this **before** the commands file, it's short and is where the actual
suppression happens); `tauri/src/commands/workbook.rs`'s `WorkbookEvent`
struct, `save_workbook_via`, and `watch_workbook_via` (lines ~104-115,
~333-389, ~417-450) — you are editing the struct and one closure, nothing
else.

## What's actually landed today (read this before writing anything)

This matters because it changes what "test a save's own event carries the
hash" can actually mean — see Question 1 below.

- `Hashes(Arc<ExpectedHashSet>)` is **app-wide managed Tauri state**
  (`tauri/src/state.rs:16`), shared between `save_workbook` and
  `watch_workbook` — not per-call, not per-window.
- `save_workbook_via` already registers the write's hash in that shared set
  **before** the atomic rename (`hashes.expect(target.clone(),
  hash.clone())`, C4 §4 step 3's load-bearing order) and already returns
  that same hash in `SaveResult.hash`. **R67's "confirm; if not, that
  return is part of the same amendment" is confirmed: `SaveResult` already
  has `hash`. No change to `save_workbook` in this task.**
- `WorkbookWatcher::new`'s `notify` callback (`watcher.rs`) hashes every
  raw filesystem event's resulting bytes and calls `check_and_consume`
  against that shared set **before** ever reaching `on_external_change`
  (`workbook.rs`'s `watch_workbook_via` closure, the thing that builds
  `WorkbookEvent`). A matching hash is swallowed silently — `continue`, no
  callback at all (`watcher.rs`, the `if hashes.check_and_consume(...) {
  continue; }` line). This is proven by an existing, passing test:
  `watch_workbook_the_apps_own_save_hash_pre_registered_no_event`
  (`commands/workbook.rs`) — a real self-write, through the real shared
  set, produces **zero** `WorkbookEvent`s, today, already.

So the suppression R67 opens with ("the UI cannot tell its own save's event
from an external edit") is, at the Rust layer, already solved — no event
for a genuine self-write ever reaches `watch_workbook_via`'s closure in the
first place. Per L6's `brief-task14.md` (line 193, quoted in the dispatch:
"frontend self-write check is defence in depth alongside the Rust
`ExpectedHashSet`"), the frontend field this task adds is an intentional
**second, independent layer** — not a fix for a bug in the first. Do not
stop on this as a contradiction; it is documented, deliberate redundancy.
It does mean **Question 1** below (how to test "a save's own event carries
the hash") needs the lead's word before you write that specific test,
because the literal scenario the plan names cannot occur through the real
code path.

## C3 §3.4 (quoted — what you are amending)

> **`save_workbook(id: string, markdown: string, based_on_hash: string | null)`**
> ...
> Return:
> ```ts
> interface SaveResult {
>   hash: string;          // sha256 of the written bytes, hex
>   saved_utc_ms: number;  // i64
> }
> ```
> ...
>
> **`watch_workbook(id: string, channel: Channel<WorkbookEvent>)`**
> ...
> ```ts
> interface WorkbookEvent {
>   kind: "changed" | "conflict";
>   cell_ids: string[];   // cells affected by this event
> }
> ```
> Errors (on the initial `Promise` only): `not_found`, `io`, `internal`.

Amend the `WorkbookEvent` block only, with a post-sign note matching the
file's existing convention (see the `based_on_hash` note immediately above
it for the exact phrasing pattern to copy):

```ts
interface WorkbookEvent {
  kind: "changed" | "conflict";
  cell_ids: string[];   // cells affected by this event
  hash: string;         // sha256 of the file's bytes after this change, hex --
                         // equals SaveResult.hash when this event reflects
                         // the app's own successful save (added post-sign,
                         // 2026-09-05, lead ruling R67)
}
```

Do not touch `save_workbook`'s block — its `hash` field already exists and
needs no post-sign note (it was never missing).

## Interface (Rust side)

```rust
/// One file-watcher event for a subscribed workbook (C3 §3.4, design §7).
#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkbookEvent {
    /// "changed" | "conflict" -- wave 1 only ever sends "changed" ...
    pub kind: String,
    /// Cells affected by this event ...
    pub cell_ids: Vec<String>,
    /// sha256 of the file's bytes after this change, hex (ruling R67) --
    /// equals `SaveResult.hash` when this event reflects the app's own
    /// successful save. Computed from the same bytes this closure already
    /// read to parse the document -- no second `std::fs::read`, no second
    /// hash function (reuses `idl_rs::store::atomic::sha256_hex`, the same
    /// helper `read_workbook`/`save_workbook` use).
    pub hash: String,
}
```

## Key logic

One closure, one new line. In `watch_workbook_via` (`commands/workbook.rs`),
the `WorkbookWatcher::new` callback already does:

```rust
let Ok(markdown) = std::fs::read_to_string(&watch_path) else { return };
let Ok((doc, _)) = parse_workbook(&markdown) else { return };
let mut prev = baseline.lock().unwrap();
let cell_ids = diff_cell_ids(&prev, &doc.cells);
*prev = doc.cells;
drop(prev);
on_event(WorkbookEvent { kind: "changed".to_string(), cell_ids });
```

Add exactly one line, hashing the `markdown` already in scope (the same
read used for parsing -- do not add a second `std::fs::read`/`read_to_string`
call):

```rust
let hash = sha256_hex(markdown.as_bytes());
...
on_event(WorkbookEvent { kind: "changed".to_string(), cell_ids, hash });
```

`sha256_hex` is already imported in this file (`use idl_rs::store::atomic::
{sha256_hex, write_atomic, AtomicWriteErrorKind};`) -- no new import.

**Mid-write / unreadable file at event time.** Not a new decision -- the
existing line immediately above (`let Ok(markdown) = ... else { return };`)
already silently drops the *entire* event (no callback at all, today,
unmodified by this task) when the file can't be read at the moment the
debounced callback fires. Since this task's `hash` is computed from that
same successful read, there is no separate "unreadable" case for `hash` to
handle -- it inherits the existing all-or-nothing behaviour. Do not add a
placeholder/sentinel hash for a case that already can't produce an event.
State this explicitly in your report so it isn't mistaken for skipped scope.

**Why `hash: String`, not `Option<String>`.** The plan's own Task 4b text
says `hash: string` (required), matching that the closure can only ever
construct a `WorkbookEvent` when it has a successful, hashable read in hand
(see above -- no code path emits an event without `markdown` bytes present).
The team lead's dispatch note that "L6 Task 14's `isSelfWrite` seam expects
`hash?: string`" describes L6's own defensive interim typing while this
Rust change was still outstanding (R67: "behind a typed seam that treats a
missing `hash` as 'unknown ⇒ reload' until the Rust lands") -- not a
requirement that the wire type stay optional once it lands. Once this task
merges, `hash` is always present; L6's optional-typed branch simply never
fires again. Do not add a `None`/`null` case to satisfy that seam -- follow
the plan's `hash: string`.

## Tests

Extend `commands/workbook.rs`'s existing `watch_workbook_*` test group
(reuse its fixtures, do not duplicate the module's setup helpers):

1. **External edit's event carries the file's hash** (extend the existing
   `watch_workbook_external_edit_to_a_watched_workbook_event_names_only_the_changed_cell`
   test, or add a sibling if extending it would blur its existing assertion
   -- implementer's call, document which): after the external
   `std::fs::write`, assert `event.hash == sha256_hex(new_content.as_bytes())`
   (hand-computed, not just "is 64 hex chars" -- matches this file's
   existing precedent in `read_workbook_via`'s hash tests).
2. **`watch_workbook_the_apps_own_save_hash_pre_registered_no_event`** stays
   exactly as it is (it proves zero events for a self-write -- there is
   nothing to add a hash assertion to; do not weaken it into asserting an
   event fires).
3. **Debounce behaviour unchanged** -- no new test needed if (1) above still
   exercises the existing ~100ms debounce path unmodified; confirm in your
   report that you didn't touch `DEBOUNCE`/`EXPECTED_HASH_TTL` or the
   pending-map logic in `watcher.rs` (you shouldn't be editing that file at
   all this task -- it's `commands/workbook.rs` only).
4. **Third test, per Question 1 below** -- do not write it until the lead
   answers; everything else in this list is unambiguous and can proceed
   immediately.

**Test filter — the gotcha already logged for this crate**
(`runs/2026-09-03/decisions.md`, "L8w four-task gate (after Task 4)"):
`cargo test` filters are substrings of the full test path, nested under
`commands::<module>::tests::` -- a filter like `commands::workbook::
watch_workbook` matches nothing. Use the test-fn prefix instead:
```
cargo test -p idl-rs-tauri watch_workbook_
```
Confirm non-zero `passed` and report the count.

**`pub`-change check:** `cargo check -p idl-rs-tauri` (struct gains a
field; every construction site is inside this same file, already updated
by you). No `core` change in this task, so `cargo check -p idl-rs-cli
--tests` is not required.

## The task, in order

- [ ] **Step 1:** confirm the gate; open the rust worktree (already exists,
      reuse it).
- [ ] **Step 2:** write/extend the failing test(s) from the Tests section
      above (excluding Question 1's pending test).
- [ ] **Step 3:** add the `hash` field to `WorkbookEvent` and the one-line
      hash computation in `watch_workbook_via`'s closure.
- [ ] **Step 4:** `cargo test -p idl-rs-tauri watch_workbook_`, confirm
      non-zero `passed`.
- [ ] **Step 5:** `cargo check -p idl-rs-tauri` clean.
- [ ] **Step 6:** commit in the rust worktree, explicit paths:
      `git add tauri/src/commands/workbook.rs` — message
      `tauri: WorkbookEvent.hash -- self-write-suppression seam for the notebook (C3 3.4, R67)`.
      Single line, no AI attribution trailer.
- [ ] **Step 7:** create the fresh idl1-app worktree (command above), amend
      C3 §3.4's `WorkbookEvent` block as specified.
- [ ] **Step 8:** commit in the idl1-app worktree, explicit paths:
      `git add docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` —
      message
      `docs: C3 3.4 WorkbookEvent.hash post-sign amendment (R67)`.
      Single line, no AI attribution trailer.
- [ ] **Step 9:** report back (see below), naming Question 1 explicitly if
      you reached it without an answer.

## Do not

- Do not touch `tauri/src/watcher.rs` — this task's only Rust edit is
  inside `commands/workbook.rs`'s `watch_workbook_via` closure and the
  `WorkbookEvent` struct.
- Do not touch `tauri/src/lib.rs` — no command signature changes, nothing
  new to register.
- Do not touch `save_workbook`/`save_workbook_via` — its `hash` return
  already exists (confirmed above); adding a second, redundant field or
  comment there is out of scope.
- Do not touch `app/src/` in either worktree.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.
- Do not invent a placeholder/sentinel `hash` value for the mid-write-file
  case — that case already drops the whole event, unchanged.

## Style / hygiene

Doc comment on the new field explaining *why* it exists (self-write
suppression, defence in depth alongside the Rust-side `ExpectedHashSet`) so
a future reader doesn't assume it duplicates existing suppression for no
reason. A/A/A tests, blank line between arrange/act/assert, names
`thing — condition — result`. No `cargo fmt`. Match `commands/workbook.rs`'s
existing style by hand (CLAUDE.md §7).

## Spec discipline (say it out loud in your report)

**Spec-during** — C3 §3.4 amended in the same task, per the plan's own
framing of Task 4b and R67's text ("Task 4b (watcher, `commands/
workbook.rs`, C3 text spec-during)").

## Open question — needs the lead's ruling before you write this one test

**Question 1: how should "a save's own event carries the hash `save_workbook`
returned" (plan's Task 4b test list) actually be tested, given that a
genuine self-write produces *zero* `WorkbookEvent`s through the real code
path (proven, existing, passing test — see "What's actually landed today"
above)?** The literal scenario named cannot occur end-to-end. Two ways to
satisfy the letter of the requirement without weakening the real
suppression test:

  (a) **Bypass suppression deliberately, to test the hash-attachment
      mechanism in isolation.** Call `watch_workbook_via` with an
      `ExpectedHashSet` that does **not** have this write's hash
      registered (simulating "if this ever reached the closure"), write
      the exact bytes `save_workbook_via` would have written, and assert
      the resulting event's `hash` equals a hash computed the same way
      `save_workbook_via` computes `SaveResult.hash`. This tests "the two
      hash computations agree," not "a self-write's event carries a hash"
      — the self-write case specifically never reaches this closure.
  (b) **Drop the test as literally unwritable** and instead note in the
      CHANGELOG/report that the property holds by construction: both
      `save_workbook_via`'s `SaveResult.hash` and `watch_workbook_via`'s
      `WorkbookEvent.hash` call the same `sha256_hex` over the file's
      current bytes, so they are trivially equal for identical content —
      already covered by each function's own existing hash test
      independently, with no need for a joint test that can't exercise a
      real code path.

Recommendation: **(b)**, on the grounds that (a) tests a scenario the
system is specifically designed to prevent, and dressing that up as "a
save's own event" would misdescribe what the test actually proves to a
future reader. But this is exactly the kind of shape decision CLAUDE.md §1
says not to guess on — stopping here rather than picking either silently.

## Report back (concise)

Two commit hashes (rust, then app) + `git show --stat` for each; the
`cargo test -p idl-rs-tauri watch_workbook_` result line with its `passed`
count; `cargo check -p idl-rs-tauri` result; confirmation no `app/src/`
file appears in either diff; confirmation `watcher.rs` and `lib.rs` are
untouched; Question 1's answer if you received one before finishing, or an
explicit flag that you stopped there and left that one test unwritten
pending the lead's ruling (CLAUDE.md §1 — stop and report, don't guess).

## Lead ruling 2026-09-05

Option (b): the Rust-side `ExpectedHashSet` already suppresses a genuine self-write before any `WorkbookEvent` is built (existing test), so "a save's own event carries the saved hash" holds by construction (same `sha256_hex`, same bytes) and is NOT tested as a joint scenario. Required tests: (1) an external edit's event carries `sha256_hex` of the file's bytes after the change; (2) a unit test that the closure's hash computation equals `sha256_hex` over the same bytes `save_workbook_via` would hash. `hash` is required (`String`), not optional; the L6 seam's `hash?:` is the interim UI typing only. R67's ledger text is amended to record that the field is defence in depth for the UI layer, not a fix to a Rust gap.
