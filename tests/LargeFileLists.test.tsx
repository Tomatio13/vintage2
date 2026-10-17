import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceFiles } from "../src/renderer/components/WorkspaceFiles.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";
import type { DesktopBridge, WorkspaceFileEntry } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
  useUiStore.setState({ expandedFileFolders: {} });
  vi.useRealTimers();
});
const props = {
  workspaceId: "large",
  active: true,
  refreshVersion: 0,
  showHiddenFiles: true,
  onRefresh: () => {},
  onSelect: vi.fn(),
  onContextMenu: () => {},
};

it("keeps a 20000-file tree bounded while scrolling to later entries", async () => {
  window.desktop = {
    listWorkspaceFiles: vi.fn().mockResolvedValue(
      Array.from({ length: 20000 }, (_, i) => ({
        kind: "file",
        path: `file-${i}.ts`,
        name: `file-${i}.ts`,
      })),
    ),
  } as unknown as DesktopBridge;
  const { container } = render(<WorkspaceFiles {...props} />);
  await screen.findByRole("button", { name: "file-0.ts" });
  expect(container.querySelectorAll("[data-files-rows] button").length).toBeLessThan(60);
  const scroll = container.querySelector("[data-files-scroll]")!;
  fireEvent.scroll(scroll, { target: { scrollTop: 32000 } });
  expect(screen.getByRole("button", { name: "file-1000.ts" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "file-0.ts" })).not.toBeInTheDocument();
  expect(container.querySelectorAll("[data-files-rows] button").length).toBeLessThan(60);
});

it("limits directory reads to four and joins slow requests across refreshes", async () => {
  vi.useFakeTimers();
  const paths = Array.from({ length: 12 }, (_, i) => `dir-${i}`);
  useUiStore.setState({ expandedFileFolders: { large: paths } });
  const pending = new Map<string, (entries: WorkspaceFileEntry[]) => void>();
  let inFlight = 0;
  let peak = 0;
  const listWorkspaceFiles = vi.fn((_workspace: string, path?: string) => {
    if (!path)
      return Promise.resolve(paths.map((path) => ({ kind: "directory", name: path, path })));
    inFlight++;
    peak = Math.max(peak, inFlight);
    return new Promise<WorkspaceFileEntry[]>((resolve) =>
      pending.set(path, (entries) => {
        inFlight--;
        resolve(entries);
      }),
    );
  });
  window.desktop = { listWorkspaceFiles } as unknown as DesktopBridge;
  render(<WorkspaceFiles {...props} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(pending.size).toBe(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  for (const path of paths)
    expect(
      listWorkspaceFiles.mock.calls.filter((call) => call[1] === path).length,
    ).toBeLessThanOrEqual(1);
  for (let batch = 0; batch < 3; batch++) {
    await act(async () => {
      const active = [...pending.values()];
      pending.clear();
      for (const resolve of active) resolve([]);
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  expect(peak).toBe(4);
  expect(inFlight).toBe(0);
  for (const path of paths)
    expect(listWorkspaceFiles.mock.calls.filter((call) => call[1] === path)).toHaveLength(1);
});

it("keeps unchanged directory rows intact through a refresh", async () => {
  const listWorkspaceFiles = vi
    .fn()
    .mockImplementation(async () => [{ kind: "file", name: "stable.ts", path: "stable.ts" }]);
  window.desktop = { listWorkspaceFiles } as unknown as DesktopBridge;
  const { rerender } = render(<WorkspaceFiles {...props} />);
  const before = await screen.findByRole("button", { name: "stable.ts" });
  rerender(<WorkspaceFiles {...props} refreshVersion={1} />);
  await waitFor(() => expect(listWorkspaceFiles).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "stable.ts" })).toBe(before);
});
