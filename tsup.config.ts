import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    esbuildPlugins: [
      {
        name: "board-skill-resources",
        setup(build) {
          build.onResolve({ filter: /\?raw$/ }, (args) => ({
            path: resolve(args.resolveDir, args.path.slice(0, -4)),
            namespace: "skill-text",
          }));
          build.onLoad({ filter: /.*/, namespace: "skill-text" }, async (args) => ({
            contents: await readFile(args.path, "utf8"),
            loader: "text",
          }));
        },
      },
    ],
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
