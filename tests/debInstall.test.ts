import { describe, expect, it } from "vitest";

import { debInstallCommand, describeInstallFailure } from "../src/main/debInstall.js";

describe("deb install", () => {
  it("builds a pkexec command with the package path as a separate argument", () => {
    expect(debInstallCommand("/tmp/cache/VINTAGE-0.2.6-amd64.deb")).toEqual({
      command: "pkexec",
      args: ["dpkg", "-i", "/tmp/cache/VINTAGE-0.2.6-amd64.deb"],
    });
  });

  it("keeps the downloaded file path free of shell interpolation", () => {
    const command = debInstallCommand("/tmp/deb dir/na've;rm -rf .deb");
    expect(command.args).toHaveLength(3);
    expect(command.args[2]).toBe("/tmp/deb dir/na've;rm -rf .deb");
    expect(command.args.join(" ")).not.toContain("sudo");
  });

  it("describes an install failure with the first non-empty output line", () => {
    expect(describeInstallFailure("\n  dpkg: error processing archive  \nsecond line")).toBe(
      "dpkg: error processing archive",
    );
  });

  it("falls back to a generic reason when the command produced no output", () => {
    expect(describeInstallFailure("")).toBe("the installation command failed");
  });

  it("truncates very long failure output", () => {
    const reason = describeInstallFailure("x".repeat(200));
    expect(reason).toBe(`${"x".repeat(157)}…`);
  });
});
