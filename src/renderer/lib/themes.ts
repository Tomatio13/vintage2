import {
  gradientProperties,
  gradientTargets,
  importThemeGradients,
  readThemeGradient,
  type ThemeGradients,
} from "./themeGradients.js";

type Appearance = "light" | "dark";

const t3ColorRoles = {
  text: "foreground",
  mutedForeground: "foreground-subtle",
  secondaryLabel: "foreground-subtlest",
  surface: "panel",
  sidebar: "sidebar",
  surfaceRaised: "card",
  chrome: "header",
  surfaceOverlay: "popover",
  input: "input",
  border: "border",
  sidebarBorder: "panel-divider",
  sidebarRowHover: "hover",
  sidebarRowSelected: "selected",
  focus: "input-border-focused",
  accentForeground: "primary-foreground",
  terminalBackground: "terminal",
  terminalForeground: "terminal-foreground",
  terminalCursor: "terminal-cursor",
  terminalSelection: "terminal-selection",
  terminalScrollbar: "terminal-scrollbar",
  terminalScrollbarHover: "terminal-scrollbar-hover",
  toolbar: "toolbar",
  toolbarForeground: "toolbar-foreground",
  toolbarBorder: "toolbar-border",
  sidebarForeground: "sidebar-foreground",
  sidebarMutedForeground: "sidebar-muted-foreground",
  placeholder: "placeholder",
  messageSurface: "message-surface",
  messageForeground: "message-foreground",
  messageAction: "message-action",
  messageActionForeground: "message-action-foreground",
  messageActionHover: "message-action-hover",
  codeBackground: "chat-code-background",
  codeForeground: "chat-code-foreground",
  error: "destructive",
  warning: "warning",
} as const;

