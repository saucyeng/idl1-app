import { Database, FileText, Radio, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { RouteId } from "../routes/types";

/**
 * Each activity's icon (ruling R220 item 1: "Device, Data, Notebook,
 * Settings as icons on the left").
 *
 * Concrete over abstract: a radio for the thing that talks to a bike over
 * the air, a database for the session library on disk, a document for the
 * workbook, and a slider rack for settings — none of them the generic
 * gear/grid/box set that would sit equally well over any four tabs.
 *
 * One table, two call sites: the wide layout's `ActivityBar.tsx` and the
 * narrow layout's `BottomBar.tsx` show the same four marks, because a user
 * who resizes the window should not have to learn the navigation twice.
 */
export const ACTIVITY_ICONS: Readonly<Record<RouteId, LucideIcon>> = {
  device: Radio,
  data: Database,
  notebook: FileText,
  settings: SlidersHorizontal,
};
