import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { safeStorage } from "electron";

import type { JevSettingsStatus } from "../shared/desktop.js";
import { JevEvaluatorController, type JevEvaluator } from "./jevJudge.js";

const SETTINGS_FILE = "jev-credentials.json";
const SETTINGS_VERSION = 1;
const MAX_API_KEY_LENGTH = 4_096;

interface StoredCredentials {
  version: 1;
  encryptedApiKey: string;
}

export interface SecretStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  backend(): string | null;
  isSecure(): boolean;
}

export interface ConfigurableJevEvaluator extends JevEvaluator {
  configure(apiKey: string | null): void;
}

const electronSecretStorage: SecretStorageAdapter = {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (value) => safeStorage.encryptString(value),
  decryptString: (value) => safeStorage.decryptString(value),
  backend: () => (process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : null),
  isSecure: () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" ||
      !["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend())),
};

export class JevCredentialStore {
  private readonly path: string;

  constructor(
    private readonly directory: string,
    private readonly encryption: SecretStorageAdapter = electronSecretStorage,
  ) {
    this.path = join(directory, SETTINGS_FILE);
  }

  status(): Pick<JevSettingsStatus, "secureStorageAvailable" | "storageBackend"> {
    return {
      secureStorageAvailable: this.encryption.isSecure(),
      storageBackend: this.encryption.backend(),
    };
  }

  read(): string | null {
    if (!existsSync(this.path) || !this.encryption.isEncryptionAvailable()) return null;
    try {
      const stored = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredCredentials>;
      if (stored.version !== SETTINGS_VERSION || typeof stored.encryptedApiKey !== "string") {
        return null;
      }
      const apiKey = this.encryption.decryptString(Buffer.from(stored.encryptedApiKey, "base64"));
      return apiKey.trim() || null;
    } catch {
      return null;
    }
  }

  write(apiKey: string): void {
    if (!this.encryption.isSecure()) {
      throw new Error("Secure credential storage is unavailable on this system");
    }
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const encryptedApiKey = this.encryption.encryptString(apiKey).toString("base64");
    const temporaryPath = this.path + ".tmp";
    writeFileSync(
      temporaryPath,
      JSON.stringify({ version: SETTINGS_VERSION, encryptedApiKey } satisfies StoredCredentials),
      { encoding: "utf8", mode: 0o600 },
    );
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, this.path);
    chmodSync(this.path, 0o600);
  }

  clear(): void {
    if (existsSync(this.path)) unlinkSync(this.path);
  }
}

export class JevSettingsManager {
  private source: JevSettingsStatus["source"] = "none";

  constructor(
    private readonly store: JevCredentialStore,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    readonly evaluator: ConfigurableJevEvaluator = new JevEvaluatorController(),
  ) {}

  initialize(): JevSettingsStatus {
    const savedApiKey = this.store.read();
    const environmentApiKey = this.environment.TYPESAFE_API_KEY?.trim() || null;
    const apiKey = savedApiKey ?? environmentApiKey;
    this.source = savedApiKey ? "saved" : environmentApiKey ? "environment" : "none";
    this.evaluator.configure(apiKey);
    return this.status();
  }

  status(): JevSettingsStatus {
    return {
      configured: this.source !== "none",
      source: this.source,
      ...this.store.status(),
    };
  }

  setApiKey(rawApiKey: unknown): JevSettingsStatus {
    if (typeof rawApiKey !== "string") throw new TypeError("TypeSafe API key must be a string");
    const apiKey = rawApiKey.trim();
    if (!apiKey || apiKey.length > MAX_API_KEY_LENGTH) {
      throw new RangeError("TypeSafe API key must be between 1 and 4096 characters");
    }
    this.store.write(apiKey);
    this.source = "saved";
    this.evaluator.configure(apiKey);
    return this.status();
  }

  clearApiKey(): JevSettingsStatus {
    this.store.clear();
    const environmentApiKey = this.environment.TYPESAFE_API_KEY?.trim() || null;
    this.source = environmentApiKey ? "environment" : "none";
    this.evaluator.configure(environmentApiKey);
    return this.status();
  }
}
