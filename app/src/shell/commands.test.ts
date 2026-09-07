import { describe, expect, it, vi } from "vitest";
import { tabSwitchCommands } from "./commands";

describe("tabSwitchCommands", () => {
  it("tabSwitchCommands — one command per route, in ROUTES order", () => {
    const commands = tabSwitchCommands(() => {});

    expect(commands.map((c) => c.id)).toEqual(["nav:device", "nav:data", "nav:notebook", "nav:settings"]);
    expect(commands.every((c) => c.group === "Navigate")).toBe(true);
  });

  it("tabSwitchCommands — running a command navigates to its route", () => {
    const onNavigate = vi.fn();
    const commands = tabSwitchCommands(onNavigate);

    commands.find((c) => c.id === "nav:data")!.run();

    expect(onNavigate).toHaveBeenCalledWith("data");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
