export type DebInstallOutcome =
  | { kind: "installed" }
  | { kind: "unavailable" }
  | { kind: "failed"; reason: string };

export function debInstallCommand(downloadedFile: string): { command: string; args: string[] } {
  // Arguments stay an array: the downloaded file path must never go through a shell.
  return { command: "pkexec", args: ["dpkg", "-i", downloadedFile] };
}

export function describeInstallFailure(stderr: string): string {
  const line = stderr
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (!line) return "the installation command failed";
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}
