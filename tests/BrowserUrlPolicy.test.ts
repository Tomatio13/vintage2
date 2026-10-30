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
it("allows only capability-shaped local browser URLs internally", () => {
  expect(isAllowedBrowserUrl("vintage-local://capability/index.html")).toBe(true);
  expect(isAllowedBrowserUrl("vintage-local:///index.html")).toBe(false);
});
it("denies direct file navigation now that local pages use a custom protocol", () => {
  expect(canNavigateBrowserGuest("https://example.com/", "file:///tmp/index.html")).toBe(false);
  expect(canNavigateBrowserGuest("http://localhost:5173/", "file:///tmp/index.html")).toBe(false);
  expect(canNavigateBrowserGuest("file:///tmp/index.html", "file:///tmp/next.html")).toBe(false);
  expect(canNavigateBrowserGuest("file:///tmp/index.html", "https://example.com/")).toBe(true);
  expect(canNavigateBrowserGuest("file:///tmp/index.html", "javascript:alert(1)")).toBe(false);
  expect(
    canNavigateBrowserGuest(
      "vintage-local://capability/index.html",
      "vintage-local://capability/next.html",
    ),
  ).toBe(true);
  expect(
    canNavigateBrowserGuest("https://example.com/", "vintage-local://capability/index.html"),
  ).toBe(false);
});
