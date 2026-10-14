import { describe, expect, it } from "vitest";

import { defaultConfig } from "./config/defaults";
import { setBikeProfile, setGps, setImuEnabled, setImuRate } from "./config/edit";
import { changedSections } from "./loggerDraft";

describe("changedSections", () => {
  it("changedSections — identical copies — empty", () => {
    const base = defaultConfig("aabbccddeeff");

    const changed = changedSections(base, structuredClone(base));

    expect(changed).toEqual([]);
  });

  it("changedSections — rider, fork IMU and GPS edited — those three in display order", () => {
    const base = defaultConfig("aabbccddeeff");
    const draft = setGps(setImuEnabled(setBikeProfile(base, { default_rider: "Isaac" }), "imu1", true), { sample_rate_hz: 10 });

    const changed = changedSections(base, draft);

    expect(changed).toEqual(["Rider & bike", "Fork IMU", "GPS"]);
  });

  it("changedSections — shared IMU rate — named apart from the slots", () => {
    const base = defaultConfig("aabbccddeeff");

    const changed = changedSections(base, setImuRate(base, 416));

    expect(changed).toEqual(["IMU rate"]);
  });

  it("changedSections — same values, different key order — empty", () => {
    const base = defaultConfig("aabbccddeeff");
    const draft = { ...base, bike_profile: { default_rider: base.bike_profile.default_rider, name: base.bike_profile.name } };

    const changed = changedSections(base, draft);

    expect(changed).toEqual([]);
  });
});
