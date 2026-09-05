import { describe, expect, it } from "vitest";

import { deleteTrack, NotImplementedError, saveTrack } from "./ipcStubs";

describe("ipcStubs", () => {
  it('ipcStubs — saveTrack — rejects with NotImplementedError naming "save_track"', async () => {
    await expect(saveTrack({})).rejects.toThrow(NotImplementedError);
    await expect(saveTrack({})).rejects.toMatchObject({ command: "save_track" });
  });

  it('ipcStubs — deleteTrack — rejects with NotImplementedError naming "delete_track"', async () => {
    await expect(deleteTrack("t1")).rejects.toThrow(NotImplementedError);
    await expect(deleteTrack("t1")).rejects.toMatchObject({ command: "delete_track" });
  });
});
