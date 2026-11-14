import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSession } from "../../../ipc/catalog";
import { linkVideo, matchVideos } from "../../../ipc/video";
import { formatLocalTime } from "../../../state/addVideos";
import { linkErrorText, linkProgressText } from "../Notebook/model/videoSpan";
import { fileNameOf, planVideoDrop, type VideoDropPlan } from "./videoDrop";

/** Links one dropped video to `sessionId`, its progress in one toast. */
async function linkDropped(path: string, sessionId: string): Promise<boolean> {
  const name = fileNameOf(path);
  const id = toast.loading(`Linking ${name}`);
  try {
    await linkVideo(sessionId, path, (p) => toast.loading(linkProgressText(name, p), { id }));
    toast.success(`${name} linked`, { id, description: "Add a video cell to a notebook to play it with the data." });
    return true;
  } catch (error) {
    toast.error("Video not linked", { id, description: linkErrorText(name, error, formatLocalTime) });
    return false;
  }
}

/**
 * The drop flow for videos (video spec §4.1): `match_videos` sorts the
 * dropped MP4s by the rides they overlap; one ride links at once, several
 * ask which, none says so. `onLinked` runs after any link succeeded.
 */
export function useVideoDrop(onLinked: () => void) {
  const [choices, setChoices] = useState<VideoDropPlan["choose"]>([]);
  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;

  async function handleVideos(paths: string[]): Promise<void> {
    let plan: VideoDropPlan;
    try {
      plan = planVideoDrop(await matchVideos(paths), formatLocalTime);
    } catch {
      toast.error("Videos not linked", { description: "Their recording times could not be read." });
      return;
    }
    for (const text of plan.failed) toast.error("Video not linked", { description: text });
    let any = false;
    for (const { path, sessionId } of plan.link) any = (await linkDropped(path, sessionId)) || any;
    if (any) onLinkedRef.current();
    setChoices(plan.choose);
  }

  async function choose(path: string, sessionId: string | null): Promise<void> {
    setChoices((rest) => rest.filter((c) => c.path !== path));
    if (sessionId !== null && (await linkDropped(path, sessionId))) onLinkedRef.current();
  }

  return { handleVideos, choices, choose };
}

/** "Which ride is this video from?" for a video that overlaps several. */
export function VideoRideChooser({ choice, onChoose }: { choice: VideoDropPlan["choose"][number] | undefined; onChoose: (path: string, sessionId: string | null) => void }) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (choice === undefined) return;
    let cancelled = false;
    for (const id of choice.sessionIds) {
      getSession(id)
        .then((d) => {
          if (!cancelled) setLabels((l) => ({ ...l, [id]: `${d.venue_name || "No venue"} · ${formatLocalTime(d.timestamp_utc_ms)}` }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [choice]);

  if (choice === undefined) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onChoose(choice.path, null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which ride is this video from?</DialogTitle>
          <DialogDescription>{fileNameOf(choice.path)} overlaps more than one ride.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {choice.sessionIds.map((id) => (
            <Button key={id} type="button" className="justify-start font-mono" onClick={() => onChoose(choice.path, id)}>
              {labels[id] ?? id.slice(0, 8)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
