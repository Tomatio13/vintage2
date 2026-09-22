import { describe, expect, it } from "vitest";

import { createMockWorkspaceAdapter } from "../src/renderer/adapters/mockWorkspaceAdapter.js";
import { WorkspaceController } from "../src/renderer/runtime/WorkspaceController.js";

function deterministicAdapter() {
  let sequence = 0;
  return createMockWorkspaceAdapter({
    delay: async () => {},
    now: () => 1_700_000_000_000 + sequence,
    id: () => `id-${++sequence}`,
  });
}

describe("WorkspaceController", () => {
  it("projects a prompt stream into one completed task", async () => {
    const controller = new WorkspaceController(deterministicAdapter());
    await controller.initialize();
    await controller.submitPrompt("Design a calm workspace");

    const state = controller.getSnapshot();
    expect(state.activeRunId).toBeNull();
    expect(state.tasks[0]?.status).toBe("completed");
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.content).toBe("Design a calm workspace");
    expect(state.messages[1]?.content).toContain("Replace `WorkspaceAdapter`");
    expect(state.activities.map((entry) => entry.message)).toEqual([
      "Run started",
      "Run completed",
    ]);
  });

  it("creates and selects a new task", async () => {
    const controller = new WorkspaceController(deterministicAdapter());
    await controller.initialize();
    const original = controller.getSnapshot().activeTaskId;
    await controller.createTask();
    expect(controller.getSnapshot().tasks).toHaveLength(2);
    expect(controller.getSnapshot().activeTaskId).not.toBe(original);
  });
});
