# L11 Task 11 / Task 11b / Task 10-fix review

Commits reviewed, `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\l11-sync` (branch `l11-sync`):
- `e03a5c7` — transport: loopback two-peer sync tests (L11 Task 11)
- `d339920` — transport: L11 Task 10 review fixes (R102) — client caps, `.part` discard, id shape validation
- `2c219d8` — core: fix render_workbook/parse_workbook fixed-point bug around fence closes (R103)

idl1-app docs, `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\l11-sync`:
- `44cfab9` — CHANGELOG bullet, Task 11
- `0bf6591` — C3 §3.9 `SyncResult` gains three fields (R102)
- `d9a79e8` — CHANGELOG bullet, Task 11b (R103)

Files touched: `transport/src/sync/loopback_tests.rs` (new), `transport/src/sync/mod.rs`;
`transport/src/sync/client.rs`; `core/src/workbook/v3/mod.rs`;
`CHANGELOG.md` (idl1-app); `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`.

Test command: none run — Rust lane, cargo forbidden for reviewers per CLAUDE.md §8.
Verified statically by reading source and doing the arithmetic by hand:

- `transport/src/sync/client.rs`: 14 `#[tokio::test]` + 3 plain `#[test]` = **17**,
  matching the reported `sync::client` 17 passed.
- `transport/src/sync/{client,discovery,loopback_tests,pairing,range,server}.rs`
  test-attribute counts sum to 17+8+10+11+10+18 = 74, minus discovery.rs's one
  `#[ignore]`d test = **73 passed, 1 ignored**, matching `sync::` exactly.
- `core/src/workbook/v3/*.rs` `#[test]` counts sum to 6+6+10+6+13+13+5+6+18+12+4+11+2+2
  = **114**, matching `workbook::v3` exactly.
- `SyncClass` (`core/src/store/sync/diff.rs`) has exactly 7 variants; `body_cap` and
  `item_shape_is_valid`'s two match arms in `client.rs` are both exhaustive over all 7
  with no wildcard — no class silently falls through uncapped or unvalidated.
- `server.rs`'s `MAX_DOCUMENT_BODY_BYTES = 16 * 1024 * 1024` and
  `MAX_RAW_FILE_BODY_BYTES = 512 * 1024 * 1024` are copied byte-for-byte as the
  client's own constants in `d339920`.
- `is_valid_id`/`IdClass` (`core/src/store/sync/ids.rs`) signatures match the call
  in `item_shape_is_valid`; cross-checked against `diff.rs`'s actual `key`
  construction per class (`Blob`/`Derived` = sha256 hex, `DataParquet`/`SessionJson`
  = session id, `Workbook`/`Track`/`Profile` = UUID) — the `IdClass::Session`/`Uuid`
  split in `item_shape_is_valid` matches every class's real key shape.
- Only one `.expect()` survives in `client.rs`'s non-test code
  (`tmp_part_path always has a tmp/ parent`, on a locally-constructed path, not
  peer data); no `.unwrap()` on peer-controlled bytes anywhere in production code.
- pulldown-cmark 0.13.4 traced directly in
  `~/.cargo/registry/src/.../pulldown-cmark-0.13.4/src/firstpass.rs`'s
  `parse_fenced_code_block` (`self.pop(ix)` at `close_ix + n`, i.e. right after the
  closing fence characters, *before* `scan_blank_line` consumes the trailing `\n`)
  and `parse.rs`'s `OffsetIter::next` (`Start`'s and `End`'s ranges are the same
  tree node's `item.start..item.end`) — the R103 fix's claimed byte range is
  exactly what the crate does, not an assumption.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| None | — | No findings. | — |

## 1. The R103 fixed-point fix (`2c219d8`)

