import { describe, expect, it } from "vitest";

import {
  classifyMarkdownLink,
  resolveMarkdownRelativePath,
} from "../src/renderer/lib/markdownLinks.js";

describe("resolveMarkdownRelativePath", () => {
  it("resolves sibling, descendant, and root-relative paths", () => {
    expect(resolveMarkdownRelativePath("docs/guide/setup.md", "./commands.md")).toBe(
      "docs/guide/commands.md",
    );
    expect(resolveMarkdownRelativePath("docs/guide/setup.md", "../intro.md")).toBe("docs/intro.md");
    expect(resolveMarkdownRelativePath("docs/guide/setup.md", "/src/main.ts")).toBe("src/main.ts");
    expect(resolveMarkdownRelativePath("README.md", "docs/ARCHITECTURE.md")).toBe(
      "docs/ARCHITECTURE.md",
    );
  });

  it("strips query strings, fragments, and percent encoding", () => {
    expect(resolveMarkdownRelativePath("docs/index.md", "details.md#section")).toBe(
      "docs/details.md",
    );
    expect(resolveMarkdownRelativePath("docs/index.md", "details.md?x=1")).toBe("docs/details.md");
    expect(resolveMarkdownRelativePath("docs/index.md", "%E6%97%A5%E6%9C%AC%E8%AA%9E.md")).toBe(
      "docs/日本語.md",
    );
  });

  it("rejects URLs, protocol-relative targets, and root escapes", () => {
    expect(resolveMarkdownRelativePath("docs/index.md", "https://example.com/x.md")).toBeNull();
    expect(resolveMarkdownRelativePath("docs/index.md", "//example.com/x.md")).toBeNull();
    expect(resolveMarkdownRelativePath("docs/index.md", "../../../outside.md")).toBeNull();
  });
});

describe("classifyMarkdownLink", () => {
  it("classifies workspace-relative targets as files", () => {
    expect(classifyMarkdownLink("./features/README.md", "docs/index.md")).toEqual({
      kind: "file",
      path: "docs/features/README.md",
    });
    expect(classifyMarkdownLink("../src/main.ts", "docs/index.md")).toEqual({
      kind: "file",
      path: "src/main.ts",
    });
    expect(classifyMarkdownLink("overview.md#usage", "docs/index.md")).toEqual({
      kind: "file",
      path: "docs/overview.md",
    });
  });

  it("classifies HTTP(S) targets as built-in browser links", () => {
    expect(classifyMarkdownLink("https://example.com/docs", "README.md")).toEqual({
      kind: "external",
      url: "https://example.com/docs",
    });
    expect(classifyMarkdownLink("HTTP://example.com/", "README.md")).toEqual({
      kind: "external",
      url: "http://example.com/",
    });
  });

  it("classifies mailto targets for the operating system", () => {
    expect(classifyMarkdownLink("mailto:support@example.com", "README.md")).toEqual({
      kind: "external-system",
      url: "mailto:support@example.com",
    });
  });

  it("classifies same-document fragments as anchors", () => {
    expect(classifyMarkdownLink("#setup", "README.md")).toEqual({
      kind: "anchor",
      anchor: "setup",
    });
    expect(classifyMarkdownLink("#a%20b", "README.md")).toEqual({ kind: "anchor", anchor: "a b" });
  });

  it("ignores non-http schemes and malformed targets", () => {
    expect(classifyMarkdownLink("javascript:alert(1)", "README.md")).toEqual({ kind: "unknown" });
    expect(classifyMarkdownLink("file:///etc/hosts", "README.md")).toEqual({ kind: "unknown" });
    expect(classifyMarkdownLink("vbscript:x", "README.md")).toEqual({ kind: "unknown" });
    expect(classifyMarkdownLink("https://[invalid", "README.md")).toEqual({ kind: "unknown" });
    expect(classifyMarkdownLink("", "README.md")).toEqual({ kind: "unknown" });
  });
});
