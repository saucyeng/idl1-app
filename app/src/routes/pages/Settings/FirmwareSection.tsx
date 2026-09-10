import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpecRow } from "@/components/brand/SpecRow";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { localStorageLastDeviceBackend } from "../Device/lastDevice";
import { describeIpcError, type IpcErrorLike } from "./errors";
import {
  catalogVerdict,
  describeVerdict,
  updateButtonLabel,
  type CatalogVerdict,
} from "./firmwareCatalog";
import {
  ROLL_BACK_INSTRUCTIONS,
  describeOtaError,
  flowCard,
  pushBlockedReason,
  withPushEnabled,
} from "./firmwareFlow";
import type { PrefsStore } from "./prefsStore";
import {
  confirmFirmware,
  deviceStatus,
  firmwareCatalog,
  onOtaStateChanged,
  otaState,
  pushFirmware,
  type FirmwareChannel,
  type FirmwareRelease,
  type OtaState,
} from "../../../ipc/device";

/** Props for {@link FirmwareSection}. */
export interface FirmwareSectionProps {
  /** The prefs store the repository and channel live in (`ui` half). */
  store: PrefsStore;
}

/** Narrows a rejected `invoke()` value to C3 §2's error shape. Anything
 *  else (a thrown `Error`, a string) falls through to generic copy rather
 *  than crashing the section. */
function asIpcError(error: unknown): (IpcErrorLike & { detail?: unknown }) | null {
  if (error === null || typeof error !== "object") return null;
  const candidate = error as { kind?: unknown; message?: unknown; detail?: unknown };
  if (typeof candidate.kind !== "string" || typeof candidate.message !== "string") return null;
  return { kind: candidate.kind, message: candidate.message, detail: candidate.detail };
}

/** Copy for a rejected firmware command: the `POST /ota` response classes
 *  first (they name what the *device* said), then this tab's shared
 *  `describeIpcError`. */
function describeFirmwareError(error: unknown): string {
  const ipc = asIpcError(error);
  if (ipc === null) return "Something unexpected happened. Please try again.";
  return describeOtaError(ipc.detail) ?? describeIpcError(ipc);
}

/** The device id the Device tab last connected to. The Firmware section has
 *  no connection state of its own — `push_firmware` requires a *managed*
 *  connection (C3 §3.8), so this id is only a candidate, and the command
 *  rejecting with `not_found` is what "connect first" actually means. */
const lastDevice = localStorageLastDeviceBackend();

/**
 * The Firmware section (SPEC §27.7 as amended for idl1, rulings R197/R198).
 *
 * A thin renderer over two pure modules: `firmwareCatalog.ts` decides what
 * the catalog has to say about the connected device, and `firmwareFlow.ts`
 * turns the Rust-owned {@link OtaState} into a card. Nothing about the OTA
 * sequence is decided here — the app subscribes to `ota_state_changed` and
 * draws whatever arrives.
 */
