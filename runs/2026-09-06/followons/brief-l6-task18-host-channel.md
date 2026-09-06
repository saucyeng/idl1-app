# L6 Task 18 — implementer brief (host-channel binding: a chart cell over a workbook definition)

You are the implementer for L6 Task 18, a wave-2 follow-on ruled in **R77
item 3** (`runs/2026-09-03/decisions.md`, at the end of that file). Read R77
first, then **R52 Q6** (who designs the byte path), **R66**, **R72** and
**R74** in the same file — R66/R72 are the binding machinery you are
extending, and the review Criticals behind the wave-2 operating brief §4
"IPC-effects" rule were all found in this exact code.

The job: a `js` chart cell whose `marks[*].channel` names a **workbook `math`
definition** rather than a session channel currently plain-mounts with the
note "Channel X is not part of this session." After this task it binds, fetches
its samples through `fetch_host_channel`, and its data reaches the sandbox as
a host variable like any session channel — on the initial bind and again on
gesture settle, through the same `CellRunSequencer`. ONE commit, then report.

**Spec discipline: spec-during.** `docs/IDL0_SPEC.md` §26.1 (which `js` cells
bind through `ChartCell`) and §26.7 (N3's "no call site at all yet") both
become false and are updated in this commit. Do not touch C2 or C3.

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -3
```

Required:
- Branch `main`, working tree clean apart from untracked `runs/`. Any modified
  tracked file ⇒ **STOP and report** (one checkout, other follow-ons may be
  running).
- `app/src/ipc/workbook.ts` exports
  `fetchHostChannel(workbookId, sessionId, defName, budget): Promise<HostChannel>`.
- `app/src/ipc/hostChannel.ts` exists and exports `decodeHostChannel` /
  `DecodedHostChannel { hasT, t, v }` / `HostChannelDecodeError`, with
  `hostChannel.test.ts` beside it.

**If either is missing — STOP and report.** This task writes no IPC wrapper
and no decoder: both landed in the post-L8w shell task (`d83a14d`). Read them
both before designing; do not re-derive the `IDLH` layout from a ruling.

---

## Where

- Repo `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  the single primary checkout.
- Work only under `app/src/routes/pages/Notebook/**`, plus `docs/IDL0_SPEC.md`
  §26.1/§26.7 and `CHANGELOG.md` (repo root).
- **Never run any cargo command.** TypeScript only. No new npm dependency.
- Do not push. Do not amend a reported commit.
- **Ownership STOPs**: `app/src/App.tsx`, `app/src/state/**`,
  `app/src/routes/types.ts`, `app/vite.config.ts`, `app/package.json`,
  `app/src-tauri/**`, `rust/**`, and either contract spec — **STOP and
  report**, do not edit.

---

## What is true today — read all of these first

1. **`Notebook/model/jsCellBinding.ts`.** `bindingFor(cell, sessionDetail,
   sessionSpanUs)` parses the cell with `plotForm.parse`, then for each mark
   looks the channel up in `sessionDetail.channels` and **returns `null` for
   the whole cell** if any one is missing. `unresolvedChannelId(code,
   sessionDetail)` names the first such channel so `index.tsx` can show the
   "not part of this session" note. `bindingIdentity(binding)` is the string
   that decides whether a *new* bind run starts.
2. **`Notebook/model/channelBindDriver.ts`.** `runChannelBind` (initial) and
   `runChannelSettle` (post-gesture) both delegate to `runChannelBindWindow`,
   which per channel calls `fetchChannelWindow` (tier choice → `tileRange` →
   `ensureTiles` → read back), dispatches a `channelData` action with the two
   `ArrayBuffer`s, pushes a `BoundChannel`, and dispatches `chartWindow` for
   the one mounted channel — then one `boundChannels` dispatch at the end.
   `isStale()` is checked after every `await`. `ChannelBindDeps` injects
   `fetchTile` only.
3. **`Notebook/model/cellRunSequencer.ts`.** One monotonic counter per cell
   shared by initial bind and every settle; `start()` before the first
   `await`, `isCurrent(cellId, seq)` after each.
4. **`Notebook/model/tiers.ts`.** `pointBudget(pixelWidth, isMobile)` =
   `pixelWidth × 2` on desktop. This is the tile budget R77.3 names.
5. **`Notebook/model/channelRebind.ts`** — `BoundChannel` and how a sandbox
   rebuild re-derives every bound channel's buffers **from the `TileCache`,
   never re-fetching** (SPEC §26.4 states this as spec text).
6. **`Notebook/index.tsx`** — the `renderJsCell` callback (~line 595 on), the
   channel-bind effect (~line 470 on), `boundIdentityRef`, and — this is the
   answer to the brief's own question — the derivation at roughly **line 549**:
   ```ts
   const definitionNames = Array.from(state.outputs.values())
     .filter((o) => o.kind === "math")
     .flatMap((o) => o.defs.map((d) => d.name));
   ```
   **Workbook definition names already come from `eval_workbook`'s outputs**
   (`CellOutput.defs[].name`, C3 §3.4), and are already fed to `CodePane`'s
   completions. Reuse that list; do not add a second source.
7. **`app/src/ipc/workbook.ts`** — `fetchHostChannel` and its doc comment
   ("settle-bound only, decimation happens server-side"), and
   `CellDefResult`/`HostChannelRef { length, has_t }`.
8. **C3 §3.4** in `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
   the `fetch_host_channel` entry: read it in full, especially that `budget`
   is validated `1..=65536`, that `t` is **empty** (`t_length == 0`,
   `has_t` clear) when the definition has no recorded axis, and that the
   command takes **no time window** — only `workbook_id`, `session_id`,
   `def_name`, `budget`.

### The consequence you must design around

`fetch_host_channel` has no `[startUs, endUs)`. A definition always comes back
as the **whole** definition, decimated to `budget`. So a pan/zoom settle on a
host-channel-bound cell changes only the budget (the chart's pixel width), not
the window. Two things follow, both of which the code must state and the
report must confirm:

- A settle whose `pointBudget` is unchanged **must not** issue a
  `fetch_host_channel` call. Making that decision is a pure function; test it.
- Zooming a host-channel cell does not fetch more resolution over a sub-range,
  because the command cannot express one. This is a real limitation, named in
  the SPEC edit and the CHANGELOG, not hidden.

---

## Interfaces

### 1. `jsCellBinding.ts` — a channel now has a source

```ts
export type BindingChannelSource = "session" | "definition";

export interface JsCellBindingChannel {
  channelId: string;
  /** `"definition"` ⇒ this names a workbook `math` definition
   *  (`CellOutput.defs[].name`), fetched via `fetch_host_channel`; it has no
   *  tile tier, no `TileCacheKey` and no time window. */
  source: BindingChannelSource;
  /** Hz. Meaningful only for `source === "session"` — a definition has no
   *  nominal rate; use `0` and never feed it to `chooseTier`/`tileRange`. */
  sampleRateHz: number;
  lap: number | null;
}
```

- `bindingFor` gains a fourth parameter,
  `definitionNames: ReadonlySet<string>` (build the `Set` in `index.tsx` from
  the existing `definitionNames` array). Resolution order per mark: session
  channel first, then definition, then unresolvable ⇒ `null` for the whole
  cell as today.
- `unresolvedChannelId` gains the same parameter and must **not** report a
  definition name as unresolved.
- `bindingIdentity` must change when the mounted channel's `source` changes,
  and must change when a name moves from unresolvable to definition (so a
  freshly-evaluated `math` cell rebinds the chart that references it).
  Include `source` in the identity string.
- **The mounted channel is the first `source === "session"` channel**, if the
  cell has one; a cell whose channels are all definitions has no mounted
  channel. Add an explicit field for it rather than leaving callers to
  recompute `channels[0]` — the existing `// TODO(idl0)` in `index.tsx` about
  `binding.channels[0]` stays true for session channels and must not silently
  start meaning something else.

### 2. `channelBindDriver.ts` — one more injected call

```ts
export interface ChannelBindDeps {
  fetchTile: (...) => Promise<DecodedTile>;               // unchanged
  fetchHostChannel: (defName: string, budget: number) => Promise<DecodedHostChannel>;
}
```
Inject it **already bound** to `workbookId`/`sessionId` by `index.tsx` — this
module must not learn about a workbook id, and must not import
`ipc/workbook.ts` (it imports no `ipc/*` today except types; keep it that
way).

Inside `runChannelBindWindow`, branch per channel:
- `source === "session"`: exactly today's path, unchanged.
- `source === "definition"`: one `deps.fetchHostChannel(channelId, budget)`
  where `budget = clampHostChannelBudget(pointBudget(chartWidthPx, false))`.
  Dispatch `channelData` with `length = v.length` and the two buffers built as
  **`Float64Array`** (`protocol.ts`'s `channelPayload` doc comment is explicit
  that the sandbox does an unconditional `new Float64Array(...)` on both
  buffers — a narrower element type silently corrupts every value).
  When `hasT` is false, `t` is empty: synthesise **nothing**. Emit
  `t = new Float64Array(v.length)` filled with the sample index? **No** —
  C1's "time is recorded, not assumed" forbids it. Instead dispatch the
  channel with an empty `t` buffer and let the record materialisation produce
  `{ t: undefined, v }`… which `sandbox/main.ts`'s `materializeHostVar` does
  not do today (it reads `t[i]` unconditionally, yielding `undefined`).
  **This is Open Question 3 — read it before writing this branch.**
  A `fetchHostChannel` rejection drops only that channel (`continue`), exactly
  as an evicted tile does today, and never throws out of the driver.
- `isStale()` after every `await`, including the host-channel one. Never
  cancel from a cleanup; staleness is decided only by the sequencer.
- A definition channel contributes a `BoundChannel` whose shape says it is one
  (see Interface 3) and gets no `chartWindow` dispatch.

Add `clampHostChannelBudget(n: number): number` to this module (or
`tiers.ts` — your call, document it), clamping to C3's `1..=65536` with
`Math.round`, and a pure
`shouldRefetchHostChannel(prevBudget: number | null, nextBudget: number): boolean`
returning `prevBudget !== nextBudget`. Both tested.

### 3. `channelRebind.ts` — `BoundChannel` becomes a union

Today `BoundChannel` is `{ name, key, range, startUs, endUs, budget }`, all of
it tile-cache addressing. A definition has none of that. Make it a
discriminated union on `source`, with the definition arm carrying
`{ source: "definition", name, budget }`. See **Open Question 1** for what a
rebuild does with it.

---

## Steps

- [ ] **Step 1.** Read every file in "What is true today". Confirm the
      `definitionNames` derivation is still at the place named; report the real
      line number.
- [ ] **Step 2.** `jsCellBinding.ts` + `jsCellBinding.test.ts` (TDD). Cases:
      a mark naming a session channel (unchanged); a mark naming a definition;
      a cell mixing both; a cell whose marks are all definitions (no mounted
      channel); a name in neither ⇒ `null` and `unresolvedChannelId` names it;
      a definition name is **not** reported by `unresolvedChannelId`;
      `bindingIdentity` differs when the same name flips session⇄definition.
- [ ] **Step 3.** `clampHostChannelBudget` and `shouldRefetchHostChannel` +
      tests (boundaries 0, 1, 65536, 65537, a fractional width).
- [ ] **Step 4.** `channelRebind.ts`'s union + its existing tests updated.
- [ ] **Step 5.** `channelBindDriver.ts` + `channelBindDriver.test.ts`. Cases,
      all with an injected fake `fetchHostChannel` (never a real `invoke`):
      a definition-only cell dispatches one `channelData` and one
      `boundChannels`, no `chartWindow`; a mixed cell dispatches both kinds in
      channel order; a `fetchHostChannel` rejection drops only that channel and
      the rest still land; `isStale()` true after the host-channel `await`
      drops every remaining dispatch **including** `boundChannels`; the budget
      passed is the clamped `pointBudget` of the given width; a `hasT: false`
      result is handled per Open Question 3's resolution.
- [ ] **Step 6.** `index.tsx`: build the `Set` from the existing
      `definitionNames`, thread it into `bindingFor`/`unresolvedChannelId`,
      inject `fetchHostChannel` bound to `state.handle.id` and
      `sessionIdRef.current`, and mount per Open Question 2's resolution.
      The bind effect's dependency array stays **data only** — adding
      `state.outputs` (which now feeds `definitionNames`) is correct and
      required; adding a function is a Critical. No cancelling cleanup.
      No unit tests (rendering).
- [ ] **Step 7. SPEC (spec-during).** In `docs/IDL0_SPEC.md`:
      - **§26.1**, the `js` bullet: a cell may now bind a `math` definition as
        well as a session channel; name the no-time-window limitation in one
        sentence.
      - **§26.7**: N3 is no longer "no call site at all yet" — say what now
        calls it and what stays open.
      Touch no other subsection. If Open Question 1 resolves toward refetch,
      **§26.4**'s "every currently bound channel (re-derived from the shared
      `TileCache`, never re-fetched)" also needs one clause — edit it then and
      not before.
