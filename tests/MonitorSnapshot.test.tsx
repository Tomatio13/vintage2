import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMonitorSnapshot } from "../src/renderer/hooks/useMonitorSnapshot.js";
import type { DesktopBridge } from "../src/shared/desktop.js";
import type { MonitorSnapshot } from "../src/shared/monitor.js";
const snapshot: MonitorSnapshot = { generatedAt: 1, sessions: [], warnings: [], supported: true };
afterEach(() => {
  delete window.desktop;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("shares background polling even with the app hidden, and stops on unmount", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const get = vi.fn().mockResolvedValue(snapshot);
  window.desktop = { getMonitorSnapshot: get } as unknown as DesktopBridge;
  const app = renderHook(() => useMonitorSnapshot(true, true));
  const panel = renderHook(() => useMonitorSnapshot());
  await act(async () => {
    await Promise.resolve();
  });
  expect(get).toHaveBeenCalledTimes(1);
  expect(app.result.current.snapshot).toBe(panel.result.current.snapshot);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(get).toHaveBeenCalledTimes(2);
  app.unmount();
  panel.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(get).toHaveBeenCalledTimes(2);
});
it("does not reuse an old response after all consumers have unmounted", async () => {
  vi.useFakeTimers();
  let resolve!: (value: MonitorSnapshot) => void;
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<MonitorSnapshot>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ ...snapshot, generatedAt: 2 });
  window.desktop = { getMonitorSnapshot: get } as unknown as DesktopBridge;
  const first = renderHook(() => useMonitorSnapshot());
  first.unmount();
  const second = renderHook(() => useMonitorSnapshot());
  await act(async () => {
    resolve(snapshot);
    await Promise.resolve();
  });
  expect(second.result.current.snapshot).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(second.result.current.snapshot?.generatedAt).toBe(2);
  second.unmount();
});
