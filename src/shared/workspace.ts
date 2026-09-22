export type TaskStatus = "idle" | "running" | "completed" | "failed";
export type MessageRole = "user" | "assistant";

export interface WorkspaceTask {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: number;
}

export interface WorkspaceMessage {
  id: string;
  taskId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  streaming?: boolean;
}

export interface ActivityEntry {
  id: string;
  taskId: string;
  level: "info" | "success" | "error";
  message: string;
  createdAt: number;
}

export interface WorkspaceSnapshot {
  tasks: WorkspaceTask[];
  activeTaskId: string | null;
  messages: WorkspaceMessage[];
  activities: ActivityEntry[];
}

export interface PromptRunInput {
  taskId: string;
  text: string;
  signal: AbortSignal;
}

export type WorkspaceEvent =
  | {
      type: "run.started";
      runId: string;
      taskId: string;
      userMessage: WorkspaceMessage;
      assistantMessage: WorkspaceMessage;
    }
  | { type: "run.delta"; runId: string; taskId: string; delta: string }
  | { type: "run.completed"; runId: string; taskId: string }
  | { type: "run.failed"; runId: string; taskId: string; error: string };

export interface WorkspaceAdapter {
  initialize(): Promise<WorkspaceSnapshot>;
  createTask(title?: string): Promise<WorkspaceTask>;
  runPrompt(input: PromptRunInput): AsyncIterable<WorkspaceEvent>;
}