- [ ] **Step 8. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: nothing printed, `exit=1`.
- [ ] **Step 9. Gate.**
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Notebook
      npx vitest run
      ```
      Lane filter must report a non-zero `passed` and 0 failed; then the whole
      suite once. Report both real numbers.
- [ ] **Step 10. CHANGELOG** — one bullet at the top of `### Added`:
      ```
      - **Chart cells bind workbook definitions over `fetch_host_channel` (L6 Task 18, R77.3, R52 Q6).** A `js` cell whose `marks[*].channel` names a `math` definition (`eval_workbook`'s `CellOutput.defs[].name`) now binds and fetches its samples through `fetch_host_channel`/`ipc/hostChannel.ts`'s `IDLH` decoder instead of plain-mounting with "not part of this session"; the data reaches the sandbox as a host variable exactly like a session channel. Budget is the tile point budget for the chart's pixel width, clamped to C3's `1..=65536`. Fetches run on the initial bind and on gesture settle through the same `CellRunSequencer`, and a settle whose budget is unchanged issues no call. Limitation, stated: `fetch_host_channel` takes no time window, so zooming a definition-bound cell re-decimates the whole definition rather than resolving a sub-range.
      ```
- [ ] **Step 11. Commit.** Explicit paths (never `git add -A`; an untracked
      `runs/` tree is present and is not yours):
      ```bash
      git add app/src/routes/pages/Notebook CHANGELOG.md docs/IDL0_SPEC.md
      ```
      Single-line message, no AI attribution trailer:
      ```
      app/Notebook: chart cells bind workbook definitions via fetch_host_channel (R77.3)
      ```

