import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipButton } from "../src/renderer/components/TooltipButton.js";

afterEach(() => vi.useRealTimers());

it("shows a keycap on keyboard focus, updates custom keys, and dismisses on Escape or click", () => {
  const click = vi.fn();
  const view = render(
    <TooltipButton tooltip="Toggle sidebar" shortcut="Ctrl+B" aria-label="Sidebar" onClick={click}>
      Logo
    </TooltipButton>,
  );
  const button = screen.getByRole("button", { name: "Sidebar" });
  expect(button).not.toHaveAttribute("title");
  fireEvent.focus(button);
  const tip = screen.getByRole("tooltip");
  expect(button).toHaveAttribute("aria-describedby", tip.id);
  expect(tip.querySelector("kbd")).toHaveTextContent("Ctrl+B");
  view.rerender(
    <TooltipButton
      tooltip="Toggle sidebar"
      shortcut="Ctrl+Shift+S"
      aria-label="Sidebar"
      onClick={click}
    >
      Logo
    </TooltipButton>,
  );
  expect(screen.getByRole("tooltip").querySelector("kbd")).toHaveTextContent("Ctrl+Shift+S");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(button).not.toHaveAttribute("aria-describedby");
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("delays hover feedback, cancels on leave, and clears pending work on unmount", () => {
  vi.useFakeTimers();
  const view = render(
    <TooltipButton tooltip="Sessions" shortcut="Ctrl+Alt+Y">
      Sessions
    </TooltipButton>,
  );
  const button = screen.getByRole("button");
  fireEvent.mouseEnter(button);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.mouseLeave(button);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.mouseEnter(button);
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole("tooltip")).toHaveTextContent("Sessions");
  fireEvent.mouseLeave(button);
  fireEvent.mouseEnter(button);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the document portal outside clipped controls and stays inside the viewport", () => {
  const view = render(
    <div style={{ overflow: "hidden" }}>
      <TooltipButton tooltip="Sessions" placement="left">
        Sessions
      </TooltipButton>
    </div>,
  );
  const button = screen.getByRole("button");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: -10,
    width: 36,
    height: 36,
    right: 36,
    bottom: 26,
    x: 0,
    y: -10,
    toJSON() {},
  });
  fireEvent.focus(button);
  const tip = screen.getByRole("tooltip");
  expect(tip.parentElement).toBe(document.body);
  expect(view.container).not.toContainElement(tip);
  expect(tip).toHaveStyle({ left: "8px", top: "8px" });
  fireEvent.blur(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
