import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

/** The Firmware section: an honest empty affordance (UI-7 brief, Open
 *  question 3). The update path itself is deferred to wave 3 (operating
 *  brief §3) — this section names that plainly rather than showing a
 *  disabled control or nothing at all, and adds no IPC command or stub. */
export default function FirmwareSection() {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <div className="flex flex-col gap-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 font-mono text-sm text-fg-dim">
          <ChevronRightIcon
            aria-hidden
            className={open ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"}
          />
          Firmware updates
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="pt-2 pl-5 font-mono text-sm text-fg-faint">
            Firmware updates arrive in a later version.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
