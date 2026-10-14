import { useMemo, useState } from "react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { Button } from "../../../components/ui/button";
import { pushConfig } from "../../../ipc/device";
import type { DeviceStatus } from "../../../ipc/device";
import type { DeviceConfig } from "./config/model";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { changedSections } from "./loggerDraft";
import type { Hardware } from "./config/validate";
import { checkPushMode, preparePush } from "./push";

/** Props for {@link SendBar}. */
export interface SendBarProps {
  deviceId: string;
  /** The config last read from (or sent to) the logger. */
  base: DeviceConfig;
  /** `base` plus the unsent edits. */
  draft: DeviceConfig;
  status: DeviceStatus | null;
  /** The logger's hardware, for validation (`hardwareFromName`). */
  hardware: Hardware;
  /** Called after the logger accepted `draft`; it is restarting. */
  onSent: (sent: DeviceConfig) => void;
  /** Drops every unsent edit. */
  onDiscard: () => void;
}

/**
 * The Logger dashboard's unsent-changes bar (2026-10-14). Appears only when
 * the draft differs from the logger's config, names what changed, and sends
 * it in one tap. A push reboots the logger (SPEC §7.2) and needs it idle,
 * so the button stays disabled, with the reason, while it records or has
 * WiFi on; a config that fails validation shows its errors instead.
 */
export default function SendBar({ deviceId, base, draft, hardware, status, onSent, onDiscard }: SendBarProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useMemo(() => changedSections(base, draft), [base, draft]);
  const prepared = useMemo(() => preparePush(draft, hardware), [draft, hardware]);
  const mode = checkPushMode(status);
  if (changed.length === 0) return null;

  const errors = prepared.ok ? [] : prepared.issues.filter((i) => i.severity === "error");
  const canSend = prepared.ok && mode.ok && !sending;

  function send(): void {
    if (!prepared.ok || !canSend) return;
    setSending(true);
    setError(null);
    pushConfig(deviceId, prepared.json)
      .then(() => {
        setSending(false);
        onSent(draft);
      })
      .catch((err: DeviceIpcError) => {
        setSending(false);
        setError(describeIpcError(err));
      });
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-hivis bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg">Unsent changes</span>
        <button type="button" className="text-xs text-fg-dim underline" onClick={onDiscard} disabled={sending}>
          Discard
        </button>
      </div>
      <span className="text-xs text-fg-dim">{changed.join(" · ")}</span>
      {errors.map((issue) => (
        <p key={issue.path + issue.message} className="font-mono text-xs text-brand-accent">
          {issue.message}
        </p>
      ))}
      {prepared.ok && !mode.ok && mode.reason && <p className="font-mono text-xs text-hivis">{mode.reason}</p>}
      <Button type="button" emphasis="info" filled className="h-12 w-full text-base" disabled={!canSend} onClick={send}>
        {sending ? "Sending…" : "Send to logger"}
      </Button>
      <span className="text-xs text-fg-dim">The logger restarts to apply them, in a few seconds.</span>
      {error && (
        <NoteBlock className="border-brand-accent text-brand-accent" role="alert">
          {error}
        </NoteBlock>
      )}
    </div>
  );
}
