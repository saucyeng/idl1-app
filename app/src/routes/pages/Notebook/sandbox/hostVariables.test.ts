import { describe, expect, it } from "vitest";

import { bindHostVariables, type HostVariableModule, type HostVariableSink } from "./hostVariables";

/** A fake Runtime `Module`/`Variable` pair recording every `.define()` call,
 *  so tests can assert what value a cell would actually receive without a
 *  real `@observablehq/runtime` instance. */
function fakeModule(): { module: HostVariableModule; sinks: Map<string, HostVariableSink> } {
  const sinks = new Map<string, HostVariableSink>();
  const module: HostVariableModule = {
    variable(): HostVariableSink {
      let lastDefinition: (() => unknown) | undefined;
      const sink: HostVariableSink = {
        define(name, _inputs, definition) {
          lastDefinition = definition;
          sinks.set(name, sink);
          return sink;
        },
      };
      // Expose the captured definition for assertions via a symbol-free back door.
      Object.defineProperty(sink, "lastDefinition", { get: () => lastDefinition });
      return sink;
    },
  };
  return { module, sinks };
}

describe("bindHostVariables", () => {
  it("bindHostVariables — laps/session/constants — registers the data itself, not a function", () => {
    const { module, sinks } = fakeModule();
    const variables = new Map<string, HostVariableSink>();
    const laps = [{ number: 1 }];
    const session = { id: "session-a" };
    const constants = { g: 9.81 };

    bindHostVariables(module, variables, { laps, session, constants });

    const lapsDefinition = (sinks.get("laps") as unknown as { lastDefinition: () => unknown }).lastDefinition;
    const sessionDefinition = (sinks.get("session") as unknown as { lastDefinition: () => unknown }).lastDefinition;
    const constantsDefinition = (sinks.get("constants") as unknown as { lastDefinition: () => unknown })
      .lastDefinition;
    expect(typeof lapsDefinition).toBe("function");
    expect(lapsDefinition()).toBe(laps);
    expect(sessionDefinition()).toBe(session);
    expect(constantsDefinition()).toBe(constants);
  });

  it("bindHostVariables — channel — registers a value that is itself callable", () => {
    const { module, sinks } = fakeModule();
    const variables = new Map<string, HostVariableSink>();
    const channel = (name: string) => [{ t: 0, v: 0, name }];

    bindHostVariables(module, variables, { channel });

    const channelDefinition = (sinks.get("channel") as unknown as { lastDefinition: () => unknown }).lastDefinition;
    const resolvedChannel = channelDefinition();
    expect(typeof resolvedChannel).toBe("function");
    expect((resolvedChannel as (name: string) => unknown)("front_fork")).toEqual([{ t: 0, v: 0, name: "front_fork" }]);
  });

  it("bindHostVariables — the same name bound twice — redefines the same Variable instead of creating a second one", () => {
    const { module } = fakeModule();
    const variables = new Map<string, HostVariableSink>();

    bindHostVariables(module, variables, { laps: [{ number: 1 }] });
    const firstVariable = variables.get("laps");
    bindHostVariables(module, variables, { laps: [{ number: 1 }, { number: 2 }] });
    const secondVariable = variables.get("laps");

    expect(secondVariable).toBe(firstVariable);
  });

  it("bindHostVariables — the same name bound twice — the second bind's value is what a cell would now read", () => {
    const { module, sinks } = fakeModule();
    const variables = new Map<string, HostVariableSink>();

    bindHostVariables(module, variables, { laps: [{ number: 1 }] });
    const updatedLaps = [{ number: 1 }, { number: 2 }];
    bindHostVariables(module, variables, { laps: updatedLaps });

    const lapsDefinition = (sinks.get("laps") as unknown as { lastDefinition: () => unknown }).lastDefinition;
    expect(lapsDefinition()).toBe(updatedLaps);
  });
});
