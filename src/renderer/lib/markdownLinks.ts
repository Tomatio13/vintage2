export type MarkdownLinkTarget =
  | { kind: "anchor"; anchor: string }
  | { kind: "external"; url: string }
  | { kind: "external-system"; url: string }
  | { kind: "file"; path: string }
  | { kind: "unknown" };

const schemePattern = /^([a-z][a-z\d+.-]*):/iu;

/**
 * Resolves a Markdown image or link target against the current document path.
 * Returns a workspace-root-relative path, or null when the target is absolute
 * (a URL), protocol-relative, escapes above the workspace root, or empty.
 */
export function resolveMarkdownRelativePath(markdownPath: string, source: string): string | null {
  const sourcePath = source.split(/[?#]/u, 1)[0] ?? "";
  if (!sourcePath || source.startsWith("//") || schemePattern.test(sourcePath)) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(sourcePath).replace(/\\/gu, "/");
  } catch {
    return null;
  }

  const rootRelative = decodedPath.startsWith("/");
  const segments = rootRelative ? [] : markdownPath.split("/").slice(0, -1);
  for (const segment of decodedPath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.length > 0 ? segments.join("/") : null;
}

/**
 * Classifies a Markdown link so clicks can be routed without ever navigating
 * the app window: workspace-relative paths open in the file preview, HTTP(S)
 * links open in the built-in browser, mailto goes to the operating system,
 * and everything else is ignored.
 */
export function classifyMarkdownLink(href: string, markdownPath: string): MarkdownLinkTarget {
  const trimmed = href.trim();
  if (!trimmed) return { kind: "unknown" };

  if (trimmed.startsWith("#")) {
    const anchor = trimmed.slice(1);
    try {
      return { kind: "anchor", anchor: decodeURIComponent(anchor) };
    } catch {
      return { kind: "anchor", anchor };
    }
  }

  const scheme = schemePattern.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme !== "http" && scheme !== "https" && scheme !== "mailto") {
      return { kind: "unknown" };
    }
    try {
      const url = new URL(trimmed);
      if (scheme === "mailto") return { kind: "external-system", url: url.toString() };
      if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "unknown" };
      return { kind: "external", url: url.toString() };
    } catch {
      return { kind: "unknown" };
    }
  }

  const resolved = resolveMarkdownRelativePath(markdownPath, trimmed);
  return resolved ? { kind: "file", path: resolved } : { kind: "unknown" };
}
