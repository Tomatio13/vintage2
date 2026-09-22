import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];

await inspect("src/renderer", (source, file) => {
  if (/from\s+["'](?:electron|node:)/u.test(source)) {
    errors.push(`${file}: renderer must not import Electron or Node.js modules`);
  }
});

await inspect("src/main", (source, file) => {
  if (/from\s+["'][^"']*renderer/u.test(source)) {
    errors.push(`${file}: main must not import renderer implementation`);
  }
});

await inspect("src/preload", (source, file) => {
  if (/from\s+["'][^"']*renderer/u.test(source)) {
    errors.push(`${file}: preload must not import renderer implementation`);
  }
});

await inspect("src", (source, file) => {
  if (source.includes("@zcode/"))
    errors.push(`${file}: starter must not depend on @zcode packages`);
});

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("boundaries: OK");
}

async function inspect(directory, check) {
  const absolute = join(root, directory);
  for (const file of await walk(absolute)) {
    check(await readFile(file, "utf8"), relative(root, file));
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if ([".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}
