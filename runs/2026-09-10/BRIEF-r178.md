# Brief: R178 -- gate 3 flake is a 512 MiB test allocation

Model: sonnet. Worktree: `../idl-rs-worktrees/r178` (branch `r178`, idl-rs submodule).
File: `rust/transport/src/sync/client.rs`. Ruling R178 in `runs/2026-09-03/decisions.md`
(superproject) -- read it first. CLAUDE.md §8 compute rules apply: you are the only cargo
process on the machine.

## Facts
`download_item_a_raw_file_tier_response_over_the_cap_is_refused_and_nothing_is_written`
(~line 1214) does `vec![b'a'; MAX_RAW_FILE_BODY_BYTES + 1]` = 512 MiB, writes it to disk
and serves it over HTTP. A sibling document-tier test does the same. Four test threads of
that OOM a 16 GB machine. `bounded_bytes` refuses on `Content-Length` before streaming a
single chunk, so the file is never read.

## Do (rulings, do not ask)
1. Both over-cap tests keep their assertion ("refused, nothing written") but manufacture the
   condition by having the test server advertise `Content-Length: cap+1` with a small body
   (any few bytes; the client must refuse on the header alone). No test allocates more
   than 1 MiB.
2. The mid-stream branch (a body with no Content-Length, or a lying one, that grows past the
   cap while streaming) is a second requirement the header check does not cover. Add one
   test per tier for it using a SMALL cap. If the cap is a hard constant at the call site,
   thread it through as a parameter so production passes the constants and the test passes
   e.g. 4 KiB. Changing a `pub` item inside `idl-transport` is fine; do not touch `core`.
   Assert: refused, partial file removed, typed error.
3. Never shrink `MAX_RAW_FILE_BODY_BYTES` or the document cap. Those are real bounds.

## Gate
`cargo test -p idl-transport -- --test-threads=4` -- must be green in one run, no reruns.
Also run the four named tests by filter and report the passed count. Commit on the branch,
do not merge, do not push. Report in 15 lines or fewer: commit hash, counts, wall time of
the full transport run, anything decided that is not ruled above.
