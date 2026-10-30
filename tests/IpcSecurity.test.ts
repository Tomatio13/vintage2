import { describe, expect, it } from "vitest";

import { assertTrustedRendererSender } from "../src/main/ipcSecurity.js";

const allowApp = (url: string) => url === "file:///app/index.html";

describe("IPC sender security", () => {
  it("accepts the application main frame", () => {
    const mainFrame = { url: "file:///app/index.html" };
    expect(() =>
      assertTrustedRendererSender(
        { sender: { mainFrame }, senderFrame: mainFrame } as never,
        allowApp,
      ),
    ).not.toThrow();
  });

  it("rejects child frames", () => {
    expect(() =>
      assertTrustedRendererSender(
        { sender: { mainFrame: {} }, senderFrame: {} } as never,
        allowApp,
      ),
    ).toThrow("IPC requests from subframes are not allowed");
  });

  it("rejects a top-level frame after navigation to an untrusted origin", () => {
    const mainFrame = { url: "https://attacker.example/" };
    expect(() =>
      assertTrustedRendererSender(
        { sender: { mainFrame }, senderFrame: mainFrame } as never,
        allowApp,
      ),
    ).toThrow("IPC requests from untrusted renderer URLs are not allowed");
  });

  it("rejects 100,000 untrusted sender checks without retaining request state", () => {
    const mainFrame = { url: "https://attacker.example/" };
    const event = { sender: { mainFrame }, senderFrame: mainFrame } as never;
    let rejected = 0;

    for (let index = 0; index < 100_000; index += 1) {
      try {
        assertTrustedRendererSender(event, allowApp);
      } catch {
        rejected += 1;
      }
    }

    expect(rejected).toBe(100_000);
    expect(mainFrame.url).toBe("https://attacker.example/");
  });
});
