import electronPath from "electron";
import { spawn } from "node:child_process";

// Ubuntu などで開発用 Electron の SUID helper が root:4755 ではない場合、
// Chromium は起動前に停止する。配布物や本番起動は変更せず、開発プロセスだけ
// --no-sandbox を付けて sudo による node_modules 書き換えを不要にする。
const args = [...(process.platform === "linux" ? ["--no-sandbox"] : []), "dist/main/index.js"];
const child = spawn(electronPath, args, {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Failed to launch Electron development process", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
