import { useEffect, useState } from "react";

import { SpecRow } from "@/components/brand/SpecRow";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AppChannel } from "../../../ipc/appUpdate";
import { BUILD, checkForUpdatesNow, effectiveChannel } from "../../../shell/channelUpdate";
import { openUpdateLink } from "../../../shell/openUpdateLink";
import { openUpdatePanel, useUpdateState, versionLabel } from "../../../shell/updateState";
import { aboutRows } from "./about";
import type { PrefsStore } from "./prefsStore";

/** Props for {@link AboutSection}. */
export interface AboutSectionProps {
  /** The `idl-rs` engine version, as already fetched once by the app shell
   *  (`AppState.engineVersion`, C3 §3.1 `engine_version`). `null` while
   *  that fetch is still in flight. This section never calls
   *  `engine_version` itself. */
  engineVersion: string | null;
  /** The prefs store the app channel pick lives in (`ui` half). */
  store: PrefsStore;
}

/** The About section: app/engine/schema/build metadata rows
 *  ({@link aboutRows}), then App updates.
 *
 * idl0's Licenses button (generated from Flutter's package graph) and
 * Report-issue button (an `example.com` placeholder) are not carried
 * across — idl1 has no equivalent license-page generator wired into its
 * build, and Licenses appears only if bundled license text is available,
 * which it is not in wave 2, so the control is omitted rather than shown
 * disabled or linking out. */
export default function AboutSection({ engineVersion, store }: AboutSectionProps) {
  const rows = aboutRows(engineVersion, BUILD);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <SpecRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
      <AppUpdates store={store} />
    </div>
  );
}

/**
 * App updates (2026-10-15): the release channel the app's own update check
 * uses (C3 §3.10) and "Check for updates". The channel defaults to the one
 * the build was made for; a pick is remembered and takes effect from the
 * next release on that channel (newer means a higher build number, so a
 * nightly switched to stable waits for the first stable built after it).
 * The outcome lands in the same store the banner and the status-bar chip
 * read.
 */
function AppUpdates({ store }: { store: PrefsStore }) {
  const update = useUpdateState();
  const [picked, setPicked] = useState<AppChannel | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let live = true;
    void store.get().then((prefs) => {
      if (live) setPicked(prefs.ui.app_channel);
    });
    return () => {
      live = false;
    };
  }, [store]);

  if (BUILD === null) {
    return (
      <div className="flex flex-col gap-2 border-t border-rule pt-4">
        <span className="font-mono text-xs tracking-[var(--tracking-label)] text-fg-dim uppercase">App updates</span>
        <p className="font-mono text-xs text-fg-faint">A local build has no release channel, so it never checks for updates.</p>
      </div>
    );
  }
  const build = BUILD;
  const channel = effectiveChannel(picked, build);

  function choose(value: AppChannel): void {
    // The build's own channel is stored as "follow the build" (null), so a
    // later build made for another channel is not pinned by an old pick.
    const next = value === build.channel ? null : value;
    setPicked(next);
    setChecked(false);
    void store.get().then((current) => store.set({ ui: { ...current.ui, app_channel: next } }));
  }

  function check(): void {
    setChecked(true);
    void checkForUpdatesNow();
  }

  let result: string | null = null;
  if (update.kind === "checking") result = "Checking…";
  else if (update.kind === "error" && checked) result = `Couldn't check: ${update.message}`;
  else if (update.kind === "idle" && checked) result = "Up to date.";

  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <span className="font-mono text-xs tracking-[var(--tracking-label)] text-fg-dim uppercase">App updates</span>
      <ToggleGroup
        type="single"
        aria-label="App release channel"
        value={channel}
        onValueChange={(value) => value && choose(value as AppChannel)}
      >
        <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
        <ToggleGroupItem value="beta">Beta</ToggleGroupItem>
        <ToggleGroupItem value="nightly">Nightly</ToggleGroupItem>
      </ToggleGroup>
      {channel !== build.channel && (
        <p className="font-mono text-xs text-fg-faint">
          This build is {build.channel}. You&apos;ll be offered the next {channel} release built after it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={update.kind === "checking"} onClick={check}>
          Check for updates
        </Button>
        {update.kind === "available" && (
          <>
            <button type="button" className="font-mono text-sm text-fg underline" onClick={openUpdatePanel}>
              {versionLabel(update.version)} available
            </button>
            {update.link !== undefined && (
              <Button emphasis="info" filled onClick={() => openUpdateLink(update.link as string)}>
                Download
              </Button>
            )}
          </>
        )}
      </div>
      {result !== null && (
        <p role="status" className="font-mono text-xs text-fg-dim">
          {result}
        </p>
      )}
    </div>
  );
}
