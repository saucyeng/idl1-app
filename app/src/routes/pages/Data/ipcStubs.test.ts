import { describe, expect, it } from "vitest";

import { deleteTrack, listQuarantine, NotImplementedError, resolveQuarantine, saveTrack } from "./ipcStubs";

describe("ipcStubs", () => {
  it('ipcStubs — saveTrack — rejects with NotImplementedError naming "save_track"', async () => {
    await expect(saveTrack({})).rejects.toThrow(NotImplementedError);
    await expect(saveTrack({})).rejects.toMatchObject({ command: "save_track" });
  });

  it('ipcStubs — deleteTrack — rejects with NotImplementedError naming "delete_track"', async () => {
    await expect(deleteTrack("t1")).rejects.toThrow(NotImplementedError);
    await expect(deleteTrack("t1")).rejects.toMatchObject({ command: "delete_track" });
  });

  it('ipcStubs — listQuarantine — rejects with NotImplementedError naming "list_quarantine"', async () => {
    await expect(listQuarantine()).rejects.toThrow(NotImplementedError);
    await expect(listQuarantine()).rejects.toMatchObject({ command: "list_quarantine" });
  });

  it('ipcStubs — resolveQuarantine — rejects with NotImplementedError naming "resolve_quarantine"', async () => {
    await expect(resolveQuarantine("q1", "retry")).rejects.toThrow(NotImplementedError);
    await expect(resolveQuarantine("q1", "discard")).rejects.toMatchObject({ command: "resolve_quarantine" });
  });
});
