import { useSyncExternalStore } from "react";
import type { MonitorSnapshot } from "../../shared/monitor.js";

let state = {
  snapshot: null as MonitorSnapshot | null,
  error: null as string | null,
  refreshing: false,
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
function publish(next: typeof state) {
  state = next;
  for (const listener of listeners) listener();
}
export async function refreshMonitorSnapshot() {
  clearTimeout(timer);
  if (
    inFlight ||
    !listeners.size ||
    document.visibilityState === "hidden" ||
    !window.desktop?.getMonitorSnapshot
  )
    return;
  inFlight = true;
  publish({ ...state, refreshing: true });
  try {
    const snapshot = await window.desktop.getMonitorSnapshot();
    if (listeners.size) publish({ snapshot, error: null, refreshing: true });
  } catch {
    // Discard stale activity rather than leave a Space permanently running.
    publish({ snapshot: null, error: "Unable to refresh local agent sessions.", refreshing: true });
  } finally {
    inFlight = false;
    publish({ ...state, refreshing: false });
    if (listeners.size && !document.hidden)
      timer = setTimeout(() => void refreshMonitorSnapshot(), 2000);
  }
}
function visibility() {
  clearTimeout(timer);
  if (document.visibilityState !== "hidden") void refreshMonitorSnapshot();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", visibility);
    void refreshMonitorSnapshot();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}
const inactiveState = { snapshot: null, error: null, refreshing: false };
const noSubscribe = () => () => {};
export function useMonitorSnapshot(active = true) {
  return useSyncExternalStore(active ? subscribe : noSubscribe, () =>
    active ? state : inactiveState,
  );
}
