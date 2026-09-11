import type { ReactNode } from "react";
import {
  AlignJustify,
  Clock,
  Code2,
  DatabaseBackup,
  Eye,
  FileOutput,
  FilePlus2,
  FolderInput,
  FolderOpen,
  Import,
  LayoutGrid,
  MousePointer2,
  PanelLeft,
  RefreshCw,
  Rows3,
  Ruler,
  Save,
  Terminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The ribbon's button shapes (ruling R225 item 3). Isaac, 2026-09-11: "a
 * CAD-style deal where they can be both big buttons and dropdowns that
 * extend to other big buttons, small buttons and nested dropdowns".
 *
 * Three shapes and nothing else:
 *
 * - {@link RibbonBigButton} — 36 × 36, icon over an 11 px label. The core
 *   tier, and the only thing a first run shows.
 * - {@link RibbonSplitButton} — a big button whose right 16 px is a chevron
 *   opening its dropdown. One bordered shell, the two halves parted by the
 *   same hairline that separates two toolbar groups (UI-DIRECTION decision
 *   23: depth is a hairline, never a shadow), so the shape reads as one
 *   control with two targets rather than two buttons jammed together.
 * - {@link RibbonSmallButton} — the promoted form of an occasional command
 *   when "Show occasional commands as buttons" is on: label only, control
 *   height, no icon, because a row of equally-big buttons has no hierarchy
 *   left to read.
 *
 * Every one of them carries `shrink-0` and every container `flex-nowrap`.
 * That pair is R225 item 3's root-cause fix for the reported overlap: the
 * old actions group let its children take the default `flex-shrink: 1`, so
 * a narrow row compressed each button's box below its own text and the text
 * painted over the next button. `shell/toolbarLayout.ts`'s `packedSpans`
 * is the model of that, and its test is the guard.
 */

/** The `lucide-react` icons `shell/commandTiers.ts` names, by name. A map
 *  rather than a dynamic import so the bundle carries these twenty icons
 *  and not the whole set — offline-first means bundled, and it means
 *  bundling only what is used. */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  AlignJustify,
  Clock,
  Code2,
  DatabaseBackup,
  Eye,
  FileOutput,
  FilePlus2,
  FolderInput,
  FolderOpen,
  Import,
  LayoutGrid,
  MousePointer2,
  PanelLeft,
  RefreshCw,
  Rows3,
  Ruler,
  Save,
  Terminal,
  Workflow,
};

/** `name`'s icon component, or `undefined` when the table names one this
 *  module does not import — the button then renders its label alone rather
 *  than a blank square. */
export function ribbonIcon(name: string): LucideIcon | undefined {
  return ICONS[name];
}

/** The shared skin of both big shapes: the focus ring, the hover and
 *  pressed grounds, and the disabled state. Written once here because the
 *  split button's two halves must be indistinguishable from a plain big
 *  button's single surface. */
const BIG_BASE =
  "flex h-9 shrink-0 flex-col items-center justify-center gap-px rounded-[var(--radius)] px-[var(--nb-pad)] " +
  "text-fg transition-colors outline-none hover:bg-control focus-visible:outline focus-visible:outline-1 " +
  "focus-visible:outline-offset-1 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50";

/** Props shared by the big shapes. */
interface BigButtonContent {
  /** The `lucide-react` icon name from `shell/commandTiers.ts`. */
  icon: string;
  /** The full word under the icon. Hidden, but still the accessible name,
   *  when `labelled` is false. */
  label: string;
  /** False at the tightest widths, where `shell/toolbarLayout.ts` has
   *  dropped every label to buy a group its place on the row. */
  labelled: boolean;
}

/** Icon over label, or icon alone with the label as the accessible name. */
function BigFace({ icon, label, labelled }: BigButtonContent) {
  const Icon = ribbonIcon(icon);

  return (
    <>
      {Icon !== undefined && <Icon aria-hidden className="size-4 shrink-0" />}
      <span
        className={cn(
          "max-w-[9ch] truncate text-[length:var(--nb-text-label)] leading-none",
          labelled ? "" : "sr-only",
        )}
      >
        {label}
      </span>
    </>
  );
}

/** Props for {@link RibbonBigButton}. */
export interface RibbonBigButtonProps extends BigButtonContent {
  /** Greyed out and unclickable. A command with no registered handler is
   *  disabled rather than absent (R220 item 1). */
  disabled?: boolean;
  /** True for a toggle that is currently on — the three panel buttons, the
   *  axis choice. Marked with the app's amber accent as a 2 px underline,
   *  the horizontal reading of the activity bar's own left accent bar. */
  pressed?: boolean;
  /** Why the control will not respond, or what it does. */
  title?: string;
  onClick: () => void;
}

/** One core command as a 36 × 36 icon-over-label button (R225 item 3). */
export function RibbonBigButton({ icon, label, labelled, disabled, pressed, title, onClick }: RibbonBigButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      title={title ?? label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={cn(BIG_BASE, "min-w-9", pressed === true && "bg-control shadow-[inset_0_-2px_0_0_var(--accent)]")}
    >
      <BigFace icon={icon} label={label} labelled={labelled} />
    </button>
  );
}

/** Props for {@link RibbonSplitButton}. */
export interface RibbonSplitButtonProps extends BigButtonContent {
  /** The default action, run by the wide half. `null` makes the whole
   *  control open the menu — the View button, which has no action of its
   *  own, only a menu. */
  onClick: (() => void) | null;
  /** True when the default action cannot run right now. The chevron half
   *  stays live: a disabled Save must still offer Export. */
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
  /** What the chevron opens. Rendered inside the R220 menu primitive. */
  children: ReactNode;
}

