import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { session, type Session } from "electron";

export const LOCAL_BROWSER_PARTITION = "vintage-local-browser";
export const LOCAL_BROWSER_SCHEME = "vintage-local";

interface LocalCapability {
  ownerId: number;
  tabId: string;
  root: string;
}

const capabilities = new Map<string, LocalCapability>();
const capabilityByTab = new Map<string, string>();

/** @internal Exposed only so stress tests can detect retained capability entries. */
export function localBrowserCapabilityCounts(): { capabilities: number; tabs: number } {
  return { capabilities: capabilities.size, tabs: capabilityByTab.size };
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const localPageCsp = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'none'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function tabKey(ownerId: number, tabId: string): string {
  return `${ownerId}:${tabId}`;
}

function inside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return !isAbsolute(fromRoot) && !/^\.\.(?:[\\/]|$)/u.test(fromRoot);
}

function parseInternalUrl(rawUrl: string): { token: string; path: string } | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${LOCAL_BROWSER_SCHEME}:` || !url.hostname) return null;
    const path = url.pathname
      .slice(1)
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
    return { token: url.hostname, path };
  } catch {
    return null;
  }
}

export async function prepareLocalBrowserUrl(
  ownerId: number,
  rawTabId: unknown,
  rawUrl: unknown,
): Promise<{ url: string; displayUrl: string }> {
  if (typeof rawTabId !== "string" || !rawTabId || rawTabId.length > 120) {
    throw new TypeError("Browser tab id is invalid");
  }
  if (typeof rawUrl !== "string") throw new TypeError("Local browser URL must be a string");
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "file:" || parsed.hostname) {
    throw new Error("Only local file URLs can be prepared");
  }
  const file = await realpath(fileURLToPath(parsed));
  if (!(await lstat(file)).isFile()) throw new Error("Local browser URL must reference a file");
  const root = await realpath(dirname(file));
  const key = tabKey(ownerId, rawTabId);
  releaseLocalBrowserUrl(ownerId, rawTabId);
  const token = randomUUID();
  capabilities.set(token, { ownerId, tabId: rawTabId, root });
  capabilityByTab.set(key, token);
  const name = relative(root, file).split(/[\\/]/u).map(encodeURIComponent).join("/");
  return {
    url: `${LOCAL_BROWSER_SCHEME}://${token}/${name}${parsed.search}${parsed.hash}`,
    displayUrl: `${pathToFileURL(file).toString()}${parsed.search}${parsed.hash}`,
  };
}

export function resolveLocalBrowserUrl(ownerId: number, rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string") return null;
  const parsed = parseInternalUrl(rawUrl);
  if (!parsed) return null;
  const capability = capabilities.get(parsed.token);
  if (!capability || capability.ownerId !== ownerId) return null;
  const internal = new URL(rawUrl);
  return `${pathToFileURL(resolve(capability.root, parsed.path)).toString()}${internal.search}${internal.hash}`;
}

export function releaseLocalBrowserUrl(ownerId: number, rawTabId: unknown): void {
  if (typeof rawTabId !== "string") return;
  const key = tabKey(ownerId, rawTabId);
  const token = capabilityByTab.get(key);
  if (!token) return;
  capabilityByTab.delete(key);
  capabilities.delete(token);
}

async function handleLocalRequest(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const parsed = parseInternalUrl(request.url);
  const capability = parsed ? capabilities.get(parsed.token) : null;
  if (!parsed || !capability) return new Response("Unavailable", { status: 404 });
  try {
    const candidate = resolve(capability.root, parsed.path);
    if (!inside(capability.root, candidate)) return new Response("Unavailable", { status: 404 });
    const file = await realpath(candidate);
    if (!inside(capability.root, file) || !(await lstat(file)).isFile()) {
      return new Response("Unavailable", { status: 404 });
    }
    const details = await stat(file);
    const extension = extname(file).toLowerCase();
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": String(details.size),
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
      "Content-Security-Policy": localPageCsp,
      "X-Content-Type-Options": "nosniff",
    });
    let status = 200;
    let start = 0;
    let end = details.size - 1;
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && details.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader);
      if (!match || (!match[1] && !match[2])) {
        headers.set("Content-Range", `bytes */${details.size}`);
        return new Response(null, { status: 416, headers });
      }
      if (!match[1]) {
        const suffixLength = Number.parseInt(match[2] ?? "", 10);
        start = Math.max(0, details.size - suffixLength);
      } else {
        start = Number.parseInt(match[1], 10);
      }
      end = match[2] && match[1] ? Math.min(Number.parseInt(match[2], 10), end) : end;
      if (start >= details.size || start > end) {
        headers.set("Content-Range", `bytes */${details.size}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set("Content-Length", String(end - start + 1));
      headers.set("Content-Range", `bytes ${start}-${end}/${details.size}`);
    }
    if (request.method === "HEAD" || details.size === 0) {
      return new Response(null, { status, headers });
    }
    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>,
      { status, headers },
    );
  } catch {
    return new Response("Unavailable", { status: 404 });
  }
}

export function configureLocalBrowserSession(
  browserSession: Session = session.fromPartition(LOCAL_BROWSER_PARTITION),
): void {
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
  browserSession.protocol.handle(LOCAL_BROWSER_SCHEME, handleLocalRequest);
}
