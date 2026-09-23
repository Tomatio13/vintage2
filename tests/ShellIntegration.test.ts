import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareShellIntegration } from "../src/main/shellIntegration.js";

const environment = { HOME: "/tmp/vintage-shell-integration-test-home", PATH: "/usr/bin" };

describe("prepareShellIntegration", () => {
  it("creates a zsh startup chain that loads user config before OSC 133 hooks", () => {
    const command = prepareShellIntegration({ file: "/usr/bin/zsh", args: ["-l"] }, environment);
    const integrationDirectory = command.env.ZDOTDIR!;

    try {
      const rc = readFileSync(join(integrationDirectory, ".zshrc"), "utf8");
      expect(rc).toContain('source "$VINTAGE_USER_ZDOTDIR/.zshrc"');
      expect(rc).toContain("add-zsh-hook preexec __vintage_preexec");
      expect(rc).toContain("add-zsh-hook precmd __vintage_precmd");
      expect(rc).toContain("133;E;%s");
      expect(rc).toContain("VINTAGE_PROMPT_END");
      expect(command.env.VINTAGE_USER_ZDOTDIR).toBe(environment.HOME);
    } finally {
      command.cleanup();
    }

    expect(existsSync(integrationDirectory)).toBe(false);
  });

  it("creates a bash rcfile with command start and completion markers", () => {
    const command = prepareShellIntegration({ file: "/usr/bin/bash", args: ["-l"] }, environment);
    const rcFile = command.args[2]!;

    try {
      const rc = readFileSync(rcFile, "utf8");
      expect(command.args).toEqual(["--noprofile", "--rcfile", rcFile, "-i"]);
      expect(rc).toContain("PS0=$'\\e]133;C\\a'");
      expect(rc).toContain("__vintage_prompt_command");
      expect(rc).toContain("builtin fc -ln -1");
      expect(rc).toContain("133;E;%s");
      expect(rc).toContain("\\e]133;D;%s\\a");
    } finally {
      command.cleanup();
    }

    expect(existsSync(rcFile)).toBe(false);
  });

  it("creates a valid fish event integration with command context", () => {
    const command = prepareShellIntegration({ file: "/usr/bin/fish", args: ["-l"] }, environment);
    const integrationFile = command.args[2]!.slice('source "'.length, -1);

    try {
      const integration = readFileSync(integrationFile, "utf8");
      expect(integration).toContain("if not set -q VINTAGE_SHELL_INTEGRATION_ACTIVE");
      expect(integration).toContain("--on-event fish_preexec");
      expect(integration).toContain("133;C\\a\\e]133;E;%s");
      expect(integration).toContain("--on-event fish_postexec");
    } finally {
      command.cleanup();
    }

    expect(existsSync(integrationFile)).toBe(false);
  });

  it("leaves unsupported shells unchanged", () => {
    const command = prepareShellIntegration({ file: "/bin/sh", args: ["-l"] }, environment);

    expect(command).toMatchObject({
      file: "/bin/sh",
      args: ["-l"],
      env: environment,
    });
    command.cleanup();
  });
});