---

## Do not

- Do not add a second source of definition names. `eval_workbook`'s outputs
  are it.
- Do not synthesise a time axis for a definition with `has_t` clear
  (C1: "time is recorded, not assumed").
- Do not pass a definition through `chooseTier`/`tileRange`/`ensureTiles`, and
  do not give it a `TileCacheKey`.
- Do not compute a decimation, an average, or a resample in TypeScript.
  `budget` goes to the command; the command decimates (CLAUDE.md §2).
- Do not import `ipc/workbook.ts` from `channelBindDriver.ts` — inject.
- Do not list a callback in an effect's dependency array; do not cancel
  in-flight work from a cleanup.
- Do not run cargo, edit a contract, push, or amend.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value;
`// TODO(idl0):` never bare. Typed errors only — a `fetch_host_channel`
rejection is an `IpcError`-shaped value, never a string.

---

## Open questions for the lead (Q1 and Q2 gate Step 5/Step 6 — if unanswered, do the parts that do not depend on them and STOP before the rest)

1. **What does a sandbox rebuild do with a definition-bound channel?**
   SPEC §26.4 states, as spec text, that a rebuild re-derives every bound
   channel from the shared `TileCache` and **never re-fetches**. A definition
   has no tile-cache entry, so it can only be restored by calling
   `fetch_host_channel` again. Options: (a) re-fetch definition channels on
   rebuild and amend §26.4's clause to say tile-backed channels are re-derived
   while definition channels are re-fetched; (b) cache the decoded
   `{t, v}` arrays host-side in a new definition cache and re-derive from
   that; (c) drop definition channels on rebuild, leaving the cell blank until
   the next settle. **Recommendation: (a).** A rebuild is already the rare,
   watchdog-triggered path; one extra command call there is cheaper than a
   second cache with its own eviction policy, and (c) silently blanks a cell.
   Cost if wrong: one clause of §26.4 and a branch in the rebuild path.

