import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { WorkspaceAdapter } from "../../shared/workspace.js";
import { WorkspaceController, type WorkspaceControllerState } from "./WorkspaceController.js";

const WorkspaceContext = createContext<WorkspaceController | null>(null);

export function WorkspaceProvider({
  adapter,
  children,
}: {
  adapter: WorkspaceAdapter;
  children: ReactNode;
}) {
  const controller = useMemo(() => new WorkspaceController(adapter), [adapter]);
  useEffect(() => {
    void controller.initialize();
    return () => controller.cancelRun();
  }, [controller]);
  return <WorkspaceContext.Provider value={controller}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceController(): WorkspaceController {
  const controller = useContext(WorkspaceContext);
  if (!controller) throw new Error("useWorkspaceController must be used inside WorkspaceProvider");
  return controller;
}

export function useWorkspaceState(): WorkspaceControllerState {
  const controller = useWorkspaceController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
