import type { VideoMatch } from "../../../ipc/video";
import { linkErrorText } from "../Notebook/model/videoSpan";

/** What to do with each dropped video (video spec §4.1's drop flow). */
export interface VideoDropPlan {
  /** Exactly one ride overlaps: link to it. */
  link: { path: string; sessionId: string }[];
  /** Several rides overlap: the user picks one. */
  choose: { path: string; sessionIds: string[] }[];
  /** Unreadable, or no ride overlaps: one message each. */
  failed: string[];
}

/** Whether a dropped path is a video (linked, not imported as a log). */
export function isVideoPath(path: string): boolean {
  return /\.mp4$/i.test(path);
}

/** The file name of `path`, for messages. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Sorts `match_videos`' answers into link, choose and failed. */
export function planVideoDrop(matches: VideoMatch[], formatTime: (utcMs: number) => string): VideoDropPlan {
  const plan: VideoDropPlan = { link: [], choose: [], failed: [] };
  for (const m of matches) {
    const name = fileNameOf(m.path);
    if (m.error !== null) plan.failed.push(linkErrorText(name, m.error, formatTime));
    else if (m.session_ids.length === 1) plan.link.push({ path: m.path, sessionId: m.session_ids[0] });
    else if (m.session_ids.length > 1) plan.choose.push({ path: m.path, sessionIds: m.session_ids });
    else plan.failed.push(`${name}: its recording time overlaps no ride in the library.`);
  }
  return plan;
}