2. **What does a definition-only cell mount?** `ChartCell` is the host-side
   gesture frame over a *tile* pipeline (viewport, tier, `TileCache`,
   cursor readout); a definition-only cell has none of that and no time window
   to pan over. Options: (a) mount `JsCellFrame` (no gestures) — the cell's
   Plot still renders in the sandbox, it just has no pan/zoom, and its budget
   is fixed at the mount width; (b) mount `ChartCell` with a synthetic viewport
   so the gesture surface exists, knowing a settle can only change the budget.
   **Recommendation: (a).** A gesture that provably cannot change what is
   fetched is a lie to the user, and R77.3's "fetches it on gesture settle"
   still holds for the case it describes — a mixed cell, where a real
   `ChartCell` is mounted for the session channel and the definition refetches
   alongside it. Cost if wrong: one branch in `renderJsCell`.

3. **A definition with no recorded axis (`has_t` false).** C3 says `t` is
   empty for a scalar or table-column result. `sandbox/main.ts`'s
   `materializeHostVar` reads `t[i]` unconditionally, so such a channel would
   materialise as `{ t: undefined, v }` records and a Plot with `x: "t"` would
   draw nothing. No source states what a chart over an axis-less definition
   should show. Options: (a) do not bind it at all — treat `has_t === false`
   like an unresolvable channel and plain-mount with a note naming the
   definition and saying it has no recorded axis; (b) bind it and let the cell
   render empty; (c) extend `HostVarPayload` with an axis-less kind that
   materialises to a bare value array. **Recommendation: (a)** for this task —
   it is honest, needs no protocol change, and reuses the note surface
   `JsCellFrame` already has; (c) is the right long-term shape and is a
   separate task once C2 §5.1 says what an axis-less host variable looks like.
   Cost if wrong: one branch in `bindingFor` and its test.

---

## Report back (concise)

Commit hash and `git show --stat`. The exact gate commands and their real
result lines (lane filter and whole suite, both non-zero `passed`, 0 failed).
The real line number of `index.tsx`'s `definitionNames` derivation as you
found it. The exact test case names added to `jsCellBinding.test.ts` and
`channelBindDriver.test.ts`. Which resolution you used for each of Q1–Q3 and
whether it came from the lead or from the recommendation. Confirmation, in one
line each, that: no definition ever reaches `chooseTier`; every `await` in the
driver is followed by an `isStale()` check; no effect dependency array gained a
function. Per-step done/deviated. Anything ambiguous you resolved and how, or
that needs a ruling — stop and report rather than guessing (CLAUDE.md §1).

## Questions template (use verbatim if you must stop)

```
QUESTION <n>
Context: <the file/line and what you were doing>
The gap: <what no source states — cite the sources you checked by path/section>
Options: (a) … (b) … (c) …
My recommendation: <one option, one sentence why>
Cost if wrong: <what has to be undone>
Blocking: yes/no — <what you can finish without the answer>
```
