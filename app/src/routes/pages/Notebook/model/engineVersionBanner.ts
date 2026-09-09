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
