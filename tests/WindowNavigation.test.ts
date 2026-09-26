import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { createRendererNavigationGuard } from "../src/main/windowNavigation.js";

const rendererFileUrl = pathToFileURL("/opt/vintage/resources/renderer/index.html").toString();

describe("createRendererNavigationGuard", () => {
  it("allows the exact renderer entry, including hash and query variants", () => {
    const isAllowed = createRendererNavigationGuard({ rendererFileUrl });
    expect(isAllowed(rendererFileUrl)).toBe(true);
    expect(isAllowed(`${rendererFileUrl}#section`)).toBe(true);
    expect(isAllowed(`${rendererFileUrl}?token=x`)).toBe(true);
  });

  it("denies file URLs that merely extend the entry path", () => {
    const isAllowed = createRendererNavigationGuard({ rendererFileUrl });
    expect(isAllowed(`${rendererFileUrl}.evil`)).toBe(false);
    expect(isAllowed(`${rendererFileUrl}/../secret`)).toBe(false);
    expect(isAllowed("file:///etc/hosts")).toBe(false);
  });

  it("allows any route on the dev server origin and nothing else", () => {
    const isAllowed = createRendererNavigationGuard({
      rendererFileUrl,
      devServerUrl: "http://127.0.0.1:5173",
    });
    expect(isAllowed("http://127.0.0.1:5173/")).toBe(true);
    expect(isAllowed("http://127.0.0.1:5173/src/main.ts")).toBe(true);
    expect(isAllowed("http://127.0.0.1:51730/")).toBe(false);
    expect(isAllowed("http://localhost:5173/")).toBe(false);
    expect(isAllowed("https://127.0.0.1:5173/")).toBe(false);
    expect(isAllowed(rendererFileUrl)).toBe(true);
  });

  it("denies dev server origins when the app runs from files", () => {
    const isAllowed = createRendererNavigationGuard({ rendererFileUrl });
    expect(isAllowed("http://127.0.0.1:5173/")).toBe(false);
  });

  it("denies external, script, and malformed targets", () => {
    const isAllowed = createRendererNavigationGuard({
      rendererFileUrl,
      devServerUrl: "http://127.0.0.1:5173",
    });
    expect(isAllowed("https://example.com/")).toBe(false);
    expect(isAllowed("javascript:alert(1)")).toBe(false);
    expect(isAllowed("not a url")).toBe(false);
    expect(isAllowed("")).toBe(false);
  });

  it("denies everything when its own inputs are unusable", () => {
    expect(createRendererNavigationGuard({ rendererFileUrl: "not a url" })("about:blank")).toBe(
      false,
    );
    const isAllowed = createRendererNavigationGuard({ rendererFileUrl });
    expect(isAllowed("file://")).toBe(false);
  });
});
