import { expect, it } from "vitest";
import { isAllowedBrowserUrl, canNavigateBrowserGuest } from "../src/shared/browserUrl.js";
it("permits local files without permitting other privileged protocols or file servers", () => {
  expect(isAllowedBrowserUrl("file:///tmp/index.html")).toBe(true);
  expect(isAllowedBrowserUrl("file://localhost/tmp/index.html")).toBe(true);
  for (const url of [
    "file://server/share/index.html",
    "javascript:alert(1)",
    "data:text/html,test",
    "about:config",
    "not a URL",
  ])
    expect(isAllowedBrowserUrl(url)).toBe(false);
});
it("denies navigation from websites into local files but permits local relative pages", () => {
  expect(canNavigateBrowserGuest("https://example.com/", "file:///tmp/index.html")).toBe(false);
  expect(canNavigateBrowserGuest("http://localhost:5173/", "file:///tmp/index.html")).toBe(false);
  expect(canNavigateBrowserGuest("file:///tmp/index.html", "file:///tmp/next.html")).toBe(true);
  expect(canNavigateBrowserGuest("file:///tmp/index.html", "https://example.com/")).toBe(true);
  expect(canNavigateBrowserGuest("file:///tmp/index.html", "javascript:alert(1)")).toBe(false);
});
