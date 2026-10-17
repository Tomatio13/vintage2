import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewPane } from "../src/renderer/components/ReviewPane.js";
import type { DesktopBridge } from "../src/shared/desktop.js";

afterEach(() => {
  delete window.desktop;
  vi.useRealTimers();
});

function setup(patch: string, count = 1) {
  const getWorkspaceGitReviewView = vi.fn().mockResolvedValue({
    status: "ready",
    currentBranch: "main",
    baseRef: "main",
    baseBranches: ["main"],
    comparisonMessage: null,
    changes: Array.from({ length: count }, (_, i) => ({
      path: `file-${i}.ts`,
      kind: "modified",
      source: "unstaged",
      added: 1,
      removed: 1,
    })),
  });
  const getWorkspaceGitReviewDiff = vi
    .fn()
    .mockResolvedValue({ availability: "patch", patch, summary: null });
  window.desktop = {
    getWorkspaceGitReviewView,
    getWorkspaceGitReviewDiff,
  } as unknown as DesktopBridge;
  const onOpenFile = vi.fn();
  const view = render(
    <ReviewPane
      workspaceId="workspace"
      active
      refreshVersion={0}
      onRefresh={() => {}}
      onOpenFile={onOpenFile}
    />,
  );
  return { ...view, getWorkspaceGitReviewView, getWorkspaceGitReviewDiff, onOpenFile };
}

it("bounds a 5000-file list and lets files on later pages open", async () => {
  setup("@@ -1 +1 @@\n-before\n+after", 5000);
  await screen.findByText("file-0.ts");
  expect(screen.queryByText("file-100.ts")).not.toBeInTheDocument();
  const pages = screen.getByRole("navigation", { name: "Unstaged file pages" });
  fireEvent.click(within(pages).getByRole("button", { name: "Next" }));
  expect(screen.queryByText("file-0.ts")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /file-100.ts/ }));
  expect(await screen.findByText("after")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /^file-\d+\.ts/ })).toHaveLength(100);
});

it("pages a large diff and preserves its page through automatic refresh", async () => {
  const { container, getWorkspaceGitReviewDiff } = setup(
    "@@ -0,0 +1,1200 @@\n" + Array.from({ length: 1200 }, (_, i) => `+line_${i}`).join("\n"),
  );
  fireEvent.click(await screen.findByRole("button", { name: /file-0.ts/ }));
  await screen.findByText("line_0");
  expect(container.querySelectorAll("code.whitespace-pre").length).toBeLessThanOrEqual(200);
  const pages = screen.getByRole("navigation", { name: "Diff pages" });
  fireEvent.click(within(pages).getByRole("button", { name: "Next" }));
  expect(screen.getByText("line_199")).toBeInTheDocument();
  expect(screen.queryByText("line_0")).not.toBeInTheDocument();
  await waitFor(() => expect(getWorkspaceGitReviewDiff).toHaveBeenCalledTimes(2), {
    timeout: 5000,
  });
  expect(screen.getByText("line_199")).toBeInTheDocument();
});

it("caps long lines and provides file preview when a diff exceeds the display budget", async () => {
  const { rerender, onOpenFile, getWorkspaceGitReviewDiff } = setup(
    "@@ -0,0 +1 @@\n+" + "x".repeat(30000),
  );
  fireEvent.click(await screen.findByRole("button", { name: /file-0.ts/ }));
  expect((await screen.findByText(/line truncated/)).textContent?.length).toBeLessThan(2100);
  getWorkspaceGitReviewDiff.mockResolvedValue({
    availability: "patch",
    patch: "@@ -0,0 +1 @@\n+" + "x".repeat(500001),
    summary: null,
  });
  rerender(
    <ReviewPane
      workspaceId="workspace"
      active
      refreshVersion={1}
      onRefresh={() => {}}
      onOpenFile={onOpenFile}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Preview file" }));
  expect(onOpenFile).toHaveBeenCalledWith("file-0.ts", 1);
});

it("keeps folded context expandable within the diff row budget", async () => {
  const { container } = setup(
    "@@ -1,600 +1,600 @@\n" +
      Array.from({ length: 599 }, (_, i) => ` context_${i}`).join("\n") +
      "\n-old\n+new",
  );
  fireEvent.click(await screen.findByRole("button", { name: /file-0.ts/ }));
  const fold = await screen.findByRole("button", { name: "596 unmodified lines" });
  fireEvent.click(fold);
  expect(screen.getByText("context_0")).toBeInTheDocument();
  expect(container.querySelectorAll("code.whitespace-pre").length).toBeLessThanOrEqual(200);
  fireEvent.click(fold);
  await waitFor(() => expect(screen.queryByText("context_0")).not.toBeInTheDocument());
});

it("finishes a pending expansion after Review is hidden and shown", async () => {
  const { rerender, getWorkspaceGitReviewDiff, onOpenFile } = setup("unused");
  let resolveDiff!: (result: { availability: string; patch: string; summary: null }) => void;
  getWorkspaceGitReviewDiff.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveDiff = resolve;
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: /file-0.ts/ }));
  expect(screen.getByText("Loading diff…")).toBeInTheDocument();
  rerender(
    <ReviewPane
      workspaceId="workspace"
      active={false}
      refreshVersion={0}
      onRefresh={() => {}}
      onOpenFile={onOpenFile}
    />,
  );
  rerender(
    <ReviewPane
      workspaceId="workspace"
      active
      refreshVersion={0}
      onRefresh={() => {}}
      onOpenFile={onOpenFile}
    />,
  );
  resolveDiff({ availability: "patch", patch: "@@ -1 +1 @@\n-old\n+returned", summary: null });
  expect(await screen.findByText("returned")).toBeInTheDocument();
  expect(screen.queryByText("Loading diff…")).not.toBeInTheDocument();
});
