import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { WINDOW_CONTROL_ORDER, windowControlLabel, type WindowControlId } from "./windowChrome";

/**
 * Each control's glyph, drawn rather than typed (ruling R216 item 1).
 *
 * Windows' own caption buttons use Segoe Fluent Icons. Bundling a font for
 * three shapes would be three shapes' worth of font ("offline-first means
 * bundled: no CDN, ever" cuts both ways — a font we do not need is a font we
 * do not ship), and the Unicode look-alikes (`─ ☐ ✕`) sit at different
 * baselines and optical weights in whatever the fallback stack resolves to.
 * A 10 px box on a 1 px grid, in `currentColor`, is the same shape in both
 * themes and at any density.
 */
function ControlGlyph({ id, maximized }: { id: WindowControlId; maximized: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="size-[10px]" fill="none" stroke="currentColor" strokeWidth={1} shapeRendering="crispEdges">
      {id === "minimize" && <line x1="0.5" y1="5.5" x2="9.5" y2="5.5" />}
      {id === "maximize" && !maximized && <rect x="0.5" y="0.5" width="9" height="9" />}
      {id === "maximize" && maximized && (
        <>
          {/* The restore glyph: the front window with the one it will
              uncover peeking out behind its top-right corner. */}
          <rect x="0.5" y="2.5" width="7" height="7" />
          <path d="M2.5 2.5V0.5H9.5V7.5H7.5" />
        </>
      )}
      {id === "close" && (
        <>
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
        </>
      )}
    </svg>
  );
}

/**
 * The minimize / maximize / close cluster for the custom title bar (ruling
 * R216 item 1), drawn by us at the density scale and sitting at the far
 * right of whichever bar is at the top of the window.
 *
 * Rendered only where `windowChrome.ts`'s `usesCustomTitleBar` is true —
 * the caller decides, because the same caller decides whether the bar it
 * sits in is a drag region at all.
 *
 * **Known cost, accepted (R216 item 1):** with `decorations: false` Windows
 * no longer offers Snap Layouts on hover of the maximize button, because
 * that gesture belongs to the native caption button we are replacing.
 * Win+arrow and dragging to a screen edge are unaffected.
 *
 * The Tauri window API is imported lazily, per click, for two reasons: the
 * shell must still render in a plain browser tab (`npm run dev` without
 * Tauri, and any future test that mounts it), where the module's top-level
 * IPC probe would throw; and nothing about the title bar should be on the
 * app's startup path. A failed call is swallowed — a window control that
 * cannot reach the window has nothing useful to tell the user, and R201's
 * "never a crash on bad data" applies to a missing host as much as to a
 * malformed payload.
 */
export default function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false);

  // `onResized` fires on maximize, restore and snap, which is every way the
  // glyph can go stale — including the ones that do not go through these
  // buttons (double-click on the drag region, Win+↑, the task bar).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const sync = async () => {
          const now = await appWindow.isMaximized();
          if (!cancelled) setMaximized(now);
        };
        await sync();
        const stop = await appWindow.onResized(() => {
          void sync();
        });
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // Not running under Tauri. The buttons render and do nothing.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  function activate(id: WindowControlId): void {
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        if (id === "minimize") return appWindow.minimize();
        if (id === "close") return appWindow.close();
        return appWindow.toggleMaximize();
      })
      .catch(() => {
        // See the doc comment: a control that cannot reach its window is
        // silent, not a banner.
      });
  }

  return (
    <div className={cn("flex h-full shrink-0 items-stretch", className)} aria-label="Window">
      {WINDOW_CONTROL_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          aria-label={windowControlLabel(id, maximized)}
          title={windowControlLabel(id, maximized)}
          onClick={() => activate(id)}
          className={cn(
            // 46 px wide is Windows' own caption-button width; the bar is
            // 32 px tall, so the hit target is the full height of the bar.
            "flex w-[46px] shrink-0 items-center justify-center text-fg-dim transition-colors",
            id === "close" ? "hover:bg-destructive hover:text-bg" : "hover:bg-surface-2 hover:text-fg",
          )}
        >
          <ControlGlyph id={id} maximized={maximized} />
        </button>
      ))}
    </div>
  );
}
