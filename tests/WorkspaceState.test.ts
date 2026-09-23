import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedWorkspace, WorkspaceStateSnapshot } from "../src/shared/desktop.js";
import { restoreSavedProjects } from "../src/main/workspaceRestore.js";
import { parseWorkspaceState, WorkspaceStateManager } from "../src/main/workspaceState.js";

function sampleState(path: string): WorkspaceStateSnapshot {
  const terminalPane = { id: "terminal-1", title: "Terminal 1", kind: "terminal" as const };
  const filePane = {
    id: "file-1",
    title: "notes.md",
    kind: "file" as const,
    path: "docs/notes.md",
  };
  return {
    version: 1,
    activeWorkspaceId: "project-1",
    workspaces: [
      {
        id: "vintage:home",
        name: "Home",
        path: "/home/test",
        kind: "home",
        tabs: [
          {
            id: "home-space",
            title: "Home Space",
            panes: [{ id: "home-terminal", title: "Terminal 1", kind: "terminal" }],
            layout: { type: "pane", paneId: "home-terminal" },
            activePaneId: "home-terminal",
          },
        ],
        activeTabId: "home-space",
      },
      {
        id: "project-1",
        name: "project",
        path,
        kind: "project",
        tabs: [
          {
            id: "space-1",
            title: "Backend",
            panes: [terminalPane, filePane],
            layout: {
              type: "split",
              splitId: "split-1",
              axis: "horizontal",
              ratio: 0.63,
              first: { type: "pane", paneId: terminalPane.id },
              second: { type: "pane", paneId: filePane.id },
            },
            activePaneId: filePane.id,
          },
        ],
        activeTabId: "space-1",
      },
    ],
  };
}

describe("WorkspaceStateManager", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vintage-workspace-state-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it("persists Projects, Spaces, files, split ratios, and active selections", () => {
    const state = sampleState("/workspace/project");
    const manager = new WorkspaceStateManager(directory);
    manager.initialize();
    manager.saveState(state);
    manager.flush();

    const restored = new WorkspaceStateManager(directory);
    restored.initialize();
    expect(restored.getState()).toEqual(state);
  });

  it("preserves a missing Project and its Spaces for folder relinking", async () => {
    const directoryPath = join(directory, "project");
    mkdirSync(directoryPath);
    const state = sampleState(directoryPath);
    const project = state.workspaces.find((workspace) => workspace.kind === "project")!;
    const restored = await restoreSavedProjects([project], "/home/test");

    expect(restored.registered).toHaveLength(1);
    expect(restored.projects[0]).toMatchObject({
      id: "project-1",
      available: true,
      tabs: project.tabs,
    });

    rmSync(directoryPath, { recursive: true, force: true });
    const missing = await restoreSavedProjects([project], "/home/test");
    expect(missing.registered).toEqual([]);
    expect(missing.projects[0]).toMatchObject({
      id: "project-1",
      path: directoryPath,
      available: false,
      tabs: project.tabs,
    });
  });

  it("retains the saved Space layout when a Project is relocated", () => {
    const state = sampleState("/workspace/old-project");
    const manager = new WorkspaceStateManager(directory);
    manager.initialize();
    manager.saveState(state);
    manager.flush();

    manager.relocateProject("project-1", "/workspace/new-project", "new-project");
    manager.flush();

    const restored = new WorkspaceStateManager(directory);
    restored.initialize();
    expect(restored.getState().workspaces[1]).toMatchObject({
      path: "/workspace/new-project",
      name: "new-project",
      tabs: state.workspaces[1]!.tabs,
      activeTabId: "space-1",
    });
  });

  it("rejects unsafe paths, invalid pane references, and unsupported versions", () => {
    const state = sampleState("/workspace/project");
    const project = state.workspaces[1]!;
    const file = project.tabs[0]!.panes[1]!;
    if (file.kind === "file") file.path = "../outside.txt";
    expect(() => parseWorkspaceState(state)).toThrow("normalized relative path");

    expect(() => parseWorkspaceState({ ...sampleState("/workspace/project"), version: 2 })).toThrow(
      "unsupported",
    );
  });

  it("starts with an empty state when the saved JSON is corrupt", () => {
    writeFileSync(join(directory, "workspace-state.json"), "{not json");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const manager = new WorkspaceStateManager(directory);
    expect(manager.initialize()).toEqual({ version: 1, workspaces: [], activeWorkspaceId: null });
  });

  it("does not delete a Project directory when its saved entry is removed", () => {
    const projectPath = join(directory, "project-on-disk");
    mkdirSync(projectPath);
    const project: PersistedWorkspace = {
      id: "project-1",
      name: "project-on-disk",
      path: projectPath,
      kind: "project",
      tabs: [],
      activeTabId: "",
    };
    const manager = new WorkspaceStateManager(directory);
    manager.initialize();
    manager.saveState({ version: 1, workspaces: [project], activeWorkspaceId: null });
    manager.flush();
    manager.saveState({ version: 1, workspaces: [], activeWorkspaceId: null });
    manager.flush();

    expect(existsSync(projectPath)).toBe(true);
    expect(new WorkspaceStateManager(directory).initialize().workspaces).toEqual([]);
  });
});
