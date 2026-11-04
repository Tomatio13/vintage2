import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SpaceTabStrip } from "../src/renderer/components/SpaceTabStrip.js";

let resize: () => void;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let width = 300;
  let total = 300;
  const add = vi.fn();
  const tree = (active = "first") => (
    <SpaceTabStrip workspaceId="project" activeTabId={active} onNewSpace={add}>
      <div data-active={active === "first"} data-tab="first">
        First
      </div>
      <div data-active={active === "last"} data-tab="last">
        Last
      </div>
    </SpaceTabStrip>
  );
  const view = render(tree());
  const viewport = view.container.querySelector<HTMLElement>(".workspace-tab-strip")!;
  Object.defineProperty(viewport, "clientWidth", { get: () => width });
  Object.defineProperty(viewport, "scrollWidth", { get: () => total });
  const rect = (left: number, size: number) => ({
    left,
    right: left + size,
    top: 0,
    bottom: 32,
    width: size,
    height: 32,
    x: left,
    y: 0,
    toJSON() {},
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(() => rect(0, width));
  for (const [name, left] of [
    ["first", 0],
    ["last", 400],
  ] as const) {
    vi.spyOn(
      view.container.querySelector<HTMLElement>(`[data-tab="${name}"]`)!,
      "getBoundingClientRect",
    ).mockImplementation(() => rect(left - viewport.scrollLeft, 100));
  }
  return {
    view,
    viewport,
    add,
    tree,
    size: (nextWidth: number, nextTotal: number) => {
      width = nextWidth;
      total = nextTotal;
      act(() => resize());
    },
  };
}

it("shows arrows only when tabs overflow and keeps the add button outside the scrolling area", () => {
  const f = fixture();
  f.size(300, 300);
  expect(screen.queryByRole("button", { name: "Scroll Spaces left" })).not.toBeInTheDocument();
  f.size(300, 600);
  expect(screen.getByRole("button", { name: "Scroll Spaces left" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Scroll Spaces right" }));
  expect(f.viewport.scrollLeft).toBe(225);
  expect(screen.getByRole("button", { name: "Scroll Spaces left" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Scroll Spaces left" }));
  expect(f.viewport.scrollLeft).toBe(0);
  expect(f.viewport).not.toContainElement(screen.getByRole("button", { name: "New space" }));
  fireEvent.click(screen.getByRole("button", { name: "New space" }));
  expect(f.add).toHaveBeenCalledOnce();
  f.size(800, 600);
  expect(screen.queryByRole("button", { name: "Scroll Spaces right" })).not.toBeInTheDocument();
});

it("reveals selected tabs on selection and resize but preserves manual scrolling during other updates", () => {
  const f = fixture();
  f.size(300, 600);
  f.view.rerender(f.tree("last"));
  expect(f.viewport.scrollLeft).toBe(200);
  f.size(200, 600);
  expect(f.viewport.scrollLeft).toBe(300);
  f.viewport.scrollLeft = 50;
  fireEvent.scroll(f.viewport);
  f.view.rerender(f.tree("last"));
  expect(f.viewport.scrollLeft).toBe(50);
  f.view.rerender(f.tree("first"));
  expect(f.viewport.scrollLeft).toBe(0);
});
