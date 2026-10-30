/** URLs supported by the embedded browser, independently of the app window. */
export function isAllowedBrowserUrl(rawUrl: string): boolean {
  if (rawUrl === "about:blank") return true;
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      (url.protocol === "vintage-local:" && Boolean(url.hostname)) ||
      (url.protocol === "file:" && url.hostname === "")
    );
  } catch {
    return false;
  }
}

/** Website navigation must never grant access to a local document. */
export function canNavigateBrowserGuest(fromUrl: string, toUrl: string): boolean {
  if (!isAllowedBrowserUrl(toUrl)) return false;
  const fromProtocol = isAllowedBrowserUrl(fromUrl) ? new URL(fromUrl).protocol : null;
  const toProtocol = new URL(toUrl).protocol;
  if (toProtocol === "file:") return false;
  if (toProtocol === "vintage-local:") return fromProtocol === "vintage-local:";
  return true;
}
