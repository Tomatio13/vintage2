import type {
  ActivityEntry,
  WorkspaceAdapter,
  WorkspaceEvent,
  WorkspaceMessage,
  WorkspaceSnapshot,
  WorkspaceTask,
} from "../../shared/workspace.js";

export interface WorkspaceControllerState extends WorkspaceSnapshot {
  initialized: boolean;
  activeRunId: string | null;
}

type Listener = () => void;

const EMPTY_STATE: WorkspaceControllerState = {
  initialized: false,
  tasks: [],
  activeTaskId: null,
  messages: [],
  activities: [],
  activeRunId: null,
};

export class WorkspaceController {
  #state = EMPTY_STATE;
  #listeners = new Set<Listener>();
  #abortController: AbortController | null = null;
  #submissionPending = false;

  constructor(private readonly adapter: WorkspaceAdapter) {}

  getSnapshot = (): WorkspaceControllerState => this.#state;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    const snapshot = await this.adapter.initialize();
    this.#setState({ ...snapshot, initialized: true, activeRunId: null });
  }

  async createTask(): Promise<void> {
    const task = await this.adapter.createTask();
    this.#setState({
      ...this.#state,
      tasks: [task, ...this.#state.tasks],
      activeTaskId: task.id,
    });
  }

  selectTask(taskId: string): void {
    if (!this.#state.tasks.some((task) => task.id === taskId)) return;
    this.#setState({ ...this.#state, activeTaskId: taskId });
  }

  async submitPrompt(text: string): Promise<void> {
    const taskId = this.#state.activeTaskId;
    const normalized = text.trim();
    if (!taskId || !normalized || this.#state.activeRunId || this.#submissionPending) return;

    this.#submissionPending = true;
    this.#abortController = new AbortController();
    try {
      for await (const event of this.adapter.runPrompt({
        taskId,
        text: normalized,
        signal: this.#abortController.signal,
      })) {
        this.#applyEvent(event);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Unknown adapter error";
      const activeRunId = this.#state.activeRunId;
      if (activeRunId)
        this.#applyEvent({ type: "run.failed", runId: activeRunId, taskId, error: message });
    } finally {
      this.#submissionPending = false;
      this.#abortController = null;
    }
  }

  cancelRun(): void {
    if (!this.#state.activeRunId) return;
    this.#abortController?.abort();
    this.#setState({
      ...this.#state,
      activeRunId: null,
      tasks: updateTask(this.#state.tasks, this.#state.activeTaskId, { status: "idle" }),
      messages: this.#state.messages.map((message) =>
        message.streaming ? { ...message, streaming: false } : message,
      ),
      activities: [
        ...this.#state.activities,
        activity(this.#state.activeTaskId, "info", "Run cancelled"),
      ],
    });
  }

  #applyEvent(event: WorkspaceEvent): void {
    if (event.type !== "run.started" && event.runId !== this.#state.activeRunId) return;

    if (event.type === "run.started") {
      if (this.#state.activeRunId) return;
      this.#setState({
        ...this.#state,
        activeRunId: event.runId,
        tasks: updateTask(this.#state.tasks, event.taskId, { status: "running" }),
        messages: [...this.#state.messages, event.userMessage, event.assistantMessage],
        activities: [...this.#state.activities, activity(event.taskId, "info", "Run started")],
      });
      return;
    }

    if (event.type === "run.delta") {
      const messages = [...this.#state.messages];
      const index = findStreamingMessageIndex(messages, event.taskId);
      if (index >= 0) {
        const current = messages[index];
        if (current) messages[index] = { ...current, content: current.content + event.delta };
      }
      this.#setState({ ...this.#state, messages });
      return;
    }

    const failed = event.type === "run.failed";
    this.#setState({
      ...this.#state,
      activeRunId: null,
      tasks: updateTask(this.#state.tasks, event.taskId, {
        status: failed ? "failed" : "completed",
      }),
      messages: this.#state.messages.map((message) =>
        message.taskId === event.taskId && message.streaming
          ? { ...message, streaming: false }
          : message,
      ),
      activities: [
        ...this.#state.activities,
        activity(
          event.taskId,
          failed ? "error" : "success",
          failed ? event.error : "Run completed",
        ),
      ],
    });
  }

  #setState(state: WorkspaceControllerState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

function findStreamingMessageIndex(messages: WorkspaceMessage[], taskId: string): number {
  return messages.findLastIndex((message) => message.taskId === taskId && message.streaming);
}

function updateTask(
  tasks: WorkspaceTask[],
  taskId: string | null,
  patch: Partial<WorkspaceTask>,
): WorkspaceTask[] {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, ...patch, updatedAt: Date.now() } : task,
  );
}

function activity(
  taskId: string | null,
  level: ActivityEntry["level"],
  message: string,
): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    taskId: taskId ?? "unknown",
    level,
    message,
    createdAt: Date.now(),
  };
}
