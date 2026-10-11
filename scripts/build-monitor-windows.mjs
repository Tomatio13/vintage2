import { spawnSync } from "node:child_process";
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

if (process.platform === "win32") {
  const root = resolve(import.meta.dirname, "..");
  // Build in a temporary directory so Cargo does not create a repository lockfile.
  const temporary = mkdtempSync(join(tmpdir(), "vintage-monitor-build-"));
  try {
    cpSync(join(root, "native", "monitor-windows"), temporary, { recursive: true });
    const result = spawnSync(
      "cargo",
      ["build", "--release", "--manifest-path", join(temporary, "Cargo.toml")],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Windows Monitor helper build failed");
    const metadata = spawnSync(
      "cargo",
      ["metadata", "--format-version", "1", "--manifest-path", join(temporary, "Cargo.toml")],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    if (metadata.error) throw metadata.error;
    if (metadata.status !== 0) throw new Error("Windows Monitor dependency metadata failed");
    const destination = join(root, "build", "monitor");
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    for (const pkg of JSON.parse(metadata.stdout).packages) {
      const directory = dirname(pkg.manifest_path);
      for (const name of readdirSync(directory).filter((name) =>
        /^(?:licen[cs]e|copying|copyright|notice)(?:[._-]|$)/iu.test(name),
      )) {
        const target = join(destination, "licenses", `${pkg.name}-${pkg.version}`, name);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(directory, name), target, { recursive: true });
      }
    }
    copyFileSync(
      join(temporary, "target", "release", "vintage-monitor.exe"),
      join(root, "build", "monitor", "vintage-monitor.exe"),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
