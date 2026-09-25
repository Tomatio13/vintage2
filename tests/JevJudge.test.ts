import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  buildJevState,
  createJevEvaluator,
  JevEvaluationService,
  normalizeOutputForJev,
  semanticHashForState,
} from "../src/main/jevJudge.js";

function clientWith(response: unknown) {
  return {
    systemOne: vi.fn().mockResolvedValue(response),
  } as unknown as TypeSafeClient;
}

const response = {
  model: "jev-test",
  usage: { input_tokens: 10, output_tokens: 4 },
  answers: {
    failed: { type: "noul", noul: 0.1 },
    needsUserInput: { type: "noul", noul: 0.9 },
    turnFinished: { type: "noul", noul: 0.1 },
    warning: { type: "noul", noul: 0.1 },
    processActive: { type: "noul", noul: 0.1 },
    agentActive: { type: "noul", noul: 0.1 },
    waitingExternal: { type: "noul", noul: 0.1 },
    attention: {
      type: "score",
      score: 2.4,
      confidence: 0.8,
      legend: {},
      probabilities: { 2: 0.6, 3: 0.4 },
    },
    actionRequired: { type: "noul", noul: 0.4 },
    keepMonitoring: { type: "noul", noul: 0.7 },
  },
};

const context = {
  command: "deploy --api-key secret-value",
  cwd: "/workspace/project-a",
  exitCode: 0,
  durationMs: 1_200,
  background: true,
  output: "[12:30:45] PID 123 Downloading 37% password=hunter2",
  statusHints: ["command_end"],
};

describe("Jev evaluation preparation", () => {
  it("normalizes volatile output and redacts secrets", () => {
    expect(normalizeOutputForJev(context.output)).toEqual([
      "[<TIME>] PID=<PID> Downloading <PERCENT> password=<REDACTED>",
    ]);
  });

  it("redacts known token formats and suffixed credential variables", () => {
    expect(
      normalizeOutputForJev(
        [
          "export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY",
          "AKIAIOSFODNN7EXAMPLE",
          "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
          "sk-proj-0123456789abcdefghij",
        ].join("\n"),
      ),
    ).toEqual([
      "export AWS_SECRET_ACCESS_KEY=<REDACTED>",
      "<AWS_KEY_REDACTED>",
      "<GITHUB_TOKEN_REDACTED>",
      "<API_TOKEN_REDACTED>",
    ]);
  });

  it("applies token format redaction to commands sent via buildJevState", () => {
    const state = buildJevState({
      background: false,
      output: "",
      statusHints: [],
      command:
        "deploy --asset AKIAIOSFODNN7EXAMPLE --blob https://user:secret@example.com --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij' --oidc eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI5ODc2NTQzMjEwIn0.zyxwvutsrqpo",
    });

    expect(state.command).toBe(
      "deploy --asset <AWS_KEY_REDACTED> --blob https://<REDACTED>@example.com --header 'Authorization: Bearer <REDACTED>' --oidc <JWT_REDACTED>",
    );
  });

  it("redacts opaque bearer tokens in commands", () => {
    const state = buildJevState({
      background: false,
      output: "",
      statusHints: [],
      command:
        "curl -sS -H 'Authorization: Bearer dqu9mZq7YcWk4rA2fP0x' https://api.example.com/v1/items",
    });

    expect(state.command).toBe(
      "curl -sS -H 'Authorization: Bearer <REDACTED>' https://api.example.com/v1/items",
    );
  });

  it("produces the same semantic hash for equivalent volatile output", () => {
    const first = buildJevState(context);
    const second = buildJevState({
      ...context,
      output: "[19:01:02] PID 999 Downloading 82% password=another-secret",
    });

    expect(first.command).toBe("deploy --api-key=<REDACTED>");
    expect(first.cwd_name).toBe("project-a");
    expect(semanticHashForState(first)).toBe(semanticHashForState(second));
  });

  it("stays disabled when no API key is configured", () => {
    expect(createJevEvaluator({})).toBeNull();
  });

  it("accepts quiet Agent Monitor snapshots without terminal output", async () => {
    const client = clientWith({
      ...response,
      answers: {
        ...response.answers,
        needsUserInput: { ...response.answers.needsUserInput, noul: 0.1 },
        turnFinished: { ...response.answers.turnFinished, noul: 0.1 },
        agentActive: { ...response.answers.agentActive, noul: 0.9 },
        attention: { ...response.answers.attention, score: 0 },
        actionRequired: { type: "noul", noul: 0.1 },
      },
    });
    const decision = await new JevEvaluationService(client).evaluate({
      foregroundProcess: "claude",
      processTree: ["zsh", "claude"],
      background: true,
      output: "",
      statusHints: ["command_running", "agent_monitor", "no_new_output"],
    });

    expect(decision).toMatchObject({
      status: "thinking",
      attentionLevel: 0,
      userActionRequired: false,
    });
    expect(client.systemOne).toHaveBeenCalledTimes(1);
  });

  it("prioritizes a finished turn over live processes and output_changed", async () => {
    const client = clientWith({
      ...response,
      answers: {
        ...response.answers,
        needsUserInput: { ...response.answers.needsUserInput, noul: 0.1 },
        turnFinished: { ...response.answers.turnFinished, noul: 0.9 },
        processActive: { ...response.answers.processActive, noul: 0.9 },
        agentActive: { ...response.answers.agentActive, noul: 0.9 },
        attention: { ...response.answers.attention, score: 0 },
        actionRequired: { type: "noul", noul: 0.1 },
      },
    });

    await expect(
      new JevEvaluationService(client).evaluate({
        background: true,
        output: "working on the next step\n",
        statusHints: ["command_running", "agent_monitor", "output_changed"],
      }),
    ).resolves.toMatchObject({
      status: "completed",
      attentionLevel: 0,
      userActionRequired: false,
    });
  });

  it("returns waiting as informational when an Agent Monitor has no new output", async () => {
    const client = clientWith({
      ...response,
      answers: {
        ...response.answers,
        needsUserInput: { ...response.answers.needsUserInput, noul: 0.1 },
        turnFinished: { ...response.answers.turnFinished, noul: 0.1 },
        waitingExternal: { ...response.answers.waitingExternal, noul: 0.9 },
        attention: { ...response.answers.attention, score: 3 },
        actionRequired: { type: "noul", noul: 0.1 },
      },
    });

    await expect(
      new JevEvaluationService(client).evaluate({
        foregroundProcess: "claude",
        background: true,
        output: "",
        statusHints: ["command_running", "agent_monitor", "no_new_output"],
      }),
    ).resolves.toMatchObject({
      status: "waiting",
      attentionLevel: 0,
      userActionRequired: false,
    });
  });
});

