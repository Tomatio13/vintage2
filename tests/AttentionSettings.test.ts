import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttentionSettingsManager } from "../src/main/attentionSettings.js";

describe("AttentionSettingsManager", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vintage-attention-settings-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("persists app settings and terminal monitor modes across manager instances", () => {
    const profileKey = "a".repeat(64);
    const first = new AttentionSettingsManager(directory);
    first.initialize();
    first.setSettings({
      debounceMs: 1200,
      agentMonitorIntervalSeconds: 20,
      attentionThreshold: 2,
      notificationThreshold: 4,
    });
    first.setTerminalMode(profileKey, "ignore_until_error");

    const restored = new AttentionSettingsManager(directory);
    restored.initialize();

    expect(restored.getSettings()).toEqual({
      debounceMs: 1200,
      agentMonitorIntervalSeconds: 20,
      attentionThreshold: 2,
      notificationThreshold: 4,
    });
    expect(restored.getTerminalMode(profileKey)).toBe("ignore_until_error");
  });

  it("uses Errors Only by default and persists Monitor as an explicit override", () => {
    const profileKey = "b".repeat(64);
    const manager = new AttentionSettingsManager(directory);
    manager.initialize();
    expect(manager.getTerminalMode(profileKey)).toBe("ignore_until_error");
    manager.setTerminalMode(profileKey, "monitor");

    const restored = new AttentionSettingsManager(directory);
    restored.initialize();
    expect(restored.getTerminalMode(profileKey)).toBe("monitor");
  });

  it("loads Agent Monitor mode and defaults the interval for saved settings without it", () => {
    const profileKey = "d".repeat(64);
    writeFileSync(
      join(directory, "attention-settings.json"),
      JSON.stringify({
        version: 1,
        settings: { debounceMs: 900, attentionThreshold: 1, notificationThreshold: 3 },
        terminalModes: { [profileKey]: "agent_monitor" },
      }),
    );

    const manager = new AttentionSettingsManager(directory);
    manager.initialize();

    expect(manager.getSettings()).toEqual({
      debounceMs: 900,
      agentMonitorIntervalSeconds: 10,
      attentionThreshold: 1,
      notificationThreshold: 3,
    });
    expect(manager.getTerminalMode(profileKey)).toBe("agent_monitor");
  });

  it("notifies active-terminal listeners after app settings change", () => {
    const manager = new AttentionSettingsManager(directory);
    manager.initialize();
    const listener = vi.fn();
    manager.onSettingsChanged(listener);
    manager.setSettings({
      debounceMs: 500,
      agentMonitorIntervalSeconds: 10,
      attentionThreshold: 3,
      notificationThreshold: 2,
    });

    expect(listener).toHaveBeenCalledWith({
      debounceMs: 500,
      agentMonitorIntervalSeconds: 10,
      attentionThreshold: 3,
      notificationThreshold: 2,
    });
  });

  it("rejects out-of-range values and non-hash profile keys", () => {
    const manager = new AttentionSettingsManager(directory);
    manager.initialize();

    expect(() =>
      manager.setSettings({
        debounceMs: 50,
        agentMonitorIntervalSeconds: 10,
        attentionThreshold: 1,
        notificationThreshold: 3,
      }),
    ).toThrow(RangeError);
    for (const interval of [4, 301, 5.5]) {
      expect(() =>
        manager.setSettings({
          debounceMs: 800,
          agentMonitorIntervalSeconds: interval,
          attentionThreshold: 1,
          notificationThreshold: 3,
        }),
      ).toThrow(RangeError);
    }
    expect(() => manager.getTerminalMode("/workspace/project")).toThrow(TypeError);
    expect(() => manager.setTerminalMode("c".repeat(64), "unknown")).toThrow(TypeError);
  });
});
