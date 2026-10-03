import { isAllowedBrowserUrl } from "../../shared/browserUrl.js";

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (trimmed === "about:blank") return trimmed;

  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (!isAllowedBrowserUrl(url.toString())) {
    throw new Error("Only HTTP, HTTPS, and local file URLs are supported");
  }
  return url.toString();
}
