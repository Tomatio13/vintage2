import type {
  PromptRunInput,
  WorkspaceAdapter,
  WorkspaceEvent,
  WorkspaceSnapshot,
  WorkspaceTask,
} from "../../shared/workspace.js";

export interface MockWorkspaceAdapterOptions {
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
  id?: () => string;
}

function defaultDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("The operation was aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function createMockWorkspaceAdapter(
  options: MockWorkspaceAdapterOptions = {},
): WorkspaceAdapter {
  const delay = options.delay ?? defaultDelay;
  const now = options.now ?? Date.now;
  const id = options.id ?? (() => crypto.randomUUID());
  const tasks: WorkspaceTask[] = [
    { id: "welcome-task", title: "Explore the starter", status: "idle", updatedAt: now() },
  ];

  return {
    async initialize(): Promise<WorkspaceSnapshot> {
      return {
        tasks: [...tasks],
        activeTaskId: tasks[0]?.id ?? null,
        messages: [],
        activities: [],
      };
    },
    async createTask(title = "Untitled task"): Promise<WorkspaceTask> {
      const task = { id: id(), title, status: "idle" as const, updatedAt: now() };
      tasks.unshift(task);
      return task;
    },
    async *runPrompt(input: PromptRunInput): AsyncIterable<WorkspaceEvent> {
      const runId = id();
      const timestamp = now();
      yield {
        type: "run.started",
        runId,
        taskId: input.taskId,
        userMessage: {
          id: id(),
          taskId: input.taskId,
          role: "user",
          content: input.text,
          createdAt: timestamp,
        },
        assistantMessage: {
          id: id(),
          taskId: input.taskId,
          role: "assistant",
          content: "",
          createdAt: timestamp + 1,
          streaming: true,
        },
      };

      const response = [
        "This is a deterministic mock response. ",
        "Replace `WorkspaceAdapter` with your HTTP, WebSocket, or SSE integration. ",
        `I received: “${input.text}”`,
      ];
      for (const delta of response) {
        await delay(180, input.signal);
        if (input.signal.aborted) return;
        yield { type: "run.delta", runId, taskId: input.taskId, delta };
      }
      yield { type: "run.completed", runId, taskId: input.taskId };
    },
  };
}
