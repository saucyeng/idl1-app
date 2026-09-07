import { describe, expect, it } from "vitest";

import { initialSandboxPrimeState, nextSandboxPrimeState, sandboxShouldRun } from "./sandboxLifecycle";

describe("sandboxShouldRun", () => {
  it("sandboxShouldRun — route visible — true", () => {
    expect(sandboxShouldRun(true)).toBe(true);
  });

  it("sandboxShouldRun — route hidden — false", () => {
    expect(sandboxShouldRun(false)).toBe(false);
  });
});

describe("initialSandboxPrimeState", () => {
  it("initialSandboxPrimeState — mounted visible — running, primed once", () => {
    const state = initialSandboxPrimeState(true);

    expect(state).toEqual({ running: true, primeEpoch: 1 });
  });

  it("initialSandboxPrimeState — mounted hidden — not running, never primed", () => {
    const state = initialSandboxPrimeState(false);

    expect(state).toEqual({ running: false, primeEpoch: 0 });
  });
});

describe("nextSandboxPrimeState", () => {
  it("nextSandboxPrimeState — hidden to visible — bumps the prime epoch and starts running", () => {
    const prev = initialSandboxPrimeState(false);

    const next = nextSandboxPrimeState(prev, true);

    expect(next).toEqual({ running: true, primeEpoch: 1 });
  });

  it("nextSandboxPrimeState — visible to hidden — stops running, leaves the prime epoch alone", () => {
    const prev = initialSandboxPrimeState(true);

    const next = nextSandboxPrimeState(prev, false);

    expect(next).toEqual({ running: false, primeEpoch: 1 });
  });

  it("nextSandboxPrimeState — hidden, shown, hidden, shown again — the epoch counts every restart", () => {
    let state = initialSandboxPrimeState(false);
    state = nextSandboxPrimeState(state, true);
    state = nextSandboxPrimeState(state, false);

    state = nextSandboxPrimeState(state, true);

    expect(state).toEqual({ running: true, primeEpoch: 2 });
  });

  it("nextSandboxPrimeState — no change — returns the same state instance", () => {
    const prev = initialSandboxPrimeState(true);

    const next = nextSandboxPrimeState(prev, true);

    expect(next).toBe(prev);
  });
});
