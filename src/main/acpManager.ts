import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";

import {
  type AcpConversationMessage,
  type AcpCreateOptions,
  type AcpEvent,
  type AcpModeOption,
  type AcpModelOption,
  type AcpPermissionOption,
  type AcpPermissionPolicy,
  type AcpPermissionRequest,
  type AcpProbeResult,
  type AcpPromptImage,
  type AcpSessionSnapshot,
  type AcpSkillItem,
  type AcpSlashCommand,
  type AcpToolCallContent,
  type AcpToolCallItem,
} from "../shared/acp.js";
import {
  DEFAULT_TERMINAL_MONITOR_MODE,
  DesktopChannels,
  type TerminalAttentionReason,
  type TerminalAttentionState,
  type TerminalAttentionStatus,
} from "../shared/desktop.js";
import { buildAcpHandoff } from "./acpHandoff.js";
import {
  AcpSettingsManager,
  filterOpenCodeGoModels,
  filterZaiModels,
  mergeAcpModelLists,
  mergeAcpReasoningLists,
  refreshOpenCodeGoCatalog,
  resolveAcpCommand,
  type ResolvedAcpCommand,
} from "./acpSettings.js";
import { AttentionSettingsManager, isTerminalMonitorMode } from "./attentionSettings.js";
import { sessionHistory } from "./sessionHistory.js";

const MAX_TERMINAL_OUTPUT_BYTES = 256 * 1024;
const MAX_ACP_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ACP_IMAGE_BYTES = 10 * 1024 * 1024;
const ACP_IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

interface ManagedSubTerminal {
  id: string;
  command: string;
  process: ChildProcess;
  output: string;
  truncated: boolean;
  outputByteLimit: number;
  exitCode: number | null;
  signal: string | null;
  exited: boolean;
  exitPromise: Promise<{ exitCode: number | null; signal: string | null }>;
}

interface PendingPermissionHandle {
  request: AcpPermissionRequest;
  resolve: (response: acp.RequestPermissionResponse) => void;
}

interface ProfileRuntime {
  profileId: string;
  historyCovered: number;
  loadedResumeHistory: boolean;
  process: ChildProcess | null;
  connection: acp.ClientConnection | null;
  acpSessionId: string | null;
  modelConfigId: string | null;
  reasoningConfigId: string | null;
  modeConfigId: string | null;
  supportsLegacySetModel: boolean;
  desiredModelId: string | null;
  reportedModelId: string | null;
  refreshingModelCatalog: boolean;
  desiredReasoningId: string | null;
  reportedReasoningId: string | null;
  desiredModeId: string | null;
  resumeSessionId: string | null;
  agentCommand: string | null;
  availableCommands: AcpSlashCommand[];
  availableModes: AcpModeOption[];
  modeId: string | null;
  stderrTail: string;
  connectPromise: Promise<{ connection: acp.ClientConnection; acpSessionId: string }> | null;
}

interface OwnedAcpSession {
  id: string;
  ownerId: number;
  owner: WebContents;
  paneId: string;
  workspaceId: string;
  cwd: string;
  profileKey: string;
  ready: boolean;
  attached: boolean;
  active: boolean;
  snapshot: AcpSessionSnapshot;
  runtimes: Map<string, ProfileRuntime>;
  pendingPermissions: Map<string, PendingPermissionHandle>;
  subTerminals: Map<string, ManagedSubTerminal>;
  currentAssistantMessageId: string | null;
  activePrompt: { cancelled: boolean } | null;
  importedHistoryLength: number;
  diagnostics: WeakSet<AcpConversationMessage>;
  turnStartedAt: number | null;
  attentionState: TerminalAttentionState;
}

function getOrCreateProfileRuntime(session: OwnedAcpSession, profileId: string): ProfileRuntime {
  let runtime = session.runtimes.get(profileId);
  if (!runtime) {
    runtime = {
      profileId,
      historyCovered: 0,
      loadedResumeHistory: false,
      process: null,
      connection: null,
      acpSessionId: null,
      modelConfigId: null,
      reasoningConfigId: null,
      modeConfigId: null,
      supportsLegacySetModel: false,
      desiredModelId: null,
      reportedModelId: null,
      refreshingModelCatalog: false,
      desiredReasoningId: null,
      reportedReasoningId: null,
      desiredModeId: null,
      resumeSessionId: null,
      agentCommand: null,
      availableCommands: [],
      availableModes: [],
      modeId: null,
      stderrTail: "",
      connectPromise: null,
    };
    session.runtimes.set(profileId, runtime);
  }
  return runtime;
}

const sessions = new Map<string, OwnedAcpSession>();
const observedOwners = new Set<number>();

