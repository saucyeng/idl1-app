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
  /** Reads the config back from the logger, replacing base and draft. */
  onRead: () => void;
  /** True while a read is in flight. */
  reading: boolean;
  /** Show the bar with its Read and Send buttons even with nothing changed
   *  (the Logger settings screen). The dashboard shows it only for changes. */
  alwaysShow?: boolean;
}

/**
 * The Logger's config bar (2026-10-14; Read and Send always on Logger
 * settings, 2026-10-15). On the dashboard it appears only when the draft
 * differs from the logger's config. On Logger settings it is always there,
 * with **Read from logger**, which re-reads and drops unsent edits after a
 * second tap, and **Send to logger**, which also re-sends an unchanged
 * config. A push reboots the logger (SPEC §7.2) and needs it idle, so Send
 * stays disabled, with the reason, while it records or has WiFi on. A
 * config that fails validation shows its errors instead.
 */
export default function SendBar({ deviceId, base, draft, hardware, status, onSent, onDiscard, onRead, reading, alwaysShow = false }: SendBarProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRead, setConfirmRead] = useState(false);
  const changed = useMemo(() => changedSections(base, draft), [base, draft]);
  const prepared = useMemo(() => preparePush(draft, hardware), [draft, hardware]);
  const mode = checkPushMode(status);
  const dirty = changed.length > 0;
  if (!dirty && !alwaysShow) return null;

  const errors = prepared.ok ? [] : prepared.issues.filter((i) => i.severity === "error");
  const canSend = prepared.ok && mode.ok && !sending && !reading;

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

  function read(): void {
    // Re-reading drops unsent edits, so with edits pending it takes a
    // second tap.
    if (dirty && !confirmRead) {
      setConfirmRead(true);
      return;
    }
    setConfirmRead(false);
    setError(null);
    onRead();
  }

  return (
    <div className={`flex flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-3 ${dirty ? "border-hivis" : "border-rule"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg">{dirty ? "Unsent changes" : "Matches the logger"}</span>
        {dirty && (
          <button type="button" className="text-xs text-fg-dim underline" onClick={onDiscard} disabled={sending}>
            Discard
          </button>
        )}
      </div>
      {dirty && <span className="text-xs text-fg-dim">{changed.join(" · ")}</span>}
      {errors.map((issue) => (
        <p key={issue.path + issue.message} className="font-mono text-xs text-brand-accent">
          {issue.message}
        </p>
      ))}
      {prepared.ok && !mode.ok && mode.reason && <p className="font-mono text-xs text-hivis">{mode.reason}</p>}
      <div className="flex gap-2">
        {alwaysShow && (
          <Button type="button" className="h-12 flex-1 text-base" disabled={sending || reading} onClick={read}>
            {reading ? "Reading…" : confirmRead ? "Tap to discard & read" : "Read from logger"}
          </Button>
        )}
        <Button type="button" emphasis="info" filled className="h-12 flex-1 text-base" disabled={!canSend} onClick={send}>
          {sending ? "Sending…" : "Send to logger"}
        </Button>
      </div>
      <span className="text-xs text-fg-dim">Sending restarts the logger to apply the settings, in a few seconds.</span>
      {error && (
        <NoteBlock className="border-brand-accent text-brand-accent" role="alert">
          {error}
        </NoteBlock>
      )}
    </div>
  );
}
