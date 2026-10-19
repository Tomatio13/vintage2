import { win32 } from "node:path";
import { spawn } from "node:child_process";

/** CLI probes and analysis workers belong to VINTAGE, not the user's active sessions. */
export const sessionAnalysisProcesses = new Set<number>();

export function terminateSessionAnalysisProcess(pid: number) {
  if (!sessionAnalysisProcesses.has(pid)) return;
  if (process.platform === "win32") {
    const rootKey = Object.keys(process.env).find((key) => key.toLowerCase() === "systemroot");
    const root = (rootKey ? process.env[rootKey] : undefined) || "C:\\Windows";
    const fallback = () => {
      if (!sessionAnalysisProcesses.has(pid)) return;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* Already exited. */
      }
    };
    const killer = spawn(
      win32.join(root, "System32", "taskkill.exe"),
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    killer.on("error", fallback);
    killer.on("close", (code) => {
      if (code !== 0) fallback();
    });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* The detached process group already exited. */
    }
  }
}

export function stopSessionAnalysisProcesses() {
  for (const pid of sessionAnalysisProcesses) terminateSessionAnalysisProcess(pid);
}
