import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mocks }));
import { renderMermaid } from "../src/renderer/lib/mermaid.js";

describe("Mermaid renderer", () => {
  it("serializes configurations and recovers after failures, removing temporary DOM", async () => {
    let finish!: (value: { svg: string }) => void;
    mocks.render
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("bad graph"))
      .mockResolvedValueOnce({ svg: "third" });
    const count = document.body.children.length;
    const first = renderMermaid("first", false);
    const second = renderMermaid("second", true);
    const rejected = expect(second).rejects.toThrow("bad graph");
    const third = renderMermaid("third", false);
    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    finish({ svg: "first" });
    expect(await first).toBe("first");
    await rejected;
    expect(await third).toBe("third");
    expect(mocks.initialize.mock.calls.map(([config]) => config.theme)).toEqual([
      "default",
      "dark",
      "default",
    ]);
    expect(document.body.children).toHaveLength(count);
    expect(new Set(mocks.render.mock.calls.map(([id]) => id)).size).toBe(3);
  });
});
