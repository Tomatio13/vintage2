import { describe, expect, it } from "vitest";

import { normalizeBrowserUrl } from "../src/renderer/lib/browserUrl.js";

describe("normalizeBrowserUrl", () => {
  it("adds HTTPS to a hostname", () => {
    expect(normalizeBrowserUrl("example.com/docs")).toBe("https://example.com/docs");
  });

  it("keeps supported absolute URLs and about:blank", () => {
    expect(normalizeBrowserUrl("http://localhost:4173")).toBe("http://localhost:4173/");
    expect(normalizeBrowserUrl("about:blank")).toBe("about:blank");
  });

  it("normalizes local files, including spaces, Unicode, Windows drives and fragments", () => {
    expect(normalizeBrowserUrl(" file:///tmp/local page.html#part ")).toBe(
      "file:///tmp/local%20page.html#part",
    );
    expect(normalizeBrowserUrl("file:///tmp/資料.html")).toBe(
      "file:///tmp/%E8%B3%87%E6%96%99.html",
    );
    expect(normalizeBrowserUrl("file:///C:/docs/index.html")).toBe("file:///C:/docs/index.html");
    expect(normalizeBrowserUrl("file://localhost/tmp/index.html")).toBe("file:///tmp/index.html");
  });
  it("rejects privileged protocols", () => {
    expect(() => normalizeBrowserUrl("file://server/share/index.html")).toThrow(
      "Only HTTP, HTTPS, and local file URLs are supported",
    );
    expect(() => normalizeBrowserUrl("javascript:alert(1)")).toThrow(
      "Only HTTP, HTTPS, and local file URLs are supported",
    );
  });
});
