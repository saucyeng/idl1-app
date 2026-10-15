import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { closeUpdatePanel } from "./updateState";

/**
 * "Download" for a channel-check release (`ipc/appUpdate.ts`): hands the
 * link to the system — on Android the browser downloads the APK and a tap
 * on the finished download installs it over this build; on desktop it opens
 * the release page. The update stays `available` so the banner keeps
 * offering it until the new build is actually running. The opener
 * capability admits only this repo's GitHub URLs
 * (`src-tauri/capabilities/default.json`).
 */
export function openUpdateLink(link: string): void {
  closeUpdatePanel();
  void openUrl(link).catch((e: unknown) => {
    toast.error("Could not open the download", { description: e instanceof Error ? e.message : String(e) });
  });
}
