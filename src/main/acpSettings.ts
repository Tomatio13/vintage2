import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, win32 } from "node:path";

import {
  DEFAULT_ACP_PROFILES,
  DEFAULT_ACP_SETTINGS,
  type AcpAgentProfile,
  type AcpModelOption,
  type AcpPermissionPolicy,
  type AcpReasoningOption,
  type AcpSettings,
} from "../shared/acp.js";

const SETTINGS_FILE = "acp-settings.json";
const MAX_PROFILES = 32;
const MAX_MODELS_PER_PROFILE = 256;
const windowsExtensions = new Set([".exe", ".com", ".cmd", ".bat"]);
const moduleRequire = createRequire(import.meta.url);

const BUNDLED_ACP_ADAPTERS: Readonly<Record<string, { packageJson: string; entry: string }>> = {
  "codex-acp": {
    packageJson: "@agentclientprotocol/codex-acp/package.json",
    entry: "dist/index.js",
  },
  "claude-agent-acp": {
    packageJson: "@agentclientprotocol/claude-agent-acp/package.json",
    entry: "dist/index.js",
  },
};

function resolveBundledAcpAdapter(candidateName: string): string | null {
  const spec = BUNDLED_ACP_ADAPTERS[candidateName];
  if (!spec) return null;
  try {
    const pkgPath = moduleRequire.resolve(spec.packageJson);
    const entryPath = join(dirname(pkgPath), spec.entry);
    const unpackedPath = entryPath.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
    if (existsSync(unpackedPath)) return unpackedPath;
    if (existsSync(entryPath)) return entryPath;
  } catch {
    /* bundled adapter package is optional */
  }
  return null;
}

const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";
const OPENCODE_GO_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedLocalOpenCodeGoModels: AcpModelOption[] | null = null;
let cachedLocalZaiModels: AcpModelOption[] | null = null;
let cachedRemoteOpenCodeGoModels: AcpModelOption[] | null = null;
let lastOpenCodeGoFetchAt = 0;
let inFlightOpenCodeGoFetch: Promise<AcpModelOption[]> | null = null;

export function mergeAcpModelLists(
  ...lists: ReadonlyArray<ReadonlyArray<AcpModelOption>>
): AcpModelOption[] {
  const byId = new Map<string, AcpModelOption>();
  for (const list of lists) {
    for (const item of list) {
      if (!item.id || !item.name) continue;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, {
          id: item.id,
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
        });
      } else if (!existing.description && item.description) {
        byId.set(item.id, { ...existing, description: item.description });
      }
    }
  }
  return [...byId.values()].slice(0, MAX_MODELS_PER_PROFILE);
}

export function mergeAcpReasoningLists(
  ...lists: ReadonlyArray<ReadonlyArray<AcpReasoningOption>>
): AcpReasoningOption[] {
  const byId = new Map<string, AcpReasoningOption>();
  for (const list of lists) {
    for (const item of list) {
      if (!item.id || !item.name) continue;
      if (!byId.has(item.id)) {
        byId.set(item.id, { id: item.id, name: item.name });
      }
    }
  }
  return [...byId.values()].slice(0, 16);
}

function parseOpenCodePrefixedModelEntries(entries: unknown[], prefix: string): AcpModelOption[] {
  const records = entries.filter(isRecord);
  records.sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")));
  const mapped: AcpModelOption[] = [];
  for (const entry of records) {
    if (entry.type === "embedding") continue;
    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : rawId;
    if (!rawId || !name) continue;
    if (/embedding|tts|live-translate|lyria|image-1|image-2|chatgpt-image/i.test(rawId)) {
      continue;
    }
    const id = rawId.startsWith(`${prefix}/`) ? rawId : `${prefix}/${rawId}`;
    const description =
      typeof entry.description === "string" && entry.description.trim()
        ? entry.description.trim().slice(0, 200)
        : undefined;
    mapped.push({
      id,
      name,
      ...(description ? { description } : {}),
    });
  }
  return mergeAcpModelLists(mapped);
}

