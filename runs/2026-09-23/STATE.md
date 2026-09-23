# State at 2026-09-23 — Isaac away for a week

Everything is committed, gated and pushed. Both repos are clean and level with
`origin/main`. No lane is running; no work is stranded on a branch.

## Where main is

    idl1-app   d859069 (and the lockfile commit on top)
    idl-rs     c5d7f41

Gates run on merged main on 2026-09-23, all exit 0:

| gate | result |
| --- | --- |
| `cargo test -p idl-rs -p idl-rs-cli` | 1770 passed |
| `cargo test -p idl-rs-tauri --lib` | 488 passed |
| `cargo test -p idl-transport` | 141 passed, 1 ignored |
| `cargo check -p app` (from `app/src-tauri`) | clean |
| app `tsc --noEmit` / `vitest` / madge / `vite build` | clean / 2959 passed / no cycles / clean |
| all five generated artefacts regenerated | byte-identical, no diff |

## What landed since 2026-09-20

- **PR #1 (both repos)** — IMU row time is the burst-seam-corrected hardware
  stamp, not a uniform grid; `where()` checks its branches; `.idl0` import
  routing. Reviewed before merge (`runs/2026-09-20/REVIEW-pr1.md`).
- **R240–R243, R246, R248 (imu-time)** — `resample(x, onto)`; raw
  `t_recorded_us`; per-IMU grid length, no shared tail pad; session origin on
  the corrected minimum. Importer **0.3.0**.
- **R239/R244 (Dockview + Welcome)** — Dockview 8.3.1 tiling, Welcome panel
  behind an empty dock.
- **R247** — a type scale for rendered markdown; math definitions as
  two-column rows.
- **R249 + R244 commands (welcome-cmds)** — five commands; the editor's
  function table is now **generated** and CI diff-gated.
- **R250 TS half (eval-progress)** — nine-state cell status, chart-sized
  labelled pending slots, blocked subgraph on the maths map, status-bar
  summary.
- **Library rebuilt**: 159 + 1 sessions re-imported under importer 0.3.0 in
  12 min 27 s, 0 failures, 0 stale remaining, lap/track index rebuilt.

## Uncommitted on purpose — do not delete

`docs/superpowers/specs/2026-09-19-idl1-first-real-workbook-gaps-DRAFT.md` is
**modified** and these two are **untracked**:

    docs/superpowers/specs/2026-09-15-idl1-calibration-bars-free-DRAFT.md
    docs/superpowers/specs/2026-09-15-idl1-kinematic-chain-estimator-DRAFT.md

They are another session's in-progress drafts (the gaps draft's 2026-09-20
yaw-acceleration section, bars-free calibration, the kinematic chain
estimator). The lead preserved them across three merges rather than commit
another session's thinking. Backed up outside the repo at
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-uncommitted-backup-2026-09-23`.
`.claude/worktrees/agent-aa4e2b3fb8c23b004` is likewise another session's
worktree, on a branch already merged; harmless, not the lead's to remove.

## Waiting on Isaac

1. **Updater signing** — generate the key
   (`npm run tauri signer generate -- -w %USERPROFILE%\.tauri\idl1.key`), add
   repo secrets `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD`, create the public
   repo `saucyeng/idl1-releases` + `RELEASES_TOKEN`, then give the lead the
   public key. The updater is merged but dormant until then (R231).
2. **Git Credential Manager** — its token expired, so a plain `git push` in
   Isaac's own terminal opens a sign-in dialog. The lead pushes with the `gh`
   CLI helper per command. Isaac must re-authenticate GCM himself.
3. **Disk** — 5.6 GB free on C:. Below the margin the pagefile wants.
4. **Ruling ids in CLI help** — seven rows of the command table put
   "(ruling RNNN)" into user-facing `--help` text. House style, so the lead did
   not change one of seven unilaterally. Strip them all, or keep them?
5. **The MX day workbook's timing caveat paragraph** is now false (it
   describes the pre-0.3.0 drift). Say the word and it goes.

## Queued, ready to dispatch

- **R250 task 3** — the engine progress `Channel` (C3 §3.4) so per-cell
  progress is real. Specced and briefed, not built:
  `docs/superpowers/specs/2026-09-20-idl1-evaluation-progress-DRAFT.md`,
  `runs/2026-09-20/BRIEF-eval-progress.md`. Until it lands, "Evaluating"
  flips to done for every cell at once.
- **Android scaffold (M4a)** — the toolchain is fully present on this machine
  (SDK, NDK 28.2, Android Studio's JBR, both phone Rust targets). Only
  `JAVA_HOME` / `ANDROID_HOME` / `NDK_HOME` are unset, and a lane can set them
  per process. Nothing to install.
- **Gap-aware maths** — R246 left `resample()` bridging importer gap fill
  because gaps never reach the maths path. Making "a gap is NaN" true is a
  C2 §3.6 value-model change affecting every builtin: its own ruling and lane.
- **Visual verification** of Dockview, Welcome, the type scale and R250 in one
  running app (capture script: `runs/2026-09-20/capture-app.ps1`).

## Process notes for the next lead

- Cargo memory gate is **3 GB** commit free, measured (R245), not 6.
- Lane owners stall waiting on background cargo notifications. Brief them to
  run cargo in the **foreground**; check with `tasklist | grep -ic '^cargo.exe'`
  before believing a lane is busy.
- Push with:
  `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -q origin main`
