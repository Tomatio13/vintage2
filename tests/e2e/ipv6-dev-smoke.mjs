import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron as electron } from "playwright-core";

const port = 5174;
const origin = `http://[::1]:${port}`;
const vite = spawn(
  resolve("node_modules/.bin/vite"),
  ["--host", "::1", "--port", String(port), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let diagnostics = "";
for (const stream of [vite.stdout, vite.stderr]) {
  stream.on("data", (chunk) => {
    diagnostics = `${diagnostics}${chunk}`.slice(-8_192);
  });
}

const waitForServer = async () => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`IPv6 Vite exited early:\n${diagnostics}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`IPv6 Vite did not start:\n${diagnostics}`);
};

let app;
try {
  await waitForServer();
  const profile = mkdtempSync(join(tmpdir(), "vintage-ipv6-dev-"));
  app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
    env: { ...process.env, VITE_DEV_SERVER_URL: origin },
  });
  const window = await app.firstWindow();
  await window.getByText("Home", { exact: true }).waitFor();
  assert.equal(await window.evaluate(() => location.origin), origin);
  console.log(`IPv6 dev smoke: Vite and Electron renderer loaded from ${origin}`);
} finally {
  await app?.close();
  if (vite.exitCode === null) vite.kill("SIGTERM");
  await new Promise((resolve) => {
    if (vite.exitCode !== null) resolve();
    else vite.once("exit", resolve);
  });
}
