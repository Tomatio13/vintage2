export interface Palette {
  id: string;
  name: string;
  light: string;
  dark: string;
  accent: string;
}
export interface ThemePreferences {
  light: string;
  dark: string;
  custom: Palette[];
}
export const palettes: Palette[] = [
  { id: "vintage", name: "Vintage", light: "#faf8f4", dark: "#191816", accent: "#ba8b48" },
  { id: "graphite", name: "Graphite", light: "#f5f5f5", dark: "#181818", accent: "#d79a54" },
  { id: "ocean", name: "Ocean", light: "#f1f7fa", dark: "#14232c", accent: "#459ec2" },
  { id: "grove", name: "Grove", light: "#f3f7ef", dark: "#19261e", accent: "#609b76" },
  { id: "iris", name: "Iris", light: "#f7f3fc", dark: "#211b30", accent: "#a180dc" },
  { id: "ember", name: "Ember", light: "#fcf3ee", dark: "#2b1e19", accent: "#cc875a" },
];
export const defaultThemePreferences: ThemePreferences = {
  light: "vintage",
  dark: "vintage",
  custom: [],
};
export function parsePalette(value: unknown): Palette {
  const p = value as Partial<Palette> | null;
  if (
    !p ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 60 ||
    ![p.light, p.dark, p.accent].every((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
  ) {
    throw new Error(
      "Use a theme with a name and six-digit hex colors for light, dark, and accent.",
    );
  }
  return {
    id: typeof p.id === "string" ? p.id : "",
    name: p.name.trim(),
    light: p.light!,
    dark: p.dark!,
    accent: p.accent!,
  };
}
export function restoreThemePreferences(value: unknown): ThemePreferences {
  const p = value as Partial<ThemePreferences> | null;
  const custom: Palette[] = [];
  if (Array.isArray(p?.custom))
    for (const item of p.custom.slice(0, 100)) {
      try {
        const parsed = parsePalette(item);
        if (parsed.id.startsWith("custom-") && !custom.some((c) => c.id === parsed.id))
          custom.push(parsed);
      } catch {
        /* Ignore invalid saved themes. */
      }
    }
  const all = [...palettes, ...custom];
  return {
    light: all.some((c) => c.id === p?.light) ? p!.light! : "vintage",
    dark: all.some((c) => c.id === p?.dark) ? p!.dark! : "vintage",
    custom,
  };
}
export function mix(a: string, b: string, amount: number): string {
  const channel = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(channel(a, i) * (1 - amount) + channel(b, i) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
export function contrastText(background: string) {
  return luminance(background) > 0.179 ? "#171717" : "#f5f5f5";
}
export function paletteTokens(p: Palette, dark: boolean): Record<string, string> {
  const base = dark ? p.dark : p.light;
  const fg = contrastText(base);
  let accent = p.accent;
  for (
    let i = 0;
    i < 16 &&
    (Math.max(luminance(accent), luminance(base)) + 0.05) /
      (Math.min(luminance(accent), luminance(base)) + 0.05) <
      4.5;
    i++
  )
    accent = mix(accent, fg, 0.15);
  const tokens: Record<string, string> = {};
  for (const key of ["background", "terminal", "input"]) tokens[key] = base;
  for (const key of ["panel", "sidebar", "card", "header", "terminal-surface"])
    tokens[key] = mix(base, fg, 0.035);
  tokens.popover = mix(base, fg, 0.065);
  for (const key of ["hover", "selected"]) tokens[key] = mix(base, p.accent, 0.18);
  for (const key of ["border", "panel-divider", "input-border", "pane-active-border"])
    tokens[key] = mix(base, fg, 0.2);
  for (const key of ["brand", "primary", "input-border-focused"]) tokens[key] = accent;
  tokens["primary-foreground"] = contrastText(accent);
  tokens.foreground = fg;
  tokens["foreground-subtle"] = mix(base, fg, 0.73);
  tokens["foreground-subtlest"] = mix(base, fg, 0.6);
  return tokens;
}
export function applyTheme(
  mode: string,
  preferences: ThemePreferences | undefined,
  systemDark: boolean,
) {
  const dark = mode === "dark" || mode === "graphite" || (mode === "system" && systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  const settings = restoreThemePreferences(preferences);
  const id = mode === "graphite" ? "graphite" : dark ? settings.dark : settings.light;
  root.classList.toggle("graphite", id === "graphite" && dark);
  const p = [...palettes, ...settings.custom].find((p) => p.id === id)!;
  const tokens = paletteTokens(p, dark);
  for (const key of Object.keys(tokens)) root.style.removeProperty(`--color-${key}`);
  // Preserve the original Vintage and Graphite palettes exactly.
  if (id !== "vintage" && !(id === "graphite" && dark))
    for (const [key, value] of Object.entries(tokens))
      root.style.setProperty(`--color-${key}`, value);
  window.dispatchEvent(new Event("vintage-theme-changed"));
}
