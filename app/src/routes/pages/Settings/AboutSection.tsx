import { SpecRow } from "@/components/brand/SpecRow";
import { aboutRows } from "./about";

/** Props for {@link AboutSection}. */
export interface AboutSectionProps {
  /** The `idl-rs` engine version, as already fetched once by the app shell
   *  (`AppState.engineVersion`, C3 §3.1 `engine_version`). `null` while
   *  that fetch is still in flight. This section never calls
   *  `engine_version` itself. */
  engineVersion: string | null;
}

/** The About section: app/engine/schema/build metadata rows
 *  ({@link aboutRows}).
 *
 * idl0's Licenses button (generated from Flutter's package graph) and
 * Report-issue button (an `example.com` placeholder) are not carried
 * across — idl1 has no equivalent license-page generator wired into its
 * build, and Licenses appears only if bundled license text is available,
 * which it is not in wave 2, so the control is omitted rather than shown
 * disabled or linking out. */
export default function AboutSection({ engineVersion }: AboutSectionProps) {
  const rows = aboutRows(engineVersion);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <SpecRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}
