/**
 * Decision 62 (`runs/2026-09-07/ui/UI-DIRECTION-2.md` §D): "An engine or
 * importer version change that will regenerate derived files is announced
 * by a dismissable banner on the workbook, not a toast or silence." Pure
 * decision logic only -- `Notebook/index.tsx` fetches the inputs
 * (`ipc/engine.ts`'s `fetchEngineVersion`, `SessionSummary.engine_version`
 * for each selected session, already exposed by `ipc/catalog.ts`'s
 * `listSessions`) and `components/VersionBanner.tsx` renders the result.
 *
 * **Engine only, not importer, in this pass.** `SessionSummary` records
 * the `importer_version` a session was produced with (C1 §4.3), but no C3
 * command exposes the engine's *current* importer version to compare it
 * against -- `ImporterInfo` (`ipc/import.ts`) carries an id/label/
 * extensions, no version. Detecting an importer-version change needs a
 * contract amendment (a new field on `ImporterInfo`, or a new command);
 * per the overnight rule ("a task needing a contract decision is skipped
 * and the reason recorded, not guessed"), this module only ever compares
 * `engine_version` and says nothing about importers. The half that is
 * knowable ships now rather than waiting on the whole decision.
 */

/** One selected session's own recorded engine version, and its display
 *  identity for the banner's copy. */
export interface SessionEngineVersion {
  sessionId: string;
  /** `SessionSummary.engine_version` (C1 §4.3) -- the `idl-rs` core
   *  version that produced this session's derived files. */
  engineVersion: string;
}

/** What the banner shows, or `null` when nothing needs announcing. */
export interface EngineVersionBanner {
  /** The live engine's own version (`fetchEngineVersion`). */
  currentEngineVersion: string;
  /** Every selected session whose own recorded `engine_version` differs
   *  from `currentEngineVersion`, in the order given -- a session already
   *  matching the live engine is not listed (nothing to announce for it). */
  outdated: SessionEngineVersion[];
}

/**
 * Decides the banner for the currently selected sessions. `null` when every
 * selected session already recorded the live engine's own version -- the
 * common case, and the only one this task's dispatch (never a hard error,
 * never a toast) is defined for. A caller with zero selected sessions gets
 * `null` too: there is nothing to regenerate yet.
 */
export function engineVersionBanner(sessions: readonly SessionEngineVersion[], currentEngineVersion: string): EngineVersionBanner | null {
  const outdated = sessions.filter((s) => s.engineVersion !== currentEngineVersion);
  if (outdated.length === 0) return null;
  return { currentEngineVersion, outdated };
}

/**
 * The advisory front-matter key recording which build last evaluated this
 * workbook — the workbook half of decision 62, alongside the per-session
 * half above.
 *
 * **Advisory, exactly like C2 §3.7's `graph`.** Nothing in the parser, the
 * evaluator or `[Name]` resolution reads it; it cannot change a value, a
 * wire or an error. It needs no contract amendment to be safe in a file:
 * ruling R135 (C2 §3.2) requires a v3 parser to preserve every top-level
 * front-matter key it does not itself define, round-tripping it unmodified
 * on render, so a key written by a newer build survives an older build
 * opening and re-saving the workbook.
 *
 * **Nothing in this app writes it.** Decision 62's "never auto-rewrite the
 * file" is taken at its word: the banner never stamps the current version
 * over the recorded one to make itself go away, and this lane adds no save
 * path that would. Stamping the key belongs in `core`'s own
 * `render_front_matter` on an explicit save — a Rust change, which a
 * TypeScript lane does not make. Until that lands the key appears only in
 * a workbook that already carries it, and {@link parseEvaluatedWith}
 * returns `null` for every other file, which is the quiet, correct
 * behaviour rather than a false alarm.
 */
export const EVALUATED_WITH_KEY = "evaluated_with";

/**
 * Reads the advisory `evaluated_with` value out of a workbook's raw
 * markdown, or `null` when the file has no front matter, no such key, or
 * an empty one.
 *
 * A deliberately narrow scan rather than a YAML parse: the app bundles no
 * YAML library, the authoritative parse is `core`'s (C2 §3.2), and this
 * value drives one advisory banner. It reads only a **top-level, scalar**
 * `evaluated_with:` line inside the leading `---` fenced block — an
 * indented line (a sub-key of `graph:` or any other mapping) is ignored,
 * so a nested key of the same name can never be mistaken for the top-level
 * one. Surrounding quotes and whitespace are stripped; a `#` comment is
 * not, since a version string has no comment syntax and stripping one
 * would corrupt a legitimate value containing `#`.
 *
 * @param markdown The workbook file's verbatim text (`readWorkbook`'s
 *   `markdown`, C3 §3.4), or `null` before a read has landed.
 */
export function parseEvaluatedWith(markdown: string | null): string | null {
  if (markdown === null) return null;

  // Front matter is the leading `---` fenced block and nothing else (C2
  // §3.1's grammar): a `---` appearing later in the body is a horizontal
  // rule, never a second front matter, so only the first block is scanned.
  const lines = markdown.split("\n");
  if (lines.length === 0 || lines[0].trimEnd() !== "---") return null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimEnd() === "---") break;
    // A leading space means this line belongs to some mapping above it,
    // not to the document's own top level.
    if (line.startsWith(" ") || line.startsWith("\t")) continue;
    if (!line.startsWith(`${EVALUATED_WITH_KEY}:`)) continue;

    const raw = line.slice(EVALUATED_WITH_KEY.length + 1).trim();
    const unquoted = raw.replace(/^["']/, "").replace(/["']$/, "").trim();
    return unquoted === "" ? null : unquoted;
  }

  return null;
}

/** What the workbook-version banner shows, or `null` when nothing needs
 *  announcing. */
export interface WorkbookVersionBanner {
  /** The version recorded in front matter — the build that last evaluated
   *  this workbook. */
  evaluatedWith: string;
  /** The build the reader is on now. */
  currentVersion: string;
}

/**
 * Decides decision 62's workbook banner: `null` when the file records no
 * version (the common case today, since nothing writes the key yet), when
 * the live version has not resolved, or when the two already agree.
 *
 * Compared as exact strings, never parsed into components and ordered: an
 * older build opening a workbook a newer one evaluated is worth announcing
 * in exactly the same way as the reverse, and a build string is not
 * reliably a comparable semantic version.
 *
 * @param markdown The workbook's verbatim text, or `null` before a read.
 * @param currentVersion The build the reader is on, or `null` before it resolves.
 */
export function workbookVersionBanner(markdown: string | null, currentVersion: string | null): WorkbookVersionBanner | null {
  if (currentVersion === null) return null;

  const evaluatedWith = parseEvaluatedWith(markdown);
  if (evaluatedWith === null || evaluatedWith === currentVersion) return null;

  return { evaluatedWith, currentVersion };
}

/** The banner's own sentence, in decision 62's wording. Built here rather
 *  than in the component so the copy is testable without rendering — the
 *  same split `theme/slotStates.ts` makes. */
export function workbookVersionBannerMessage(banner: WorkbookVersionBanner): string {
  return `Evaluated with idl1 ${banner.evaluatedWith}; you are on ${banner.currentVersion}.`;
}
