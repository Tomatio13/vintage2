import { describe, expect, it } from "vitest";

import { WorkspaceController } from "../src/renderer/runtime/WorkspaceController.js";
import type { WorkspaceAdapter, WorkspaceEvent } from "../src/shared/workspace.js";

describe("WorkspaceController cancellation", () => {
  it("ignores late deltas after an active run is cancelled", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter: WorkspaceAdapter = {
      async initialize() {
        return {
          tasks: [{ id: "task", title: "Task", status: "idle", updatedAt: 1 }],
          activeTaskId: "task",
          messages: [],
          activities: [],
        };
      },
      async createTask() {
        throw new Error("not used");
      },
      async *runPrompt(): AsyncIterable<WorkspaceEvent> {
        yield {
          type: "run.started",
          runId: "run",
          taskId: "task",
          userMessage: { id: "user", taskId: "task", role: "user", content: "hello", createdAt: 1 },
          assistantMessage: {
            id: "assistant",
            taskId: "task",
            role: "assistant",
            content: "",
            createdAt: 2,
            streaming: true,
          },
        };
        await gate;
        yield { type: "run.delta", runId: "run", taskId: "task", delta: "late" };
        yield { type: "run.completed", runId: "run", taskId: "task" };
      },
    };

    const controller = new WorkspaceController(adapter);
    await controller.initialize();
    const submission = controller.submitPrompt("hello");
    await Promise.resolve();
    await Promise.resolve();
    controller.cancelRun();
    release?.();
    await submission;

    const state = controller.getSnapshot();
    expect(state.activeRunId).toBeNull();
    expect(state.tasks[0]?.status).toBe("idle");
    expect(state.messages[1]?.content).toBe("");
    expect(state.activities.at(-1)?.message).toBe("Run cancelled");
  });
});
