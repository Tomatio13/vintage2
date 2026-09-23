import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_ATTENTION_SETTINGS,
  DEFAULT_TERMINAL_MONITOR_MODE,
  type AttentionLevel,
  type AttentionSettings,
  type TerminalMonitorMode,
} from "../shared/desktop.js";

const SETTINGS_FILE = "attention-settings.json";
const SETTINGS_VERSION = 1;
const MAX_TERMINAL_PROFILES = 2_000;
const MONITOR_MODES = new Set<TerminalMonitorMode>([
  "monitor",
  "agent_monitor",
  "ignore",
  "mute",
  "always_notify",
  "ignore_until_error",
]);

interface StoredAttentionSettings {
  version: 1;
  settings: AttentionSettings;
  terminalModes: Record<string, TerminalMonitorMode>;
}

export function isTerminalMonitorMode(value: unknown): value is TerminalMonitorMode {
  return typeof value === "string" && MONITOR_MODES.has(value as TerminalMonitorMode);
}

export function parseAttentionSettings(value: unknown): AttentionSettings {
  if (!value || typeof value !== "object") throw new TypeError("Attention settings are required");
  const candidate = value as Partial<AttentionSettings>;
  if (
    !Number.isInteger(candidate.debounceMs) ||
    candidate.debounceMs! < 100 ||
    candidate.debounceMs! > 5_000
  ) {
    throw new RangeError("Attention debounce must be between 100 and 5000 milliseconds");
  }
  const agentMonitorIntervalSeconds =
    candidate.agentMonitorIntervalSeconds === undefined
      ? DEFAULT_ATTENTION_SETTINGS.agentMonitorIntervalSeconds
      : candidate.agentMonitorIntervalSeconds;
  if (
    !Number.isInteger(agentMonitorIntervalSeconds) ||
    agentMonitorIntervalSeconds < 5 ||
    agentMonitorIntervalSeconds > 300
  ) {
    throw new RangeError("Agent Monitor interval must be between 5 and 300 seconds");
  }
  if (!isAttentionLevel(candidate.attentionThreshold)) {
    throw new RangeError("Attention threshold must be between 1 and 4");
  }
  if (!isAttentionLevel(candidate.notificationThreshold)) {
    throw new RangeError("Notification threshold must be between 1 and 4");
  }
  return {
    debounceMs: candidate.debounceMs!,
    agentMonitorIntervalSeconds,
    attentionThreshold: candidate.attentionThreshold,
    notificationThreshold: candidate.notificationThreshold,
  };
}

export class AttentionSettingsManager {
  private readonly path: string;
  private settings: AttentionSettings = { ...DEFAULT_ATTENTION_SETTINGS };
  private terminalModes = new Map<string, TerminalMonitorMode>();
  private readonly listeners = new Set<(settings: AttentionSettings) => void>();

  constructor(private readonly directory: string) {
    this.path = join(directory, SETTINGS_FILE);
  }

  initialize(): AttentionSettings {
    if (!existsSync(this.path)) return this.getSettings();
    try {
      const stored = JSON.parse(
        readFileSync(this.path, "utf8"),
      ) as Partial<StoredAttentionSettings>;
      if (stored.version !== SETTINGS_VERSION) return this.getSettings();
      if (stored.settings) this.settings = parseAttentionSettings(stored.settings);
      const modes = new Map<string, TerminalMonitorMode>();
      for (const [profileKey, mode] of Object.entries(stored.terminalModes ?? {})) {
        if (
          isProfileKey(profileKey) &&
          isTerminalMonitorMode(mode) &&
          mode !== DEFAULT_TERMINAL_MONITOR_MODE
        ) {
          modes.set(profileKey, mode);
        }
      }
      this.terminalModes = modes;
    } catch {
      this.settings = { ...DEFAULT_ATTENTION_SETTINGS };
      this.terminalModes = new Map();
    }
    return this.getSettings();
  }

  getSettings(): AttentionSettings {
    return { ...this.settings };
  }

  setSettings(value: unknown): AttentionSettings {
    this.settings = parseAttentionSettings(value);
    this.persist();
    const settings = this.getSettings();
    for (const listener of this.listeners) listener(settings);
    return settings;
  }

  getTerminalMode(profileKey: string): TerminalMonitorMode {
    if (!isProfileKey(profileKey)) throw new TypeError("Invalid terminal profile identifier");
    return this.terminalModes.get(profileKey) ?? DEFAULT_TERMINAL_MONITOR_MODE;
  }

  setTerminalMode(profileKey: string, mode: unknown): TerminalMonitorMode {
    if (!isProfileKey(profileKey)) throw new TypeError("Invalid terminal profile identifier");
    if (!isTerminalMonitorMode(mode)) throw new TypeError("Unsupported terminal monitor mode");
    if (mode === DEFAULT_TERMINAL_MONITOR_MODE) this.terminalModes.delete(profileKey);
    else this.terminalModes.set(profileKey, mode);
    while (this.terminalModes.size > MAX_TERMINAL_PROFILES) {
      const oldest = this.terminalModes.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.terminalModes.delete(oldest);
    }
    this.persist();
    return mode;
  }

  onSettingsChanged(listener: (settings: AttentionSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const terminalModes = Object.fromEntries(this.terminalModes);
    const contents: StoredAttentionSettings = {
      version: SETTINGS_VERSION,
      settings: this.getSettings(),
      terminalModes,
    };
    const temporaryPath = this.path + ".tmp";
    writeFileSync(temporaryPath, JSON.stringify(contents), { encoding: "utf8", mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, this.path);
    chmodSync(this.path, 0o600);
  }
}

function isAttentionLevel(value: unknown): value is AttentionLevel {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isProfileKey(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}
