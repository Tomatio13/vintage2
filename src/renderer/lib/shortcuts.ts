import type { ShortcutAction, ShortcutBinding } from "../store/uiStore.js";

const arrowEventKeys: Record<string, string> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

export function eventKey(event: KeyboardEvent): string {
  return arrowEventKeys[event.key] ?? event.key.toLowerCase();
}

export function shortcutBinding(
  shortcuts: ShortcutBinding[],
  action: ShortcutAction,
): ShortcutBinding | undefined {
  return shortcuts.find((item) => item.action === action);
}

export function shortcutLabel(binding: ShortcutBinding): string {
  const key =
    ({ left: "←", right: "→", up: "↑", down: "↓" } as Record<string, string>)[binding.key] ??
    binding.key.toUpperCase();
  return [binding.ctrl && "Ctrl", binding.alt && "Alt", binding.shift && "Shift", key]
    .filter(Boolean)
    .join("+");
}

export function bindingMatchesEvent(
  binding: ShortcutBinding,
  event: KeyboardEvent,
  platform: NodeJS.Platform | undefined,
): boolean {
  // Terminal bindings treat Ctrl as the macOS Command key, matching the
  // hardcoded Cmd+F behavior this registry entry replaced.
  const modifier = platform === "darwin" ? event.metaKey : event.ctrlKey;
  return (
    binding.key === eventKey(event) &&
    binding.ctrl === modifier &&
    binding.alt === event.altKey &&
    binding.shift === event.shiftKey
  );
}