const importedTokenNames = Object.values(t3ColorRoles);
const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export interface Palette {
  id: string;
  name: string;
  light: string;
  dark: string;
  accent: string;
  gradients?: Partial<Record<Appearance, ThemeGradients>>;
  accents?: Partial<Record<Appearance, string>>;
  colors?: Partial<Record<Appearance, Record<string, string>>>;
}
export interface ThemePreferences {
  light: string;
  dark: string;
  custom: Palette[];
  wallpaperOpacity?: number;
  wallpaperBlur?: number;
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
    ![p.light, p.dark, p.accent].every(isHexColor)
  ) {
    throw new Error(
      "Use a theme with a name and six-digit hex colors for light, dark, and accent.",
    );
  }
  const accents: NonNullable<Palette["accents"]> = {};
  const gradients: NonNullable<Palette["gradients"]> = {};
  const colors: NonNullable<Palette["colors"]> = {};
  for (const mode of ["light", "dark"] as const) {
    const accent = p.accents?.[mode];
    if (isHexColor(accent)) accents[mode] = accent;
    const paint = record(p.gradients?.[mode]);
    const layers = gradientTargets.flatMap((target) => {
      const value = readThemeGradient(paint?.[target]);
      return value ? [[target, value] as const] : [];
    });
    if (layers.length) gradients[mode] = Object.fromEntries(layers);
    const tokens = record(p.colors?.[mode]);
    const entries = importedTokenNames.flatMap((token) => {
      const value = tokens?.[token];
      return isHexColor(value) ? [[token, value] as const] : [];
    });
    if (entries.length) colors[mode] = Object.fromEntries(entries);
  }
  return {
    ...(Object.keys(gradients).length ? { gradients } : {}),
    ...(Object.keys(accents).length ? { accents } : {}),
    ...(Object.keys(colors).length ? { colors } : {}),
    id: typeof p.id === "string" ? p.id : "",
    name: p.name.trim(),
    light: p.light!,
    dark: p.dark!,
    accent: p.accent!,
  };
}
function importColor(value: unknown, background: string): string | undefined {
  if (isHexColor(value)) return value;
  if (typeof value !== "string") return undefined;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    const raw = hex[1]!;
    const expanded = raw.length < 5 ? [...raw].map((digit) => digit + digit).join("") : raw;
    const rgb = "#" + expanded.slice(0, 6);
    return expanded.length === 8
      ? mix(background, rgb, parseInt(expanded.slice(6), 16) / 255)
      : rgb;
  }

  const oklch =
    /^oklch\(\s*([.\d]+)(%?)\s+([.\d]+)\s+(-?[.\d]+)(?:deg)?(?:\s*\/\s*([.\d]+)(%?))?\s*\)$/i.exec(
      value,
    );
  if (!oklch) return undefined;
  const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1);
  const chroma = Number(oklch[3]);
  const hue = ((Number(oklch[4]) % 360) * Math.PI) / 180;
  const alpha = oklch[5] === undefined ? 1 : Number(oklch[5]) / (oklch[6] ? 100 : 1);
  if (
    ![lightness, chroma, hue, alpha].every(Number.isFinite) ||
    lightness > 1 ||
    chroma > 1 ||
    alpha > 1
  )
    return undefined;

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  // Convert OKLab to linear sRGB, then encode and clip each channel for the palette.
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const rgb =
    "#" +
    channels
      .map((channel) => {
        const linear = Math.max(0, Math.min(1, channel));
        const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
        return Math.round(encoded * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("");
  return mix(background, rgb, alpha);
}

export function parseThemeImport(value: unknown): Palette {
  const theme = record(value);
  if (!theme || !("appearance" in theme)) return parsePalette(value);
  const mode = theme.appearance;
  if (theme.version !== 1 || (mode !== "light" && mode !== "dark")) {
    throw new Error("Use a T3 Code version 1 theme with a light or dark appearance.");
  }

  const baseColors = record(theme.colors);
  if (!baseColors) throw new Error("The T3 Code theme needs a colors object.");
  const otherMode = mode === "light" ? "dark" : "light";
  const otherColors = record(record(theme.variants)?.[otherMode]);
  const defaults = palettes[0]!;
  const mapColors = (source: Record<string, unknown>, background: string) =>
    Object.fromEntries(
      Object.entries(t3ColorRoles).flatMap(([role, token]) => {
        const color = importColor(source[role], background);
        return color ? [[token, color]] : [];
      }),
    );
  const canvas =
    importColor(baseColors.canvas, defaults[mode]) ?? importColor(theme.canvas, defaults[mode]);
  const accent =
    importColor(baseColors.accent, canvas ?? defaults[mode]) ??
    importColor(theme.accent, canvas ?? defaults[mode]);
  const base = mapColors(baseColors, canvas ?? defaults[mode]);
  const variantCanvas = importColor(otherColors?.canvas, defaults[otherMode]);
  const variantAccent = importColor(otherColors?.accent, variantCanvas ?? defaults[otherMode]);
  const variant = otherColors ? mapColors(otherColors, variantCanvas ?? defaults[otherMode]) : {};
  if (
    !canvas &&
    !accent &&
    !variantCanvas &&
    !variantAccent &&
    !Object.keys(base).length &&
    !Object.keys(variant).length
  ) {
    throw new Error("The T3 Code theme needs at least one supported hex or OKLCH color.");
  }
  return parsePalette({
    name: theme.name,
    gradients: {
      [mode]: importThemeGradients(theme.css, mode === "dark"),
      ...(otherColors
        ? { [otherMode]: importThemeGradients(theme.css, otherMode === "dark") }
        : {}),
    },
    light: defaults.light,
    dark: defaults.dark,
    [mode]: canvas ?? defaults[mode],
    [otherMode]: variantCanvas ?? defaults[otherMode],
    accent: accent ?? defaults.accent,
    accents: { [mode]: accent, [otherMode]: variantAccent ?? defaults.accent },
    colors: { [mode]: base, [otherMode]: variant },
  });
}

export const wallpaperDefaults = { opacity: 85, blur: 8 };

function boundedInteger(value: unknown, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value)))
    : fallback;
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
    ...(p?.wallpaperOpacity !== undefined
      ? { wallpaperOpacity: boundedInteger(p.wallpaperOpacity, 100, wallpaperDefaults.opacity) }
      : {}),
    ...(p?.wallpaperBlur !== undefined
      ? { wallpaperBlur: boundedInteger(p.wallpaperBlur, 24, wallpaperDefaults.blur) }
      : {}),
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
  const mode = dark ? "dark" : "light";
  const sourceAccent = p.accents?.[mode] ?? p.accent;
  let accent = sourceAccent;
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
  for (const key of ["hover", "selected"]) tokens[key] = mix(base, sourceAccent, 0.18);
  for (const key of ["border", "panel-divider", "input-border", "pane-active-border"])
    tokens[key] = mix(base, fg, 0.2);
  for (const key of ["brand", "primary", "input-border-focused"]) tokens[key] = accent;
  tokens["primary-foreground"] = contrastText(accent);
  tokens.foreground = fg;
  tokens["foreground-subtle"] = mix(base, fg, 0.73);
  tokens["foreground-subtlest"] = mix(base, fg, 0.6);
  return { ...tokens, ...p.colors?.[mode] };
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
  for (const key of [...Object.keys(tokens), ...importedTokenNames]) {
    root.style.removeProperty(`--color-${key}`);
  }
  // Preserve the original Vintage and Graphite palettes exactly.
  if (id !== "vintage" && !(id === "graphite" && dark))
    for (const [key, value] of Object.entries(tokens))
      root.style.setProperty(`--color-${key}`, value);
  for (const target of gradientTargets) {
    const gradient = p.gradients?.[dark ? "dark" : "light"]?.[target];
    for (const property of gradientProperties) {
      const name =
        property === "image"
          ? `--theme-gradient-${target}`
          : `--theme-gradient-${target}-${property}`;
      const value = gradient?.[property];
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
  }
  window.dispatchEvent(new Event("vintage-theme-changed"));
}
