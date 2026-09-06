# L11 Task 1 — spec-first: C3 §3.9, C4 §6/§8 and the SPEC sync section

Docs only. Writes the contract L11's code is then held to. No Rust, no tests.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git -C rust merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
```
If it fails, STOP and report.

## Files to read first

`CLAUDE.md` §6; this lane's `PLAN.md` in full (§1, §3, §5 and every answered
open question); `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`
§3.9 and its §2 error-kind table rows for `sync`;
`…-c4-data-directory.md` §6 and §8 items 3 and 4; `…-c2-workbook-v3.md` §7
opening paragraph (the `.sync-base` path); `docs/IDL0_SPEC.md` §17a.4, §27.9
and §28.

## Where

- **Files:** `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
  `…-c4-data-directory.md`, `docs/IDL0_SPEC.md`, `CHANGELOG.md`.

## Key content

**C3 §3.9** gains, in the existing style of that file (arg list, return
interface, error list):
- `start_pairing() -> { code: string, expires_at_ms: number }` — mints a
  single-use 6-digit code. Errors: `sync`, `internal`.
- `unpair_peer(peer_id: string) -> void`. Errors: `sync`, `not_found`.
- `PeerStatus` gains `protocol_version: number` and `paired_at_ms: number`.
- A `peer_appeared` event carrying `PeerStatus`, listed the way C3 lists
  `WorkbookEvent`.
`sync_now`'s `phase` union is stated explicitly: `"manifest" | "blobs" |
"sessions" | "workbooks" | "tracks" | "profiles"` (widened from §3.9's
three — `app/src/ipc/sync.ts` documents `phase` as free-form, so widening
breaks nothing).

**C4 §6** gains: `profiles` in the manifest document and the entry table
(identity `profile_id`, LWW by `updated_at_ms`, R6); `workbooks/.sync-base/`
named as never-synced **and** exempt from §7's orphan findings; the five
endpoint names replaced by PLAN §3's versioned `/idl1/v1` set.
**C4 §8** item 4 is closed by that. Item 3 is closed by the per-field
`session.json` rule: user-owned fields merge per field with `updated_at_ms`
as tiebreak; `laps`, `track_visits`, `track_visits_library_hash` and
`lap_detector_version` never merge — the receiver keeps its own.

**SPEC** gains a sync section (numbered where §28 sits) carrying PLAN §1 and
§3: the model, what moves, what never moves, the conflict table, the
LAN-only security posture with no TLS stated plainly, and resumability.
§17a.4's "contract to follow in L11's wave-2 work" is updated to point at it.
§28's Drive content is marked superseded the way §27.9 already is.

## Steps

- [ ] 1. Gate. 2. C3 §3.9 + §2 kind rows. 3. C4 §6 and §8. 4. SPEC section
      + §17a.4 + §28 supersede note. 5. NUL check every file touched
      (`grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'` prints `0`).
      6. `CHANGELOG.md` bullet. 7. Commit
      `docs: C3 §3.9 + C4 §6 sync amendments and the SPEC sync section (L11)`.

## Do not

- Do not write Rust. Do not touch `app/src/ipc/sync.ts` — the TS shell is a
  post-lane shell task (PLAN §6).
- Do not invent an endpoint, field or error kind that PLAN §3/§5 does not
  name. A gap you find is a question, not a decision.
- Do not renumber existing C3 or C4 sections.

## Spec discipline

**Spec-first** — this task *is* the spec change. Every later task in the lane
cites it by commit hash.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the exact new C3 command signatures shipped;
which C4 §8 items are now closed; the SPEC section number used; anything the
amendment could not settle without a ruling.
