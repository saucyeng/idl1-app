import { describe, expect, it } from "vitest";

import { linkName, pairLinkFrom } from "./deepLinkPairing";
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
