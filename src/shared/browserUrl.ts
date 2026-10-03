/** URLs supported by the embedded browser, independently of the app window. */
export function isAllowedBrowserUrl(rawUrl: string): boolean {
  if (rawUrl === "about:blank") return true;
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      (url.protocol === "file:" && url.hostname === "")
    );
  } catch {
    return false;
  }
}

/** Website navigation must never grant access to a local document. */
export function canNavigateBrowserGuest(fromUrl: string, toUrl: string): boolean {
  if (!isAllowedBrowserUrl(toUrl)) return false;
  return (
    new URL(toUrl).protocol !== "file:" ||
    (isAllowedBrowserUrl(fromUrl) && new URL(fromUrl).protocol === "file:") ||
    fromUrl === "about:blank"
  );
}
