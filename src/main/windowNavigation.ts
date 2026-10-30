function safeParseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Development content must never replace the packaged renderer or come from the network. */
export function resolveDevServerUrl(
  rawUrl: string | undefined,
  isPackaged: boolean,
): string | undefined {
  if (isPackaged || !rawUrl) return undefined;
  const parsed = safeParseUrl(rawUrl);
  if (!parsed || parsed.protocol !== "http:" || !loopbackHosts.has(parsed.hostname)) {
    throw new Error("VITE_DEV_SERVER_URL must use HTTP on a loopback host");
  }
  return parsed.toString();
}

/**
 * Builds a predicate that decides which top-level navigations the renderer
 * window may perform: the dev server origin while developing, or the app's own
 * renderer entry otherwise. URLs are parsed and compared by origin and path —
 * prefix string matching would let e.g. a different port slip through.
 */
export function createRendererNavigationGuard({
  rendererFileUrl,
  devServerUrl,
}: {
  rendererFileUrl: string;
  devServerUrl?: string | undefined;
}): (rawUrl: string) => boolean {
  const rendererUrl = safeParseUrl(rendererFileUrl);
  const devUrl = devServerUrl ? safeParseUrl(devServerUrl) : null;
  return (rawUrl) => {
    const parsed = safeParseUrl(rawUrl);
    if (!parsed || !rendererUrl) return false;
    if (devUrl && parsed.protocol === devUrl.protocol && parsed.host === devUrl.host) {
      return true;
    }
    return (
      parsed.protocol === rendererUrl.protocol &&
      parsed.host === rendererUrl.host &&
      parsed.pathname === rendererUrl.pathname
    );
  };
}