/**
 * A core command with its occasional and rare commands behind a 16 px
 * chevron (R225 item 3).
 *
 * The wide half runs the command; the chevron half opens the menu. When
 * `onClick` is `null` the whole control is the trigger, which is how a
 * group that is only ever a menu — View — keeps the same silhouette as its
 * neighbours without pretending to have a default action.
 */
export function RibbonSplitButton({ icon, label, labelled, onClick, disabled, pressed, title, children }: RibbonSplitButtonProps) {
  return (
    <DropdownMenu>
      <div
        className={cn(
          "flex shrink-0 flex-nowrap items-center rounded-[var(--radius)] border border-rule bg-surface-2",
          pressed === true && "shadow-[inset_0_-2px_0_0_var(--accent)]",
        )}
      >
        {onClick !== null && (
          <button
            type="button"
            onClick={onClick}
            disabled={disabled === true}
            title={title ?? label}
            aria-pressed={pressed === undefined ? undefined : pressed}
            className={cn(BIG_BASE, "min-w-9 rounded-r-none")}
          >
            <BigFace icon={icon} label={label} labelled={labelled} />
          </button>
        )}
        <DropdownMenuTrigger
          type="button"
          aria-label={onClick === null ? label : `${label} — more commands`}
          aria-pressed={onClick === null && pressed !== undefined ? pressed : undefined}
          title={onClick === null ? (title ?? label) : `${label} — more commands`}
          className={cn(
            BIG_BASE,
            "gap-[var(--nb-pad)] rounded-l-none",
            // With a default action beside it the chevron is R225 item 3's
            // 16 px half, parted from it by the same hairline that parts two
            // toolbar groups. With no default action the whole control is
            // the trigger, so it carries the face and the chevron together.
            onClick === null ? "min-w-9 flex-row px-[var(--nb-pad)] rounded-l-[var(--radius)]" : "w-4 min-w-4 border-l border-rule px-0 text-fg-dim",
          )}
        >
          {onClick === null && <BigFace icon={icon} label={label} labelled={labelled} />}
          <span aria-hidden className="text-[length:var(--nb-text-label)] leading-none">
            ▾
          </span>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="start" className="idl-dense min-w-56 text-[length:var(--nb-text-body)]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Props for {@link RibbonSmallButton}. */
export interface RibbonSmallButtonProps {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
  onClick: () => void;
}

/** An occasional command promoted onto the row by R225 item 4's preference:
 *  label only, at the Notebook's own 22 px control height, so it reads as a
 *  smaller thing than the core tier beside it. */
export function RibbonSmallButton({ label, disabled, pressed, title, onClick }: RibbonSmallButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      title={title ?? label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={cn(
        "flex h-[var(--nb-control-h)] shrink-0 items-center whitespace-nowrap rounded-[var(--radius)] border border-rule",
        "bg-surface-2 px-[var(--space-2)] text-[length:var(--nb-text-label)] text-fg transition-colors outline-none",
        "hover:bg-control focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1",
        "focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50",
        pressed === true && "bg-control",
      )}
    >
      {label}
    </button>
  );
}

/** Props for {@link RibbonMenuItem}. */
export interface RibbonMenuItemProps {
  label: string;
  icon?: string;
  /** Printed right-aligned, e.g. `"Ctrl+S"`; `null` for no binding. */
  shortcut: string | null;
  disabled: boolean;
  /** `true`/`false` render a leading tick column; `undefined` is an action
   *  with no on/off state. */
  checked?: boolean;
  title?: string;
  onSelect: () => void;
}

/** One entry inside a ribbon dropdown, shaped exactly like the menu bar's
 *  (R220's menu primitive) so a command reads the same wherever it is met. */
export function RibbonMenuItem({ label, icon, shortcut, disabled, checked, title, onSelect }: RibbonMenuItemProps) {
  const Icon = icon === undefined ? undefined : ribbonIcon(icon);

  return (
    <DropdownMenuItem disabled={disabled} title={title} onSelect={onSelect} className="gap-[var(--space-2)]">
      <span aria-hidden className="w-3 shrink-0 text-center text-fg-dim">
        {checked === true ? "✓" : ""}
      </span>
      {Icon !== undefined && <Icon aria-hidden className="size-3.5 shrink-0 text-fg-dim" />}
      <span className="flex-1 truncate">{label}</span>
      {shortcut !== null && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}

/** The rule between two blocks of a dropdown. */
export function RibbonMenuSeparator() {
  return <DropdownMenuSeparator />;
}

/** Props for {@link RibbonSubmenu}. */
export interface RibbonSubmenuProps {
  label: string;
  icon?: string;
  /** True when nothing inside can run — a submenu that opens onto a list of
   *  greyed-out items is worse than one that says so at its own trigger. */
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

/** A nested dropdown, one level inside its parent (R225 item 2's home for
 *  the rare tier, and for the pointer-mode presets, whose entries come from
 *  `interaction/inputMap.ts` at runtime rather than from the tier table). */
export function RibbonSubmenu({ label, icon, disabled, title, children }: RibbonSubmenuProps) {
  const Icon = icon === undefined ? undefined : ribbonIcon(icon);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled === true} title={title} className="gap-[var(--space-2)]">
        <span aria-hidden className="w-3 shrink-0" />
        {Icon !== undefined && <Icon aria-hidden className="size-3.5 shrink-0 text-fg-dim" />}
        <span className="flex-1 truncate">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="idl-dense min-w-48 text-[length:var(--nb-text-body)]">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
