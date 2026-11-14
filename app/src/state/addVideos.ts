import { open } from "@tauri-apps/plugin-dialog";

import { linkVideo } from "../ipc/video";
import { linkErrorText, linkProgressText } from "../routes/pages/Notebook/model/videoSpan";

/** What one "Add video" run did: how many files were linked, and a message
 *  per file that was not. */
export interface AddVideosOutcome {
  linked: number;
  errors: string[];
}

/**
 * "Add video" (video spec §4.1): pick one or more MP4s and link each to
 * `sessionId` (C3 §3.12 `link_video`, which copies the file, never moves
 * it). Shared by the Data tab's session pane and the empty video cell.
 * `onBusy` gets each file's progress line, then `null`. Resolves `null`
 * when the picker was cancelled.
 */
export async function pickAndLinkVideos(sessionId: string, onBusy: (text: string | null) => void): Promise<AddVideosOutcome | null> {
  let picked: string | string[] | null;
  try {
    picked = await open({ multiple: true, filters: [{ name: "Video", extensions: ["mp4", "MP4"] }] });
  } catch {
    return { linked: 0, errors: ["The file picker could not be opened."] };
  }
  if (picked === null) return null;
  const outcome: AddVideosOutcome = { linked: 0, errors: [] };
  for (const path of Array.isArray(picked) ? picked : [picked]) {
    const fileName = path.split(/[\\/]/).pop() ?? path;
    onBusy(`Linking ${fileName}`);
    try {
      await linkVideo(sessionId, path, (p) => onBusy(linkProgressText(fileName, p)));
      outcome.linked += 1;
    } catch (error) {
      outcome.errors.push(linkErrorText(fileName, error, formatLocalTime));
    }
  }
  onBusy(null);
  return outcome;
}

/** A local wall-clock time, for the no-overlap message. */
export function formatLocalTime(utcMs: number): string {
  return new Date(utcMs).toLocaleString();
}
