# Review — L7c Task 8 (Settings persist to settings.json behind PrefsBackend)

Commit reviewed: `de6f862` on branch `wave2-l7c-followon`
(`idl1-app-worktrees/wave2-l7c-followon`).

Files touched: `CHANGELOG.md`, `docs/IDL0_SPEC.md`,
`app/src/routes/pages/Settings/{ProfileSection.tsx, UnitsSection.tsx,
index.tsx, settingsBackend.ts, settingsBackend.test.ts, prefsMigration.ts,
prefsMigration.test.ts}`. All within the brief's ownership
(`Settings/**`, SPEC §27.1, CHANGELOG). No other file touched;
`prefs.ts`/`prefsStore.ts` and their tests are byte-identical to `main`
(confirmed: absent from `git show --stat`).

Test command run once, from `app/`:

```
npx tsc --noEmit && npx vitest run src/routes/pages/Settings
```

Result: `tsc` clean (no output). Vitest: **Test Files 12 passed (12) /
Tests 85 passed (85)**, 0 failed — matches the implementer's reported
"Settings 12 files / 85 passed." Whole-suite number was not re-run (not
required by this dispatch).

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Major | `app/src/routes/pages/Settings/settingsBackend.ts:87-97` (`write()`) | `write()` sets `engine: persisted` on the document it stores locally, where `persisted` is `deps.setSettings`'s return — which, per `rust/core/src/store/settings.rs`'s `AppSettings` (exactly `data_dir`/`rider_name`/`unit_system`, no `#[serde(flatten)]`), can never carry an unknown key. Any unknown key nested inside `engine` that `read()` correctly preserved (proven by the test "read() preserves unknown keys from the local document", which puts `future_engine_field` only in the local document, matching how such a key could ever get there since `get_settings` cannot supply it) is silently deleted from `localStorage` the next time this backend's `write()` runs — permanently, since the local half is now the only place it could have lived. This is the exact "unknown keys survive a round trip" guarantee the brief pins as a **Do not** ("Do not drop unknown keys anywhere in the round trip") and the SPEC diff repeats ("plus preserved unknown keys ... so a `get_settings` outage degrades to the last known values"). No test in `settingsBackend.test.ts` covers this path — "write() also persists the whole document locally" only exercises a **top-level** unknown key (`future_top_level`), never one nested inside `engine`, so the asymmetry between `read()` (merge-preserves) and `write()` (replace-destroys) passed the gate unnoticed. | Build `toStoreLocally.engine` as `{ ...prefs.engine, ...persisted }` (spread the previously-known engine object first, then overlay the three server-confirmed fields), mirroring the merge already used in `read()`. Add a `write()` test that seeds an engine-nested unknown key via `local` and asserts it survives a `write()` call. |
| Minor | `app/src/routes/pages/Settings/prefsMigration.ts:130-142` (`runPrefsMigration`, local-doc rewrite) | The post-migration local rewrite destructures `const { engine: _engine, ...rest }` — dropping the **whole** `engine` object, not just the three known fields the migration imported. If an engine-nested unknown key existed in the pre-migration local document (the same narrow scenario as the Major above), it is deleted here too, one step earlier than the write() bug would have deleted it. Consistent with the brief's literal instruction ("the engine half is removed... entirely") but worth naming since it is the same class of loss. | If the Major above is fixed by preserving engine-nested unknown keys generally, decide here too whether unknown engine keys should survive the migration's deletion (spec text only promises the `ui` half and "any preserved unknown keys" survive, ambiguous on nesting) — a one-sentence SPEC clarification either way closes the ambiguity. |
| Note | `app/src/routes/pages/Settings/settingsBackend.ts:63` (`lastKnownEngine` initial value) | `lastKnownEngine` starts as `DEFAULT_PREFS.engine` before any `read()`. If `write()` were ever called before `read()`, the echoed `data_dir` would be `null` rather than whatever is actually on disk. In practice this can't happen: `createPrefsStore` always awaits its one `backend.read()` (`initialRead`) before either `get()` or `set()` proceeds, so by the time this backend's `write()` runs, `read()` has always already populated `lastKnownEngine` from a real `getSettings()` call. Documented here as a coupling to `createPrefsStore`'s construction order rather than a defect — no fix needed unless that ordering ever changes. | — |

