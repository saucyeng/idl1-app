import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.tsx", "src/vite-env.d.ts"],
      // "text" is console-only (CI log); "html" writes files under
      // coverage/ so coverage.yml has something to upload as an artifact.
      reporter: ["text", "html"],
    },
  },
});
