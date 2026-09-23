import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  JevCredentialStore,
  JevSettingsManager,
  type SecretStorageAdapter,
} from "../src/main/jevSettings.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "vintage-jev-settings-"));
  directories.push(directory);
  return directory;
}

function encryption(secure = true): SecretStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    isSecure: () => secure,
    backend: () => (secure ? "test-keyring" : "basic_text"),
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/u, ""),
  };
}

describe("Jev credential settings", () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });

  it("stores the API key encrypted with owner-only permissions", () => {
    const directory = temporaryDirectory();
    const store = new JevCredentialStore(directory, encryption());

    store.write("typesafe-secret-key");

    const path = join(directory, "jev-credentials.json");
    const contents = readFileSync(path, "utf8");
    expect(contents).not.toContain("typesafe-secret-key");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(store.read()).toBe("typesafe-secret-key");
  });

  it("prefers a saved key and falls back to the environment after clearing", () => {
    const store = new JevCredentialStore(temporaryDirectory(), encryption());
    const evaluator = {
      configure: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(null),
    };
    const manager = new JevSettingsManager(
      store,
      { TYPESAFE_API_KEY: "environment-key" },
      evaluator,
    );

    expect(manager.initialize()).toMatchObject({ configured: true, source: "environment" });
    expect(manager.setApiKey("saved-key")).toMatchObject({ configured: true, source: "saved" });
    expect(manager.clearApiKey()).toMatchObject({ configured: true, source: "environment" });
  });

  it("refuses persistence when the OS credential backend is not secure", () => {
    const store = new JevCredentialStore(temporaryDirectory(), encryption(false));

    expect(() => store.write("must-not-be-written")).toThrow(
      "Secure credential storage is unavailable",
    );
  });
});
