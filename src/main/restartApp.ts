import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { app } from "electron";

// Electron's Linux relauncher adds PR_SET_NO_NEW_PRIVS, which breaks sudo in
// every subsequent PTY. Wait for the old process to exit, then exec normally.
// All variable values are positional arguments, never shell source.
export const linuxRestartScript = `
parent_pid="$1"
shift
while kill -0 "$parent_pid" 2>/dev/null; do sleep 0.1; done
exec "$@"
`;

let restartPending = false;

export function restartApp(): void {
  if (restartPending) return;
  if (process.platform !== "linux") {
    app.relaunch();
    app.quit();
    return;
  }

  if (/^NoNewPrivs:\s+1$/m.test(readFileSync("/proc/self/status", "utf8"))) {
    throw new Error(
      "VINTAGE was started with restricted privileges. Quit VINTAGE and reopen it from your desktop to restore sudo support.",
    );
  }

  restartPending = true;
  // 'quit' runs after windows close and before-quit saves the workspace.
  const launch = () => {
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        linuxRestartScript,
        "vintage-restart",
        String(process.pid),
        process.execPath,
        ...process.argv.slice(1),
      ],
      { detached: true, stdio: "ignore" },
    );
    child.on("error", (error) => console.error("Unable to restart VINTAGE", error));
    child.unref();
  };
  app.once("quit", launch);
  app.quit();
}
