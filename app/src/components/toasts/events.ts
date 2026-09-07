/** The only four events allowed to raise a toast (UI-DIRECTION decision 21):
 *  transfer complete, config pushed, sync finished, import failed.
 *  Everything else reports in place — a toast is not an error channel. */
export type CoreToastEvent =
  | { kind: "transferComplete"; fileCount: number }
  | { kind: "configPushed"; profileName: string }
  | { kind: "syncFinished"; changed: number }
  | { kind: "importFailed"; fileName: string; message: string };

/** What `Toaster.tsx` shows for a `CoreToastEvent`: the tone picks the icon
 *  and accent colour, `title` is the headline, `detail` is optional
 *  supporting text (e.g. the failing file name). */
export interface ToastDescriptor {
  tone: "good" | "info" | "accent";
  title: string;
  detail?: string;
}

/** Maps a core-workflow event to its toast content. The union above is
 *  closed on purpose: adding a fifth toast is a design decision, and a
 *  `default` arm would hide it silently — the `never` assignment below
 *  turns an unhandled variant into a compile error instead. */
export function toastFor(event: CoreToastEvent): ToastDescriptor {
  switch (event.kind) {
    case "transferComplete":
      return {
        tone: "good",
        title: "Transfer complete",
        detail: `${event.fileCount} file${event.fileCount === 1 ? "" : "s"}`,
      };
    case "configPushed":
      return {
        tone: "info",
        title: "Config pushed",
        detail: event.profileName,
      };
    case "syncFinished":
      return {
        tone: "good",
        title: "Sync finished",
        detail: `${event.changed} changed`,
      };
    case "importFailed":
      return {
        tone: "accent",
        title: "Import failed",
        detail: `${event.fileName}: ${event.message}`,
      };
    default: {
      const exhaustive: never = event;
      throw new Error(`unhandled toast event: ${JSON.stringify(exhaustive)}`);
    }
  }
}
