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
    status: {
      type: "choice",
      choice: "waiting_input",
      confidence: 0.9,
      probabilities: { waiting_input: 0.9 },
    },
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
});

describe("JevEvaluationService", () => {
  it("composes typed answers and caches the semantic decision", async () => {
    const client = clientWith(response);
    const service = new JevEvaluationService(client);

    const first = await service.evaluate(context);
    const second = await service.evaluate(context);

    expect(first).toMatchObject({
      status: "waiting_input",
      attentionLevel: 3,
      userActionRequired: true,
      keepMonitoring: true,
      confidence: 0.8,
      model: "jev-test",
    });
    expect(second).toEqual(first);
    expect(client.systemOne).toHaveBeenCalledTimes(1);
  });

  it("falls back to warning when attention and action corroborate a low-confidence status", async () => {
    const client = clientWith({
      ...response,
      answers: {
        ...response.answers,
        status: { ...response.answers.status, confidence: 0.48 },
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
      confidence: 0.76,
    });
  });
  it("ignores low-confidence and failed evaluations", async () => {
    const uncertainClient = clientWith({
      ...response,
      answers: {
        ...response.answers,
        status: { ...response.answers.status, confidence: 0.3 },
      },
    });
    const failingClient = {
      systemOne: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as TypeSafeClient;

    await expect(new JevEvaluationService(uncertainClient).evaluate(context)).resolves.toBeNull();
    await expect(new JevEvaluationService(failingClient).evaluate(context)).resolves.toBeNull();
  });
});
