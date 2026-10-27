import { SendIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PeerStatus } from "../../../ipc/sync";

/** Props for {@link PushMenu}. */
export interface PushMenuProps {
  /** Paired devices that are online right now; the menu renders nothing when empty. */
  targets: readonly PeerStatus[];
  /** Called with the chosen device's id. */
  onPush: (peerId: string) => void;
  /** True while a push is running; the trigger is disabled. */
  busy: boolean;
  /** `"icon"` is the per-row push icon; `"toolbar"` is the labelled "Push to" control. */
  variant: "icon" | "toolbar";
  /** Toolbar label (variant `"toolbar"`), e.g. "Push 3 sessions to". */
  label?: ReactNode;
}

/** A menu of online paired devices to push session(s) to. Events are stopped
 *  from reaching a session row's own click/key handlers (React bubbles
 *  through the menu's portal), so choosing a device does not also select the
 *  row. */
export function PushMenu({ targets, onPush, busy, variant, label }: PushMenuProps) {
  if (targets.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            type="button"
            size="icon-xs"
            aria-label="Push to another device"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <SendIcon aria-hidden />
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy} aria-label="Push to another device">
            <SendIcon aria-hidden /> {label ?? "Push to"}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Push to</DropdownMenuLabel>
        {targets.map((peer) => (
          <DropdownMenuItem key={peer.peer_id} onSelect={() => onPush(peer.peer_id)}>
            {peer.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
