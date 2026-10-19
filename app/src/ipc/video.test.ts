import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string, protocol: string) => `http://${protocol}.localhost/${path}`),
  Channel: class {
    onmessage: ((p: unknown) => void) | null = null;
  },
}));

describe("video IPC", () => {
  it("video commands — each call — invokes its C3 §3.12 command with camelCase arguments", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const ipc = await import("./video");

    // Act
    await ipc.matchVideos(["a.mp4"]);
    await ipc.setVideoOffset("s1", "ab", 12.5);
    await ipc.reestimateVideoOffset("s1", "ab");
    await ipc.unlinkVideo("s1", "ab", true);

    // Assert
    expect(invoke).toHaveBeenCalledWith("match_videos", { paths: ["a.mp4"] });
    expect(invoke).toHaveBeenCalledWith("set_video_offset", { sessionId: "s1", blobSha256: "ab", offsetS: 12.5 });
    expect(invoke).toHaveBeenCalledWith("reestimate_video_offset", { sessionId: "s1", blobSha256: "ab" });
    expect(invoke).toHaveBeenCalledWith("unlink_video", { sessionId: "s1", blobSha256: "ab", deleteFile: true });
  });

  it("linkVideo — progress message — reaches the callback through an onProgress Channel", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const mock = invoke as ReturnType<typeof vi.fn>;
    mock.mockReset();
    mock.mockResolvedValue({ blob_sha256: "ab" });
    const ipc = await import("./video");
    const seen: unknown[] = [];

    // Act
    await ipc.linkVideo("s1", "C:/GX01.MP4", (p) => seen.push(p));
    const args = mock.mock.calls[0][1] as { onProgress: { onmessage: (p: unknown) => void } };
    args.onProgress.onmessage({ done: 1, total: 2, phase: "copying" });

    // Assert
    expect(mock.mock.calls[0][0]).toBe("link_video");
    expect(mock.mock.calls[0][1]).toMatchObject({ sessionId: "s1", path: "C:/GX01.MP4" });
    expect(seen).toEqual([{ done: 1, total: 2, phase: "copying" }]);
  });

  it("videoUrl — a sha256 — the idl1-video scheme via convertFileSrc", async () => {
    // Arrange
    const ipc = await import("./video");

    // Act
    const url = ipc.videoUrl("ab12");

    // Assert
    expect(url).toBe("http://idl1-video.localhost/ab12");
  });

  it("isVideoIpcError — video and non-video shapes — true only for a video kind with a message", async () => {
    // Arrange
    const { isVideoIpcError } = await import("./video");

    // Act
    const results = [
      isVideoIpcError({ kind: "video_parse", message: "no moov" }),
      isVideoIpcError({ kind: "video_no_overlap", message: "x", detail: {} }),
      isVideoIpcError({ kind: "video_no_time", message: "x" }),
      isVideoIpcError({ kind: "math_parse", message: "x" }),
      isVideoIpcError({ kind: "io" }),
      isVideoIpcError(null),
    ];

    // Assert
    expect(results).toEqual([true, true, true, false, false, false]);
  });
});
