import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog.js";
import { Sidebar } from "../src/renderer/components/Sidebar.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";

vi.mock("../src/renderer/components/SidebarGary.js", () => ({
  SidebarGary: () => <span data-testid="gary" />,
}));

afterEach(() => useUiStore.setState({ settingsOpen: false, sidebarGaryEnabled: true }));

it("toggles Gary through Appearance, removes its space and restores the saved preference", async () => {
  useUiStore.setState({ settingsOpen: true, sidebarGaryEnabled: true });
  const noop = () => {};
  render(
    <>
      <SettingsDialog />
      <Sidebar
        workspaces={[]}
        attentionItems={[]}
        attentionHistory={[]}
        activeWorkspaceId={null}
        onOpenWorkspace={noop}
        onNewSpace={noop}
        onSelectWorkspace={noop}
        onSelectTab={noop}
        onSelectAttention={noop}
        onDismissAttention={noop}
        onOpenSettings={noop}
      />
    </>,
  );
  expect(screen.getByTestId("gary")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: "Show Gary in sidebar" }));
  expect(screen.queryByTestId("gary")).not.toBeInTheDocument();
  const persisted = localStorage.getItem("ai-workspace-starter-ui")!;
  expect(JSON.parse(persisted).state.sidebarGaryEnabled).toBe(false);
  await act(async () => {
    useUiStore.setState({ sidebarGaryEnabled: true });
    localStorage.setItem("ai-workspace-starter-ui", persisted);
    await useUiStore.persist.rehydrate();
  });
  expect(screen.queryByTestId("gary")).not.toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Show Gary in sidebar" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  fireEvent.click(screen.getByRole("switch", { name: "Show Gary in sidebar" }));
  expect(screen.getByTestId("gary")).toBeInTheDocument();
});

it("defaults Gary to visible when restoring settings from before the option existed", async () => {
  useUiStore.setState({ sidebarGaryEnabled: false });
  localStorage.setItem("ai-workspace-starter-ui", JSON.stringify({ state: {}, version: 0 }));
  await useUiStore.persist.rehydrate();
  expect(useUiStore.getState().sidebarGaryEnabled).toBe(true);
});
