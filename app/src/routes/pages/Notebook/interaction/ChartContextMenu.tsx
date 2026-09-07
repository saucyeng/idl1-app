import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { actionLabel, actionsFor, type ChartAction, type ChartActionContext } from "./chartActions";

/** Props for {@link ChartContextMenu}. */
export interface ChartContextMenuProps {
  /** The chart's current action context — see `chartActions.ts`'s {@link ChartActionContext}. */
  ctx: ChartActionContext;
  /** Called with the chosen action; `ChartCell` dispatches it to the matching viewport/cursor/code handler. */
  onAction: (action: ChartAction) => void;
  /** The chart surface the menu opens over (UI-3's `context-menu`, right-click). */
  children: ReactNode;
}

/**
 * The chart's right-click action menu (decision 27), over UI-3's
 * `context-menu` primitive: renders `chartActions.ts`'s `actionsFor(ctx)`
 * in order, with `ContextMenuSeparator` for every `"-"` and a keyboard hint
 * (`ContextMenuShortcut`) exactly when `actionLabel` reports one. This
 * component holds no state of its own — `ctx` and `onAction` are supplied
 * fresh on every open by `ChartCell`, which is also the only place any
 * action's effect (a viewport change, a cursor move, a code toggle) is
 * actually applied.
 *
 * @param props See {@link ChartContextMenuProps}.
 */
export default function ChartContextMenu({ ctx, onAction, children }: ChartContextMenuProps) {
  const items = actionsFor(ctx);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((item, index) =>
          item === "-" ? (
            <ContextMenuSeparator key={`sep-${index}`} />
          ) : (
            <ContextMenuItem key={item} onSelect={() => onAction(item)}>
              {actionLabel(item).label}
              {actionLabel(item).hint !== null && <ContextMenuShortcut>{actionLabel(item).hint}</ContextMenuShortcut>}
            </ContextMenuItem>
          )
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
