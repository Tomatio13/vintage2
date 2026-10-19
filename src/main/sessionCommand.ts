import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

interface CommandOptions {
  platform?: NodeJS.Platform;
  home?: string;
  env?: Record<string, string>;
  executable?: (file: string) => boolean;
}
export interface SessionCommand {
  file: string;
  args: string[] | string;
  env: Record<string, string>;
}
const commands = new Set(["codex", "claude", "grok", "agy"]);
const windowsExtensions = new Set([".exe", ".com", ".cmd", ".bat"]);
function variable(env: Record<string, string>, name: string): string {
  const key = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
  return key ? env[key]! : "";
}

// Resolve actual CLI files rather than depend on a shell alias or the GUI app's
// often minimal PATH. Keep the parent user's authentication environment intact.
export function resolveSessionCommand(
  file: string,
  args: string[],
  options: CommandOptions = {},
): SessionCommand {
  if (!commands.has(file) || args.some((arg) => !/^[a-zA-Z0-9_-]+$/.test(arg)))
    throw new TypeError("Unsupported session resume command");
  const platform = options.platform ?? process.platform;
  const windows = platform === "win32";
  const path = windows ? win32 : posix;
  const home = options.home ?? homedir();
  const env = { ...(options.env ?? (process.env as Record<string, string>)) };
  const existingPath = windows ? variable(env, "PATH") : (env.PATH ?? "");
  const directories = existingPath.split(windows ? ";" : ":").map((directory) => {
    const unquoted = directory.trim().replace(/^"(.*)"$/, "$1");
    return windows
      ? unquoted.replace(/%([^%]+)%/g, (_, key: string) => variable(env, key))
      : unquoted;
  });
  directories.push(
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".grok", "bin"),
  );
  for (const name of ["NVM_BIN", "PNPM_HOME", ...(windows ? ["NVM_HOME", "NVM_SYMLINK"] : [])])
    if (variable(env, name)) directories.push(variable(env, name));
  for (const name of ["VOLTA_HOME", "BUN_INSTALL", "NPM_CONFIG_PREFIX"])
    if (variable(env, name))
      directories.push(
        path.join(variable(env, name), windows && name === "NPM_CONFIG_PREFIX" ? "" : "bin"),
      );
  if (windows) {
    const appData = variable(env, "APPDATA") || path.join(home, "AppData", "Roaming");
    const local = variable(env, "LOCALAPPDATA") || path.join(home, "AppData", "Local");
    directories.push(
      path.join(appData, "npm"),
      path.join(home, ".npm-global"),
      path.join(local, "Microsoft", "WinGet", "Links"),
      path.join(local, "Microsoft", "WindowsApps"),
      path.join(variable(env, "ProgramFiles") || "C:\\Program Files", "nodejs"),
    );
  } else {
    directories.push("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin");
    const nvm = variable(env, "NVM_DIR") || path.join(home, ".nvm");
    try {
      directories.push(
        ...readdirSync(path.join(nvm, "versions", "node"))
          .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          .slice(0, 8)
          .map((name) => path.join(nvm, "versions", "node", name, "bin")),
      );
    } catch {
      /* nvm is optional. */
    }
  }
  const searchPath = [
    ...new Set(
      directories
        .filter((directory) => path.isAbsolute(directory))
        .map((directory) => path.normalize(directory)),
    ),
  ];
  const executable =
    options.executable ??
    ((candidate: string) => {
      try {
        if (!statSync(candidate).isFile()) return false;
        if (!windows) accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  const extensions = windows
    ? (variable(env, "PATHEXT") || ".EXE;.COM;.CMD;.BAT")
        .split(";")
        .map((extension) => extension.toLowerCase())
        .filter((extension) => windowsExtensions.has(extension))
    : [""];
  // Always support native binaries and npm shims, even with an incomplete PATHEXT.
  if (windows)
    for (const extension of windowsExtensions)
      if (!extensions.includes(extension)) extensions.push(extension);
  const resolved = searchPath
    .flatMap((directory) => extensions.map((extension) => path.join(directory, file + extension)))
    .find(executable);
  if (!resolved)
    throw new Error(
      `${file} was not found. Install its CLI for this OS, or add its installation directory to PATH, then restart VINTAGE.`,
    );
  const pathKey = windows
    ? (Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH")
    : "PATH";
  env[pathKey] = searchPath.join(windows ? ";" : ":");
  if (!windows || ![".cmd", ".bat"].includes(path.extname(resolved).toLowerCase()))
    return { file: resolved, args, env };
  // A batch shim needs cmd.exe. Expand the executable path once via an
  // environment variable, inside quotes; do not interpolate it as command code.
  // Delayed expansion is off so paths containing ! retain their literal value.
  for (const key of Object.keys(env))
    if (key.toLowerCase() === "vintage_session_executable") delete env[key];
  env.VINTAGE_SESSION_EXECUTABLE = resolved;
  const comspec = variable(env, "COMSPEC");
  return {
    file:
      path.isAbsolute(comspec) && path.extname(comspec).toLowerCase() === ".exe"
        ? comspec
        : path.join(variable(env, "SystemRoot") || "C:\\Windows", "System32", "cmd.exe"),
    // node-pty accepts a verbatim Windows argument string. An argv array would
    // apply C-runtime escaping to cmd.exe's nested quoting and break space paths.
    args: `/d /v:off /s /c ""%VINTAGE_SESSION_EXECUTABLE%" ${args.join(" ")}"`,
    env,
  };
}
