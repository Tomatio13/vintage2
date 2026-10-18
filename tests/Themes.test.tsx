import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { applyTheme, parsePalette, restoreThemePreferences } from "../src/renderer/lib/themes.js";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog.js";
import { useUiStore } from "../src/renderer/store/uiStore.js";

afterEach(() => {
  useUiStore.setState({
    settingsOpen: false,
    theme: "system",
    themePreferences: restoreThemePreferences(null),
  });
  applyTheme("light", undefined, false);
});
it("keeps light and dark choices independent and updates the running theme", () => {
  const p = restoreThemePreferences({ light: "ocean", dark: "iris" });
  applyTheme("system", p, false);
  expect(document.documentElement.style.getPropertyValue("--color-background")).toBe("#f1f7fa");
  applyTheme("system", p, true);
  expect(document.documentElement.style.getPropertyValue("--color-background")).toBe("#211b30");
  applyTheme("dark", undefined, false);
  expect(document.documentElement.style.getPropertyValue("--color-background")).toBe("");
});
it("rejects invalid imports and recovers missing or corrupt palettes", () => {
  expect(() =>
    parsePalette({ name: "Bad", light: "url(x)", dark: "#123456", accent: "#123456" }),
  ).toThrow();
  expect(restoreThemePreferences({ light: "missing", custom: [null, { id: "custom-1" }] })).toEqual(
    { light: "vintage", dark: "vintage", custom: [] },
  );
});
it("persists palette choices, duplicates and edits a theme, and falls back when deleted", () => {
  useUiStore.setState({
    settingsOpen: true,

    theme: "dark",
    themePreferences: restoreThemePreferences(null),
  });
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Ocean dark palette" }));
  expect(useUiStore.getState().themePreferences?.dark).toBe("ocean");
  fireEvent.click(screen.getByRole("button", { name: "Duplicate Ocean" }));
  fireEvent.change(screen.getByLabelText("Theme name"), { target: { value: "My Ocean" } });
  fireEvent.blur(screen.getByLabelText("Theme name"));
  fireEvent.change(screen.getByLabelText("Theme accent color"), { target: { value: "#aabbcc" } });
  fireEvent.click(screen.getByRole("button", { name: "My Ocean dark palette" }));
  expect(
    JSON.parse(localStorage.getItem("ai-workspace-starter-ui")!).state.themePreferences.custom[0]
      .accent,
  ).toBe("#aabbcc");
  fireEvent.click(screen.getByRole("button", { name: "Delete My Ocean" }));
  expect(useUiStore.getState().themePreferences?.dark).toBe("vintage");
});

it("uses a light Graphite palette without enabling dark CSS", () => {
  applyTheme("light", restoreThemePreferences({ light: "graphite" }), false);
  expect(document.documentElement.classList.contains("graphite")).toBe(false);
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(document.documentElement.style.getPropertyValue("--color-background")).toBe("#f5f5f5");
});
