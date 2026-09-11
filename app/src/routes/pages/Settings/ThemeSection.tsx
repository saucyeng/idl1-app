import { useEffect, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { readShowOccasional, writeShowOccasional } from "@/shell/ribbonPrefs";
import type { PrefsStore } from "./prefsStore";
import { resolveRegister, themeAttribute, type OutputRegister, type PaperTheme, type ThemeChoice } from "./theme";

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

/** The Theme section: the app's dark / follow-OS choice, the paper view's
 *  own theme (ruling R185 item 3), and the notebook output
 *  register (UI-DIRECTION decision 5, 31; R92/R93). Both are `ui` keys
 *  (`prefs.ts`'s `UiPrefs.theme` / `output_register`) written through
 *  {@link PrefsStore}. The register's effective value ({@link resolveRegister})
 *  is shown here for reference; UI-10's worksheet bar reads and can also
 *  change the same stored value through the same store. */
export default function ThemeSection({ store }: ThemeSectionProps) {
  const [theme, setTheme] = useState<ThemeChoice>("dark");
  const [outputRegister, setOutputRegister] = useState<OutputRegister | null>(null);
  const [paperTheme, setPaperTheme] = useState<PaperTheme>("app");
  const [graphNodeColour, setGraphNodeColour] = useState(false);
  const [showOccasional, setShowOccasional] = useState(readShowOccasional);
  const prefersLight = usePrefersLight();
  const widthPx = useViewportWidth();

  useEffect(() => {
    let cancelled = false;
    void store.get().then((prefs) => {
      if (!cancelled) {
        setTheme(prefs.ui.theme);
        setOutputRegister(prefs.ui.output_register);
        setPaperTheme(prefs.ui.paper_theme);
        setGraphNodeColour(prefs.ui.graph_node_colour);
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

  /** Ruling R185 item 3's second toggle. Unlike {@link handleThemeChange}
   *  this stamps nothing on the document: paper's theme is scoped to the
   *  paper view itself (`PaperView`'s `data-paper-theme` and
   *  `Notebook/model/report/paperPalette.ts`), never to the whole app. */
  function handlePaperThemeChange(value: string): void {
    if (value !== "app" && value !== "light" && value !== "dark") {
      return;
    }
    setPaperTheme(value);
    void store.get().then((current) => store.set({ ui: { ...current.ui, paper_theme: value } }));
  }

  /** Ruling R214 item 1's optional colour cue for the maths graph. Off by
   *  default and purely additive: the node kinds are already told apart by
   *  card shape, header glyph and type face, so nothing breaks when this is
   *  off and nothing new is stated when it is on. */
  function handleGraphNodeColourChange(next: boolean): void {
    setGraphNodeColour(next);
    void store.get().then((current) => store.set({ ui: { ...current.ui, graph_node_colour: next } }));
  }

  /** Ruling R225 item 4's ribbon density switch. Renderer-only and per
   *  machine (`shell/ribbonPrefs.ts`), so unlike its neighbours here it is
   *  not a `UiPrefs` key: which controls this machine wants on screen is
   *  not a document value and is never synced. */
  function handleShowOccasionalChange(next: boolean): void {
    setShowOccasional(next);
    writeShowOccasional(next);
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
        <label htmlFor="idl1-settings-paper-theme" className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
          Paper view
        </label>
        <Select value={paperTheme} onValueChange={handlePaperThemeChange}>
          <SelectTrigger id="idl1-settings-paper-theme" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="app">Follow app</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
        <p className="font-mono text-xs text-fg-faint">
          The Notebook&apos;s paper view on a narrow screen. Light is for reading outdoors; it does not change the rest of the app.
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

      <div className="flex flex-col gap-2">
        <label htmlFor="idl1-settings-graph-node-colour" className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
          Colour-code graph nodes
        </label>
        <Switch
          id="idl1-settings-graph-node-colour"
          checked={graphNodeColour}
          onCheckedChange={handleGraphNodeColourChange}
        />
        <p className="font-mono text-xs text-fg-faint">
          Adds a coloured stripe per node kind on the Notebook&apos;s maths graph. Sources, derived values and charts are already
          told apart by card shape and glyph; this is an extra cue, not the encoding.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="idl1-settings-ribbon-occasional" className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">
          Show occasional commands as buttons
        </label>
        <Switch id="idl1-settings-ribbon-occasional" checked={showOccasional} onCheckedChange={handleShowOccasionalChange} />
        <p className="font-mono text-xs text-fg-faint">
          The Notebook ribbon shows the commands you reach for constantly and keeps the rest behind each button&apos;s chevron. Turn
          this on to put Export report, Rescan library and Rebuild catalog on the row as small buttons too.
        </p>
      </div>
    </div>
  );
}
