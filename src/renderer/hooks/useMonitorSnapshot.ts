import { useCallback, useSyncExternalStore } from "react";
import type { MonitorSnapshot } from "../../shared/monitor.js";

let state = {
  snapshot: null as MonitorSnapshot | null,
  error: null as string | null,
  refreshing: false,
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let backgroundListeners = 0;
let generation = 0;
function publish(next: typeof state) {
  state = next;
  for (const listener of listeners) listener();
}
export async function refreshMonitorSnapshot() {
  clearTimeout(timer);
  if (
    inFlight ||
    !listeners.size ||
    (document.visibilityState === "hidden" && backgroundListeners === 0) ||
    !window.desktop?.getMonitorSnapshot
  )
    return;
  const requestGeneration = generation;
  inFlight = true;
  publish({ ...state, refreshing: true });
  try {
    const snapshot = await window.desktop.getMonitorSnapshot();
    if (listeners.size && requestGeneration === generation)
      publish({ snapshot, error: null, refreshing: true });
  } catch {
    // Discard stale activity rather than leave a Space permanently running.
    if (requestGeneration === generation)
      publish({
        snapshot: null,
        error: "Unable to refresh local agent sessions.",
        refreshing: true,
      });
  } finally {
    inFlight = false;
    if (requestGeneration === generation) publish({ ...state, refreshing: false });
    if (listeners.size && (backgroundListeners > 0 || !document.hidden))
      timer = setTimeout(() => void refreshMonitorSnapshot(), 2000);
  }
}
function visibility() {
  clearTimeout(timer);
  if (backgroundListeners > 0 || document.visibilityState !== "hidden")
    void refreshMonitorSnapshot();
}
function subscribe(listener: () => void, background: boolean) {
  listeners.add(listener);
  if (background) backgroundListeners++;
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", visibility);
    void refreshMonitorSnapshot();
  }
  return () => {
    listeners.delete(listener);
    if (background) backgroundListeners--;
    if (!listeners.size) {
      clearTimeout(timer);
      generation++;
      state = { snapshot: null, error: null, refreshing: false };
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}
const inactiveState = { snapshot: null, error: null, refreshing: false };
const noSubscribe = () => () => {};
export function useMonitorSnapshot(active = true, background = false) {
  const subscribeToStore = useCallback(
    (listener: () => void) => subscribe(listener, background),
    [background],
  );
  return useSyncExternalStore(active ? subscribeToStore : noSubscribe, () =>
    active ? state : inactiveState,
  );
}
