import { describe, expect, it } from "vitest";

import { OutboundQueue } from "./outboundQueue";

describe("OutboundQueue", () => {
  it("OutboundQueue — messages sent before ready — are held, not sent immediately", () => {
    const queue = new OutboundQueue<string>();
    const sent: string[] = [];
    queue.startGeneration();

    queue.send("a", (m) => sent.push(m));
    queue.send("b", (m) => sent.push(m));

    expect(sent).toEqual([]);
  });

  it("OutboundQueue — markReady for the current generation — flushes held messages in order", () => {
    const queue = new OutboundQueue<string>();
    const sent: string[] = [];
    const generation = queue.startGeneration();
    queue.send("a", (m) => sent.push(m));
    queue.send("b", (m) => sent.push(m));

    queue.markReady(generation, (m) => sent.push(m));

    expect(sent).toEqual(["a", "b"]);
  });

  it("OutboundQueue — a message sent after markReady — is sent immediately, not queued", () => {
    const queue = new OutboundQueue<string>();
    const sent: string[] = [];
    const generation = queue.startGeneration();
    queue.markReady(generation, (m) => sent.push(m));

    queue.send("c", (m) => sent.push(m));

    expect(sent).toEqual(["c"]);
  });

  it("OutboundQueue — markReady for a stale (previous) generation — is ignored, held messages stay held", () => {
    const queue = new OutboundQueue<string>();
    const sent: string[] = [];
    const staleGeneration = queue.startGeneration();
    const currentGeneration = queue.startGeneration();
    queue.send("a", (m) => sent.push(m));

    queue.markReady(staleGeneration, (m) => sent.push(m));

    expect(sent).toEqual([]);

    queue.markReady(currentGeneration, (m) => sent.push(m));
    expect(sent).toEqual(["a"]);
  });

  it("OutboundQueue — a duplicate markReady for the same generation — does not re-flush", () => {
    const queue = new OutboundQueue<string>();
    const sent: string[] = [];
    const generation = queue.startGeneration();
    queue.send("a", (m) => sent.push(m));
    queue.markReady(generation, (m) => sent.push(m));

    queue.markReady(generation, (m) => sent.push(m));

    expect(sent).toEqual(["a"]);
  });
});
