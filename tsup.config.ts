import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "main/index": "src/main/index.ts" },
    outDir: "dist",
    format: "esm",
    platform: "node",
    target: "node22",
    // SQLite is a prefix-only built-in: stripping node: would import a package named sqlite.
    removeNodeProtocol: false,
    external: ["electron", "node-pty", "node:sqlite"],
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