export function registerAcpIpc(
  resolveWorkspace: (id: unknown) => string,
  acpSettings: AcpSettingsManager,
  attentionSettings: AttentionSettingsManager,
  resolveWindow: (event: IpcMainInvokeEvent) => BrowserWindow,
): void {
  const assertTrustedSender = (event: IpcMainInvokeEvent) => resolveWindow(event);

  ipcMain.handle(DesktopChannels.acpSettingsGet, async (event) => {
    assertTrustedSender(event);
    await refreshOpenCodeGoCatalog();
    return acpSettings.getSettingsWithLocalCatalog();
  });

  ipcMain.handle(DesktopChannels.acpSettingsSet, (event, raw: unknown) => {
    assertTrustedSender(event);
    acpSettings.setSettings(raw);
    return acpSettings.getSettingsWithLocalCatalog();
  });

  ipcMain.handle(
    DesktopChannels.acpProbe,
    async (
      event,
      rawProfileId: unknown,
      rawExecutable: unknown,
      rawArgs: unknown,
    ): Promise<AcpProbeResult> => {
      assertTrustedSender(event);
      const profileId = typeof rawProfileId === "string" ? rawProfileId : undefined;
      const executable = typeof rawExecutable === "string" ? rawExecutable : undefined;
      const args = Array.isArray(rawArgs)
        ? rawArgs.filter((item): item is string => typeof item === "string")
        : undefined;
      return probeAcpProfileConnection(acpSettings, profileId, executable, args);
    },
  );

  ipcMain.handle(DesktopChannels.acpPathChoose, async (event) => {
    const window = assertTrustedSender(event);
    const result = await dialog.showOpenDialog(window, {
      title: "Choose ACP agent executable",
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(DesktopChannels.acpCreate, async (event, rawOptions: unknown) => {
    assertTrustedSender(event);
    const options = parseCreateOptions(rawOptions);
    return createOrReattachAcpSession(
      event.sender,
      options,
      resolveWorkspace,
      acpSettings,
      attentionSettings,
    );
  });

  ipcMain.handle(DesktopChannels.acpReady, (event, rawId: unknown) => {
    assertTrustedSender(event);
    const session = requireOwnedSession(event, rawId);
    session.ready = true;
    sendCurrentSessionState(session);
  });

  ipcMain.handle(
    DesktopChannels.acpPrompt,
    async (event, rawId: unknown, rawText: unknown, rawImages?: unknown) => {
      assertTrustedSender(event);
      const session = requireOwnedSession(event, rawId);
      const text = typeof rawText === "string" ? rawText.trim() : "";
      const images = parsePromptImages(rawImages);
      if ((!text && images.length === 0) || text.length > 512 * 1024) {
        throw new TypeError("Prompt must include text (<= 512 KiB) or at least one image");
      }
      await submitPrompt(session, text, images, acpSettings);
    },
  );

  ipcMain.handle(DesktopChannels.acpCancel, async (event, rawId: unknown) => {
    assertTrustedSender(event);
    const session = requireOwnedSession(event, rawId);
    await cancelPrompt(session);
  });

  ipcMain.handle(
    DesktopChannels.acpPermission,
    async (event, rawId: unknown, rawRequestId: unknown, rawOptionId: unknown) => {
      assertTrustedSender(event);
      const session = requireOwnedSession(event, rawId);
      if (typeof rawRequestId !== "string" || typeof rawOptionId !== "string") {
        throw new TypeError("Permission response requires requestId and optionId");
      }
      resolvePermissionRequest(session, rawRequestId, rawOptionId);
    },
  );

  ipcMain.handle(DesktopChannels.acpConfigure, async (event, rawId: unknown, rawPatch: unknown) => {
    assertTrustedSender(event);
    const session = requireOwnedSession(event, rawId);
    return configureSession(session, rawPatch, acpSettings);
  });

  ipcMain.handle(DesktopChannels.acpReset, async (event, rawId: unknown) => {
    assertTrustedSender(event);
    const session = requireOwnedSession(event, rawId);
    return resetSessionConversation(session, acpSettings);
  });

  ipcMain.handle(DesktopChannels.acpSetActive, (event, rawId: unknown, rawActive: unknown) => {
    assertTrustedSender(event);
    if (typeof rawActive !== "boolean") throw new TypeError("Active state must be a boolean");
    const session = requireOwnedSession(event, rawId);
    session.active = rawActive;
    if (rawActive && session.attentionState.status === "completed") {
      publishAttention(session, "idle", 0, false);
    }
  });

  ipcMain.handle(DesktopChannels.acpSetMonitorMode, (event, rawId: unknown, rawMode: unknown) => {
    assertTrustedSender(event);
    if (!isTerminalMonitorMode(rawMode)) throw new TypeError("Unsupported monitor mode");
    const session = requireOwnedSession(event, rawId);
    attentionSettings.setTerminalMode(session.profileKey, rawMode);
    session.snapshot.monitorMode = rawMode;
    session.attentionState.monitorMode = rawMode;
    publishAttention(
      session,
      session.attentionState.status,
      session.attentionState.attentionLevel,
      session.attentionState.userActionRequired,
      session.attentionState.reason,
    );
  });

  ipcMain.handle(DesktopChannels.acpClose, (event, rawId: unknown) => {
    assertTrustedSender(event);
    const session = requireOwnedSession(event, rawId);
    closeAcpSession(session);
  });

  ipcMain.handle(
    DesktopChannels.acpReadImage,
    async (event, rawWorkspaceId: unknown, rawPath: unknown): Promise<string | null> => {
      assertTrustedSender(event);
      if (typeof rawPath !== "string" || !rawPath.trim() || rawPath.includes("\0")) return null;
      const cwd = resolveWorkspace(rawWorkspaceId);
      return readSafeAcpImageDataUrl(cwd, rawPath.trim());
    },
  );
}

async function readSafeAcpImageDataUrl(cwd: string, rawPath: string): Promise<string | null> {
  try {
    let candidate = rawPath;
    if (/^file:\/\//i.test(candidate)) {
      candidate = fileURLToPath(candidate);
    }
    const resolvedPath = isAbsolute(candidate) ? resolve(candidate) : resolve(cwd, candidate);
    const realFile = await realpath(resolvedPath);
    const ext = extname(realFile).toLowerCase();
    const mimeType = ACP_IMAGE_MIME_BY_EXT[ext];
    if (!mimeType) return null;

    const home = homedir();
    const allowedRoots = [
      cwd,
      join(home, ".gemini"),
      join(home, ".claude"),
      join(home, ".codex"),
      join(home, ".opencode"),
      tmpdir(),
    ];
    let allowed = false;
    for (const root of allowedRoots) {
      try {
        const realRoot = await realpath(root);
        const rel = relative(realRoot, realFile);
        if (rel && !isAbsolute(rel) && !/^\.\.(?:[\\/]|$)/u.test(rel)) {
          allowed = true;
          break;
        }
      } catch {
        /* optional root may not exist */
      }
    }
    if (!allowed) return null;

    const info = await lstat(realFile);
    if (!info.isFile() || info.size > MAX_ACP_IMAGE_BYTES) return null;
    const bytes = await readFile(realFile);
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function probeAcpProfileConnection(
  acpSettings: AcpSettingsManager,
  profileId?: string,
  overrideExecutable?: string,
  overrideArgs?: string[],
): Promise<AcpProbeResult> {
  const profile = acpSettings.getProfile(profileId);
  let resolved: ResolvedAcpCommand;
  try {
    resolved = resolveAcpCommand(profile, overrideExecutable, overrideArgs);
  } catch (error) {
    return {
      ok: false,
      resolvedPath: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  let child: ChildProcess | null = null;
  let stderrTail = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    child = spawn(resolved.file, resolved.args, {
      env: resolved.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrTail = `${stderrTail}${chunk.toString()}`.slice(-4096);
    });
    const spawnErrorPromise = new Promise<never>((_, reject) => {
      child?.once("error", (err) => reject(err));
    });
    if (!child.stdin || !child.stdout) {
      return {
        ok: false,
        resolvedPath: resolved.displayPath,
        message: "Unable to open stdio pipes to ACP executable.",
      };
    }
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    let models: AcpModelOption[] = [];
    const appClient = acp
      .client({ name: "VINTAGE-Probe" })
      .onNotification(acp.methods.client.session.update, async ({ params: { update } }) => {
        if (update.sessionUpdate !== "config_option_update") return;
        const discovered = readConfigModels(update.configOptions);
        if (discovered.length) models = discovered;
      });
    const connection = appClient.connect(stream);
    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        (timeout = setTimeout(
          () => reject(new Error("Timed out waiting for the ACP connection test (10s).")),
          10_000,
        )),
    );
    const initResponse = await Promise.race([
      connection.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
        clientInfo: { name: "VINTAGE", version: "0.2.50" },
      }),
      spawnErrorPromise,
      timeoutPromise,
    ]);
    if (isMuseCodeAdapter(profile.id, initResponse.agentInfo?.name)) {
      try {
        await Promise.race([
          (async () => {
            const probeSession = await connection.agent.request(acp.methods.agent.session.new, {
              cwd: process.cwd(),
              mcpServers: [],
            });
            models = readConfigModels(probeSession.configOptions ?? []);
            await refreshMuseCodeModels(connection, probeSession.sessionId);
          })(),
          spawnErrorPromise,
          timeoutPromise,
        ]);
      } catch {
        // Report the handshake and any initial model choices that were received.
      }
      models = acpSettings.updateProfileDiscoveredCatalog(profile.id, models);
    }
    connection.close();
    child.kill();
    const agentName = initResponse.agentInfo?.title || initResponse.agentInfo?.name || profile.name;
    const agentVersion = initResponse.agentInfo?.version || "ACP";
    return {
      ok: true,
      resolvedPath: resolved.displayPath,
      protocolVersion: initResponse.protocolVersion,
      agentInfo: { name: agentName, version: agentVersion },
      message: `Connected to ${agentName} (${agentVersion}) · ACP v${initResponse.protocolVersion} · ${resolved.displayPath}${models.length ? ` · ${models.length} model choices` : ""}`,
    };
  } catch (error) {
    try {
      child?.kill();
    } catch {
      /* ignore */
    }
    const stderrHint = stderrTail
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-2)
      .join(" | ");
    const baseReason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      resolvedPath: resolved.displayPath,
      message: `Found executable at ${resolved.displayPath}, but ACP handshake failed: ${baseReason}${stderrHint ? ` (${stderrHint})` : ""}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createOrReattachAcpSession(
  sender: WebContents,
  options: AcpCreateOptions,
  resolveWorkspace: (id: unknown) => string,
  acpSettings: AcpSettingsManager,
  attentionSettings: AttentionSettingsManager,
): Promise<AcpSessionSnapshot> {
  observeOwner(sender);
  const cwd = resolveWorkspace(options.workspaceId);
  const detached = findDetachedSession(sender.id, options.paneId);
  if (detached) {
    detached.ownerId = sender.id;
    detached.owner = sender;
    detached.attached = true;
    detached.ready = false;
    detached.snapshot.reattached = true;
    return structuredClone(detached.snapshot);
  }

  const forkSource = options.forkFrom ? sessions.get(options.forkFrom.sessionId) : undefined;
  let forkMessages: AcpConversationMessage[] = [];
  if (options.forkFrom) {
    if (
      !forkSource ||
      forkSource.ownerId !== sender.id ||
      forkSource.workspaceId !== options.workspaceId ||
      forkSource.cwd !== cwd ||
      forkSource.paneId === options.paneId
    ) {
      throw new Error("The source ACP conversation is unavailable in this workspace.");
    }
    const index = forkSource.snapshot.messages.findIndex(
      (message) => message.id === options.forkFrom?.messageId,
    );
    if (index < 0 || forkSource.snapshot.messages[index]?.streaming) {
      throw new Error("Choose a completed ACP message to fork.");
    }
    forkMessages = forkSource.snapshot.messages.slice(0, index + 1);
  }
  const forkSnapshot = forkSource?.snapshot;
  const profile = acpSettings.getProfile(forkSnapshot?.profileId ?? options.profileId);
  const profileKey = createHash("sha256")
    .update(JSON.stringify(["acp", cwd, options.tabTitle ?? "", options.paneTitle ?? ""]))
    .digest("hex");
  const monitorMode =
    attentionSettings.getTerminalMode(profileKey) ?? DEFAULT_TERMINAL_MONITOR_MODE;
  const sessionId = randomUUID();
  const modelId = forkSnapshot?.modelId ?? options.modelId ?? profile.defaultModel;
  const reasoningId = forkSnapshot?.reasoningId ?? options.reasoningId ?? profile.defaultReasoning;
  const permissionPolicy = options.permissionPolicy ?? profile.permissionPolicy;

  const snapshot: AcpSessionSnapshot = {
    id: sessionId,
    acpSessionId: null,
    paneId: options.paneId,
    workspaceId: options.workspaceId,
    cwd,
    profileId: profile.id,
    profileName: profile.name,
    profileBadge: profile.badge,
    agentCommand:
      `${profile.executable || profile.defaultCandidates[0] || profile.id} ${profile.args.join(" ")}`.trim(),
    modelId,
    reasoningId,
    permissionPolicy,
    availableModels: profile.models.map((item) => ({ ...item })),
    availableReasoning: profile.reasoningLevels.map((item) => ({ ...item })),
    status: "ready",
    monitorMode,
    messages: structuredClone(forkMessages),
    plan: [],
    availableCommands: [],
    availableSkills: [],
    availableModes: [],
    workspaceFiles: [],
    turnStartedAt: null,
    lastTurnDurationMs: null,
    usage: null,
    pendingPermission: null,
  };

  const session: OwnedAcpSession = {
    id: sessionId,
    ownerId: sender.id,
    owner: sender,
    paneId: options.paneId,
    workspaceId: options.workspaceId,
    cwd,
    profileKey,
    ready: false,
    attached: true,
    active: false,
    snapshot,
    runtimes: new Map(),
    pendingPermissions: new Map(),
    subTerminals: new Map(),
    currentAssistantMessageId: null,
    activePrompt: null,
    importedHistoryLength: 0,
    diagnostics: new WeakSet(),
    turnStartedAt: null,
    attentionState: {
      sessionId,
      status: "idle",
      attentionLevel: 0,
      userActionRequired: false,
      source: "session",
      lastActivityAt: Date.now(),
      monitorMode,
      notificationThreshold: attentionSettings.getSettings().notificationThreshold,
    },
  };

  if (forkSource) {
    const runtime = getOrCreateProfileRuntime(session, profile.id);
    runtime.desiredModelId = modelId || null;
    runtime.desiredReasoningId = reasoningId || null;
    for (const [index, message] of snapshot.messages.entries()) {
      const source = forkMessages[index];
      if (source && forkSource.diagnostics.has(source)) session.diagnostics.add(message);
    }
  }
  sessions.set(session.id, session);
  if (options.resumeSessionId) {
    const initialRuntime = getOrCreateProfileRuntime(session, profile.id);
    initialRuntime.resumeSessionId = options.resumeSessionId;
  }
  if (options.resumeSessionKey) {
    const initialMessages = session.snapshot.messages;
    void sessionHistory
      .detail(options.resumeSessionKey)
      .then((detail) => {
        if (
          !sessions.has(session.id) ||
          session.snapshot.messages !== initialMessages ||
          initialMessages.length > 0
        )
          return;
        session.snapshot.messages = detail.messages.map((item, idx) => ({
          id: `resumed-${idx}-${randomUUID()}`,
          role: item.role,
          text: item.text,
          thought: "",
          toolCalls: [],
          createdAt: detail.session.updatedAt || Date.now(),
          streaming: false,
          ...(item.role === "assistant"
            ? {
                profileId: profile.id,
                profileName: profile.name,
                profileBadge: profile.badge,
              }
            : {}),
        }));
        session.importedHistoryLength = session.snapshot.messages.length;
        const runtime = session.runtimes.get(profile.id);
        if (runtime?.loadedResumeHistory) runtime.historyCovered = session.importedHistoryLength;
        emitSessionSnapshot(session);
      })
      .catch(() => {});
  }
  void discoverAcpSkills(cwd).then((skills) => {
    if (!sessions.has(session.id)) return;
    session.snapshot.availableSkills = skills;
    emitSessionSnapshot(session);
  });
  void discoverWorkspaceFiles(cwd).then((files) => {
    if (!sessions.has(session.id)) return;
    session.snapshot.workspaceFiles = files;
    emitSessionSnapshot(session);
  });
  if (!forkSource) void warmupAgentSession(session, acpSettings);
  return structuredClone(session.snapshot);
}

const IGNORED_WORKSPACE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  ".cache",
  ".turbo",
  "release",
  ".ruff_cache",
]);

async function discoverWorkspaceFiles(cwd: string, limit = 400): Promise<string[]> {
  const results: string[] = [];
  const walk = async (dir: string, relPrefix: string, depth: number): Promise<void> => {
    if (results.length >= limit || depth > 5) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (results.length >= limit) break;
      if (entry.isSymbolicLink()) continue;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_WORKSPACE_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name), rel, depth + 1);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  };
  await walk(cwd, "", 0);
  return results;
}

function parsePromptImages(raw: unknown): AcpPromptImage[] {
  if (!Array.isArray(raw)) return [];
  const result: AcpPromptImage[] = [];
  let totalBytes = 0;
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<AcpPromptImage>;
    const mimeType = typeof rec.mimeType === "string" ? rec.mimeType.trim() : "";
    const dataBase64 = typeof rec.dataBase64 === "string" ? rec.dataBase64.trim() : "";
    if (!mimeType.startsWith("image/") || !dataBase64) continue;
    totalBytes += dataBase64.length;
    if (totalBytes > 16 * 1024 * 1024) break;
    result.push({
      id: typeof rec.id === "string" && rec.id ? rec.id : randomUUID(),
      name: typeof rec.name === "string" && rec.name ? rec.name.slice(0, 120) : "image",
      mimeType,
      dataBase64,
    });
  }
  return result;
}

function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  const block = match[1]!;
  let name: string | undefined;
  let description: string | undefined;
  for (const line of block.split(/\r?\n/)) {
    const nameMatch = /^name:\s*(.+)$/.exec(line);
    if (nameMatch && !name) {
      name = nameMatch[1]!.trim().replace(/^["']|["']$/g, "");
      continue;
    }
    const descMatch = /^description:\s*(.+)$/.exec(line);
    if (descMatch && !description) {
      const value = descMatch[1]!.trim().replace(/^["']|["']$/g, "");
      if (value && value !== "|" && value !== ">") {
        description = value;
      }
    }
  }
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };
}

async function discoverAcpSkills(cwd: string): Promise<AcpSkillItem[]> {
  const home = homedir();
  const roots: ReadonlyArray<{ dir: string; scope: AcpSkillItem["scope"]; source: string }> = [
    { dir: join(cwd, "skills"), scope: "project", source: "project" },
    { dir: join(cwd, ".claude", "skills"), scope: "project", source: ".claude" },
    { dir: join(cwd, ".agents", "skills"), scope: "project", source: ".agents" },
    { dir: join(cwd, ".codex", "skills"), scope: "project", source: ".codex" },
    { dir: join(home, ".claude", "skills"), scope: "personal", source: "claude" },
    { dir: join(home, ".codex", "skills"), scope: "personal", source: "codex" },
    { dir: join(home, ".agents", "skills"), scope: "personal", source: "agents" },
    { dir: join(home, ".gemini", "skills"), scope: "personal", source: "gemini" },
    { dir: join(home, ".gemini", "config", "skills"), scope: "personal", source: "gemini" },
    { dir: join(home, ".config", "opencode", "skills"), scope: "personal", source: "opencode" },
  ];

  const byName = new Map<string, AcpSkillItem>();
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      const skillFile = join(root.dir, entry.name, "SKILL.md");
      let raw: string;
      try {
        raw = await readFile(skillFile, "utf8");
      } catch {
        continue;
      }
      const meta = parseSkillFrontmatter(raw.slice(0, 4096));
      const name = (meta.name || entry.name).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, {
        name,
        description: (meta.description || "").slice(0, 240),
        scope: root.scope,
        source: root.source,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function warmupAgentSession(
  session: OwnedAcpSession,
  acpSettings: AcpSettingsManager,
): Promise<void> {
  try {
    const profile = acpSettings.getProfile(session.snapshot.profileId);
    resolveAcpCommand(profile);
  } catch {
    return;
  }
  try {
    await ensureAgentConnected(session, acpSettings, true);
  } catch {
    if (session.snapshot.status === "starting" || session.snapshot.status === "error") {
      session.snapshot.status = "ready";
      delete session.snapshot.errorMessage;
      emitSessionSnapshot(session);
    }
  }
}

async function ensureAgentConnected(
  session: OwnedAcpSession,
  acpSettings: AcpSettingsManager,
  isBackgroundWarmup = false,
): Promise<{ connection: acp.ClientConnection; acpSessionId: string }> {
  const targetProfileId = session.snapshot.profileId;
  const runtime = getOrCreateProfileRuntime(session, targetProfileId);

  if (runtime.connection && runtime.acpSessionId && runtime.process && !runtime.process.killed) {
    session.snapshot.acpSessionId = runtime.acpSessionId;
    if (runtime.agentCommand) {
      session.snapshot.agentCommand = runtime.agentCommand;
    }
    return { connection: runtime.connection, acpSessionId: runtime.acpSessionId };
  }

  if (runtime.connectPromise) {
    if (!isBackgroundWarmup && session.snapshot.profileId === targetProfileId) {
      session.snapshot.status = "starting";
      delete session.snapshot.errorMessage;
      emitSessionSnapshot(session);
    }
    return runtime.connectPromise;
  }

  const profile = acpSettings.getProfile(targetProfileId);
  const resolved = resolveAcpCommand(profile);
  runtime.agentCommand = resolved.displayCommand;
  if (session.snapshot.profileId === targetProfileId) {
    session.snapshot.agentCommand = resolved.displayCommand;
    if (!isBackgroundWarmup) {
      session.snapshot.status = "starting";
      delete session.snapshot.errorMessage;
      emitSessionSnapshot(session);
    }
  }

  const connectPromise = (async () => {
    const child = spawn(resolved.file, resolved.args, {
      cwd: session.cwd,
      env: resolved.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    runtime.process = child;
    runtime.stderrTail = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      runtime.stderrTail = `${runtime.stderrTail}${chunk.toString()}`.slice(-8192);
    });

    child.on("exit", (exitCode) => {
      if (runtime.process !== child) return;
      runtime.process = null;
      runtime.connection = null;
      runtime.acpSessionId = null;
      if (session.snapshot.profileId !== targetProfileId) return;
      session.snapshot.acpSessionId = null;
      if (session.snapshot.status === "running" || session.snapshot.status === "starting") {
        session.snapshot.status = exitCode === 0 ? "stopped" : "error";
        if (exitCode !== 0) {
          const stderrHint = runtime.stderrTail.trim().split("\n").slice(-3).join(" ").trim();
          session.snapshot.errorMessage = stderrHint
            ? `Agent exited (${exitCode}): ${stderrHint}`
            : `ACP agent exited with code ${exitCode}`;
          publishAttention(session, "failed", 3, true, "command_failed");
        }
      }
      emitEvent(session, { type: "session.exit", sessionId: session.id, exitCode });
      emitSessionSnapshot(session);
    });

    if (!child.stdin || !child.stdout) {
      throw new Error("Failed to open stdio streams for ACP agent process.");
    }

    const rawStdout = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const tappedStdout = tapIncomingAcpJsonStream(rawStdout, session, runtime, acpSettings);

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      tappedStdout,
    );

    const clientApp = buildAcpClientApp(session, runtime, acpSettings);
    const connection = clientApp.connect(stream);
    runtime.connection = connection;

    const agentInitialization = await connection.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: "VINTAGE", title: "VINTAGE Workspace", version: "0.2.50" },
    });

    let sessionIdResult: string | undefined;
    let configOptionsResult: acp.SessionConfigOption[] = [];
    let resumed = false;
    if (runtime.resumeSessionId) {
      const targetResumeId = runtime.resumeSessionId;
      try {
        const resumeRes = await connection.agent.request(acp.methods.agent.session.resume, {
          sessionId: targetResumeId,
          cwd: session.cwd,
          mcpServers: [],
        });
        sessionIdResult = targetResumeId;
        configOptionsResult = resumeRes.configOptions ?? [];
        resumed = true;
      } catch {
        try {
          const loadRes = await connection.agent.request(acp.methods.agent.session.load, {
            sessionId: targetResumeId,
            cwd: session.cwd,
            mcpServers: [],
          });
          sessionIdResult = targetResumeId;
          configOptionsResult = loadRes.configOptions ?? [];
          resumed = true;
        } catch (error) {
          if (targetProfileId === "muse") throw error;
          /* fall back to session/new if agent does not support resume/load */
        }
      }
      if (!resumed) {
        const newSessionResult = await connection.agent.request(acp.methods.agent.session.new, {
          cwd: session.cwd,
          mcpServers: [],
        });
        sessionIdResult = newSessionResult.sessionId;
        configOptionsResult = newSessionResult.configOptions ?? [];
      }
    } else {
      const newSessionResult = await connection.agent.request(acp.methods.agent.session.new, {
        cwd: session.cwd,
        mcpServers: [],
      });
      sessionIdResult = newSessionResult.sessionId;
      configOptionsResult = newSessionResult.configOptions ?? [];
    }

    if (session.runtimes.get(targetProfileId) !== runtime || runtime.process !== child) {
      throw new Error("ACP connection was closed");
    }
    if (!sessionIdResult) throw new Error("ACP agent did not return a session ID");
    runtime.historyCovered = resumed
      ? Math.max(
          runtime.loadedResumeHistory ? runtime.historyCovered : 0,
          session.importedHistoryLength,
        )
      : 0;
    runtime.loadedResumeHistory = resumed;
    applyAgentConfigOptions(session, runtime, configOptionsResult, acpSettings);

    if (isMuseCodeAdapter(targetProfileId, agentInitialization.agentInfo?.name)) {
      if (session.snapshot.profileId === targetProfileId) emitSessionSnapshot(session);
      runtime.refreshingModelCatalog = true;
      try {
        await refreshMuseCodeModels(connection, sessionIdResult);
      } catch {
        // A catalog refresh failure still leaves the adapter's initial model available.
      } finally {
        runtime.refreshingModelCatalog = false;
      }
      if (session.runtimes.get(targetProfileId) !== runtime || runtime.process !== child) {
        throw new Error("ACP connection was closed");
      }
    }

    runtime.acpSessionId = sessionIdResult;
    if (runtime.desiredModelId) {
      await applyModelSelectionToRuntime(session, runtime, runtime.desiredModelId, acpSettings);
    }
    if (runtime.desiredReasoningId) {
      await applyReasoningSelectionToRuntime(
        session,
        runtime,
        runtime.desiredReasoningId,
        acpSettings,
      );
    }
    if (runtime.desiredModeId) {
      await applyModeSelectionToRuntime(session, runtime, runtime.desiredModeId, acpSettings);
    }

    if (session.snapshot.profileId === targetProfileId) {
      session.snapshot.acpSessionId = runtime.acpSessionId;
      if (session.snapshot.status === "starting") {
        session.snapshot.status = "ready";
      }
      emitSessionSnapshot(session);
    }

    return { connection, acpSessionId: sessionIdResult };
  })().finally(() => {
    if (runtime.connectPromise === connectPromise) {
      runtime.connectPromise = null;
    }
  });

  runtime.connectPromise = connectPromise;
  return connectPromise;
}

async function applyModelSelectionToRuntime(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  modelId: string,
  acpSettings: AcpSettingsManager,
): Promise<void> {
  if (!runtime.connection || !runtime.acpSessionId) return;
  if (runtime.modelConfigId) {
    try {
      const res = await runtime.connection.agent.request(
        acp.methods.agent.session.setConfigOption,
        {
          sessionId: runtime.acpSessionId,
          configId: runtime.modelConfigId,
          value: modelId,
        },
      );
      applyAgentConfigOptions(session, runtime, res.configOptions, acpSettings);
    } catch {
      /* ignore unsupported model selection */
    }
  } else if (runtime.process?.stdin?.writable && runtime.supportsLegacySetModel) {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: `set-model-${Date.now()}`,
      method: "session/set_model",
      params: {
        sessionId: runtime.acpSessionId,
        modelId,
      },
    });
    runtime.process.stdin.write(`${payload}\n`);
  }
}

async function applyReasoningSelectionToRuntime(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  reasoningId: string,
  acpSettings: AcpSettingsManager,
): Promise<void> {
  if (!runtime.connection || !runtime.acpSessionId || !runtime.reasoningConfigId) return;
  try {
    const res = await runtime.connection.agent.request(acp.methods.agent.session.setConfigOption, {
      sessionId: runtime.acpSessionId,
      configId: runtime.reasoningConfigId,
      value: reasoningId,
    });
    applyAgentConfigOptions(session, runtime, res.configOptions, acpSettings);
  } catch {
    /* ignore unsupported reasoning selection */
  }
}

async function applyModeSelectionToRuntime(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  modeId: string,
  acpSettings: AcpSettingsManager,
): Promise<void> {
  if (!runtime.connection || !runtime.acpSessionId || !runtime.modeConfigId) return;
  try {
    const res = await runtime.connection.agent.request(acp.methods.agent.session.setConfigOption, {
      sessionId: runtime.acpSessionId,
      configId: runtime.modeConfigId,
      value: modeId,
    });
    applyAgentConfigOptions(session, runtime, res.configOptions, acpSettings);
  } catch {
    /* ignore unsupported mode selection */
  }
}

function tapIncomingAcpJsonStream(
  source: ReadableStream<Uint8Array>,
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  acpSettings: AcpSettingsManager,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let lineBuffer = "";
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        lineBuffer += decoder.decode(chunk, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed.startsWith("{")) continue;
          try {
            const parsed = JSON.parse(trimmed) as {
              result?: {
                models?: {
                  currentModelId?: unknown;
                  availableModels?: Array<{
                    modelId?: unknown;
                    id?: unknown;
                    name?: unknown;
                    description?: unknown;
                  }>;
                };
              };
            };
            if (parsed.result?.models) {
              applyAgentLegacyModels(session, runtime, parsed.result.models, acpSettings);
            }
          } catch {
            /* ignore non-JSON or partial line */
          }
        }
      },
    }),
  );
}

function applyAgentLegacyModels(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  rawModels: {
    currentModelId?: unknown;
    availableModels?: Array<{
      modelId?: unknown;
      id?: unknown;
      name?: unknown;
      description?: unknown;
    }>;
  },
  acpSettings: AcpSettingsManager,
): void {
  runtime.supportsLegacySetModel = true;
  const isActiveProfile = session.snapshot.profileId === runtime.profileId;
  if (Array.isArray(rawModels.availableModels) && rawModels.availableModels.length > 0) {
    const discovered: AcpModelOption[] = [];
    for (const item of rawModels.availableModels) {
      const id =
        typeof item.modelId === "string"
          ? item.modelId.trim()
          : typeof item.id === "string"
            ? item.id.trim()
            : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : id;
      if (!id || !name) continue;
      const description =
        typeof item.description === "string" && item.description.trim()
          ? item.description.trim()
          : undefined;
      discovered.push({ id, name, ...(description ? { description } : {}) });
    }
    if (discovered.length > 0) {
      const normalized =
        runtime.profileId === "opencode"
          ? filterOpenCodeGoModels(discovered)
          : runtime.profileId === "zai"
            ? filterZaiModels(discovered)
            : mergeAcpModelLists(discovered);
      const models = acpSettings.updateProfileDiscoveredCatalog(runtime.profileId, normalized);
      if (isActiveProfile) {
        session.snapshot.availableModels = models;
      }
    }
  }
  if (typeof rawModels.currentModelId === "string" && rawModels.currentModelId.trim()) {
    runtime.reportedModelId = rawModels.currentModelId.trim();
    if (isActiveProfile && !runtime.desiredModelId) {
      session.snapshot.modelId = runtime.reportedModelId;
    }
  }
}

function applyAgentConfigOptions(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  configOptions: acp.SessionConfigOption[],
  acpSettings: AcpSettingsManager,
): void {
  const isActiveProfile = session.snapshot.profileId === runtime.profileId;
  for (const option of configOptions) {
    if (option.type !== "select") continue;
    const flatOptions = flattenSelectOptions(option.options);
    if (option.category === "model" || option.id.toLowerCase().includes("model")) {
      runtime.modelConfigId = option.id;
      let normalizedModels: AcpModelOption[] | null = null;
      if (flatOptions.length > 0) {
        const discovered = flatOptions.map((item) => ({
          id: item.value,
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
        }));
        normalizedModels =
          runtime.profileId === "opencode"
            ? filterOpenCodeGoModels(discovered)
            : runtime.profileId === "zai"
              ? filterZaiModels(discovered)
              : mergeAcpModelLists(discovered);
        if (normalizedModels.length > 0) {
          normalizedModels = acpSettings.updateProfileDiscoveredCatalog(
            runtime.profileId,
            normalizedModels,
          );
        }
        if (isActiveProfile) {
          const priorModel = session.snapshot.availableModels.find(
            (model) => model.id === session.snapshot.modelId,
          );
          const reportedModel = normalizedModels.find((model) => model.id === option.currentValue);
          if (
            runtime.profileId === "muse" &&
            priorModel &&
            reportedModel?.name === priorModel.name &&
            !normalizedModels.some((model) => model.id === priorModel.id)
          ) {
            session.snapshot.modelId = reportedModel.id;
            if (runtime.desiredModelId === priorModel.id) runtime.desiredModelId = reportedModel.id;
          }
          session.snapshot.availableModels = normalizedModels;
        }
      }
      if (option.currentValue) runtime.reportedModelId = option.currentValue;
      if (isActiveProfile && option.currentValue && !runtime.desiredModelId) {
        if (!normalizedModels || normalizedModels.some((m) => m.id === option.currentValue)) {
          session.snapshot.modelId = option.currentValue;
        } else {
          const preferred = normalizedModels.some((m) => m.id === session.snapshot.modelId)
            ? session.snapshot.modelId
            : normalizedModels[0]!.id;
          session.snapshot.modelId = preferred;
          runtime.desiredModelId = preferred;
        }
      }
    } else if (
      option.category === "thought_level" ||
      option.id.toLowerCase().includes("reason") ||
      option.id.toLowerCase().includes("thinking") ||
      option.id.toLowerCase().includes("effort")
    ) {
      runtime.reasoningConfigId = option.id;
      if (flatOptions.length > 0) {
        const discoveredReasoning = mergeAcpReasoningLists(
          flatOptions.map((item) => ({
            id: item.value,
            name: item.name,
          })),
        );
        acpSettings.updateProfileDiscoveredCatalog(runtime.profileId, [], discoveredReasoning);
        if (isActiveProfile) {
          session.snapshot.availableReasoning = discoveredReasoning;
        }
      }
      if (option.currentValue) runtime.reportedReasoningId = option.currentValue;
      if (isActiveProfile && option.currentValue && !runtime.desiredReasoningId) {
        session.snapshot.reasoningId = option.currentValue;
      }
    } else if (option.category === "mode" || option.id.toLowerCase() === "mode") {
      runtime.modeConfigId = option.id;
      if (flatOptions.length > 0) {
        const discoveredModes: AcpModeOption[] = flatOptions.map((item) => ({
          id: item.value,
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
        }));
        runtime.availableModes = discoveredModes;
        if (isActiveProfile) {
          session.snapshot.availableModes = discoveredModes;
        }
      }
      if (option.currentValue) {
        runtime.modeId = option.currentValue;
        if (isActiveProfile && !runtime.desiredModeId) {
          session.snapshot.modeId = option.currentValue;
        }
      }
    }
  }
}

function isMuseCodeAdapter(profileId: string, agentName: string | undefined): boolean {
  return profileId === "muse" && agentName === "@bex-co/muse-code-acp";
}

function refreshMuseCodeModels(connection: acp.ClientConnection, sessionId: string) {
  return connection.agent.request(acp.methods.agent.session.prompt, {
    sessionId,
    prompt: [{ type: "text", text: "/models" }],
  });
}

function readConfigModels(configOptions: acp.SessionConfigOption[]): AcpModelOption[] {
  const option = configOptions.find(
    (item) => item.type === "select" && (item.category === "model" || item.id === "model"),
  );
  return option?.type === "select"
    ? mergeAcpModelLists(
        flattenSelectOptions(option.options).map(({ value, name, description }) => ({
          id: value,
          name,
          ...(description ? { description } : {}),
        })),
      )
    : [];
}

function flattenSelectOptions(
  options: acp.SessionConfigSelectOptions,
): acp.SessionConfigSelectOption[] {
  const result: acp.SessionConfigSelectOption[] = [];
  for (const item of options) {
    if ("group" in item && Array.isArray(item.options)) {
      result.push(...item.options);
    } else if ("value" in item) {
      result.push(item);
    }
  }
  return result;
}

function buildAcpClientApp(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  acpSettings: AcpSettingsManager,
): acp.ClientApp {
  return acp
    .client({ name: "VINTAGE" })
    .onNotification(acp.methods.client.session.update, async ({ params }) => {
      handleSessionUpdate(session, runtime, params.update, acpSettings);
    })
    .onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
      return handlePermissionRequest(session, params);
    })
    .onRequest(acp.methods.client.fs.readTextFile, async ({ params }) => {
      return handleReadTextFile(session, params);
    })
    .onRequest(acp.methods.client.fs.writeTextFile, async ({ params }) => {
      return handleWriteTextFile(session, params);
    })
    .onRequest(acp.methods.client.terminal.create, async ({ params }) => {
      return handleTerminalCreate(session, params);
    })
    .onRequest(acp.methods.client.terminal.output, async ({ params }) => {
      return handleTerminalOutput(session, params);
    })
    .onRequest(acp.methods.client.terminal.waitForExit, async ({ params }) => {
      return handleTerminalWaitForExit(session, params);
    })
    .onRequest(acp.methods.client.terminal.kill, async ({ params }) => {
      return handleTerminalKill(session, params);
    })
    .onRequest(acp.methods.client.terminal.release, async ({ params }) => {
      return handleTerminalRelease(session, params);
    });
}

function resolveSnapshotModelName(snapshot: AcpSessionSnapshot): string {
  return (
    snapshot.availableModels.find((item) => item.id === snapshot.modelId)?.name ?? snapshot.modelId
  );
}

function getOrCreateAssistantMessage(session: OwnedAcpSession) {
  let msg = session.currentAssistantMessageId
    ? session.snapshot.messages.find((item) => item.id === session.currentAssistantMessageId)
    : undefined;
  if (!msg) {
    msg = {
      id: randomUUID(),
      role: "assistant",
      text: "",
      thought: "",
      toolCalls: [],
      createdAt: Date.now(),
      streaming: true,
      profileId: session.snapshot.profileId,
      profileName: session.snapshot.profileName,
      profileBadge: session.snapshot.profileBadge,
      modelId: session.snapshot.modelId,
      modelName: resolveSnapshotModelName(session.snapshot),
    };
    session.snapshot.messages.push(msg);
    session.currentAssistantMessageId = msg.id;
  }
  return msg;
}

function mapToolContent(
  session: OwnedAcpSession,
  rawContent: acp.ToolCallContent[] | null | undefined,
): AcpToolCallContent[] {
  if (!rawContent) return [];
  const mapped: AcpToolCallContent[] = [];
  for (const block of rawContent) {
    if (block.type === "content" && block.content.type === "text") {
      mapped.push({ type: "text", text: block.content.text });
    } else if (block.type === "diff") {
      mapped.push({
        type: "diff",
        path: toWorkspaceDisplayPath(session.cwd, block.path),
        oldText: block.oldText ?? null,
        newText: block.newText,
      });
    } else if (block.type === "terminal") {
      const subTerm = session.subTerminals.get(block.terminalId);
      mapped.push({
        type: "terminal",
        terminalId: block.terminalId,
        ...(subTerm?.command ? { command: subTerm.command } : {}),
        ...(subTerm?.output ? { output: subTerm.output } : {}),
        ...(subTerm ? { exitCode: subTerm.exitCode } : {}),
      });
    }
  }
  return mapped;
}

function mapToolLocations(
  cwd: string,
  kind: AcpToolCallItem["kind"],
  rawLocations:
    | ReadonlyArray<{ path: string; line?: number | null | undefined }>
    | null
    | undefined,
): AcpToolCallItem["locations"] {
  if (!rawLocations || rawLocations.length === 0 || kind === "execute") return [];
  const normalizedCwd = resolve(cwd);
  const result: AcpToolCallItem["locations"] = [];
  for (const loc of rawLocations) {
    const rawPath = loc.path?.trim();
    if (!rawPath || rawPath === ".") continue;
    const abs = isAbsolute(rawPath) ? resolve(rawPath) : resolve(normalizedCwd, rawPath);
    if (abs === normalizedCwd) continue;
    result.push({
      path: toWorkspaceDisplayPath(cwd, rawPath),
      ...(typeof loc.line === "number" ? { line: loc.line } : {}),
    });
  }
  return result;
}

function toWorkspaceDisplayPath(cwd: string, targetPath: string): string {
  if (!isAbsolute(targetPath)) return targetPath;
  const rel = relative(cwd, targetPath);
  if (!rel || isAbsolute(rel) || rel.startsWith("..")) return targetPath;
  return rel.replaceAll("\\", "/");
}

function handleSessionUpdate(
  session: OwnedAcpSession,
  runtime: ProfileRuntime,
  update: acp.SessionUpdate,
  acpSettings: AcpSettingsManager,
): void {
  if (
    runtime.refreshingModelCatalog &&
    (update.sessionUpdate === "agent_message_chunk" ||
      update.sessionUpdate === "agent_thought_chunk")
  )
    return;

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type === "text") {
        const msg = getOrCreateAssistantMessage(session);
        msg.text += update.content.text;
        emitEvent(session, {
          type: "message.delta",
          sessionId: session.id,
          messageId: msg.id,
          field: "text",
          delta: update.content.text,
        });
      } else if (
        update.content.type === "image" &&
        update.content.data &&
        update.content.mimeType
      ) {
        const msg = getOrCreateAssistantMessage(session);
        msg.images = [
          ...(msg.images ?? []),
          {
            id: randomUUID(),
            name: "image",
            mimeType: update.content.mimeType,
            dataBase64: update.content.data,
          },
        ];
        emitSessionSnapshot(session);
      }
      break;
    }
    case "agent_thought_chunk": {
      if (update.content.type === "text") {
        const msg = getOrCreateAssistantMessage(session);
        msg.thought += update.content.text;
        emitEvent(session, {
          type: "message.delta",
          sessionId: session.id,
          messageId: msg.id,
          field: "thought",
          delta: update.content.text,
        });
      }
      break;
    }
    case "tool_call":
    case "tool_call_update": {
      const msg = getOrCreateAssistantMessage(session);
      const existing = msg.toolCalls.find((item) => item.toolCallId === update.toolCallId);
      const kind = update.kind ?? existing?.kind ?? "other";
      const locations = mapToolLocations(
        session.cwd,
        kind,
        update.locations ?? existing?.locations,
      );
      const content =
        update.content !== undefined && update.content !== null
          ? mapToolContent(session, update.content)
          : (existing?.content ?? []);
      const nextTool: AcpToolCallItem = {
        toolCallId: update.toolCallId,
        title: update.title ?? existing?.title ?? "Tool execution",
        kind,
        status: update.status ?? existing?.status ?? "in_progress",
        locations,
        content,
      };
      if (existing) {
        Object.assign(existing, nextTool);
      } else {
        msg.toolCalls.push(nextTool);
      }
      emitEvent(session, {
        type: "tool.upsert",
        sessionId: session.id,
        messageId: msg.id,
        toolCall: structuredClone(nextTool),
      });
      break;
    }
    case "plan": {
      session.snapshot.plan = update.entries.map((entry) => ({
        content: entry.content,
        priority: entry.priority,
        status: entry.status,
      }));
      emitEvent(session, {
        type: "plan.update",
        sessionId: session.id,
        entries: structuredClone(session.snapshot.plan),
      });
      break;
    }
    case "available_commands_update": {
      const commands: AcpSlashCommand[] = update.availableCommands
        .filter((cmd) => typeof cmd.name === "string" && Boolean(cmd.name.trim()))
        .map((cmd) => {
          const hint =
            cmd.input &&
            typeof cmd.input === "object" &&
            "hint" in cmd.input &&
            typeof cmd.input.hint === "string" &&
            cmd.input.hint.trim()
              ? cmd.input.hint.trim()
              : undefined;
          return {
            name: cmd.name.trim().replace(/^\//, ""),
            description: typeof cmd.description === "string" ? cmd.description.trim() : "",
            ...(hint ? { inputHint: hint } : {}),
          };
        });
      runtime.availableCommands = commands;
      if (session.snapshot.profileId === runtime.profileId) {
        session.snapshot.availableCommands = commands;
        emitSessionSnapshot(session);
      }
      break;
    }
    case "usage_update": {
      const usageUpdate = update as unknown as {
        used?: number;
        size?: number;
        cost?: { amount?: number; currency?: string } | null;
      };
      if (typeof usageUpdate.used === "number" && typeof usageUpdate.size === "number") {
        session.snapshot.usage = {
          used: usageUpdate.used,
          size: usageUpdate.size,
          ...(typeof usageUpdate.cost?.amount === "number"
            ? { costAmount: usageUpdate.cost.amount }
            : {}),
          ...(typeof usageUpdate.cost?.currency === "string"
            ? { costCurrency: usageUpdate.cost.currency }
            : {}),
        };
        if (session.snapshot.profileId === runtime.profileId) {
          emitSessionSnapshot(session);
        }
      }
      break;
    }
    case "config_option_update": {
      applyAgentConfigOptions(session, runtime, update.configOptions, acpSettings);
      if (session.snapshot.profileId === runtime.profileId) {
        emitSessionSnapshot(session);
      }
      break;
    }
    default:
      break;
  }
}

async function handlePermissionRequest(
  session: OwnedAcpSession,
  params: acp.RequestPermissionRequest,
): Promise<acp.RequestPermissionResponse> {
  const policy = session.snapshot.permissionPolicy;
  const toolKind = params.toolCall.kind ?? "other";

  const allowOption =
    params.options.find((opt) => opt.kind === "allow_once") ??
    params.options.find((opt) => opt.kind === "allow_always");

  if (
    allowOption &&
    (policy === "auto_all" ||
      (policy === "auto_edit" &&
        (toolKind === "read" || toolKind === "edit" || toolKind === "search")))
  ) {
    return {
      outcome: {
        outcome: "selected",
        optionId: allowOption.optionId,
      },
    };
  }

  const requestId = randomUUID();
  const permissionToolKind = params.toolCall.kind ?? "other";
  const toolCall: AcpToolCallItem = {
    toolCallId: params.toolCall.toolCallId,
    title: params.toolCall.title ?? "Permission required",
    kind: permissionToolKind,
    status: params.toolCall.status ?? "pending",
    locations: mapToolLocations(session.cwd, permissionToolKind, params.toolCall.locations),
    content: mapToolContent(session, params.toolCall.content),
  };

  const options: AcpPermissionOption[] = params.options.map((opt) => ({
    optionId: opt.optionId,
    name: opt.name,
    kind: opt.kind,
  }));

  const permissionRequest: AcpPermissionRequest = {
    requestId,
    sessionId: session.id,
    toolCall,
    options,
  };

  return new Promise<acp.RequestPermissionResponse>((resolvePromise) => {
    session.pendingPermissions.set(requestId, {
      request: permissionRequest,
      resolve: resolvePromise,
    });
    if (session.pendingPermissions.size === 1) showPermissionRequest(session, permissionRequest);
  });
}
function showPermissionRequest(
  session: OwnedAcpSession,
  permissionRequest: AcpPermissionRequest,
): void {
  session.snapshot.status = "waiting_permission";
  session.snapshot.pendingPermission = permissionRequest;
  emitEvent(session, {
    type: "permission.requested",
    sessionId: session.id,
    request: structuredClone(permissionRequest),
  });
  emitSessionSnapshot(session);
  publishAttention(session, "waiting_input", 3, true, "input_request");
}

function resolvePermissionRequest(
  session: OwnedAcpSession,
  requestId: string,
  optionId: string,
): void {
  const pending = session.pendingPermissions.get(requestId);
  if (!pending || session.snapshot.pendingPermission?.requestId !== requestId) return;
  session.pendingPermissions.delete(requestId);
  session.snapshot.pendingPermission = null;
  session.snapshot.status = "running";
  pending.resolve({
    outcome: {
      outcome: "selected",
      optionId,
    },
  });
  emitEvent(session, { type: "permission.resolved", sessionId: session.id, requestId });
  const next = session.pendingPermissions.values().next().value;
  if (next) {
    showPermissionRequest(session, next.request);
    return;
  }
  emitSessionSnapshot(session);
  publishAttention(session, "thinking", 0, false, "agent_activity");
}

async function resolveSafeWorkspacePath(
  workspaceRoot: string,
  rawPath: string,
  allowCreate = false,
): Promise<string> {
  if (!rawPath || rawPath.includes("\0")) {
    throw new Error("File path must be a non-empty string");
  }
  const root = await realpath(workspaceRoot);
  const candidate = isAbsolute(rawPath) ? resolve(rawPath) : resolve(root, rawPath);
  const rel = relative(root, candidate);
  if (candidate === root || isAbsolute(rel) || /^\.\.(?:[\\/]|$)/u.test(rel)) {
    throw new Error("Access denied: file is outside the active VINTAGE workspace");
  }

  let current = root;
  const parts = rel.split(/[\\/]/u).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]!);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new Error("Symbolic links are not permitted for ACP file operations");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && allowCreate) {
        continue;
      }
      throw error;
    }
  }
  return candidate;
}

async function handleReadTextFile(
  session: OwnedAcpSession,
  params: acp.ReadTextFileRequest,
): Promise<acp.ReadTextFileResponse> {
  const safePath = await resolveSafeWorkspacePath(session.cwd, params.path, false);
  const content = await readFile(safePath, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_ACP_TEXT_FILE_BYTES) {
    throw new Error("File exceeds the 2 MiB ACP read limit");
  }
  if (typeof params.line === "number" || typeof params.limit === "number") {
    const lines = content.split("\n");
    const start = Math.max(0, (params.line ?? 1) - 1);
    const count = params.limit ?? lines.length;
    return { content: lines.slice(start, start + count).join("\n") };
  }
  return { content };
}

async function handleWriteTextFile(
  session: OwnedAcpSession,
  params: acp.WriteTextFileRequest,
): Promise<acp.WriteTextFileResponse> {
  if (Buffer.byteLength(params.content, "utf8") > MAX_ACP_TEXT_FILE_BYTES) {
    throw new Error("Content exceeds the 2 MiB ACP write limit");
  }
  const safePath = await resolveSafeWorkspacePath(session.cwd, params.path, true);
  await mkdir(dirname(safePath), { recursive: true });
  await writeFile(safePath, params.content, "utf8");
  return {};
}

async function handleTerminalCreate(
  session: OwnedAcpSession,
  params: acp.CreateTerminalRequest,
): Promise<acp.CreateTerminalResponse> {
  const terminalId = randomUUID();
  const targetCwd = params.cwd
    ? await resolveSafeWorkspacePath(session.cwd, params.cwd, false).catch(() => session.cwd)
    : session.cwd;
  const customEnv: Record<string, string> = {};
  for (const item of params.env ?? []) {
    if (item.name && item.name !== "TYPESAFE_API_KEY") {
      customEnv[item.name] = item.value;
    }
  }

  const outputByteLimit = Math.min(
    MAX_TERMINAL_OUTPUT_BYTES,
    Math.max(4096, params.outputByteLimit ?? MAX_TERMINAL_OUTPUT_BYTES),
  );

  const child = spawn(params.command, params.args ?? [], {
    cwd: targetCwd,
    env: { ...process.env, ...customEnv },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  let resolveExit!: (status: { exitCode: number | null; signal: string | null }) => void;
  const exitPromise = new Promise<{ exitCode: number | null; signal: string | null }>((res) => {
    resolveExit = res;
  });

  const subTerminal: ManagedSubTerminal = {
    id: terminalId,
    command: [params.command, ...(params.args ?? [])].join(" "),
    process: child,
    output: "",
    truncated: false,
    outputByteLimit,
    exitCode: null,
    signal: null,
    exited: false,
    exitPromise,
  };

  const appendOutput = (chunk: Buffer | string) => {
    subTerminal.output += chunk.toString();
    if (Buffer.byteLength(subTerminal.output, "utf8") > subTerminal.outputByteLimit) {
      subTerminal.output = subTerminal.output.slice(-subTerminal.outputByteLimit);
      subTerminal.truncated = true;
    }
  };

  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);
  child.on("exit", (code, sig) => {
    subTerminal.exitCode = code;
    subTerminal.signal = sig;
    subTerminal.exited = true;
    resolveExit({ exitCode: code, signal: sig });
  });
  child.on("error", (err) => {
    appendOutput(`\n[spawn error: ${err.message}]\n`);
    subTerminal.exitCode = 1;
    subTerminal.exited = true;
    resolveExit({ exitCode: 1, signal: null });
  });

  session.subTerminals.set(terminalId, subTerminal);
  return { terminalId };
}

async function handleTerminalOutput(
  session: OwnedAcpSession,
  params: acp.TerminalOutputRequest,
): Promise<acp.TerminalOutputResponse> {
  const subTerminal = session.subTerminals.get(params.terminalId);
  if (!subTerminal) {
    return { output: "", truncated: false, exitStatus: { exitCode: 1, signal: null } };
  }
  return {
    output: subTerminal.output,
    truncated: subTerminal.truncated,
    ...(subTerminal.exited
      ? { exitStatus: { exitCode: subTerminal.exitCode, signal: subTerminal.signal } }
      : {}),
  };
}

async function handleTerminalWaitForExit(
  session: OwnedAcpSession,
  params: acp.WaitForTerminalExitRequest,
): Promise<acp.WaitForTerminalExitResponse> {
  const subTerminal = session.subTerminals.get(params.terminalId);
  if (!subTerminal) return { exitCode: 1, signal: null };
  return subTerminal.exitPromise;
}

async function handleTerminalKill(
  session: OwnedAcpSession,
  params: acp.KillTerminalRequest,
): Promise<acp.KillTerminalResponse> {
  const subTerminal = session.subTerminals.get(params.terminalId);
  if (subTerminal && !subTerminal.exited) {
    try {
      subTerminal.process.kill();
    } catch {
      /* ignore */
    }
  }
  return {};
}

function captureTerminalResult(
  messages: readonly AcpConversationMessage[],
  terminal: ManagedSubTerminal,
): void {
  for (const message of messages) {
    for (const tool of message.toolCalls) {
      for (const content of tool.content) {
        if (content.type !== "terminal" || content.terminalId !== terminal.id) continue;
        content.command = terminal.command;
        content.output = terminal.output;
        content.exitCode = terminal.exitCode;
      }
    }
  }
}

async function handleTerminalRelease(
  session: OwnedAcpSession,
  params: acp.ReleaseTerminalRequest,
): Promise<acp.ReleaseTerminalResponse> {
  const subTerminal = session.subTerminals.get(params.terminalId);
  if (subTerminal) {
    if (!subTerminal.exited) {
      try {
        subTerminal.process.kill();
      } catch {
        /* ignore */
      }
    }
    captureTerminalResult(session.snapshot.messages, subTerminal);
    session.subTerminals.delete(params.terminalId);
  }
  return {};
}

async function submitPrompt(
  session: OwnedAcpSession,
  text: string,
  images: AcpPromptImage[],
  acpSettings: AcpSettingsManager,
): Promise<void> {
  if (session.activePrompt !== null) throw new Error("An ACP prompt is already running");
  const runtime = getOrCreateProfileRuntime(session, session.snapshot.profileId);
  const historyEnd = session.snapshot.messages.length;
  const userMessage = {
    id: randomUUID(),
    role: "user" as const,
    text,
    thought: "",
    toolCalls: [],
    ...(images.length > 0 ? { images } : {}),
    createdAt: Date.now(),
    streaming: false,
  };
  session.snapshot.messages.push(userMessage);
  const assistantMessage = {
    id: randomUUID(),
    role: "assistant" as const,
    text: "",
    thought: "",
    toolCalls: [],
    createdAt: Date.now(),
    streaming: true,
    profileId: session.snapshot.profileId,
    profileName: session.snapshot.profileName,
    profileBadge: session.snapshot.profileBadge,
    modelId: session.snapshot.modelId,
    modelName: resolveSnapshotModelName(session.snapshot),
  };
  session.snapshot.messages.push(assistantMessage);
  session.currentAssistantMessageId = assistantMessage.id;
  const prompt = { cancelled: false };
  session.activePrompt = prompt;
  const startedAt = Date.now();
  session.turnStartedAt = startedAt;
  session.snapshot.turnStartedAt = startedAt;
  delete session.snapshot.lastTurnCompleted;
  session.snapshot.status = "running";
  delete session.snapshot.errorMessage;
  emitSessionSnapshot(session);
  publishAttention(session, "thinking", 0, false, "agent_activity");

  try {
    const { connection, acpSessionId } = await ensureAgentConnected(session, acpSettings);
    if (session.activePrompt !== prompt) return;
    assistantMessage.modelId = session.snapshot.modelId;
    assistantMessage.modelName = resolveSnapshotModelName(session.snapshot);
    session.snapshot.status = "running";
    emitSessionSnapshot(session);

    for (const terminal of session.subTerminals.values()) {
      if (terminal.exited) captureTerminalResult(session.snapshot.messages, terminal);
    }
    const handoff = buildAcpHandoff(
      session.snapshot.messages,
      runtime.historyCovered,
      historyEnd,
      session.diagnostics,
    );
    const promptBlocks: acp.ContentBlock[] = [
      ...(handoff ? [{ type: "text" as const, text: `${handoff}\n\nCurrent request:\n` }] : []),
      ...images.map((img) => ({
        type: "image" as const,
        data: img.dataBase64,
        mimeType: img.mimeType,
      })),
      ...(text ? [{ type: "text" as const, text }] : []),
    ];

    if (!prompt.cancelled) {
      const response = await connection.agent.request(acp.methods.agent.session.prompt, {
        sessionId: acpSessionId,
        prompt: promptBlocks,
      });
      if (session.activePrompt !== prompt) return;
      runtime.historyCovered = historyEnd + 2;
      session.snapshot.lastTurnCompleted = response.stopReason === "end_turn";
    }
    if (prompt.cancelled) session.snapshot.lastTurnCompleted = false;
    assistantMessage.streaming = false;
    session.currentAssistantMessageId = null;
    session.snapshot.status = "ready";
    const durationMs =
      session.turnStartedAt === null ? undefined : Math.max(0, Date.now() - session.turnStartedAt);
    session.turnStartedAt = null;
    session.snapshot.turnStartedAt = null;
    session.snapshot.lastTurnDurationMs = durationMs ?? null;
    emitSessionSnapshot(session);
    if (prompt.cancelled) {
      publishAttention(session, "idle", 0, false);
      return;
    }
    const longRunning = durationMs !== undefined && durationMs >= 30_000;
    publishAttention(
      session,
      "completed",
      longRunning ? 2 : 1,
      true,
      longRunning ? "long_running_completed" : "command_completed",
      durationMs,
    );
  } catch (error) {
    if (session.activePrompt !== prompt) return;
    assistantMessage.streaming = false;
    session.currentAssistantMessageId = null;
    session.turnStartedAt = null;
    session.snapshot.turnStartedAt = null;
    const message = error instanceof Error ? error.message : String(error);
    session.snapshot.status = "error";
    session.snapshot.errorMessage = message;
    if (!assistantMessage.text && assistantMessage.toolCalls.length === 0) {
      assistantMessage.text = `⚠️ ${message}`;
      session.diagnostics.add(assistantMessage);
    }
    emitEvent(session, { type: "session.error", sessionId: session.id, message });
    emitSessionSnapshot(session);
    publishAttention(session, "failed", 3, true, "command_failed");
  } finally {
    if (session.activePrompt === prompt) session.activePrompt = null;
  }
}

async function cancelPrompt(session: OwnedAcpSession): Promise<void> {
  if (session.activePrompt) session.activePrompt.cancelled = true;
  for (const [, pending] of session.pendingPermissions) {
    pending.resolve({ outcome: { outcome: "cancelled" } });
  }
  session.pendingPermissions.clear();
  if (session.snapshot.pendingPermission) {
    session.snapshot.pendingPermission = null;
    session.snapshot.status = "running";
    emitSessionSnapshot(session);
    publishAttention(session, "thinking", 0, false, "agent_activity");
  }

  const activeRuntime = session.runtimes.get(session.snapshot.profileId);
  if (activeRuntime?.connection && activeRuntime.acpSessionId) {
    await activeRuntime.connection.agent.notify(acp.methods.agent.session.cancel, {
      sessionId: activeRuntime.acpSessionId,
    });
  }
}

async function configureSession(
  session: OwnedAcpSession,
  rawPatch: unknown,
  acpSettings: AcpSettingsManager,
): Promise<AcpSessionSnapshot> {
  if (!rawPatch || typeof rawPatch !== "object") return structuredClone(session.snapshot);
  const patch = rawPatch as {
    profileId?: string;
    modelId?: string;
    reasoningId?: string;
    modeId?: string;
    permissionPolicy?: AcpPermissionPolicy;
  };

  if (typeof patch.profileId === "string" && patch.profileId !== session.snapshot.profileId) {
    if (session.activePrompt !== null) return structuredClone(session.snapshot);
    const nextProfile = acpSettings.getProfile(patch.profileId);
    const nextRuntime = getOrCreateProfileRuntime(session, nextProfile.id);
    session.snapshot.profileId = nextProfile.id;
    session.snapshot.profileName = nextProfile.name;
    session.snapshot.profileBadge = nextProfile.badge;
    session.snapshot.agentCommand =
      nextRuntime.agentCommand ??
      `${nextProfile.executable || nextProfile.defaultCandidates[0] || nextProfile.id} ${nextProfile.args.join(" ")}`.trim();
    session.snapshot.acpSessionId = nextRuntime.acpSessionId;
    session.snapshot.availableCommands = nextRuntime.availableCommands.map((c) => ({ ...c }));
    session.snapshot.availableModes = nextRuntime.availableModes.map((m) => ({ ...m }));
    const nextModeId = nextRuntime.desiredModeId ?? nextRuntime.modeId;
    if (nextModeId) {
      session.snapshot.modeId = nextModeId;
    } else {
      delete session.snapshot.modeId;
    }
    session.snapshot.availableModels = nextProfile.models.map((m) => ({ ...m }));
    session.snapshot.availableReasoning = nextProfile.reasoningLevels.map((r) => ({ ...r }));
    session.snapshot.modelId =
      patch.modelId ??
      nextRuntime.desiredModelId ??
      nextRuntime.reportedModelId ??
      nextProfile.defaultModel;
    session.snapshot.reasoningId =
      patch.reasoningId ??
      nextRuntime.desiredReasoningId ??
      nextRuntime.reportedReasoningId ??
      nextProfile.defaultReasoning;
    session.snapshot.status = "ready";
    delete session.snapshot.errorMessage;
    if (!nextRuntime.connection || !nextRuntime.acpSessionId || nextRuntime.process?.killed) {
      void warmupAgentSession(session, acpSettings);
    }
  }

  const activeRuntime = getOrCreateProfileRuntime(session, session.snapshot.profileId);

  if (typeof patch.modelId === "string" && patch.modelId.trim()) {
    const nextModelId = patch.modelId.trim();
    session.snapshot.modelId = nextModelId;
    activeRuntime.desiredModelId = nextModelId;
    void applyModelSelectionToRuntime(session, activeRuntime, nextModelId, acpSettings).then(() => {
      if (session.snapshot.profileId === activeRuntime.profileId) {
        emitSessionSnapshot(session);
      }
    });
  }

  if (typeof patch.reasoningId === "string" && patch.reasoningId.trim()) {
    const nextReasoningId = patch.reasoningId.trim();
    session.snapshot.reasoningId = nextReasoningId;
    activeRuntime.desiredReasoningId = nextReasoningId;
    void applyReasoningSelectionToRuntime(
      session,
      activeRuntime,
      nextReasoningId,
      acpSettings,
    ).then(() => {
      if (session.snapshot.profileId === activeRuntime.profileId) {
        emitSessionSnapshot(session);
      }
    });
  }

  if (typeof patch.modeId === "string" && patch.modeId.trim()) {
    const nextModeId = patch.modeId.trim();
    session.snapshot.modeId = nextModeId;
    activeRuntime.desiredModeId = nextModeId;
    void applyModeSelectionToRuntime(session, activeRuntime, nextModeId, acpSettings).then(() => {
      if (session.snapshot.profileId === activeRuntime.profileId) {
        emitSessionSnapshot(session);
      }
    });
  }

  if (
    patch.permissionPolicy === "ask" ||
    patch.permissionPolicy === "auto_edit" ||
    patch.permissionPolicy === "auto_all"
  ) {
    session.snapshot.permissionPolicy = patch.permissionPolicy;
  }

  emitSessionSnapshot(session);
  return structuredClone(session.snapshot);
}

async function resetSessionConversation(
  session: OwnedAcpSession,
  acpSettings: AcpSettingsManager,
): Promise<AcpSessionSnapshot> {
  void acpSettings;
  terminateSessionProcess(session);
  session.snapshot.messages = [];
  session.importedHistoryLength = 0;
  session.snapshot.plan = [];
  session.snapshot.pendingPermission = null;
  session.snapshot.status = "ready";
  session.snapshot.lastTurnDurationMs = null;
  delete session.snapshot.lastTurnCompleted;
  delete session.snapshot.errorMessage;
  emitSessionSnapshot(session);
  publishAttention(session, "idle", 0, false);
  return structuredClone(session.snapshot);
}

function publishAttention(
  session: OwnedAcpSession,
  status: TerminalAttentionStatus,
  attentionLevel: 0 | 1 | 2 | 3 | 4,
  userActionRequired: boolean,
  reason?: TerminalAttentionReason,
  durationMs?: number,
): void {
  const mode = session.snapshot.monitorMode;
  let effectiveLevel = attentionLevel;
  let effectiveAction = userActionRequired;
  if (mode === "ignore") {
    effectiveLevel = 0;
    effectiveAction = false;
  } else if (mode === "ignore_until_error" && status !== "failed" && status !== "warning") {
    effectiveLevel = 0;
    effectiveAction = false;
  }

  session.attentionState = {
    sessionId: session.id,
    status,
    attentionLevel: effectiveLevel,
    userActionRequired: effectiveAction,
    source: "pty",
    ...(reason ? { reason } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    lastActivityAt: Date.now(),
    monitorMode: mode,
    notificationThreshold: session.attentionState.notificationThreshold ?? 3,
  };

  if (!session.owner.isDestroyed()) {
    session.owner.send(DesktopChannels.terminalAttention, session.attentionState);
  }
}

function emitSessionSnapshot(session: OwnedAcpSession): void {
  if (!session.ready || !session.attached) return;
  emitEvent(session, {
    type: "session.snapshot",
    sessionId: session.id,
    snapshot: structuredClone(session.snapshot),
  });
}

function emitEvent(session: OwnedAcpSession, event: AcpEvent): void {
  if (!sessions.has(session.id)) return;
  if (!session.ready || !session.attached) {
    return;
  }
  if (!session.owner.isDestroyed()) {
    session.owner.send(DesktopChannels.acpEvent, event);
  }
}

function sendCurrentSessionState(session: OwnedAcpSession): void {
  if (session.owner.isDestroyed()) return;
  session.owner.send(DesktopChannels.acpEvent, {
    type: "session.snapshot",
    sessionId: session.id,
    snapshot: structuredClone(session.snapshot),
  });
  session.owner.send(DesktopChannels.terminalAttention, session.attentionState);
}

function findDetachedSession(ownerId: number, paneId: string): OwnedAcpSession | undefined {
  for (const session of sessions.values()) {
    if (session.attached || session.ownerId !== ownerId) continue;
    if (session.paneId === paneId) return session;
  }
  return undefined;
}

function observeOwner(owner: WebContents): void {
  if (observedOwners.has(owner.id)) return;
  observedOwners.add(owner.id);
  const detachSessions = () => {
    for (const session of sessions.values()) {
      if (session.ownerId === owner.id) session.attached = false;
    }
  };
  owner.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) detachSessions();
  });
  owner.on("render-process-gone", detachSessions);
  owner.once("destroyed", () => {
    for (const session of sessions.values()) {
      if (session.ownerId === owner.id) closeAcpSession(session);
    }
    observedOwners.delete(owner.id);
  });
}

function requireOwnedSession(event: IpcMainInvokeEvent, rawId: unknown): OwnedAcpSession {
  if (typeof rawId !== "string") throw new TypeError("ACP session id must be a string");
  const session = sessions.get(rawId);
  if (!session || session.ownerId !== event.sender.id) {
    throw new Error("Unknown ACP session for this window");
  }
  return session;
}

function terminateProfileRuntime(runtime: ProfileRuntime): void {
  try {
    runtime.connection?.close();
  } catch {
    /* ignore */
  }
  runtime.connection = null;
  if (runtime.process && !runtime.process.killed) {
    try {
      runtime.process.kill();
    } catch {
      /* ignore */
    }
  }
  runtime.process = null;
  runtime.acpSessionId = null;
  runtime.modelConfigId = null;
  runtime.reasoningConfigId = null;
  runtime.reportedModelId = null;
  runtime.reportedReasoningId = null;
  runtime.supportsLegacySetModel = false;
  runtime.connectPromise = null;
}

function terminateSessionProcess(session: OwnedAcpSession): void {
  for (const [, pending] of session.pendingPermissions) {
    pending.resolve({ outcome: { outcome: "cancelled" } });
  }
  session.pendingPermissions.clear();
  for (const [, subTerm] of session.subTerminals) {
    if (!subTerm.exited) {
      try {
        subTerm.process.kill();
      } catch {
        /* ignore */
      }
    }
  }
  session.subTerminals.clear();
  for (const runtime of session.runtimes.values()) {
    terminateProfileRuntime(runtime);
  }
  session.runtimes.clear();
  session.activePrompt = null;
  session.currentAssistantMessageId = null;
  session.turnStartedAt = null;
  session.snapshot.turnStartedAt = null;
  session.snapshot.acpSessionId = null;
}

function closeAcpSession(session: OwnedAcpSession): void {
  if (!sessions.delete(session.id)) return;
  terminateSessionProcess(session);
}

function parseCreateOptions(raw: unknown): AcpCreateOptions {
  if (!raw || typeof raw !== "object") throw new TypeError("ACP options are required");
  const {
    workspaceId,
    paneId,
    profileId,
    modelId,
    reasoningId,
    permissionPolicy,
    tabTitle,
    paneTitle,
    resumeSessionId,
    resumeSessionKey,
    forkFrom,
  } = raw as Partial<AcpCreateOptions>;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new TypeError("A registered workspace is required");
  }
  if (typeof paneId !== "string" || !paneId || paneId.length > 200) {
    throw new TypeError("An ACP pane id no longer than 200 characters is required");
  }
  if (
    forkFrom !== undefined &&
    (!forkFrom ||
      typeof forkFrom !== "object" ||
      typeof forkFrom.sessionId !== "string" ||
      !forkFrom.sessionId ||
      forkFrom.sessionId.length > 200 ||
      typeof forkFrom.messageId !== "string" ||
      !forkFrom.messageId ||
      forkFrom.messageId.length > 200 ||
      resumeSessionId !== undefined ||
      resumeSessionKey !== undefined)
  ) {
    throw new TypeError("A fork requires a source ACP session and message.");
  }
  return {
    workspaceId,
    paneId,
    ...(forkFrom
      ? { forkFrom: { sessionId: forkFrom.sessionId, messageId: forkFrom.messageId } }
      : {}),
    ...(typeof profileId === "string" && profileId ? { profileId } : {}),
    ...(typeof modelId === "string" && modelId ? { modelId } : {}),
    ...(typeof reasoningId === "string" && reasoningId ? { reasoningId } : {}),
    ...(permissionPolicy === "ask" ||
    permissionPolicy === "auto_edit" ||
    permissionPolicy === "auto_all"
      ? { permissionPolicy }
      : {}),
    ...(typeof tabTitle === "string" ? { tabTitle: tabTitle.slice(0, 120) } : {}),
    ...(typeof paneTitle === "string" ? { paneTitle: paneTitle.slice(0, 120) } : {}),
    ...(typeof resumeSessionId === "string" && resumeSessionId
      ? { resumeSessionId: resumeSessionId.slice(0, 200) }
      : {}),
    ...(typeof resumeSessionKey === "string" && resumeSessionKey
      ? { resumeSessionKey: resumeSessionKey.slice(0, 400) }
      : {}),
  };
}
