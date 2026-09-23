import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { spawn, type IPty } from "node-pty";

import {
  DesktopChannels,
  type TerminalCreateOptions,
  type TerminalExitEvent,
  type TerminalResize,
  type TerminalSession,
} from "../shared/desktop.js";
import { AttentionRouter } from "./attentionRouter.js";
import { AttentionSettingsManager, isTerminalMonitorMode } from "./attentionSettings.js";
import { inspectForegroundProcess } from "./processMonitor.js";
import type { JevEvaluationQueue } from "./jevEvaluationQueue.js";
import { prepareShellIntegration } from "./shellIntegration.js";

const MAX_BUFFER_LENGTH = 64 * 1024;
const MAX_WRITE_LENGTH = 1024 * 1024;

interface OwnedTerminal {
  id: string;
  ownerId: number;
  owner: WebContents;
  process: IPty;
  ready: boolean;
  buffer: string;
  attention: AttentionRouter;
  profileKey: string;
  cleanup(): void;
  stopProcessMonitor(): void;
}

const sessions = new Map<string, OwnedTerminal>();
const observedOwners = new Set<number>();

export function registerTerminalIpc(
  resolveWorkspace: (id: unknown) => string,
  evaluationQueue: JevEvaluationQueue,
  attentionSettings: AttentionSettingsManager,
): void {
  ipcMain.handle(DesktopChannels.terminalCreate, (event, rawSize: unknown) =>
    createTerminal(
      event,
      parseCreateOptions(rawSize),
      resolveWorkspace,
      evaluationQueue,
      attentionSettings,
    ),
  );
  attentionSettings.onSettingsChanged((settings) => {
    for (const terminal of sessions.values()) terminal.attention.updateAttentionSettings(settings);
  });
  ipcMain.handle(DesktopChannels.terminalReady, (event, rawId: unknown) => {
    const terminal = requireOwnedSession(event, rawId);
    if (terminal.ready) return;
    terminal.ready = true;
    if (terminal.buffer) {
      terminal.owner.send(DesktopChannels.terminalData, {
        sessionId: terminal.id,
        data: terminal.buffer,
      });
      terminal.buffer = "";
    }
  });
  ipcMain.handle(DesktopChannels.terminalWrite, (event, rawId: unknown, rawData: unknown) => {
    if (typeof rawData !== "string" || rawData.length > MAX_WRITE_LENGTH) {
      throw new TypeError("Terminal input must be a string no larger than 1 MiB");
    }
    const terminal = requireOwnedSession(event, rawId);
    terminal.attention.observeInput();
    terminal.process.write(rawData);
  });
  ipcMain.handle(DesktopChannels.terminalResize, (event, rawId: unknown, rawSize: unknown) => {
    const size = parseSize(rawSize);
    requireOwnedSession(event, rawId).process.resize(size.cols, size.rows);
  });
  ipcMain.handle(DesktopChannels.terminalSetActive, (event, rawId: unknown, active: unknown) => {
    if (typeof active !== "boolean") {
      throw new TypeError("Terminal active state must be a boolean");
    }
    requireOwnedSession(event, rawId).attention.setActive(active);
  });
  ipcMain.handle(
    DesktopChannels.terminalSetMonitorMode,
    (event, rawId: unknown, rawMode: unknown) => {
      if (!isTerminalMonitorMode(rawMode)) throw new TypeError("Unsupported terminal monitor mode");
      const terminal = requireOwnedSession(event, rawId);
      attentionSettings.setTerminalMode(terminal.profileKey, rawMode);
      terminal.attention.setMonitorMode(rawMode);
    },
  );
  ipcMain.handle(DesktopChannels.terminalDismissAttention, (event, rawId: unknown) => {
    requireOwnedSession(event, rawId).attention.dismiss();
  });
  ipcMain.handle(DesktopChannels.terminalClose, (event, rawId: unknown) => {
    closeSession(requireOwnedSession(event, rawId));
  });
}

