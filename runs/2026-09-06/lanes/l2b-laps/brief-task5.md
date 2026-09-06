# L2b Task 5 — implementer brief (pin `LapDetail.sectors` / `.neutral_zone_visits`; close C3 §6 item 11)

C3 §6 open item 11 and R53 Q5 both say the sector and neutral-zone element
shapes get pinned "when lap indexing lands". They have landed. You replace the
`serde_json::Value` placeholders with the real types and amend the contracts.
TDD, ONE commit, then report.

**Depends on Task 4.**

## GATE

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "pub fn index_session" src/store/catalog.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Where

- Same worktree/branch. Do NOT push.
- **Files:** `core/src/store/catalog_read.rs`, `tauri/src/commands/catalog.rs`,
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`.

## Files to read first

`CLAUDE.md`; C3 §3.2's `LapDetail` and `TrackVisitSummary` blocks and C3 §6
**item 11** verbatim (it names IDL0_SPEC §15.2's `sector_name`/`sector_time_ms`
and §16.2b's `NeutralZoneVisit` as the plausible-but-uncommitted shapes — read
why it declined to guess); ruling R53 Q5 in `runs/2026-09-03/decisions.md`
("`LapDetail.sectors` element shape is pinned in C1 §6 when lap indexing
lands, not before"); `core/src/store/session_json.rs`'s `SectorJson` and
`NeutralZoneVisitJson` — **these are the landed truth and they win**;
`core/src/store/catalog_read.rs`'s `LapDetail`; `tauri/src/commands/catalog.rs`'s
`LapDetail`/`TrackVisitSummary` and their `From` impls; `app/src/ipc/catalog.ts`.

## The decision this task implements

C3 item 11 guessed at IDL0_SPEC §15.2's `{sector_name, sector_time_ms}`. The
landed `SectorJson` is `{name, start_ms, end_ms, start_time_secs, end_time_secs}`
and is what `session.json` actually contains. **The landed shape wins**; the
contract is corrected to match it, not the reverse. `NeutralZoneVisitJson` is
`{name, enter_ms, exit_ms}`, which does match §16.2b modulo naming. If you find
any real disagreement between the landed structs and a signed contract beyond
this, STOP and report (CLAUDE.md §1).

## Interfaces

```rust
// tauri/src/commands/catalog.rs — new DTOs mirroring the core JSON types
#[derive(Debug, Clone, serde::Serialize)]
pub struct LapSector { pub name: String, pub start_ms: i64, pub end_ms: i64,
                       pub start_time_secs: f64, pub end_time_secs: f64 }

#[derive(Debug, Clone, serde::Serialize)]
pub struct LapNeutralZoneVisit { pub name: String, pub enter_ms: i64, pub exit_ms: i64 }

// LapDetail's two fields change type:
pub sectors: Vec<LapSector>,
pub neutral_zone_visits: Vec<LapNeutralZoneVisit>,
```

Mirror the same change in `catalog_read::LapDetail` (drop its
`serde_json::Value` fields for the core `SectorJson`/`NeutralZoneVisitJson`, or
re-export them — implementer's call, document which and why).

## Key logic

- The `From<session_json::LapJson>` conversion becomes a plain field copy.
  Every `serde_json::to_value`/`json!` round-trip on this path disappears.
- **The wire shape must not change.** `serde_json::Value` built from these
  structs already serialised with exactly these field names, so a correct
  refactor produces byte-identical JSON. Prove it with a test (below) rather
  than by inspection.
- `TrackVisitSummary.laps` is `Vec<LapDetail>` and picks the change up for free;
  confirm it compiles and is covered.
- `app/src/ipc/catalog.ts` is **lead-owned** (operating brief §2). Do not edit
  it. List the exact TypeScript type change needed in your report so the lead
  applies it as a shell task.

## Tests

- `LapDetail::from` on a `LapJson` with two sectors and one neutral-zone visit
  → the typed fields carry every value through.
- `serde_json::to_value(LapDetail)` for that same input equals the JSON the old
  `serde_json::Value` path produced — construct the expected value literally
  with `json!` so the assertion is independent of the old code.
- a lap with no sectors serialises `"sectors": []`, not `null`.
- `TrackVisitSummary` round-trips a visit with laps carrying sectors.

## COMPUTE RULES

`cargo test -p idl-rs-tauri commands::catalog::` and
`cargo test -p idl-rs store::catalog_read::` — foreground, non-zero `passed`.
`cargo check -p idl-rs-cli --tests` (`catalog_read::LapDetail` is `pub` in core).
No `cargo fmt`, no `--workspace`. One cargo process.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Retype in `catalog_read.rs`. 4. Retype in
      `commands/catalog.rs`. 5. Both filters green. 6. `cargo check -p
      idl-rs-cli --tests`. 7. C3 §3.2 + §6 item 11 + C1 §6 amendments.
      8. CHANGELOG bullet; commit
      `tauri+core: LapDetail sectors/neutral zones typed concretely (C3 6 item 11)`.

## Do not

- Do not change any field name or JSON key — this is a typing change only.
- Do not edit `app/src/` (lead-owned).
- Do not "fix" `SectorJson` to match C3's guess.

## Spec discipline

**spec-during.** In C3 §3.2 replace both `unknown[]` types with the pinned
element interfaces. In C3 §6 mark item 11 **CLOSED** with the date, this
commit's reasoning (the landed `SectorJson` wins over §15.2's illustrative
shape), and a pointer to C1 §6. In C1 §6 fill in the `sectors: []` and
`neutral_zone_visits: []` comments with their real element fields and units,
matching the file's existing comment style.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both test result lines with `passed` counts;
`cargo check -p idl-rs-cli --tests` result; confirmation the serialised JSON is
byte-identical and how you proved it; the exact `app/src/ipc/catalog.ts` change
the lead must apply; whether `catalog_read` re-exports or redefines the types
and why; anything needing a ruling.
