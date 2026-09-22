export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (trimmed === "about:blank") return trimmed;

  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS addresses are supported");
  }
  return url.toString();
}
