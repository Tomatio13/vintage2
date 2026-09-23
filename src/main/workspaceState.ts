import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import type {
  PersistedWorkspace,
  WorkspacePaneLayoutSnapshot,
  WorkspacePaneSnapshot,
  WorkspaceSpaceSnapshot,
  WorkspaceStateSnapshot,
} from "../shared/desktop.js";

const STATE_FILE = "workspace-state.json";
const STATE_VERSION = 1;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_WORKSPACES = 128;
const MAX_SPACES_PER_WORKSPACE = 256;
const MAX_PANES_PER_SPACE = 64;
const MAX_LAYOUT_DEPTH = 8;
const PERSIST_DELAY_MS = 250;
const MIN_SPLIT_RATIO = 0.15;
const MAX_SPLIT_RATIO = 0.85;

const emptyState = (): WorkspaceStateSnapshot => ({
  version: STATE_VERSION,
  workspaces: [],
  activeWorkspaceId: null,
});

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, name: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    value.includes("\0")
  ) {
    throw new TypeError(
      `${name} must be a non-empty string no longer than ${maxLength} characters`,
    );
  }
  return value;
}

function parsePane(value: unknown): WorkspacePaneSnapshot {
  if (!record(value)) throw new TypeError("Workspace pane must be an object");
  const id = requiredString(value.id, "Pane id", 120);
  const title = requiredString(value.title, "Pane title", 255);
  if (value.kind === "terminal") return { id, title, kind: "terminal" };
  if (value.kind === "file") {
    const path = requiredString(value.path, "File pane path", 4_096);
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new TypeError("File pane path must be a normalized relative path");
    }
    return { id, title, kind: "file", path };
  }
  throw new TypeError("Unsupported workspace pane kind");
}

function parseLayout(value: unknown, depth = 0): WorkspacePaneLayoutSnapshot {
  if (!record(value)) throw new TypeError("Workspace pane layout must be an object");
  if (value.type === "pane") {
    return { type: "pane", paneId: requiredString(value.paneId, "Pane reference", 120) };
  }
  if (value.type !== "split" || depth >= MAX_LAYOUT_DEPTH) {
    throw new TypeError("Workspace pane layout is invalid or too deeply nested");
  }
  const splitId = requiredString(value.splitId, "Split id", 120);
  if (value.axis !== "horizontal" && value.axis !== "vertical") {
    throw new TypeError("Workspace split axis is invalid");
  }
  if (
    typeof value.ratio !== "number" ||
    !Number.isFinite(value.ratio) ||
    value.ratio < MIN_SPLIT_RATIO ||
    value.ratio > MAX_SPLIT_RATIO
  ) {
    throw new RangeError("Workspace split ratio is outside the supported range");
  }
  return {
    type: "split",
    splitId,
    axis: value.axis,
    ratio: value.ratio,
    first: parseLayout(value.first, depth + 1),
    second: parseLayout(value.second, depth + 1),
  };
}

function paneReferences(layout: WorkspacePaneLayoutSnapshot): string[] {
  if (layout.type === "pane") return [layout.paneId];
  return [...paneReferences(layout.first), ...paneReferences(layout.second)];
}

function parseSpace(value: unknown): WorkspaceSpaceSnapshot {
  if (!record(value)) throw new TypeError("Workspace Space must be an object");
  const id = requiredString(value.id, "Space id", 120);
  const title = requiredString(value.title, "Space title", 255);
  if (
    !Array.isArray(value.panes) ||
    value.panes.length === 0 ||
    value.panes.length > MAX_PANES_PER_SPACE
  ) {
    throw new RangeError(`A Space must contain between 1 and ${MAX_PANES_PER_SPACE} panes`);
  }
  const panes = value.panes.map(parsePane);
  const paneIds = panes.map((pane) => pane.id);
  if (new Set(paneIds).size !== paneIds.length)
    throw new TypeError("Workspace pane ids must be unique");
  const layout = parseLayout(value.layout);
  const layoutPaneIds = paneReferences(layout);
  if (
    new Set(layoutPaneIds).size !== layoutPaneIds.length ||
    layoutPaneIds.length !== paneIds.length ||
    layoutPaneIds.some((paneId) => !paneIds.includes(paneId))
  ) {
    throw new TypeError("Workspace pane layout must reference every pane exactly once");
  }
  const activePaneId = requiredString(value.activePaneId, "Active pane id", 120);
  if (!paneIds.includes(activePaneId)) throw new TypeError("Active pane must belong to its Space");
  return { id, title, panes, layout, activePaneId };
}

