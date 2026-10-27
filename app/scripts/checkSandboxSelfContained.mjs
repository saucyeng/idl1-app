// Guards the production Notebook sandbox document (R69): it runs in an
// opaque-origin iframe, so it must fetch nothing. Run after `vite build`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/src/routes/pages/Notebook/sandbox/index.html"
);
const html = readFileSync(file, "utf8");
const bad = [
  [/<script[^>]*\ssrc\s*=/i, "<script src=>"],
  [/<link[^>]*rel\s*=\s*["']?(stylesheet|modulepreload|preload)/i, "<link rel=stylesheet|modulepreload|preload>"],
  [/\bimport\s*(?:[^'"()]*?\sfrom\s*)?["']\/assets\//, 'import ... from "/assets/"'],
  [/\bimport\s*\(\s*["'`]/, "dynamic import() of a literal URL"],
  [/new\s+Worker\s*\(/, "new Worker("],
  [/@import\s/, "CSS @import"],
  [/url\(\s*["']?\/assets\//, "CSS url(/assets/...)"],
];
const hits = bad.filter(([re]) => re.test(html)).map(([, name]) => name);
if (hits.length > 0) {
  console.error(`sandbox is not self-contained (${file}): ${hits.join("; ")}`);
  process.exit(1);
}
console.log(`sandbox self-contained: ${(html.length / 1024).toFixed(0)} KiB`);