function createTerminal(
  event: IpcMainInvokeEvent,
  options: TerminalCreateOptions,
  resolveWorkspace: (id: unknown) => string,
  evaluationQueue: JevEvaluationQueue,
  attentionSettings: AttentionSettingsManager,
): TerminalSession {
  observeOwner(event.sender);
  const command = prepareShellIntegration(resolveShell(options.shell), cleanEnvironment());
  const cwd = resolveWorkspace(options.workspaceId);
  const profileKey = terminalProfileKey(cwd, options.tabTitle, options.paneTitle);
  const monitorMode = attentionSettings.getTerminalMode(profileKey);
  let process: IPty;
  try {
    process = spawn(command.file, command.args, {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd,
      env: command.env,
    });
  } catch (error) {
    command.cleanup();
    throw error;
  }

  const terminalId = randomUUID();
  const attention = new AttentionRouter(
    terminalId,
    (state) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(DesktopChannels.terminalAttention, state);
      }
    },
    { cwd, evaluationQueue, attentionSettings: attentionSettings.getSettings(), monitorMode },
  );
  const terminal: OwnedTerminal = {
    id: terminalId,
    ownerId: event.sender.id,
    owner: event.sender,
    process,
    ready: false,
    buffer: "",
    attention,
    profileKey,
    cleanup: command.cleanup,
    stopProcessMonitor: () => {},
  };
  sessions.set(terminal.id, terminal);
  const processMonitor = setInterval(() => {
    void inspectForegroundProcess(process.pid).then((snapshot) => {
      if (!sessions.has(terminal.id) || !snapshot) return;
      terminal.attention.observeProcess(snapshot.process, snapshot.tree);
    });
  }, 1_000);
  processMonitor.unref();
  terminal.stopProcessMonitor = () => clearInterval(processMonitor);

  process.onData((data) => {
    terminal.attention.observeOutput(data);
    if (!sessions.has(terminal.id)) return;
    if (!terminal.ready) {
      terminal.buffer = `${terminal.buffer}${data}`.slice(-MAX_BUFFER_LENGTH);
      return;
    }
    if (!terminal.owner.isDestroyed()) {
      terminal.owner.send(DesktopChannels.terminalData, { sessionId: terminal.id, data });
    }
  });
  process.onExit(({ exitCode, signal }) => {
    if (!sessions.delete(terminal.id)) return;
    terminal.attention.observeSessionExit(exitCode);
    terminal.stopProcessMonitor();
    terminal.attention.dispose();
    terminal.cleanup();
    if (terminal.owner.isDestroyed()) return;
    const payload: TerminalExitEvent = {
      sessionId: terminal.id,
      exitCode,
      ...(signal === undefined ? {} : { signal }),
    };
    terminal.owner.send(DesktopChannels.terminalExit, payload);
  });

  return { id: terminal.id, shell: basename(command.file), cwd, monitorMode };
}

function terminalProfileKey(
  cwd: string,
  tabTitle: string | undefined,
  paneTitle: string | undefined,
): string {
  return createHash("sha256")
    .update(JSON.stringify([cwd, tabTitle ?? "", paneTitle ?? ""]))
    .digest("hex");
}

function observeOwner(owner: WebContents): void {
  if (observedOwners.has(owner.id)) return;
  observedOwners.add(owner.id);
  owner.once("destroyed", () => {
    for (const terminal of sessions.values()) {
      if (terminal.ownerId === owner.id) closeSession(terminal);
    }
    observedOwners.delete(owner.id);
  });
}

function requireOwnedSession(event: IpcMainInvokeEvent, rawId: unknown): OwnedTerminal {
  if (typeof rawId !== "string") throw new TypeError("Terminal session id must be a string");
  const terminal = sessions.get(rawId);
  if (!terminal || terminal.ownerId !== event.sender.id) {
    throw new Error("Unknown terminal session for this window");
  }
  return terminal;
}

function closeSession(terminal: OwnedTerminal): void {
  if (!sessions.delete(terminal.id)) return;
  terminal.stopProcessMonitor();
  terminal.attention.dispose();
  terminal.process.kill();
  terminal.cleanup();
}

function parseCreateOptions(raw: unknown): TerminalCreateOptions {
  if (!raw || typeof raw !== "object") throw new TypeError("Terminal options are required");
  const { workspaceId, shell, tabTitle, paneTitle, ...size } =
    raw as Partial<TerminalCreateOptions>;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new TypeError("A registered workspace is required");
  }
  if (shell !== undefined && !["system", "zsh", "bash", "fish"].includes(shell)) {
    throw new TypeError("Unsupported terminal shell");
  }
  for (const title of [tabTitle, paneTitle]) {
    if (title !== undefined && (typeof title !== "string" || title.length > 120)) {
      throw new TypeError("Terminal profile titles must be strings no longer than 120 characters");
    }
  }
  return {
    workspaceId,
    ...(shell === undefined ? {} : { shell }),
    ...(tabTitle === undefined ? {} : { tabTitle }),
    ...(paneTitle === undefined ? {} : { paneTitle }),
    ...parseSize(size),
  };
}

function parseSize(raw: unknown): TerminalResize {
  if (!raw || typeof raw !== "object") throw new TypeError("Terminal size is required");
  const { cols, rows } = raw as Partial<TerminalResize>;
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols! < 2 ||
    cols! > 1000 ||
    rows! < 1 ||
    rows! > 500
  ) {
    throw new RangeError("Terminal size is outside the supported range");
  }
  return { cols: cols!, rows: rows! };
}

function resolveShell(preferred: TerminalCreateOptions["shell"]): { file: string; args: string[] } {
  if (preferred === "zsh") return { file: "/usr/bin/zsh", args: ["-l"] };
  if (preferred === "bash") return { file: "/bin/bash", args: ["-l"] };
  if (preferred === "fish") return { file: "/usr/bin/fish", args: ["-l"] };
  if (process.platform === "win32") {
    return { file: process.env.COMSPEC || "powershell.exe", args: [] };
  }
  return { file: process.env.SHELL || "/bin/bash", args: ["-l"] };
}

function cleanEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "TYPESAFE_API_KEY",
    ),
  );
}
