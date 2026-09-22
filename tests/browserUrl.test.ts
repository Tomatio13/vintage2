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

  it("rejects privileged protocols", () => {
    expect(() => normalizeBrowserUrl("file:///etc/passwd")).toThrow(
      "Only HTTP and HTTPS addresses are supported",
    );
    expect(() => normalizeBrowserUrl("javascript:alert(1)")).toThrow(
      "Only HTTP and HTTPS addresses are supported",
    );
  });
});
