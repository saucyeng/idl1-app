import { useEffect, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PrefsStore } from "./prefsStore";
import { resolveRegister, themeAttribute, type OutputRegister, type ThemeChoice } from "./theme";

/** Props for {@link ThemeSection}. */
export interface ThemeSectionProps {
  /** The prefs store this section reads from and writes to. */
  store: PrefsStore;
}

/** Reads the live `(prefers-color-scheme: light)` match, for `"system"`
 *  (`theme.ts`'s {@link themeAttribute}). `window.matchMedia` is read
 *  directly here rather than through an injected dependency — this is a
 *  synchronous media-query read, not IPC or `postMessage`, so the
 *  IPC-effects rule does not apply. */
function usePrefersLight(): boolean {
  const [prefersLight, setPrefersLight] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setPrefersLight(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersLight;
}

/** The current viewport width, for {@link resolveRegister}. Width-dependent
 *  layout stays in the pure `resolveRegister`; this hook is only the resize
 *  listener that feeds it (per the lane's effects rule). */
function useViewportWidth(): number {
  const [widthPx, setWidthPx] = useState<number>(() => (typeof window === "undefined" ? 1024 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidthPx(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return widthPx;
}

/** The Theme section: dark / follow-OS choice, and the notebook output
 *  register (UI-DIRECTION decision 5, 31; R92/R93). Both are `ui` keys
 *  (`prefs.ts`'s `UiPrefs.theme` / `output_register`) written through
 *  {@link PrefsStore}. The register's effective value ({@link resolveRegister})
 *  is shown here for reference; UI-10's worksheet bar reads and can also
 *  change the same stored value through the same store. */
export default function ThemeSection({ store }: ThemeSectionProps) {
  const [theme, setTheme] = useState<ThemeChoice>("dark");
  const [outputRegister, setOutputRegister] = useState<OutputRegister | null>(null);
  const prefersLight = usePrefersLight();
  const widthPx = useViewportWidth();

  useEffect(() => {
    let cancelled = false;
    void store.get().then((prefs) => {
      if (!cancelled) {
        setTheme(prefs.ui.theme);
        setOutputRegister(prefs.ui.output_register);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    const attribute = themeAttribute(theme, prefersLight);
    if (attribute === null) {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", attribute);
    }
  }, [theme, prefersLight]);

  function handleThemeChange(value: string): void {
    const next = value === "system" ? "system" : "dark";
    setTheme(next);
    void store.get().then((current) => store.set({ ui: { ...current.ui, theme: next } }));
  }

  function handleRegisterChange(value: string): void {
    if (value !== "paper" && value !== "studio") {
      return;
    }
    setOutputRegister(value);
    void store.get().then((current) => store.set({ ui: { ...current.ui, output_register: value } }));
  }

  const effectiveRegister = resolveRegister(outputRegister, widthPx);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="idl1-settings-theme" className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
          Appearance
        </label>
        <Select value={theme} onValueChange={handleThemeChange}>
          <SelectTrigger id="idl1-settings-theme" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">Follow OS</SelectItem>
          </SelectContent>
        </Select>
        <p className="font-mono text-xs text-fg-faint">
          Dark is the only styled palette today; Follow OS falls back to dark until a light theme lands.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
          Notebook output register
        </span>
        <ToggleGroup
          type="single"
          value={effectiveRegister}
          onValueChange={(value) => value && handleRegisterChange(value)}
        >
          <ToggleGroupItem value="paper">Paper</ToggleGroupItem>
          <ToggleGroupItem value="studio">Studio</ToggleGroupItem>
        </ToggleGroup>
        <p className="font-mono text-xs text-fg-faint">
          {outputRegister === null
            ? `No choice made yet — currently defaulting to ${effectiveRegister} for this window's width.`
            : "Also switchable from the worksheet bar in the Notebook."}
        </p>
      </div>
    </div>
  );
}
