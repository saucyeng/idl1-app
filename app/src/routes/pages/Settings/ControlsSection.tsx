import { NoteBlock } from "@/components/brand/NoteBlock";
import { SpecRow } from "@/components/brand/SpecRow";
import { CONTROL_GROUPS } from "./controls";

/** The Chart controls section: a read-only reference of the notebook
 *  chart's mouse-wheel, mouse and keyboard shortcuts ({@link CONTROL_GROUPS}).
 *
 * **Partially provisional (R53 Q2).** The visible banner below is
 * required, not decorative — the "mouse wheel" and "mouse" groups are
 * still idl0's until they have a landed equivalent, and a settings screen
 * listing shortcuts that might not match the shipped chart is exactly the
 * kind of confidently-wrong documentation this banner exists to prevent.
 * The "keyboard" group is no longer provisional: `controls.ts` generates
 * it from the Notebook lane's landed `interaction/keymap.ts` bindings. */
export default function ControlsSection() {
  return (
    <div className="flex flex-col gap-4">
      <NoteBlock className="w-fit border-hivis text-hivis">
        Mouse wheel / mouse bindings are provisional — they land with the Notebook lane.
      </NoteBlock>
      {CONTROL_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1.5">
          <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">{group.title}</h3>
          {group.rows.map(([action, keystroke]) => (
            <SpecRow key={action} label={action} value={keystroke} />
          ))}
        </div>
      ))}
    </div>
  );
}
