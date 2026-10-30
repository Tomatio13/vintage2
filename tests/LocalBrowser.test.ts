import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  localBrowserCapabilityCounts,
  prepareLocalBrowserUrl,
  releaseLocalBrowserUrl,
  resolveLocalBrowserUrl,
} from "../src/main/localBrowser.js";

describe("local browser capabilities", () => {
  it("maps a local file through an opaque capability and preserves its display URL", async () => {
    const root = await mkdtemp(join(tmpdir(), "vintage-local-browser-"));
    await mkdir(join(root, "assets"));
    const file = join(root, "index page.html");
    await writeFile(file, "<h1>local</h1>");
    const displayUrl = `${pathToFileURL(await realpath(file)).toString()}#section`;

    const prepared = await prepareLocalBrowserUrl(42, "browser-1", displayUrl);
    expect(prepared.url).toMatch(/^vintage-local:\/\/[\da-f-]+\/index%20page\.html#section$/u);
    expect(prepared.displayUrl).toBe(displayUrl);
    expect(resolveLocalBrowserUrl(42, prepared.url)).toBe(displayUrl);
    expect(resolveLocalBrowserUrl(7, prepared.url)).toBeNull();

    releaseLocalBrowserUrl(42, "browser-1");
    expect(resolveLocalBrowserUrl(42, prepared.url)).toBeNull();
  });

  it("rejects remote file hosts and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "vintage-local-browser-"));
    await expect(
      prepareLocalBrowserUrl(1, "browser-1", "file://server/share/index.html"),
    ).rejects.toThrow("Only local file URLs");
    await expect(
      prepareLocalBrowserUrl(1, "browser-1", pathToFileURL(root).toString()),
    ).rejects.toThrow("must reference a file");
  });

  it("releases all retained state after repeated capability rotation and bulk tab cleanup", async () => {
    const root = await mkdtemp(join(tmpdir(), "vintage-local-browser-stress-"));
    const file = join(root, "index.html");
    await writeFile(file, "<h1>stress</h1>");
    const displayUrl = pathToFileURL(file).toString();
    const staleUrls: string[] = [];

    for (let index = 0; index < 5_000; index += 1) {
      const prepared = await prepareLocalBrowserUrl(99, "rotating-tab", displayUrl);
      staleUrls.push(prepared.url);
    }
    expect(localBrowserCapabilityCounts()).toEqual({ capabilities: 1, tabs: 1 });
    for (const url of staleUrls.slice(0, -1)) {
      expect(resolveLocalBrowserUrl(99, url)).toBeNull();
    }
    releaseLocalBrowserUrl(99, "rotating-tab");

    const bulkUrls = await Promise.all(
      Array.from({ length: 5_000 }, async (_, index) => {
        const tabId = `bulk-${index}`;
        const prepared = await prepareLocalBrowserUrl(99, tabId, displayUrl);
        return { tabId, url: prepared.url };
      }),
    );
    expect(localBrowserCapabilityCounts()).toEqual({ capabilities: 5_000, tabs: 5_000 });
    for (const { tabId } of bulkUrls) releaseLocalBrowserUrl(99, tabId);
    expect(localBrowserCapabilityCounts()).toEqual({ capabilities: 0, tabs: 0 });
    for (const { url } of bulkUrls) expect(resolveLocalBrowserUrl(99, url)).toBeNull();
  }, 15_000);
});