export default function FirmwareSection({ store }: FirmwareSectionProps) {
  const [repo, setRepo] = useState<string>("");
  const [channel, setChannel] = useState<FirmwareChannel>("stable");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceVersion, setDeviceVersion] = useState<string | null>(null);
  const [recording, setRecording] = useState<boolean>(false);
  const [releases, setReleases] = useState<FirmwareRelease[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<string | null>(null);
  const [state, setState] = useState<OtaState>({ phase: "idle" });
  const [flowError, setFlowError] = useState<string | null>(null);
  const [showRollBack, setShowRollBack] = useState<boolean>(false);

  // Guards a result from an in-flight request being applied after the user
  // has moved on (a channel switch, a remount) — the same generation idiom
  // `Settings/index.tsx` uses for its migration.
  const generation = useRef<number>(0);

  const card = withPushEnabled(flowCard(state, flowError), pickedFile !== null);
  const verdict: CatalogVerdict = catalogVerdict({ firmwareRepo: repo, channel, deviceVersion, releases });
  const updateLabel = updateButtonLabel(verdict);
  const blockedReason = pushBlockedReason(deviceId, recording, card.busy);

  /** Fetches the catalog for `forRepo`/`forChannel`. Never on a timer
   *  (R198) — only from the mount effect below and the "Check now" button. */
  const check = useCallback(async (forRepo: string, forChannel: FirmwareChannel): Promise<void> => {
    if (forRepo.trim() === "") {
      setReleases(null);
      setCheckError(null);
      return;
    }
    const mine = generation.current;
    try {
      const found = await firmwareCatalog(forRepo, forChannel);
      if (generation.current !== mine) return;
      setReleases(found);
      setCheckError(null);
    } catch (error) {
      if (generation.current !== mine) return;
      setReleases(null);
      setCheckError(`Couldn't check: ${describeFirmwareError(error)}`);
    }
  }, []);

  // Seed prefs, the candidate device and its status, and the OTA state, then
  // run the one permitted automatic catalog check.
  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const prefs = await store.get();
      if (cancelled) return;
      setRepo(prefs.ui.firmware_repo);
      setChannel(prefs.ui.firmware_channel);

      const id = await lastDevice.read();
      if (cancelled) return;
      setDeviceId(id);
      if (id !== null) {
        try {
          const status = await deviceStatus(id);
          if (cancelled) return;
          setDeviceVersion(status.firmware);
          setRecording(status.logging === true);
        } catch {
          // No device, or no link: the catalog verdict falls back to
          // "not-connected", which is exactly right.
          if (!cancelled) setDeviceVersion(null);
        }
      }

      try {
        const current = await otaState();
        if (!cancelled) setState(current);
      } catch {
        // ota_state never fails in practice; a rejection just leaves idle.
      }

      unlisten = await onOtaStateChanged((next) => {
        setState(next);
        if (next.phase !== "pending_verify") setShowRollBack(false);
      });
      if (cancelled) {
        unlisten();
        unlisten = null;
        return;
      }

      if (generation.current === mine) await check(prefs.ui.firmware_repo, prefs.ui.firmware_channel);
    })();

    return () => {
      cancelled = true;
      generation.current += 1;
      if (unlisten !== null) unlisten();
    };
  }, [store, check]);

  function handleRepoChange(value: string): void {
    setRepo(value);
    setReleases(null);
    setCheckError(null);
    void store.get().then((current) => store.set({ ui: { ...current.ui, firmware_repo: value } }));
  }

  function handleChannelChange(value: FirmwareChannel): void {
    setChannel(value);
    generation.current += 1;
    void store.get().then((current) => store.set({ ui: { ...current.ui, firmware_channel: value } }));
    void check(repo, value);
  }

  async function handlePick(): Promise<void> {
    const chosen = await open({
      filters: [{ name: "Firmware image", extensions: ["bin"] }],
      multiple: false,
    });
    if (typeof chosen === "string") setPickedFile(chosen);
  }

  async function runPush(source: { kind: "file"; path: string } | { kind: "catalog"; version: string }): Promise<void> {
    if (deviceId === null) return;
    setFlowError(null);
    try {
      await pushFirmware(deviceId, source, repo, channel, () => {
        // Byte-level progress is already reflected in the state machine's
        // own `pushing`/`downloading` percentages; this channel exists for
        // callers that want finer granularity than the card shows.
      });
    } catch (error) {
      setFlowError(describeFirmwareError(error));
    }
  }

  async function handleConfirm(): Promise<void> {
    if (deviceId === null) return;
    setFlowError(null);
    try {
      setState(await confirmFirmware(deviceId));
    } catch (error) {
      setFlowError(describeFirmwareError(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SpecRow label="Device firmware" value={deviceVersion ?? "unknown version"} />
        <SpecRow label="Channel" value={channel} />
      </div>

      <label className="flex flex-col gap-1.5 font-mono text-xs text-fg-dim">
        Firmware repository
        <Input
          value={repo}
          placeholder="owner/name — leave empty to disable update checks"
          onChange={(event) => handleRepoChange(event.target.value)}
        />
      </label>

      <ToggleGroup
        type="single"
        aria-label="Release channel"
        value={channel}
        onValueChange={(value) => value && handleChannelChange(value as FirmwareChannel)}
      >
        <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
        <ToggleGroupItem value="beta">Beta</ToggleGroupItem>
      </ToggleGroup>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-fg-dim">{describeVerdict(verdict)}</p>
        {checkError !== null ? (
          <p role="status" className="font-mono text-xs text-brand-accent">
            {checkError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={card.busy || repo.trim() === ""} onClick={() => void check(repo, channel)}>
            Check now
          </Button>
          {updateLabel !== null && verdict.kind === "update-available" ? (
            <Button
              disabled={card.busy || blockedReason !== null}
              onClick={() => void runPush({ kind: "catalog", version: verdict.latest.version })}
            >
              {updateLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-rule pt-4">
        <p className="font-mono text-xs text-fg-faint">
          A firmware image from disk is pushed as-is and is never committed automatically — you confirm it, or
          power-cycle the device to roll back.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!card.actions.choose} onClick={() => void handlePick()}>
            {pickedFile === null ? "Choose firmware file…" : "Change"}
          </Button>
          <Button
            disabled={!card.actions.push || blockedReason !== null}
            onClick={() => pickedFile !== null && void runPush({ kind: "file", path: pickedFile })}
          >
            Push to Device
          </Button>
          {pickedFile !== null ? (
            <span className="truncate font-mono text-xs text-fg-faint">{pickedFile}</span>
          ) : null}
        </div>
        {blockedReason !== null ? (
          <p role="status" className="font-mono text-xs text-fg-dim">
            {blockedReason}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-rule pt-4">
        <p
          role="status"
          className={
            card.tone === "bad"
              ? "font-mono text-sm text-brand-accent"
              : card.tone === "warn"
                ? "font-mono text-sm text-fg"
                : "font-mono text-sm text-fg-dim"
          }
        >
          {card.title}
        </p>
        {card.detail !== null ? <p className="font-mono text-xs text-fg-faint">{card.detail}</p> : null}
        {card.progress !== null ? (
          <progress
            aria-label={card.progress.label}
            className="w-full"
            max={100}
            {...(card.progress.pct === null ? {} : { value: card.progress.pct })}
          />
        ) : null}
        {card.actions.confirm || card.actions.rollBack ? (
          <div className="flex flex-wrap gap-2">
            {card.actions.confirm ? <Button onClick={() => void handleConfirm()}>Confirm</Button> : null}
            {card.actions.rollBack ? <Button onClick={() => setShowRollBack(true)}>Roll back</Button> : null}
          </div>
        ) : null}
        {showRollBack ? <p className="font-mono text-xs text-fg-dim">{ROLL_BACK_INSTRUCTIONS}</p> : null}
      </div>
    </div>
  );
}
