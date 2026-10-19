import { statSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { resolveSessionExecutable, type CommandOptions } from "./sessionCommand.js";
import type { AnalysisCli } from "../shared/sessionAnalysis.js";

interface AnalysisCommandOptions extends CommandOptions {
  cli?: AnalysisCli;
  isFile?: (file: string) => boolean;
}

/** Resolve native CLIs and npm shims to argv-only launches; never pass JSON through cmd.exe. */
export function resolveAnalysisCommand(
  file: string,
  args: string[],
  options: AnalysisCommandOptions = {},
) {
  const platform = options.platform ?? process.platform;
  const windows = platform === "win32";
  const path = windows ? win32 : posix;
  const cli = options.cli ?? "codex";
  if (!path.isAbsolute(file) && !/^~[/\\]/.test(file) && file !== cli)
    throw new Error("CLI executable path must be absolute.");
  const resolved = resolveSessionExecutable(cli, {
    ...options,
    ...(file === cli ? {} : { executablePath: file }),
  });
  const env = resolved.env;
  const pathKey = windows
    ? (Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH")
    : "PATH";
  // CLI entrypoints with an env-node shebang need their own installation's Node on GUI launches.
  env[pathKey] = [path.dirname(resolved.file), env[pathKey]]
    .filter(Boolean)
    .join(windows ? ";" : ":");
  for (const key of Object.keys(env)) {
    if (
      ["claudecode", "claude_code_entrypoint", "node_options", "electron_run_as_node"].includes(
        key.toLowerCase(),
      )
    )
      delete env[key];
  }
  if (!windows || ![".cmd", ".bat"].includes(path.extname(resolved.file).toLowerCase())) {
    return { file: resolved.file, args, env };
  }
  const isFile =
    options.isFile ??
    ((candidate: string) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
  const base = path.dirname(resolved.file);
  const entry = path.join(
    base,
    "node_modules",
    ...(cli === "codex"
      ? ["@openai", "codex", "bin", "codex.js"]
      : ["@anthropic-ai", "claude-code", "cli.js"]),
  );
  if (!isFile(entry))
    throw new Error(
      `The selected ${cli} batch launcher is not a supported npm installation. Select its native executable or reinstall the CLI with npm.`,
    );
  const directories = (env[pathKey] ?? "").split(";");
  const node = [
    path.join(base, "node.exe"),
    ...directories.map((directory) => path.join(directory, "node.exe")),
  ].find(isFile);
  if (!node)
    throw new Error(
      "Node.js was not found for the npm CLI. Install Node.js for Windows or select a native CLI executable.",
    );
  return { file: node, args: [entry, ...args], env };
}

export function analysisCliCandidates(
  cli: AnalysisCli,
  configured: string,
  options: CommandOptions = {},
) {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  if (configured)
    return [configured.replace(/^~[/\\]/, `${home}${platform === "win32" ? "\\" : "/"}`)];
  try {
    return [resolveSessionExecutable(cli, options).file];
  } catch {
    return [cli];
  }
}