describe("JevEvaluationService", () => {
  it("composes typed answers and caches the semantic decision", async () => {
    const client = clientWith(response);
    const service = new JevEvaluationService(client);

    const first = await service.evaluate(context);
    const second = await service.evaluate(context);
    const third = await service.evaluate({ ...context, durationMs: 9_999 });

    expect(first).toMatchObject({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
      keepMonitoring: true,
      confidence: 0.8,
      model: "jev-test",
    });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(client.systemOne).toHaveBeenCalledTimes(1);
  });

  it("clamps an unconfident attention score to the status floor", async () => {
    const client = clientWith({
      ...response,
      answers: {
        ...response.answers,
        needsUserInput: { type: "noul", noul: 0.1 },
        turnFinished: { type: "noul", noul: 0.9 },
        attention: {
          type: "score",
          score: 3,
          confidence: 0.2,
          legend: {},
          probabilities: { 3: 1 },
        },
        actionRequired: { type: "noul", noul: 0.1 },
      },
    });

    await expect(new JevEvaluationService(client).evaluate(context)).resolves.toMatchObject({
      status: "completed",
      attentionLevel: 0,
      userActionRequired: false,
      confidence: 0.2,
    });
  });

  it("resolves explicit warning facts before active processes", async () => {
    const client = clientWith({
      ...response,
      answers: {
        ...response.answers,
        needsUserInput: { ...response.answers.needsUserInput, noul: 0.1 },
        turnFinished: { ...response.answers.turnFinished, noul: 0.1 },
        warning: { ...response.answers.warning, noul: 0.9 },
        processActive: { ...response.answers.processActive, noul: 0.9 },
        attention: {
          ...response.answers.attention,
          score: 2.88,
          confidence: 0.9,
        },
        actionRequired: { type: "noul", noul: 0.76 },
      },
    });

    await expect(new JevEvaluationService(client).evaluate(context)).resolves.toMatchObject({
      status: "warning",
      attentionLevel: 3,
      userActionRequired: true,
      confidence: 0.9,
    });
  });
  it("returns no decision when state facts are ambiguous and when evaluation fails", async () => {
    const uncertainClient = clientWith({
      ...response,
      answers: {
        ...response.answers,
        failed: { ...response.answers.failed, noul: 0.3 },
        needsUserInput: { ...response.answers.needsUserInput, noul: 0.3 },
        turnFinished: { ...response.answers.turnFinished, noul: 0.3 },
        warning: { ...response.answers.warning, noul: 0.3 },
        processActive: { ...response.answers.processActive, noul: 0.3 },
        agentActive: { ...response.answers.agentActive, noul: 0.3 },
        waitingExternal: { ...response.answers.waitingExternal, noul: 0.3 },
      },
    });
    const failingClient = {
      systemOne: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as TypeSafeClient;

    await expect(new JevEvaluationService(uncertainClient).evaluate(context)).resolves.toBeNull();
    await expect(new JevEvaluationService(failingClient).evaluate(context)).resolves.toBeNull();
  });
});
