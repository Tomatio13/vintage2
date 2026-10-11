import { basename } from "node:path";

export function monitorCommandName(
  command: string,
  windows = process.platform === "win32",
): string {
  return (
    windows
      ? command
          .split(/[\\/]/u)
          .at(-1)!
          .replace(/\.exe$/iu, "")
      : basename(command)
  ).toLowerCase();
}

export function monitorCommandTokens(args: string): string[] {
  return (args.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/gu) ?? []).map((token) => {
    if (token.startsWith('"')) {
      try {
        return JSON.parse(token) as string;
      } catch {
        return token.slice(1, -1);
      }
    }
    return token.startsWith("'") ? token.slice(1, -1) : token;
  });
}