function parseOpenCodeGoModelEntries(entries: unknown[]): AcpModelOption[] {
  return parseOpenCodePrefixedModelEntries(entries, "opencode-go");
}

function loadLocalZaiModels(): AcpModelOption[] {
  if (cachedLocalZaiModels) return cachedLocalZaiModels;
  let result: AcpModelOption[] = [];
  try {
    const home = homedir();
    const xdgCache = process.env.XDG_CACHE_HOME || join(home, ".cache");
    const candidatePaths = [
      join(xdgCache, "opencode", "models.json"),
      join(home, ".cache", "opencode", "models.json"),
    ];
    const catalogPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (catalogPath) {
      const parsed = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
      if (isRecord(parsed)) {
        const codingPlan = parsed["zai-coding-plan"];
        if (isRecord(codingPlan) && isRecord(codingPlan.models)) {
          result = parseOpenCodePrefixedModelEntries(
            Object.values(codingPlan.models),
            "zai-coding-plan",
          );
        } else {
          const zai = parsed.zai;
          if (isRecord(zai) && isRecord(zai.models)) {
            result = parseOpenCodePrefixedModelEntries(Object.values(zai.models), "zai");
          }
        }
      }
    }
  } catch {
    /* local zai catalog cache is optional */
  }
  cachedLocalZaiModels = result;
  return result;
}

export function filterZaiModels(discovered: ReadonlyArray<AcpModelOption>): AcpModelOption[] {
  const codingPlan = discovered.filter((item) =>
    item.id.toLowerCase().startsWith("zai-coding-plan/"),
  );
  if (codingPlan.length > 0) return codingPlan;
  const zaiDirect = discovered.filter((item) => item.id.toLowerCase().startsWith("zai/"));
  if (zaiDirect.length > 0) return zaiDirect;
  return [...discovered];
}

function loadLocalOpenCodeGoModels(): AcpModelOption[] {
  if (cachedLocalOpenCodeGoModels) return cachedLocalOpenCodeGoModels;
  let result: AcpModelOption[] = [];
  try {
    const home = homedir();
    const xdgCache = process.env.XDG_CACHE_HOME || join(home, ".cache");
    const candidatePaths = [
      join(xdgCache, "opencode", "models.json"),
      join(home, ".cache", "opencode", "models.json"),
    ];
    const catalogPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (catalogPath) {
      const parsed = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
      if (isRecord(parsed)) {
        const goProvider = parsed["opencode-go"];
        if (isRecord(goProvider) && isRecord(goProvider.models)) {
          result = parseOpenCodeGoModelEntries(Object.values(goProvider.models));
        }
      }
    }
  } catch {
    /* local opencode-go catalog cache is optional */
  }
  cachedLocalOpenCodeGoModels = result;
  return result;
}

export function getOpenCodeGoCatalog(): AcpModelOption[] {
  if (cachedRemoteOpenCodeGoModels && cachedRemoteOpenCodeGoModels.length > 0) {
    return cachedRemoteOpenCodeGoModels;
  }
  return loadLocalOpenCodeGoModels();
}

export function refreshOpenCodeGoCatalog(): Promise<AcpModelOption[]> {
  const now = Date.now();
  if (
    cachedRemoteOpenCodeGoModels &&
    cachedRemoteOpenCodeGoModels.length > 0 &&
    now - lastOpenCodeGoFetchAt < OPENCODE_GO_CACHE_TTL_MS
  ) {
    return Promise.resolve(cachedRemoteOpenCodeGoModels);
  }
  if (inFlightOpenCodeGoFetch) return inFlightOpenCodeGoFetch;
  lastOpenCodeGoFetchAt = now;
  inFlightOpenCodeGoFetch = fetch(OPENCODE_GO_MODELS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  })
    .then(async (response) => {
      if (!response.ok) return getOpenCodeGoCatalog();
      const body = (await response.json()) as unknown;
      const items = isRecord(body) && Array.isArray(body.data) ? body.data : [];
      const parsed = parseOpenCodeGoModelEntries(items);
      if (parsed.length > 0) {
        cachedRemoteOpenCodeGoModels = parsed;
      }
      return getOpenCodeGoCatalog();
    })
    .catch(() => getOpenCodeGoCatalog())
    .finally(() => {
      inFlightOpenCodeGoFetch = null;
    });
  return inFlightOpenCodeGoFetch;
}