function parseWorkspace(value: unknown): PersistedWorkspace {
  if (!record(value)) throw new TypeError("Workspace must be an object");
  const id = requiredString(value.id, "Workspace id", 120);
  const name = requiredString(value.name, "Workspace name", 255);
  const path = requiredString(value.path, "Workspace path", 4_096);
  if (!isAbsolute(path)) throw new TypeError("Workspace path must be absolute");
  if (value.kind !== "home" && value.kind !== "project") {
    throw new TypeError("Unsupported workspace kind");
  }
  if (!Array.isArray(value.tabs) || value.tabs.length > MAX_SPACES_PER_WORKSPACE) {
    throw new RangeError(`A workspace cannot contain more than ${MAX_SPACES_PER_WORKSPACE} Spaces`);
  }
  const tabs = value.tabs.map(parseSpace);
  const tabIds = tabs.map((tab) => tab.id);
  if (new Set(tabIds).size !== tabIds.length)
    throw new TypeError("Space ids must be unique per workspace");
  const activeTabId =
    value.activeTabId === "" && tabs.length === 0
      ? ""
      : requiredString(value.activeTabId, "Active Space id", 120);
  if (activeTabId && !tabIds.includes(activeTabId)) {
    throw new TypeError("Active Space must belong to its workspace");
  }
  if (value.kind === "home" && id !== "vintage:home") {
    throw new TypeError("Home workspace id is invalid");
  }
  if (value.kind === "project" && id === "vintage:home") {
    throw new TypeError("Project workspace id is reserved for Home");
  }
  return { id, name, path, kind: value.kind, tabs, activeTabId };
}

export function parseWorkspaceState(value: unknown): WorkspaceStateSnapshot {
  if (!record(value) || value.version !== STATE_VERSION || !Array.isArray(value.workspaces)) {
    throw new TypeError("Workspace state version or shape is unsupported");
  }
  if (value.workspaces.length > MAX_WORKSPACES) {
    throw new RangeError(`Workspace state cannot contain more than ${MAX_WORKSPACES} workspaces`);
  }
  const workspaces = value.workspaces.map(parseWorkspace);
  const ids = workspaces.map((workspace) => workspace.id);
  if (new Set(ids).size !== ids.length) throw new TypeError("Workspace ids must be unique");
  if (workspaces.filter((workspace) => workspace.kind === "home").length > 1) {
    throw new TypeError("Workspace state can contain only one Home workspace");
  }
  const activeWorkspaceId =
    value.activeWorkspaceId === null
      ? null
      : requiredString(value.activeWorkspaceId, "Active workspace id", 120);
  if (activeWorkspaceId && !ids.includes(activeWorkspaceId)) {
    throw new TypeError("Active workspace must exist in workspace state");
  }
  return { version: STATE_VERSION, workspaces, activeWorkspaceId };
}

export class WorkspaceStateManager {
  private readonly path: string;
  private state = emptyState();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly directory: string) {
    this.path = join(directory, STATE_FILE);
  }

  initialize(): WorkspaceStateSnapshot {
    if (!existsSync(this.path)) return this.getState();
    try {
      const contents = readFileSync(this.path, "utf8");
      if (Buffer.byteLength(contents, "utf8") > MAX_STATE_BYTES) {
        throw new RangeError("Workspace state file is too large");
      }
      this.state = parseWorkspaceState(JSON.parse(contents) as unknown);
    } catch (error) {
      console.error("Unable to load saved workspace state; starting with a fresh state.", error);
      this.state = emptyState();
    }
    return this.getState();
  }

  getState(): WorkspaceStateSnapshot {
    return JSON.parse(JSON.stringify(this.state)) as WorkspaceStateSnapshot;
  }

  saveState(value: unknown): void {
    this.state = parseWorkspaceState(value);
    this.scheduleFlush();
  }

  relocateProject(workspaceId: string, path: string, name: string): void {
    const workspace = this.state.workspaces.find(
      (item) => item.id === workspaceId && item.kind === "project",
    );
    if (!workspace) throw new Error("Unknown saved Project");
    const nextPath = requiredString(path, "Workspace path", 4_096);
    if (!isAbsolute(nextPath)) throw new TypeError("Workspace path must be absolute");
    workspace.path = nextPath;
    workspace.name = requiredString(name, "Workspace name", 255);
    this.scheduleFlush();
  }

  flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.persist();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.persist();
    }, PERSIST_DELAY_MS);
  }

  private persist(): void {
    const temporaryPath = `${this.path}.tmp`;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      writeFileSync(temporaryPath, JSON.stringify(this.state), {
        encoding: "utf8",
        mode: 0o600,
      });
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, this.path);
      chmodSync(this.path, 0o600);
    } catch (error) {
      console.error("Unable to save workspace state.", error);
    }
  }
}
