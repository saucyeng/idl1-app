#!/usr/bin/env node
// Dev-only companion to drive.mjs: evaluates an expression in every frame of the running
// idl1 page (the notebook's sandbox is an iframe the page itself cannot read) and prints
// each frame's URL and result.
//
//   node tools/drive/frames.mjs "<js expression>"

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const state = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "idl1-drive.json"), "utf8"));
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`);
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith("devtools://"));
for (const frame of page.frames()) {
  let result;
  try {
    result = await frame.evaluate(process.argv[2]);
  } catch (e) {
    result = `error: ${e.message.split("\n")[0]}`;
  }
  console.log(`${frame.url()}\n${JSON.stringify(result, null, 2)}`);
}
await browser.close();
process.exit(0);
