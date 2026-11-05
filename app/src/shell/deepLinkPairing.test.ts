import { describe, expect, it } from "vitest";

import type { PeerStatus } from "../ipc/sync";
import { linkName, pairFromLink, pairLinkFrom } from "./deepLinkPairing";
import { secondsLeft } from "../routes/pages/Settings/qrPair";

describe("pairLinkFrom", () => {
  it("pairLinkFrom — a mix of links — the first idl1 pairing link, or null", () => {
    // Arrange
    const urls = ["https://example.com", "idl1://pair?v=1&peer=a&code=123456&addr=192.168.1.2:1", "idl1://pair?v=1&peer=b"];

    // Act
    const found = [pairLinkFrom(urls), pairLinkFrom(["https://x"]), pairLinkFrom(null)];

    // Assert
    expect(found).toEqual([urls[1], null, null]);
  });
});

describe("linkName", () => {
  it("linkName — an encoded name, or none — decoded name, or null", () => {
    // Arrange
    const withName = "idl1://pair?v=1&peer=a&name=Isaac%27s+PC+%26+bench&code=123456";

    // Act
    const names = [linkName(withName), linkName("idl1://pair?v=1&peer=a"), linkName("idl1://pair")];

    // Assert
    expect(names).toEqual(["Isaac's PC & bench", null, null]);
  });
});

describe("secondsLeft", () => {
  it("secondsLeft — before and after expiry — whole seconds up, never negative", () => {
    // Arrange
    const expires = 10_000;

    // Act
    const values = [secondsLeft(expires, 8_500), secondsLeft(expires, 12_000)];

    // Assert
    expect(values).toEqual([2, 0]);
  });
});

describe("pairFromLink", () => {
  it("pairFromLink — a valid link — pairs, says nothing was transferred, and has no way to sync", async () => {
    // Arrange — the deps carry only the pairing call; there is no sync to call.
    const paired: string[] = [];
    const deps = {
      pairWithLink: async (link: string): Promise<PeerStatus> => {
        paired.push(link);
        return { peer_id: "p1", name: "DESKTOP", online: true, protocol_version: 1, paired_at_ms: 0, auto_sync: "off" } as PeerStatus;
      },
    };

    // Act
    const message = await pairFromLink("idl1://pair?name=DESKTOP", deps);

    // Assert
    expect(paired).toEqual(["idl1://pair?name=DESKTOP"]);
    expect(message.title).toBe("Paired with DESKTOP");
    expect(message.description).toMatch(/Nothing was transferred/);
    expect(Object.keys(deps)).toEqual(["pairWithLink"]);
  });
});
