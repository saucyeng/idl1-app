import { useState } from "react";
import { toast } from "sonner";

import { Button } from "../../../components/ui/button";
import { getSession, type SessionDetail } from "../../../ipc/catalog";
import { isAndroid } from "../../../ipc/appUpdate";
import { pickAndLinkVideos } from "../../../state/addVideos";

/**
 * "Add video" on the session pane (video spec §4.1): pick MP4s and link them
 * to this session, then reload the session so its video count is current.
 * Desktop only, as the video cell's picker is: videos stay off the phone by
 * default (spec §10 item 3).
 */
export function AddVideoButton({ detail, onLinked }: { detail: SessionDetail; onLinked: (detail: SessionDetail) => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  if (typeof navigator !== "undefined" && isAndroid(navigator.userAgent)) return null;
  const count = detail.videos?.length ?? 0;

  const handleAdd = async () => {
    const outcome = await pickAndLinkVideos(detail.session_id, setBusy);
    if (outcome === null) return;
    if (outcome.linked > 0) {
      toast.success(outcome.linked === 1 ? "Video linked" : `${outcome.linked} videos linked`, {
        description: "Add a video cell to a notebook to play it with the data.",
      });
      onLinked(await getSession(detail.session_id));
    }
    for (const error of outcome.errors) toast.error("Video not linked", { description: error });
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" onClick={() => void handleAdd()} disabled={busy !== null}>
        {busy ?? "Add video"}
      </Button>
      {count > 0 && busy === null && (
        <span className="font-mono text-xs text-fg-dim">{count === 1 ? "1 video linked" : `${count} videos linked`}</span>
      )}
    </div>
  );
}