export function filterOpenCodeGoModels(
  discovered: ReadonlyArray<AcpModelOption>,
): AcpModelOption[] {
  const goCatalog = getOpenCodeGoCatalog();
  const knownBareIds = new Set(
    goCatalog.map((item) => item.id.replace(/^opencode-go\//i, "").toLowerCase()),
  );
  const filtered = discovered.filter((item) => {
    const lower = item.id.toLowerCase();
    if (lower.startsWith("opencode-go/")) return true;
    return !lower.includes("/") && knownBareIds.has(lower);
  });
  return filtered.length > 0 ? filtered : [...discovered];
}

export function parseClaudeSettingsModels(parsed: unknown): AcpModelOption[] {
  if (!isRecord(parsed)) return [];
  const envRecord = isRecord(parsed.env) ? parsed.env : {};
  const readEnv = (key: string): string =>
    typeof envRecord[key] === "string" ? envRecord[key].trim() : "";

  const availableModels = Array.isArray(parsed.availableModels)
    ? parsed.availableModels
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
    : [];

  const configuredModel = typeof parsed.model === "string" ? parsed.model.trim() : "";
  const anthropicModel = readEnv("ANTHROPIC_MODEL");
  const customOpus = readEnv("ANTHROPIC_DEFAULT_OPUS_MODEL");
  const customSonnet = readEnv("ANTHROPIC_DEFAULT_SONNET_MODEL");
  const customHaiku = readEnv("ANTHROPIC_DEFAULT_HAIKU_MODEL");

  if (availableModels.length > 0) {
    const models: AcpModelOption[] = [
      {
        id: "default",
        name: "Default (recommended)",
        ...(configuredModel ? { description: configuredModel } : {}),
      },
      ...availableModels
        .filter((id) => id !== "default")
        .map((id) => ({
          id,
          name: id,
        })),
    ];
    return mergeAcpModelLists(models);
  }

  if (!anthropicModel && !customOpus && !customSonnet && !customHaiku) {
    return [];
  }

  const defaultDesc =
    configuredModel === "opus"
      ? customOpus || "opus"
      : configuredModel === "sonnet"
        ? customSonnet || "sonnet"
        : configuredModel === "haiku"
          ? customHaiku || "haiku"
          : configuredModel || anthropicModel || customSonnet || customOpus || customHaiku;

  const models: AcpModelOption[] = [
    {
      id: "default",
      name: "Default (recommended)",
      ...(defaultDesc ? { description: defaultDesc } : {}),
    },
  ];
  if (anthropicModel) {
    models.push({
      id: anthropicModel,
      name: anthropicModel,
      description: "Custom model (ANTHROPIC_MODEL)",
    });
  }
  if (customOpus) {
    models.push({
      id: "opus",
      name: `${customOpus} (opus)`,
      description: "Custom Opus model",
    });
  }
  if (customSonnet) {
    models.push({
      id: "sonnet",
      name: `${customSonnet} (sonnet)`,
      description: "Custom Sonnet model",
    });
  }
  if (customHaiku) {
    models.push({
      id: "haiku",
      name: `${customHaiku} (haiku)`,
      description: "Custom Haiku model",
    });
  }
  return mergeAcpModelLists(models);
}

function loadLocalClaudeSettingsModels(): AcpModelOption[] {
  try {
    const home = homedir();
    const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude");
    const settingsPath = join(configDir, "settings.json");
    if (!existsSync(settingsPath)) return [];
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
    return parseClaudeSettingsModels(parsed);
  } catch {
    return [];
  }
}

function loadLocalModelCatalog(): Record<string, AcpModelOption[]> {
  return {
    claude: loadLocalClaudeSettingsModels(),
    opencode: getOpenCodeGoCatalog(),
    zai: loadLocalZaiModels(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPermissionPolicy(value: unknown): value is AcpPermissionPolicy {
  return value === "ask" || value === "auto_edit" || value === "auto_all";
}

function parseModelOption(raw: unknown): AcpModelOption | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : id;
  if (!id || !name) return null;
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().slice(0, 200)
      : undefined;
  return { id, name, ...(description ? { description } : {}) };
}

function parseReasoningOption(raw: unknown): AcpReasoningOption | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 60) : "";
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : id;
  if (!id || !name) return null;
  return { id, name };
}

function sanitizeProfile(
  raw: unknown,
  fallback?: AcpAgentProfile,
  includeLocalCatalog = false,
): AcpAgentProfile | null {
  const localCatalog = includeLocalCatalog ? loadLocalModelCatalog() : {};
  const catalogForFallback = fallback ? (localCatalog[fallback.id] ?? []) : [];
  if (!isRecord(raw)) {
    if (!fallback) return null;
    const copy = structuredClone(fallback);
    if (catalogForFallback.length > 0) {
      copy.models =
        fallback.id === "opencode" || fallback.id === "claude" || fallback.id === "zai"
          ? catalogForFallback.map((item) => ({ ...item }))
          : mergeAcpModelLists(copy.models, catalogForFallback);
      if (!copy.models.some((model) => model.id === copy.defaultModel)) {
        copy.defaultModel = copy.models[0]!.id;
      }
    }
    return copy;
  }
  const id =
    fallback?.id ??
    (typeof raw.id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(raw.id.trim())
      ? raw.id.trim()
      : "");
  if (!id) return null;
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim().slice(0, 80)
      : (fallback?.name ?? id);
  const badge =
    typeof raw.badge === "string" && raw.badge.trim()
      ? raw.badge.trim().toUpperCase().slice(0, 3)
      : (fallback?.badge ?? name.slice(0, 2).toUpperCase());
  const executable =
    typeof raw.executable === "string" && !raw.executable.includes("\0")
      ? raw.executable.trim().slice(0, 1024)
      : (fallback?.executable ?? "");
  let args = Array.isArray(raw.args)
    ? raw.args
        .filter((arg): arg is string => typeof arg === "string" && !arg.includes("\0"))
        .map((arg) => arg.trim())
        .filter(Boolean)
        .slice(0, 32)
    : [...(fallback?.args ?? [])];
  if (fallback?.id === "antigravity" && args.length === 1 && args[0] === "--acp") {
    args = ["acp"];
  }
  if (!executable && fallback?.id === "codex" && args.length === 1 && args[0] === "acp") {
    args = [];
  }
  if (!executable && fallback?.id === "claude" && args.length === 1 && args[0] === "--acp") {
    args = [];
  }
  const permissionPolicy = isPermissionPolicy(raw.permissionPolicy)
    ? raw.permissionPolicy
    : (fallback?.permissionPolicy ?? "ask");
  const rawModels = Array.isArray(raw.models)
    ? raw.models
        .map(parseModelOption)
        .filter((item): item is AcpModelOption => item !== null)
        .slice(0, MAX_MODELS_PER_PROFILE)
    : [];
  const models =
    (fallback?.id === "opencode" || fallback?.id === "claude" || fallback?.id === "zai") &&
    catalogForFallback.length > 0
      ? catalogForFallback.map((item) => ({ ...item }))
      : fallback?.builtin
        ? mergeAcpModelLists(fallback.models, catalogForFallback, rawModels)
        : rawModels.length > 0
          ? rawModels
          : (fallback?.models.map((item) => ({ ...item })) ?? [{ id: "default", name: "Default" }]);
  const safeModels = models.length > 0 ? models : [{ id: "default", name: "Default" }];
  const rawReasoning = Array.isArray(raw.reasoningLevels)
    ? raw.reasoningLevels
        .map(parseReasoningOption)
        .filter((item): item is AcpReasoningOption => item !== null)
        .slice(0, 16)
    : [];
  const reasoningLevels = fallback?.builtin
    ? mergeAcpReasoningLists(fallback.reasoningLevels, rawReasoning)
    : rawReasoning.length > 0
      ? rawReasoning
      : (fallback?.reasoningLevels.map((item) => ({ ...item })) ?? [
          { id: "low", name: "Low" },
          { id: "medium", name: "Medium" },
          { id: "high", name: "High" },
        ]);
  const safeReasoning =
    reasoningLevels.length > 0
      ? reasoningLevels
      : [
          { id: "low", name: "Low" },
          { id: "medium", name: "Medium" },
          { id: "high", name: "High" },
        ];
  const legacyDefaults = new Set(["gpt-5.4", "claude-sonnet-4-5", "gemini-2.5-pro", "default"]);
  const rawDefaultModel = typeof raw.defaultModel === "string" ? raw.defaultModel : "";
  const fallbackDefaultModel =
    fallback?.defaultModel && safeModels.some((model) => model.id === fallback.defaultModel)
      ? fallback.defaultModel
      : safeModels[0]!.id;
  const defaultModel =
    rawDefaultModel &&
    safeModels.some((model) => model.id === rawDefaultModel) &&
    !(
      fallback?.builtin &&
      legacyDefaults.has(rawDefaultModel) &&
      rawDefaultModel !== fallbackDefaultModel
    )
      ? rawDefaultModel
      : fallbackDefaultModel;
  const defaultReasoning =
    typeof raw.defaultReasoning === "string" &&
    safeReasoning.some((level) => level.id === raw.defaultReasoning)
      ? raw.defaultReasoning
      : (fallback?.defaultReasoning ?? safeReasoning[0]!.id);
  const defaultCandidates = fallback
    ? [...fallback.defaultCandidates]
    : Array.isArray(raw.defaultCandidates)
      ? raw.defaultCandidates
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .map((item) => item.trim())
          .slice(0, 8)
      : [];

  return {
    id,
    name,
    badge,
    builtin: Boolean(fallback?.builtin),
    executable,
    defaultCandidates,
    args,
    permissionPolicy,
    defaultModel,
    defaultReasoning,
    models: safeModels,
    reasoningLevels: safeReasoning,
  };
}

export function sanitizeAcpSettings(raw: unknown, includeLocalCatalog = false): AcpSettings {
  if (!isRecord(raw)) {
    return includeLocalCatalog
      ? sanitizeAcpSettings({ defaultProfileId: DEFAULT_ACP_SETTINGS.defaultProfileId }, true)
      : structuredClone(DEFAULT_ACP_SETTINGS);
  }
  const rawProfiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  const byId = new Map<string, unknown>();
  for (const item of rawProfiles) {
    if (isRecord(item) && typeof item.id === "string") {
      byId.set(item.id, item);
    }
  }

  const profiles: AcpAgentProfile[] = [];
  for (const builtin of DEFAULT_ACP_PROFILES) {
    const merged = sanitizeProfile(byId.get(builtin.id), builtin, includeLocalCatalog);
    if (merged) profiles.push(merged);
    byId.delete(builtin.id);
  }

  for (const [, customRaw] of byId) {
    if (profiles.length >= MAX_PROFILES) break;
    const custom = sanitizeProfile(customRaw, undefined, includeLocalCatalog);
    if (custom && !profiles.some((p) => p.id === custom.id)) {
      profiles.push({ ...custom, builtin: false });
    }
  }

  const defaultProfileId =
    typeof raw.defaultProfileId === "string" &&
    profiles.some((profile) => profile.id === raw.defaultProfileId)
      ? raw.defaultProfileId
      : (profiles[0]?.id ?? "claude");

  return { defaultProfileId, profiles };
}

function variable(env: Record<string, string>, name: string): string {
  const key = Object.keys(env).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? env[key]! : "";
}

export interface ResolvedAcpCommand {
  file: string;
  args: string[];
  env: Record<string, string>;
  displayPath: string;
  displayCommand: string;
}

export function resolveAcpCommand(
  profile: AcpAgentProfile,
  overrideExecutable?: string,
  overrideArgs?: string[],
): ResolvedAcpCommand {
  const platform = process.platform;
  const windows = platform === "win32";
  const path = windows ? win32 : posix;
  const home = homedir();
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "TYPESAFE_API_KEY",
    ),
  );
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
  for (const name of ["NVM_BIN", "PNPM_HOME", ...(windows ? ["NVM_HOME", "NVM_SYMLINK"] : [])]) {
    if (variable(env, name)) directories.push(variable(env, name));
  }
  for (const name of ["VOLTA_HOME", "BUN_INSTALL", "NPM_CONFIG_PREFIX"]) {
    if (variable(env, name)) {
      directories.push(
        path.join(variable(env, name), windows && name === "NPM_CONFIG_PREFIX" ? "" : "bin"),
      );
    }
  }
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
      /* nvm is optional */
    }
  }

  const searchPath = [
    ...new Set(
      directories
        .filter((directory) => path.isAbsolute(directory))
        .map((directory) => path.normalize(directory)),
    ),
  ];

  const isExecutable = (candidate: string) => {
    try {
      if (!statSync(candidate).isFile()) return false;
      if (!windows) accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  const extensions = windows
    ? [
        ...new Set([
          ...(variable(env, "PATHEXT") || ".EXE;.COM;.CMD;.BAT")
            .split(";")
            .map((ext) => ext.toLowerCase())
            .filter((ext) => windowsExtensions.has(ext)),
          ...windowsExtensions,
        ]),
      ]
    : [""];

  const rawExecutable = (overrideExecutable ?? profile.executable).trim();
  const expanded = rawExecutable.replace(/^~[/\\]/, `${home}${windows ? "\\" : "/"}`);
  const baseArgs = overrideArgs ?? profile.args;

  const nodeBinary =
    searchPath
      .flatMap((dir) => extensions.map((ext) => path.join(dir, `node${ext}`)))
      .find(isExecutable) ?? (!process.versions.electron ? process.execPath : undefined);

  let resolved: string | undefined;
  let bundledEntry: string | undefined;
  let resolvedCandidateName = "";

  if (expanded) {
    if (path.isAbsolute(expanded)) {
      if (isExecutable(expanded)) {
        resolved = expanded;
        resolvedCandidateName = path.basename(expanded);
      }
    } else if (!expanded.includes("/") && !expanded.includes("\\")) {
      resolved = searchPath
        .flatMap((dir) => extensions.map((ext) => path.join(dir, expanded + ext)))
        .find(isExecutable);
      if (!resolved) {
        const bundled = resolveBundledAcpAdapter(expanded);
        if (bundled && nodeBinary) {
          resolved = nodeBinary;
          bundledEntry = bundled;
        }
      }
      resolvedCandidateName = expanded;
    } else {
      throw new Error("ACP executable path must be an absolute path or a binary name on PATH.");
    }
  } else {
    for (const candidate of profile.defaultCandidates) {
      const match = searchPath
        .flatMap((dir) => extensions.map((ext) => path.join(dir, candidate + ext)))
        .find(isExecutable);
      if (match) {
        resolved = match;
        resolvedCandidateName = candidate;
        break;
      }
      const bundled = resolveBundledAcpAdapter(candidate);
      if (bundled && nodeBinary) {
        resolved = nodeBinary;
        bundledEntry = bundled;
        resolvedCandidateName = candidate;
        break;
      }
    }
  }

  if (!resolved) {
    const targetLabel = expanded || profile.defaultCandidates.join(" / ") || profile.name;
    throw new Error(
      `${targetLabel} was not found. Install the ACP agent CLI or configure its executable path in Settings → ACP Agents.`,
    );
  }

  // Dedicated ACP adapter binaries (such as codex-acp or claude-agent-acp) speak
  // ACP over stdio directly without an extra "--acp" or "acp" subcommand.
  let finalArgs = [...baseArgs];
  if (
    !expanded &&
    /-acp(?:\.(?:exe|cmd|bat))?$/i.test(resolvedCandidateName) &&
    finalArgs.length === 1 &&
    (finalArgs[0] === "--acp" || finalArgs[0] === "acp")
  ) {
    finalArgs = [];
  }

  const spawnArgs = bundledEntry ? [bundledEntry, ...finalArgs] : finalArgs;
  const displayPath = bundledEntry ?? resolved;
  const displayBase = bundledEntry ? resolvedCandidateName : path.basename(resolved);
  const displayCommand = `${displayBase}${finalArgs.length ? ` ${finalArgs.join(" ")}` : ""}`;

  const pathKey = windows
    ? (Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH")
    : "PATH";
  env[pathKey] = searchPath.join(windows ? ";" : ":");

  return { file: resolved, args: spawnArgs, env, displayPath, displayCommand };
}

export class AcpSettingsManager {
  private readonly path: string;
  private settings: AcpSettings = structuredClone(DEFAULT_ACP_SETTINGS);
  private readonly discoveredModelsByProfile = new Map<string, AcpModelOption[]>();
  private readonly discoveredReasoningByProfile = new Map<string, AcpReasoningOption[]>();

  constructor(private readonly directory: string) {
    this.path = join(directory, SETTINGS_FILE);
  }

  initialize(): AcpSettings {
    if (existsSync(this.path)) {
      try {
        const raw = JSON.parse(readFileSync(this.path, "utf8")) as unknown;
        this.settings = sanitizeAcpSettings(raw);
      } catch {
        this.settings = structuredClone(DEFAULT_ACP_SETTINGS);
      }
    }
    return this.getSettings();
  }

  getSettings(): AcpSettings {
    return structuredClone(this.settings);
  }

  getSettingsWithLocalCatalog(): AcpSettings {
    const enriched = sanitizeAcpSettings(this.settings, true);
    for (const profile of enriched.profiles) {
      const discoveredModels = this.discoveredModelsByProfile.get(profile.id);
      if (discoveredModels && discoveredModels.length > 0) {
        profile.models = discoveredModels.map((item) => ({ ...item }));
        if (!profile.models.some((item) => item.id === profile.defaultModel)) {
          profile.defaultModel = profile.models[0]!.id;
        }
      }
      const discoveredReasoning = this.discoveredReasoningByProfile.get(profile.id);
      if (discoveredReasoning && discoveredReasoning.length > 0) {
        profile.reasoningLevels = discoveredReasoning.map((item) => ({ ...item }));
        if (!profile.reasoningLevels.some((item) => item.id === profile.defaultReasoning)) {
          profile.defaultReasoning = profile.reasoningLevels[0]!.id;
        }
      }
    }
    return enriched;
  }

  getProfile(profileId?: string): AcpAgentProfile {
    const enriched = this.getSettingsWithLocalCatalog();
    const targetId = profileId || enriched.defaultProfileId;
    return (
      enriched.profiles.find((item) => item.id === targetId) ??
      enriched.profiles[0] ??
      structuredClone(DEFAULT_ACP_PROFILES[0]!)
    );
  }

  updateProfileDiscoveredCatalog(
    profileId: string,
    discoveredModels: AcpModelOption[],
    discoveredReasoning?: AcpReasoningOption[],
  ): void {
    const profile = this.settings.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    if (discoveredModels.length > 0) {
      const nextModels = mergeAcpModelLists(discoveredModels);
      this.discoveredModelsByProfile.set(profileId, nextModels);
      profile.models = nextModels.map((item) => ({ ...item }));
    }
    if (discoveredReasoning && discoveredReasoning.length > 0) {
      const nextReasoning = mergeAcpReasoningLists(discoveredReasoning);
      this.discoveredReasoningByProfile.set(profileId, nextReasoning);
      profile.reasoningLevels = nextReasoning.map((item) => ({ ...item }));
    }
  }

  setSettings(raw: unknown): AcpSettings {
    const next = sanitizeAcpSettings(raw);
    this.settings = next;
    this.persist();
    return this.getSettings();
  }

  private persist(): void {
    const temporaryPath = `${this.path}.tmp`;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(temporaryPath, JSON.stringify(this.settings, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, this.path);
      if (isAbsolute(this.path)) chmodSync(this.path, 0o600);
    } catch (error) {
      console.error("Unable to save ACP settings.", error);
    }
  }
}
