# Brief: make the watcher self-write test deterministic

Model: sonnet. Worktree: `../idl-rs-worktrees/watcher-flake` (branch `watcher-flake`, idl-rs
submodule). File: `rust/tauri/src/watcher.rs`, tests module. CLAUDE.md §8 applies: you are
the only cargo process on the machine.

## Facts
`self_write_with_pre_registered_hash_never_fires_callback` fails only on a loaded machine.
It asserts "no callback within 500 ms" against a 100 ms debounce. Two things are wrong with
the test, independent of any watcher defect:
- It writes with `std::fs::write` (create, then write: two events, and a window where the
  file exists with partial content). Production self-writes go through the workbook save
  path, which is temp-file + rename (C4 §4 step 3; find the actual save code in `core`'s
  store and mirror its pattern). A test of "self-write is suppressed" must write the way
  the app writes.
- A negative timing assertion can never be deterministic.

## Do (rulings, do not ask)
1. First, state the cause in your report: read the watcher's event and debounce path and
   say which sequence makes the callback fire under load. Reason from the code; a
   reproduction is welcome but do not loop reruns hunting it (one targeted run at most).
2. Rewrite the test so the self-write uses the production write pattern (temp + rename),
   with a helper in the tests module.
3. Replace the negative timing assertion with an ordering assertion: after the self-write,
   perform a genuinely external write with different content, then assert the FIRST
   callback received is for that external write (verify by hashing the file at callback
   time or by the content). Any self-write callback would arrive first, so this proves
   suppression without a timeout being the oracle. Keep a generous receive timeout
   (2 s) for the positive wait only.
4. Apply the same production write pattern to the other two tests' self-writes; leave their
   external writes as plain `std::fs::write`, that is what an editor does.
5. Do NOT change the watcher itself. If your analysis in step 1 shows the watcher can fire
   on a partially written EXTERNAL file (editor mid-write), say so in the report with the
   sequence; the lead rules on that separately.

## Gate
`cargo test -p idl-rs-tauri watcher -- --test-threads=4` (report passed count, must be
non-zero) then `cargo test -p idl-rs-tauri -- --test-threads=4` green in one run. Commit on
the branch, no merge, no push, plain message. Report in 15 lines or fewer.