**Everything else checked clean:**

- `PrefsBackend`'s two-method shape is unchanged; `prefs.ts`/`prefsStore.ts`
  and `prefs.test.ts`/`prefsStore.test.ts` are untouched (not in the diff).
- Field mapping matches `AppSettings` exactly: `rider_name`/`unit_system`
  go through `set_settings`; `data_dir` is read from `get_settings` and
  echoed (never invented, never sent as a value the app chose) on `write()`
  — confirmed by grep, no other write site. Per R59 Q5, `set_settings`
  ignores `data_dir` server-side, so echoing an occasionally-stale value
  (see the Note above) is inert either way — safe.
- Migration (R78 Q1(b)): `settings.json` wins — `migrationPlan` only
  imports a field still at its `DEFAULT_PREFS.engine` value on disk,
  proven by both conflict-direction tests. The flag
  (`idl1.settings.prefs.migrated.v1`) lives in `localStorage`; a cleared
  WebView reruns the migration, which is harmless and stated as such in
  `index.tsx`'s doc comment (`settings.json` still wins on the rerun). A
  rejected `setSettings` leaves the flag unset (`markMigrated` is called
  only after `setSettings` resolves) and the retry test proves the second
  call re-imports. `ui` and unknown top-level/`ui`-nested keys are never
  touched by the migration's local rewrite.
- Effects: the migration effect's dependency array is `[]`; no
  cleanup/cancel; a monotonic `migrationGeneration` counter (module-level,
  bumped on every mount) gates whether a late-arriving result is applied —
  matches the operating-brief §4 tightening (data-only deps, no
  cleanup-cancel, pure staleness guard). `getSettings`/`setSettings` are
  stable module-level imports, not props, so nothing needed a ref.
- `role="status"` is present on exactly the two notices the ruling names
  (migration outcome and the pre-existing `writeFailed` hint) in
  `ProfileSection`/`UnitsSection` only — no shared banner, no other
  section touched.
- Degradation: a rejecting `getSettings` degrades `read()` to the local
  document's engine half, then to `DEFAULT_PREFS.engine` — proven by two
  tests. A rejecting `setSettings` propagates out of `write()` uncaught,
  reaching `createPrefsStore.set()`'s existing `{ ok: false, error }` path
  — proven by "a setSettings rejection propagates out of write()".
- Tests: all names follow `thing — condition — result`; each is
  Arrange/Act/Assert with blank lines; every case in the brief's minimum
  list for both new files is present verbatim or close to it, plus extra
  conflict-direction and defaults-only cases. Both new modules are covered
  well past 80% of their lines (every branch in `migrationPlan` and
  `settingsBackend`'s read/write paths has a dedicated test, save the
  engine-nested-unknown-key write path flagged above).
- SPEC §27.1 correctly states the new home for each field, cites R78/R59
  Q5, and matches the code (data_dir read-only via `get_settings`,
  written only by `setDataDir`). CHANGELOG bullet is accurate to what
  shipped. No other SPEC section or C2/C3 touched.
- Doc comments present on every new exported symbol; `px` unit already
  documented on the pre-existing `section_list_width_px` (no new numeric
  field introduced); no bare `TODO`; no `unwrap`-equivalent on data (all
  IPC failures caught and typed via `MigrationOutcome`/`SetResult`); no
  reformatting of untouched lines; single-line commit message, no AI
  attribution trailer.

**Verdict rationale:** the implementation is careful and the test suite is
strong — the read-side unknown-key preservation is explicitly tested and
correct, migration's conflict rule and retry-on-failure are both correctly
implemented and tested, and the effect obeys the operating brief's
IPC-effects tightening exactly. The one real defect is a silent,
asymmetric loss of engine-nested unknown keys on `write()` (and again on
migration's local-document rewrite) — a narrow but genuine violation of an
explicit "Do not drop unknown keys anywhere in the round trip" instruction
that the test suite does not currently catch, which is enough to hold this
out of CLEAN pending a one-line fix and one added test.

VERDICT: NEEDS_FIXES
