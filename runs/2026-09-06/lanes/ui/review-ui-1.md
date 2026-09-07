# Review — UI-1 tokens, fonts, Tailwind v4 + shadcn wiring

Commit: `6ce9427` on branch `ui-1`, worktree
`C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-1`.

Files touched (50): `CHANGELOG.md`; `app/components.json`;
`app/package.json` + `package-lock.json`; `app/src/App.css` (deleted),
`App.tsx` (one line removed); `app/src/assets/fonts/*.woff2` (6) +
`FONTS.md`; `app/src/lib/utils.ts`; `app/src/main.tsx`;
`app/src/styles/{fonts.css,index.css,tokenSheet.test.ts,tokens.css}`;
`app/tsconfig.json`; `app/vite.config.ts`; `docs/vendor/shadcn/**` (25
files incl. `SOURCES.md`); `docs/vendor/tailwind-v4/**` (5 files incl.
`SOURCES.md`).

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/styles
```
`tsc --noEmit`: clean, no output. `npx vitest run src/styles`: **29 passed
(29)**, 1 test file. Whole-suite `npx vitest run`: **953 passed (953)**,
99 files — matches the implementer's reported number. One `npx vite build`
run: succeeded (860 modules, both entries — `index.html` and the sandbox
`Notebook/sandbox/index.html` — emitted, R56 preserved); `dist/` inspected
for network references and deleted afterward. No cargo run (not applicable,
TypeScript lane).

## Findings

| Severity | file:line | Finding | Fix |
| --- | --- | --- | --- |
| Major | `app/package.json:24` (`"lucide-react": "1.41.0"`) | UI-1's own brief says explicitly "Do not add an icon library here (UI-2's question)." `lucide-react` was added as a **runtime** dependency, is not imported anywhere under `app/src` (`grep` for `from "lucide-react"` returns nothing), and is not mentioned in the report-back template's required fields. R93 pre-rules that *UI-2* should use `lucide-react`, which does not authorize installing it a task early. | Drop `lucide-react` from UI-1; let UI-2 add it when it's actually consumed. If the lead prefers it land now for shadcn's `iconLibrary: "lucide"` init default, say so explicitly and note the deviation in the report — as filed, the report is silent on it. |
| Minor | `app/components.json:12` | `"iconLibrary": "lucide"` is written into the shadcn config even though no icon library is meant to land in this task. Harmless by itself (shadcn init always asks/writes this field) but it's the reason the above dependency got pulled in; worth a one-line note in the report rather than silence. | No code change needed if the lead accepts the Major above; otherwise revert this field too until UI-2. |

No other deviation found. Specifically checked and clean:
- Every one of the 13 palette hexes, the 8 chart-series hexes (in cycle
  order), the type scale, spacing scale (incl. the new `--space-8`/32px and
  `--hit-target`/44px), and both radii match `UI-DIRECTION.md` exactly —
  verified value-by-value against `tokens.css`.
- R94 (`--accent` collision, ruled 2026-09-07, not yet present in the
  `ui-1` worktree's copy of `decisions.md` since the branch predates it —
  confirmed on `main`) is followed precisely: brand `--accent` stays
  `#e63946` untouched, shadcn's highlight concept is aliased to
  `--shadcn-accent`, and `@theme inline` wires `--color-accent` to
  `--shadcn-accent` while `--color-brand-accent` carries the real brand
  token. `tokenSheet.test.ts`'s colour-literal regex is broadened to
  `rgb()/rgba()/hsl()/hsla()` per R94's acceptance, and the `Settings/
  settings.css` `rgba(...)` known offender is both listed in
  `KNOWN_EXCEPTIONS` (tagged `UI-7`) and independently asserted to still
  contain a colour literal (a stale-exception check the brief did not
  literally ask for but that strengthens the intended guarantee).
- No CDN: all six `@font-face` `url()`s are relative and resolve to
  committed woff2 files (`tokenSheet.test.ts` asserts this and that there
  are exactly 6); the built `dist/assets/main-*.css` only contains
  `url(/assets/ibm-plex-*.woff2)` references, no `http(s)://`; grepped the
  built JS bundles for `fonts.googleapis`/`fonts.gstatic`, zero hits.
  `font-display: swap` is set on all six blocks.
- Font source recorded in `app/src/assets/fonts/FONTS.md`: `@ibm/plex-mono
  2.5.0` / `@ibm/plex-sans 1.1.0`, fetched 2026-09-06, packages dropped
  after extraction per R93; subsetting method (`pyftsubset`, latin +
  latin-ext unicode-range) documented and its cmap coverage stated as
  verified.
- `App.css` deleted; `App.tsx`'s import line removed and nothing else in
  that file touched; `idl1-root` (the one class actually used) is
  re-expressed token-driven in `index.css`'s `@layer base`; `idl1-error`
  was grepped for and found unused anywhere in `app/src`, so correctly
  dropped rather than carried forward.
- `tsconfig.json`'s `paths`-only change is additive and harmless — `tsc
  --noEmit` is clean and nothing else in the file moved.
- Version pins: `tailwindcss` and `@tailwindcss/vite` both `4.3.3` exact,
  `clsx` `2.1.1`, `tailwind-merge` `3.6.0`, `class-variance-authority`
  `0.7.1`, `@types/node` `26.4.1` — none carry a `^`, matching
  `package-lock.json`'s resolved versions. shadcn CLI pinned at `4.21.0`
  and recorded in `docs/vendor/shadcn/SOURCES.md`; both vendor
  `SOURCES.md` files carry file, source URL, and a 2026-09-06 fetch date.
  `tw-animate-css` correctly omitted per the accepted recommendation.
- Tailwind is wired via `@tailwindcss/vite` in the plugins array
  (`vite.config.ts`), not a PostCSS chain; the existing two-entry
  `build.rollupOptions.input` is untouched and both entries still build
  (verified with the one permitted `vite build`).
- `CHANGELOG.md` bullet is accurate to the diff, including the flagged
  `--accent` collision.
- Nothing outside the brief's file list was touched: no changes under
  `app/src/routes/`, `app/src/state/`, `app/src-tauri/`, `rust/`, or
  `Notebook/sandbox/`.

## Verdict rationale

The lane does exactly what its brief specifies — token values, fonts, and
build wiring all check out byte-for-byte against `UI-DIRECTION.md`, the
`--accent` collision is resolved exactly as R94 later ruled, the
enforcement test is real (it would catch a stray hex or a re-added CDN
url), and the reported test/build numbers reproduce. The one real problem
is a single unused runtime dependency (`lucide-react`) added despite the
brief's explicit "do not add an icon library here" instruction and never
mentioned in the report-back — a silent scope deviation, not a
functionality bug, but exactly the kind of drift `CLAUDE.md` §1 says to
stop and ask about rather than pick quietly. It costs one line to revert
and blocks nothing else in the lane, so this is a fix-and-relaunch item,
not a rework.

VERDICT: NEEDS_FIXES
