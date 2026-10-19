import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionsPanel } from "../src/renderer/components/SessionsPanel.js";
import type { DesktopBridge } from "../src/shared/desktop.js";
import type { HistorySession, SessionHistoryDetail } from "../src/shared/sessionHistory.js";
const session = (
  key: string,
  cwd: string,
  agent: "codex" | "claude",
  title: string,
): HistorySession => ({
  key: key.repeat(64),
  cwd,
  agent,
  title,
  sessionId: key,
  preview: title,
  updatedAt: Date.now(),
  canResume: true,
});
afterEach(() => {
  delete window.desktop;
  localStorage.clear();
});
it("filters projects and agents, pins a session and resumes the selected conversation", async () => {
  const a = session("a", "/project", "codex", "Fix tabs");
  const b = session("b", "/other", "claude", "History panel");
  window.desktop = {
    listSessionHistory: vi.fn().mockResolvedValue({ sessions: [a, b], warnings: [] }),
    getSessionHistoryDetail: vi.fn(async (key) => ({
      session: key === a.key ? a : b,
      messages: [{ role: "assistant", text: "Completed the layout" }],
      truncated: false,
    })),
  } as unknown as DesktopBridge;
  const resume = vi.fn();
  render(<SessionsPanel active workspacePath="/project" onResume={resume} />);
  fireEvent.click(await screen.findByRole("button", { name: /Fix tabs/ }));
  await screen.findByText("Completed the layout");
  fireEvent.click(screen.getByRole("button", { name: "Pin session" }));
  expect(localStorage.getItem("vintage-session-pins")).toContain(a.key);
  fireEvent.click(screen.getByRole("button", { name: "Resume in new Space" }));
  expect(resume).toHaveBeenCalledWith(a);
  fireEvent.click(screen.getByRole("button", { name: "Session project" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "All projects" }));
  await screen.findByRole("button", { name: /History panel/ });
  fireEvent.click(screen.getByRole("button", { name: "Session agent" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Claude Code" }));
  expect(screen.queryByRole("button", { name: /Fix tabs/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Search sessions" }), {
    target: { value: "no match" },
  });
  expect(screen.getByText("No saved sessions found.")).toBeInTheDocument();
});
it("ignores stale detail responses and does not load while hidden", async () => {
  const a = session("a", "/project", "codex", "First request");
  const b = session("b", "/project", "claude", "Second request");
  let first!: (detail: SessionHistoryDetail) => void;
  const list = vi.fn().mockResolvedValue({ sessions: [a, b], warnings: [] });
  window.desktop = {
    listSessionHistory: list,
    getSessionHistoryDetail: vi.fn((key) =>
      key === a.key
        ? new Promise((resolve) => {
            first = resolve;
          })
        : Promise.resolve({
            session: b,
            messages: [{ role: "assistant", text: "SECOND" }],
            truncated: false,
          }),
    ),
  } as unknown as DesktopBridge;
  const { rerender } = render(<SessionsPanel active={false} workspacePath="/project" />);
  expect(list).not.toHaveBeenCalled();
  rerender(<SessionsPanel active workspacePath="/project" />);
  fireEvent.click(await screen.findByRole("button", { name: /First request/ }));
  fireEvent.click(screen.getByRole("button", { name: /Second request/ }));
  await screen.findByText("SECOND");
  first({ session: a, messages: [{ role: "assistant", text: "STALE" }], truncated: false });
  await waitFor(() => expect(screen.queryByText("STALE")).not.toBeInTheDocument());
});
it("returns to an existing live terminal instead of resuming the same session twice", async () => {
  const a = session("a", "/project", "codex", "Live conversation");
  window.desktop = {
    listSessionHistory: vi.fn().mockResolvedValue({ sessions: [a], warnings: [] }),
    getSessionHistoryDetail: vi
      .fn()
      .mockResolvedValue({ session: a, messages: [], truncated: false }),
    getMonitorSnapshot: vi.fn().mockResolvedValue({
      generatedAt: Date.now(),
      supported: true,
      warnings: [],
      sessions: [
        { agent: "codex", sessionId: a.sessionId, paneId: "existing-pane", status: "Done" },
      ],
    }),
  } as unknown as DesktopBridge;
  const resume = vi.fn(),
    open = vi.fn();
  render(<SessionsPanel active workspacePath="/project" onResume={resume} onOpenTerminal={open} />);
  fireEvent.click(await screen.findByRole("button", { name: /Live conversation/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Open terminal" }));
  expect(open).toHaveBeenCalledWith("existing-pane");
  expect(resume).not.toHaveBeenCalled();
});

it("shows the current Windows project's sessions despite separator or casing differences", async () => {
  const a = session("a", "C:\\Users\\Test\\Project", "codex", "Windows project session");
  window.desktop = {
    platform: "win32",
    listSessionHistory: vi.fn().mockResolvedValue({ sessions: [a], warnings: [] }),
    getSessionHistoryDetail: vi
      .fn()
      .mockResolvedValue({ session: a, messages: [], truncated: false }),
  } as unknown as DesktopBridge;
  render(<SessionsPanel active workspacePath="c:/users/test/project/" />);
  expect(
    await screen.findByRole("button", { name: /Windows project session/ }),
  ).toBeInTheDocument();
});