Verified from both sides, not taken on trust. `scan_cells`'s `segment_start =
range.end` (`core/src/workbook/v3/cell.rs:189`) uses the `CodeBlock` node's
`item.end`, which pulldown-cmark 0.13.4 sets via `self.pop(close_ix + n)` —
strictly before the closing fence's own line-ending newline is consumed by
`scan_blank_line`. So the trailing `\n` after a closing ` ``` ` is already the
first byte of whatever `prose_before`/`prose_after`/`trailing_prose` follows,
never inside `raw_fence_body`. The old renderer's hard-coded `"```\n"`
therefore doubled that byte on every render; the fix (`out.push_str("```")`,
letting the newline arrive via the following prose span) is exactly the right
correction, not a guess.

Edge cases: a fence at EOF with no trailing newline is covered
(`render_workbook_is_a_fixed_point_no_trailing_newline_at_all`) — remainder is
empty, nothing is appended, matches. Two fences with no blank line between is
covered (`..._two_adjacent_fences_no_blank_line_between`) — the second cell's
`prose_before` becomes exactly the one `\n` between them, preserved verbatim.
Both pass by the same reasoning I traced above, not just by running the
suite. All seven fixtures were checked against the ruling's ask (C2 §2.5
worked example, prose-only, adjacent fences, trailing whitespace) plus three
more (front matter with every optional field, no trailing newline, two blank
lines before prose) — a superset of what R103 asked for.

The front-matter exclusion is genuinely sanctioned, not a second bug hiding
behind a carve-out: C2 §7.1 states front matter is "merged **per top-level
key**" as structured values (`id`, `name`, `units`, `constants`), never raw
YAML bytes, and `render_front_matter`'s own pre-existing doc comment states
its contract is round-trip-to-same-struct, "not the exact bytes emitted."
Since §7.2's `Unchanged`/`Changed` byte comparison (`core/src/workbook/merge/
cells.rs:32-37`, `same_content`) only ever compares `raw_fence_body`,
`prose_before`, and `prose_after` — never front-matter bytes — a
reformatted-but-equivalent front matter block cannot manufacture R103's
spurious-`Changed` bug. The doc comment's claim is correct.

`same_content` also confirms *why* R103 was real: it compares `prose_before`/
`prose_after` byte-for-byte, not just `raw_fence_body`, so the renderer's
extra byte genuinely could (and did) misclassify an untouched cell after one
render/reparse hop.

## 2. R102 fixes (`d339920`)

All three review-task10 Importants and the Minor are closed correctly:

- **Unbounded peer response** — `body_cap` mirrors the server's per-tier caps
  exactly (verified above); `fetch_manifest` and `download_item` both refuse
  an over-cap `Content-Length` up front and re-check the running total every
  chunk (covers a peer that omits or lies about `Content-Length`).
- **`.part` discard** — `pull_and_install` now discards the `.part`
  unconditionally once `download_item` returns complete bytes, regardless of
  whether `install` succeeds. `download_item` itself now also discards a
  `.part` on a `416` or a `206` whose `Content-Range` start mismatches. Both
  of review-task10's named adversarial tests are present and assert the
  `.part` is gone and a second run recovers.

  **On the "widened R102's literal" question**: the ruling's wording ("any
  failure after the bytes are complete... deletes the `.part`... a transport
  interruption (incomplete bytes) keeps it") was written for the general
  network-drop case, where keeping the partial is the entire point of
  resume. The 416 and mismatched-`Content-Range`-start cases are different in
  kind: both are *proof the existing `.part` can never validly resume against
  this peer's current state* (the peer's content is now shorter, or it
  answered a resume at the wrong offset) — keeping it would not preserve any
  resumable work, it would just reproduce the identical failure on every
  future run, which is the exact infinite-loop bug R102 was raised to close.
  Discarding here is the correct extension of the ruling's intent, not a
  deviation from it, and it's necessary: without it, the "peer returns a
  shorter file" adversarial case (416, caught before bytes are complete)
  would still loop forever.
- **`SyncRunResult`/C3 §3.9** — the amendment
  (`0bf6591`) lists all six fields with each one's attribution copied
  verbatim from `SyncRunResult`'s own doc comments in `client.rs` (checked
  field-by-field against `tally_success`'s actual increments: `blobs_transferred`
  and `tracks_updated`/`profiles_updated` count pull+push, `workbooks_merged`
  counts pull-only, `sessions_updated` is a distinct-session-id set touched by
  any successful `DataParquet`/`Derived`/`SessionJson` transfer). The amendment
  is dated 2026-09-07, attributes the ruling (R102, L11 Task 10 review), and
  states Task 12 is the consumer — matches CLAUDE.md §6's spec-during
  discipline.
- **Minor (id shape)** — `item_shape_is_valid` runs before any peer-sourced
  `session_id`/`key` is hashed into the `.part` name, and its
  `IdClass::Session`/`IdClass::Uuid` split matches every `SyncClass`'s actual
  key shape in `diff.rs` (confirmed above), closing the colon-join collision.

## 3. The loopback proof (`e03a5c7`)

All ten brief-named scenarios are present as named `#[tokio::test]` functions
and assert on resulting files, not just returned counts (session import,
workbook one-sided push, zero-conflict two-sided edit, one-conflict two-sided
edit, idempotent re-run, track LWW + reverse-direction no-op, `session.json`
per-field survival, killed-and-restarted server resume, unpaired-401, and
tmp/catalog cleanliness).

