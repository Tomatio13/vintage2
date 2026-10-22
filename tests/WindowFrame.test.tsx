import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WindowFrame } from "../src/renderer/components/WindowFrame.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";

afterEach(() => {
  vi.unstubAllGlobals();
  useUiStore.setState({ sidebarWidth: 264 });
});

it("resizes and restores the sidebar without remounting workspace content", () => {
  vi.stubGlobal("innerWidth", 1280);
  useUiStore.setState({ sidebarWidth: 264 });
  const mounted = vi.fn();
  const unmounted = vi.fn();
  function Workspace() {
    useEffect(() => {
      mounted();
      return unmounted;
    }, []);
    return <div>Workspace</div>;
  }
  const frame = (sidebar = true) => (
    <WindowFrame sidebar={sidebar ? <div>Sidebar</div> : undefined}>
      <Workspace />
    </WindowFrame>
  );
  const view = render(frame());
  const handle = screen.getByRole("separator", { name: "Resize sidebar" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(useUiStore.getState().sidebarWidth).toBe(280);
  expect(handle.parentElement).toHaveStyle({ width: "280px" });
  view.rerender(frame(false));
  view.rerender(frame());
  expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "280");
  act(() => {
    useUiStore.setState({ sidebarWidth: 600 });
    vi.stubGlobal("innerWidth", 900);
    window.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "420");
  expect(useUiStore.getState().sidebarWidth).toBe(600);
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
});
