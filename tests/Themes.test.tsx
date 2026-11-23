import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  applyTheme,
  parsePalette,
  parseThemeImport,
  restoreThemePreferences,
} from "../src/renderer/lib/themes.js";
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

it("imports T3 color variants and restores endpoint colors without importing CSS", () => {
  const palette = parseThemeImport({
    version: 1,
    name: "Night Sky",
    appearance: "dark",
    colors: {
      canvas: "#000",
      accent: "#aabbcc",
      sidebar: "oklch(1 0 0 / 0.2)",
      terminalCursor: "#eeeeee",
    },
    variants: { light: { canvas: "#fff", accent: "#334455" } },
    css: "body { display: none }",
  });
  expect(palette).toMatchObject({ light: "#ffffff", dark: "#000000", accent: "#aabbcc" });
  expect(palette).not.toHaveProperty("css");
  const themePreferences = restoreThemePreferences({
    light: "custom-t3",
    dark: "custom-t3",
    custom: [{ ...palette, id: "custom-t3" }],
  });
  applyTheme("dark", themePreferences, false);
  expect(document.documentElement.style.getPropertyValue("--color-sidebar")).toBe("#333333");
  expect(document.documentElement.style.getPropertyValue("--color-terminal-cursor")).toBe(
    "#eeeeee",
  );
  applyTheme("light", themePreferences, false);
  expect(document.documentElement.style.getPropertyValue("--color-brand")).toBe("#334455");
  expect(document.documentElement.style.getPropertyValue("--color-terminal-cursor")).toBe("");
});

it("imports a T3 JSON file from Appearance settings", async () => {
  useUiStore.setState({
    settingsOpen: true,
    theme: "dark",
    themePreferences: restoreThemePreferences(null),
  });
  render(<SettingsDialog />);
  const file = new File([""], "skin.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: async () =>
      JSON.stringify({
        version: 1,
        name: "T3 Night",
        appearance: "dark",
        colors: { canvas: "#123456" },
      }),
  });
  fireEvent.change(screen.getByLabelText("Import theme JSON"), { target: { files: [file] } });
  const palette = await screen.findByRole("button", { name: "T3 Night copy dark palette" });
  fireEvent.click(palette);
  await waitFor(() => expect(useUiStore.getState().themePreferences?.dark).toMatch(/^custom-/));
  expect(useUiStore.getState().themePreferences?.custom[0]?.dark).toBe("#123456");
});

it("restores safe gradient layers and clears them when changing palettes", () => {
  const gradient = "linear-gradient(90deg, rgb(30 40 50 / 50%), transparent)";
  const preferences = restoreThemePreferences({
    dark: "custom-gradient",
    custom: [
      {
        id: "custom-gradient",
        name: "Gradient",
        light: "#ffffff",
        dark: "#000000",
        accent: "#778899",
        gradients: {
          dark: {
            message: {
              image: gradient,
              position: "10px 20px",
              size: "64px 64px",
              repeat: "no-repeat",
            },
            workspace: gradient + ", url(remote.png)",
          },
        },
        colors: { dark: { "chat-code-background": "#012345" } },
      },
    ],
  });
  const root = document.documentElement;
  applyTheme("dark", preferences, false);
  expect(root.style.getPropertyValue("--theme-gradient-message")).toBe(gradient);
  expect(root.style.getPropertyValue("--theme-gradient-message-position")).toBe("10px 20px");
  expect(root.style.getPropertyValue("--theme-gradient-message-size")).toBe("64px 64px");
  expect(root.style.getPropertyValue("--theme-gradient-message-repeat")).toBe("no-repeat");
  expect(root.style.getPropertyValue("--theme-gradient-workspace")).toBe("");
  expect(root.style.getPropertyValue("--color-chat-code-background")).toBe("#012345");
  applyTheme("dark", undefined, false);
  expect(root.style.getPropertyValue("--theme-gradient-message")).toBe("");
  expect(root.style.getPropertyValue("--theme-gradient-message-size")).toBe("");
  expect(root.style.getPropertyValue("--color-chat-code-background")).toBe("");
});
