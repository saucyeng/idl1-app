# L8x Task 6 — core quarantine module + `verify`'s repair pass

Builds the thing that makes `list_quarantine` non-empty: C4 §7's repair
action, which no code performs today. TDD, ONE commit.

**Depends on Task 5.** **Blocked on lead ruling PLAN Q1** — if the lead
declines the producer, this task and Task 7's `verify_data_dir` are cut and
Task 7 ships list/resolve alone. Confirm the ruling before starting.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "tmp/quarantine" docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §5 and Q1/Q2; C4 §2's Staging bullet and
§7's findings list and repair actions **as Task 1 amended them**;
`core/src/store/verify.rs` in full (`Severity`, `Finding`, `verify` — note
that findings #1 and #5 are the only two whose repair is quarantine);
`core/src/store/atomic.rs` (the fsync/rename primitive and its error type);
`core/src/store/blob.rs` (how a blob's path encodes its hash);
`tauri/src/paths.rs` (`tmp/quarantine` is created at data-dir setup, so the
directory already exists — do not assume it does at the core layer though).

## Where

- **Files:** `core/src/store/quarantine.rs` (new),
  `core/src/store/mod.rs`, `core/src/store/verify.rs`, `CHANGELOG.md`.

## Interfaces

```rust
/// One quarantined file: the payload plus its sidecar (C4 §2, §7).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct QuarantineEntry {
    /// The uuid in both filenames — C3 §3.2's `entry_id`.
    pub entry_id: String,
    /// Absolute path of the payload under `<data>/tmp/quarantine/`.
    pub path: String,
    /// Where it was pulled from, absolute. `""` when unknown (no sidecar).
    pub original_path: String,
    /// The C4 §7 finding text that caused the move.
    pub reason: String,
    /// Milliseconds since the Unix epoch, supplied by the caller.
    pub quarantined_at_ms: i64,
}

pub enum QuarantineErrorKind { Io, NotFound, Occupied, Encode }
pub struct QuarantineError { pub kind: QuarantineErrorKind, pub message: String }

/// Moves `path` to `tmp/quarantine/<entry_id>-<file name>` and writes the
/// sidecar `tmp/quarantine/<entry_id>.json`. `entry_id` and
/// `quarantined_at_ms` are supplied — this function has no clock and no
/// randomness, so it is deterministic under test (PLAN §3).
pub fn quarantine_file(data_root: &Path, path: &Path, reason: &str,
                       entry_id: &str, quarantined_at_ms: i64)
    -> Result<QuarantineEntry, QuarantineError>;

/// Every entry currently in `tmp/quarantine/`, sorted by
/// `quarantined_at_ms` descending then `entry_id`.
pub fn list_quarantine(data_root: &Path) -> Result<Vec<QuarantineEntry>, QuarantineError>;

pub enum ResolveAction { Restore, Discard }

/// `Restore` moves the payload back to `original_path`; `Discard` deletes
/// it. Both then delete the sidecar. Nothing under `tmp/` is catalog truth
/// (C4 §2), so neither touches the catalog.
pub fn resolve_quarantine(data_root: &Path, entry_id: &str, action: ResolveAction)
    -> Result<(), QuarantineError>;
```

## Key logic

- **Move, never copy-then-delete.** `std::fs::rename` within `<data>` is the
  same-volume case the atomic-write primitive already relies on. If rename
  fails with a cross-device error, fall back to copy + fsync + remove and
  say so in a doc comment.
- Sidecar write goes through the landed atomic write, so a crash never
  leaves a half-written sidecar.
- **Listing is payload-driven.** Scan for files matching
  `<uuid>-<rest>`; for each, read `<uuid>.json` if present. Missing sidecar
  ⇒ `original_path: ""`, `reason: "unknown (no sidecar)"`,
  `quarantined_at_ms` from the payload's mtime. A `.json` with no matching
  payload is skipped, not reported — it is a resolve that half-finished.
- `restore` with `original_path == ""` ⇒ `NotFound` (nowhere to put it).
  `restore` onto an existing path ⇒ `Occupied` (never overwrite: the whole
  point is that we do not destroy either copy). Create the parent directory
  if missing.
- `resolve_quarantine` on an unknown `entry_id` ⇒ `NotFound`.
- **`verify` stays read-only.** Add a separate
  `pub fn verify_and_repair(data_root, ids: &mut dyn FnMut() -> String,
  now_ms: i64) -> (Vec<Finding>, Vec<QuarantineEntry>)` that runs `verify`
  and then quarantines exactly the paths of findings #1 and #5. Ids and the
  clock are injected for the same reason as above. Do not change `verify`'s
  signature or its findings.
- Guard every `entry_id` against path separators and `..` before joining.

## Tests

- `quarantine_file — a corrupt blob — the payload moves, the sidecar holds
  the reason and the original path, and the source path is gone`.
- `quarantine_file — quarantine dir absent — it is created`.
- `list_quarantine — an empty or absent directory — an empty list, not an
  error`.
- `list_quarantine — a payload with no sidecar — listed with the unknown
  reason and no original path`.
- `list_quarantine — a sidecar with no payload — skipped`.
- `resolve_quarantine — Restore — the file is back at original_path and both
  quarantine files are gone`.
- `resolve_quarantine — Restore onto an occupied path — Occupied, and both
  copies still exist`.
- `resolve_quarantine — Discard — payload and sidecar are gone`.
- `resolve_quarantine — unknown entry_id — NotFound`.
- `resolve_quarantine — entry_id containing a path separator — NotFound or
  Io, and a decoy file outside tmp/ survives`.
- `verify_and_repair — a blob whose bytes do not match its path — the blob
  is quarantined and the finding is still returned`.
- `verify_and_repair — a healthy tree — no quarantine entries and the
  directory stays empty`.
- `verify_and_repair — a missing blob (finding #3) — not quarantined`
  (only #1 and #5 are repairable this way).

## COMPUTE RULES

While working: `cargo test -p idl-rs store::quarantine`, foreground,
non-zero `passed`; then `cargo test -p idl-rs store::verify`. New `pub`
symbols in core ⇒ `cargo check -p idl-rs-cli --tests`.

## Steps

- [ ] 1. Gate + confirm PLAN Q1's ruling. 2. Failing tests.
      3. `quarantine.rs` + `mod.rs` export. 4. `verify_and_repair`.
      5. Both filters green. 6. `cargo check -p idl-rs-cli --tests` clean.
      7. NUL check. 8. `CHANGELOG.md` bullet. 9. Commit
      `core: quarantine model and verify repair pass (C4 7)`.

## Do not

- Do not change `verify`'s existing signature, findings, or severities.
- Do not quarantine findings #2, #3, #7, #8 — C4 §7 says those are surfaced,
  never auto-repaired, because an automatic fix risks data loss.
- Do not generate uuids or read the clock inside core.
- Do not touch the catalog from any function in this module.

## Spec discipline

**spec-during if anything diverges.** Task 1 already wrote C4 §2's sidecar
and §7's repair sentence. If the landed shape needs a different sidecar
field, amend C4 in this commit and say so; anything larger is STOP and ask.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both test result lines with their `passed`
counts; the `cargo check` result; the exact sidecar JSON of one entry;
whether the cross-device rename fallback was needed; confirmation `verify`'s
own signature is unchanged; anything needing a ruling.
