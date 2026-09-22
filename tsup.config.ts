import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "main/index": "src/main/index.ts" },
    outDir: "dist",
    format: "esm",
    platform: "node",
    target: "node22",
    external: ["electron", "node-pty"],
    sourcemap: true,
    clean: false,
  },
  {
    entry: { "preload/index": "src/preload/index.ts" },
    outDir: "dist",
    format: "cjs",
    platform: "node",
    target: "node22",
    external: ["electron"],
    outExtension: () => ({ js: ".cjs" }),
    sourcemap: true,
    clean: false,
  },
]);
