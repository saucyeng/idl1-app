# L7a Task 1 review — `DataPage.tsx` → `Data/`, session list

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`. Commit under review: `52ca4d4` (parent `b6426c1`).
Scope in review: exactly the 7 files in that commit's diff —
`CHANGELOG.md`, `app/src/routes/pages/Data/{errors.ts,errors.test.ts,index.tsx,sessionRow.ts,sessionRow.test.ts}`,
`app/src/routes/pages/DataPage.tsx`. `git status --porcelain` in the worktree
is clean — nothing else present.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```

```
 RUN  v4.1.11 C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data/app

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  07:31:14
   Duration  744ms
```

`tsc --noEmit` printed nothing (exit clean). Reproduces the implementer's
reported 11 passed / 0 failed exactly.

## Findings

No Critical, Important, or Minor findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | none | — |

## Checks performed (all pass)

- Ownership boundary (`git show --stat`): only `app/src/routes/pages/Data/**`,
  `DataPage.tsx`, `CHANGELOG.md` touched. Nothing under `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`. No `docs/IDL0_SPEC.md`
  touch (this is a no-spec-change task, correctly).
- `DataPage.tsx` is exactly the one-line re-export (`export { default } from
  "./Data";`) with a doc comment explaining the shim; `App.tsx` not touched,
  so its import path is unaffected.
- `sessionRow.ts` is a pure module (no `invoke`, no React import). Every
  formatted field states its unit/derivation in its doc comment.
  `duration_ms === null` → `"—"` (never `"0:00"`); `lap_count === null` →
  `"—"`; `timestamp_utc_ms === 0` → `dateText`/`timeText` = `"unknown"`
  (C1 §3.1's 0-means-unknown rule, not rendered as the 1970 epoch);
  `venue_name === ""` → `"(none)"`. Arithmetic check:
  `duration_ms = 3_723_000` → 3723 s → 1 h 2 m 3 s → `"1:02:03"`, matches
  the test's expectation and hand recomputation.
- `groupKeyOf`/`toSessionRow` signatures match the brief's interfaces
  verbatim, including doc comments and field names (`SessionRow`).
- `errors.ts` maps only kinds that exist in C3 §2's table
  (`not_found`, `invalid_argument`, `io`, `internal`, `conflict`, the seven
  `import_*` kinds, the three `parse_*` kinds) — no invented kind, and an
  unrecognised `kind` string or a non-`IpcError` value both fall through to
  a generic `UNKNOWN_KIND_FALLBACK` without throwing (verified against the
  test asserting `result.kind` is passed through unchanged for an unknown
  kind, and that a plain `Error` doesn't throw). Every call site (`index.tsx`)
  routes on `describeIpcError(e).text`, never on `.message` directly.
- `index.tsx` imports `listSessions` only from `../../../ipc/catalog`; no
  direct `@tauri-apps/api` import anywhere under `Data/` (grepped, zero
  hits). IPC is called once in a `useEffect` on mount, not inside any
  pointer/scroll handler. Loading/error/empty/ready states all present as
  specified; `cancelled` guard prevents a late-resolving promise from
  dispatching after unmount.
- `sessionRow.ts` — the file the implementer reported repairing a stray NUL
  byte in — is clean: `git show 52ca4d4:.../sessionRow.ts | grep -c -P
  '[\x00-\x08\x0B\x0C\x0E-\x1F]'` prints `0`.
- Tests: all 11 names are literally `thing — condition — result` with an em
  dash; each has a blank-line-separated Arrange/Act/Assert; each assertion
  targets the specific behaviour named in its title (spot-checked the
  0-timestamp, null-duration, null-lap-count, and unknown-venue cases against
  the implementation — none are vacuous). No rendering tests — no React
  Testing Library, no jsdom, no component-tree assertions; `index.tsx`
  itself has no test file, consistent with the brief ("Do not add rendering
  tests").
- CHANGELOG entry present, one line, matches the brief's wording, and is
  accurate to what shipped. Spec discipline correctly declared as
  no-change and the diff confirms no `docs/IDL0_SPEC.md` edit.
- Commit is a single line (`app: Data tab directory + session list over
  list_sessions`), no AI attribution trailer; `git show --stat` shows only
  the 7 explicitly-added paths (no evidence of `git add -A` sweeping in an
  unrelated file).
- No `cargo`/`npm run tauri` invocation anywhere in the diff or in the
  implementer's reported commands.
- Doc comments present on every exported symbol (`SessionRow`, `toSessionRow`,
  `groupKeyOf`, `DescribedError`, `describeIpcError`, the `Data` default
  export); numeric fields carry units in their doc comments (`_ms`).

## Verdict rationale

The task does exactly what its brief specifies and nothing more: the page
directory move, the pure `sessionRow`/`errors` view-model modules, and a
minimal loading/error/empty/ready session table, all built only against
already-landed C3 §3.2 surface with no new IPC command and no ownership
violations. Every C1 §3.1 and C3 §3.2 edge case named in the brief (0 = 
unknown timestamp, null duration, null lap count, empty venue) is handled
correctly and covered by a test that would fail if the behaviour broke, the
error-kind vocabulary is a faithful, non-inventive subset of C3 §2, and the
reproduced gate matches the implementer's reported 11 passed with `tsc`
silent. There is nothing here that would change a maintainer's decision.

VERDICT: CLEAN
