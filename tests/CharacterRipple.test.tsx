import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CharacterRipple } from "../src/renderer/components/CharacterRipple.js";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";

afterEach(() => {
  useUiStore.setState({
    characterRippleEnabled: false,
    characterRippleIntensity: 50,
    characterRippleColor: null,
    settingsOpen: false,
  });
  vi.restoreAllMocks();
});

it("saves enablement and intensity through Appearance and restores them", async () => {
  useUiStore.setState({
    characterRippleEnabled: false,
    characterRippleIntensity: 50,
    characterRippleColor: null,
    settingsOpen: true,
  });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("switch", { name: "Character ripple" }));
  fireEvent.change(screen.getByRole("slider", { name: "Ripple intensity" }), {
    target: { value: "80" },
  });
  fireEvent.change(screen.getByLabelText("Ripple color"), { target: { value: "#3366cc" } });
  const saved = localStorage.getItem("ai-workspace-starter-ui")!;
  expect(JSON.parse(saved).state).toMatchObject({
    characterRippleEnabled: true,
    characterRippleIntensity: 80,
    characterRippleColor: "#3366cc",
  });
  act(() => useUiStore.setState({ characterRippleEnabled: false, characterRippleIntensity: 50 }));
  localStorage.setItem("ai-workspace-starter-ui", saved);
  await act(() => useUiStore.persist.rehydrate());
  expect(useUiStore.getState()).toMatchObject({
    characterRippleEnabled: true,
    characterRippleIntensity: 80,
    characterRippleColor: "#3366cc",
  });
  fireEvent.click(screen.getByRole("button", { name: "Use theme color" }));
  expect(useUiStore.getState().characterRippleColor).toBeNull();
});

it("leaves old saved settings disabled and clamps invalid intensity", async () => {
  localStorage.setItem(
    "ai-workspace-starter-ui",
    JSON.stringify({
      state: { characterRippleIntensity: 10000, characterRippleColor: "invalid" },
      version: 0,
    }),
  );
  await useUiStore.persist.rehydrate();
  expect(useUiStore.getState()).toMatchObject({
    characterRippleEnabled: false,
    characterRippleIntensity: 100,
    characterRippleColor: null,
  });
});

it("animates without consuming input, becomes idle, and cancels on disable", () => {
  const context = { clearRect: vi.fn(), setTransform: vi.fn(), fillText: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  let callback: FrameRequestCallback = () => {};
  const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
    callback = next;
    return 42;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  useUiStore.setState({ characterRippleEnabled: true });
  const { container } = render(<CharacterRipple />);
  expect(container.querySelector("canvas")).toHaveClass("pointer-events-none");
  expect(request).not.toHaveBeenCalled();
  const event = new Event("pointerdown", { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, isPrimary: true, clientX: 100, clientY: 100 });
  const now = performance.now();
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  callback(now + 250);
  expect(context.fillText).toHaveBeenCalled();
  callback(now + 2000);
  const count = request.mock.calls.length;
  expect(count).toBe(2);
  window.dispatchEvent(event);
  act(() => useUiStore.setState({ characterRippleEnabled: false }));
  expect(cancel).toHaveBeenCalledWith(42);
  expect(container.querySelector("canvas")).toBeNull();
  window.dispatchEvent(event);
  expect(request).toHaveBeenCalledTimes(count + 1);
});

it("does not schedule animation when reduced motion is requested", () => {
  const context = { clearRect: vi.fn(), setTransform: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  const request = vi.spyOn(window, "requestAnimationFrame");
  useUiStore.setState({ characterRippleEnabled: true });
  render(<CharacterRipple />);
  const event = new Event("pointerdown");
  Object.assign(event, { button: 0, isPrimary: true });
  window.dispatchEvent(event);
  expect(request).not.toHaveBeenCalled();
});
