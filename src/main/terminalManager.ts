import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { spawn, type IPty } from "node-pty";

import {
  DesktopChannels,
  type TerminalExitEvent,
  type TerminalCreateOptions,
  type TerminalResize,
  type TerminalSession,
} from "../shared/desktop.js";

const MAX_BUFFER_LENGTH = 64 * 1024;
const MAX_WRITE_LENGTH = 1024 * 1024;

interface OwnedTerminal {
  id: string;
  ownerId: number;
  owner: WebContents;
  process: IPty;
  ready: boolean;
  buffer: string;
}

const sessions = new Map<string, OwnedTerminal>();
const observedOwners = new Set<number>();

export function registerTerminalIpc(resolveWorkspace: (id: unknown) => string): void {
  ipcMain.handle(DesktopChannels.terminalCreate, (event, rawSize: unknown) =>
    createTerminal(event, parseCreateOptions(rawSize), resolveWorkspace),
  );
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
    requireOwnedSession(event, rawId).process.write(rawData);
  });
  ipcMain.handle(DesktopChannels.terminalResize, (event, rawId: unknown, rawSize: unknown) => {
    const size = parseSize(rawSize);
    requireOwnedSession(event, rawId).process.resize(size.cols, size.rows);
  });
  ipcMain.handle(DesktopChannels.terminalClose, (event, rawId: unknown) => {
    closeSession(requireOwnedSession(event, rawId));
  });
}

function createTerminal(
  event: IpcMainInvokeEvent,
  options: TerminalCreateOptions,
  resolveWorkspace: (id: unknown) => string,
): TerminalSession {
  observeOwner(event.sender);
  const command = resolveShell(options.shell);
  const cwd = resolveWorkspace(options.workspaceId);
  const process = spawn(command.file, command.args, {
    name: "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd,
    env: cleanEnvironment(),
  });
  const terminal: OwnedTerminal = {
    id: randomUUID(),
    ownerId: event.sender.id,
    owner: event.sender,
    process,
    ready: false,
    buffer: "",
  };
  sessions.set(terminal.id, terminal);

  process.onData((data) => {
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
    if (!sessions.delete(terminal.id) || terminal.owner.isDestroyed()) return;
    const payload: TerminalExitEvent = {
      sessionId: terminal.id,
      exitCode,
      ...(signal === undefined ? {} : { signal }),
    };
    terminal.owner.send(DesktopChannels.terminalExit, payload);
  });

  return { id: terminal.id, shell: basename(command.file), cwd };
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
  terminal.process.kill();
}

function parseCreateOptions(raw: unknown): TerminalCreateOptions {
  if (!raw || typeof raw !== "object") throw new TypeError("Terminal options are required");
  const { workspaceId, shell, ...size } = raw as Partial<TerminalCreateOptions>;
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new TypeError("A registered workspace is required");
  }
  if (shell !== undefined && !["system", "zsh", "bash", "fish"].includes(shell)) {
    throw new TypeError("Unsupported terminal shell");
  }
  return { workspaceId, ...(shell === undefined ? {} : { shell }), ...parseSize(size) };
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
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
