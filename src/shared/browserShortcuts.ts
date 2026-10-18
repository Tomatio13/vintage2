export type BrowserCommand =
  | "address"
  | "close"
  | "restore"
  | "next"
  | "previous"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "back"
  | "forward";

export function browserShortcut(input: {
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}): BrowserCommand | null {
  if (input.alt || !(input.control || input.meta)) return null;
  const key = input.key.toLowerCase();
  if (key === "tab" && input.control && !input.meta) return input.shift ? "previous" : "next";
  if (key === "t" && input.shift) return "restore";
  if (key === "+" || key === "=") return "zoom-in";
  if (input.shift) return null;
  if (key === "-") return "zoom-out";
  if (key === "0") return "zoom-reset";
  if (key === "l") return "address";
  if (key === "w") return "close";
  return null;
}
