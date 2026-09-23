import { lstat, realpath } from "node:fs/promises";

import type {
  PersistedWorkspace,
  RestoredWorkspace,
  RegisteredWorkspace,
} from "../shared/desktop.js";

export interface RestoredProjects {
  projects: RestoredWorkspace[];
  registered: RegisteredWorkspace[];
}

export async function restoreSavedProjects(
  savedProjects: PersistedWorkspace[],
  homePath: string,
): Promise<RestoredProjects> {
  const seenPaths = new Set([homePath]);
  const projects: RestoredWorkspace[] = [];
  const registered: RegisteredWorkspace[] = [];

  for (const project of savedProjects) {
    try {
      const path = await realpath(project.path);
      if (!(await lstat(path)).isDirectory() || seenPaths.has(path)) {
        projects.push({ ...project, available: false });
        continue;
      }
      seenPaths.add(path);
      const workspace: RegisteredWorkspace = { ...project, path };
      registered.push(workspace);
      projects.push({ ...project, path, available: true });
    } catch {
      projects.push({ ...project, available: false });
    }
  }

  return { projects, registered };
}
