/** Re-export shim so `App.tsx` (lead-owned, operating brief §2) keeps its
 *  existing import specifier while L6 builds the tab out under
 *  `Notebook/`. Deleted by Task 16 together with the one-line `App.tsx`
 *  change, applied by the lead as a shell task at the lane merge. */
export { default } from "./Notebook";