Pairing is real: `pair()` drives an actual `POST /pair` against a live
`SyncServer` and parses a real `PairResponse`, no mocked server or client
anywhere in the file. No `sleep`/`tokio::time`/mDNS/mock usage found by
search. The "server killed mid-transfer" test genuinely calls
`a.server.shutdown().await` and starts a brand-new `SyncServer` on the same
port with a fresh `PairingState`, then resumes against it — a real restart,
not a simulated one.

**On the `.sync-base` priming and case (c):** the "different cells, zero
conflicts" test primes `base_cache::write_base` on both sides before the
edits diverge, and its own doc comment explains why (without a real base, the
empty-base fallback can't distinguish "unedited since ancestor" from
"changed" — matching `apply.rs`'s own unit-test pattern of seeding the same
way rather than running two throwaway syncs). This is a fair proxy for two
real prior syncs, not a shortcut that trivializes the assertion: the merge
code path exercised (`core::workbook::merge`, reading local/peer/base from
real files on disk through `plan_sync`→`install`) is identical to what a
third-plus sync round would hit.

Whether the workaround in `edit_cell` (mutate a cloned `WorkbookDoc` and
render once, rather than editing rendered text and re-parsing it) is now
"unnecessary but not masking anything," per the dispatch's question: the
Task 11b CHANGELOG entry (`d9a79e8`) states this explicitly and candidly —
"`sync::loopback_tests`'s `edit_cell` helper (Task 11's clone-and-render-once
workaround) is now provably unnecessary but was left as-is per this task's
scope." That is the correct call for 11b (a core-crate fix task, not a
transport-test cleanup task) and it is not silently glossed over — the
CHANGELOG says outright that a follow-up could simplify it. Since the
workaround exercises exactly one render step from an original single parse
(never re-parses its own rendered output before writing to disk), it does
not depend on the R103 fix to pass and was never itself masking the bug in
this particular test; the real fixed-point bug was independently caught and
is now independently pinned by 11b's own dedicated
`render_workbook_is_a_fixed_point_*` suite. Nothing here is hiding a second
divergence.

## Verdict rationale

Every claim I could check statically checks out: the pulldown-cmark byte-range
story is verified against the vendored crate source, not asserted; the
front-matter carve-out is grounded in an actual C2 §7.1 quote and confirmed
against `same_content`'s real comparison fields; the R102 fixes are complete,
correctly capped against the server's real constants, and the "widening" of
the `.part`-discard rule is the right call, explained above; the C3 §3.9
amendment's six fields match the code's actual attribution field-by-field; the
loopback proof's ten scenarios are real (no mocks, no sleeps, no mDNS, a
genuinely restarted server) and assert on disk state; the `.sync-base` priming
is a fair proxy, not a shortcut; and the workaround the dispatch flagged is
honestly documented as unnecessary rather than silently left to rot. Test
counts for all three named filters reproduce exactly by hand-counting
`#[test]`/`#[tokio::test]` attributes. No Critical, Important, or Minor
findings.

VERDICT: CLEAN
