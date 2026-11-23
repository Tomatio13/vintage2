const targets = {
  html: "workspace",
  body: "workspace",
  "body::before": "workspace",
  ":root": "workspace",
  "[data-chat-canvas]": "chat",
  "[data-user-message-bubble]": "message",
  "[data-slot=composer-shell]": "composer",
  "[data-slot=composer-shell]::before": "composer",
} as const;

type GradientTarget = (typeof targets)[keyof typeof targets];
export const gradientProperties = ["image", "position", "size", "repeat"] as const;
type GradientProperty = (typeof gradientProperties)[number];
type GradientPaint = Partial<Record<GradientProperty, string>> & { image: string };
export type ThemeGradients = Partial<Record<GradientTarget, GradientPaint>>;
export const gradientTargets = [...new Set(Object.values(targets))];

// Only paint values are persisted. Selectors, variables and resource references never apply.
const gradientPattern =
  /(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[\w.#,%+\s/-]|(?:rgba?|hsla?|oklch|oklab)\([\w.#,%+\s/-]+\))*\)/gi;

function readGradientImage(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  const layers = value.match(gradientPattern);
  const normalize = (text: string) => text.trim().replace(/\s*,\s*/g, ",");
  return layers && normalize(value) === normalize(layers.join(",")) ? value : undefined;
}

const placementPatterns = {
  position: /^(?:[\d.%+\s,-]|px|top|right|bottom|left|center)+$/i,
  size: /^(?:[\d.%+\s,-]|px|auto|contain|cover)+$/i,
  repeat: /^(?:[\s,]|no-repeat|repeat-x|repeat-y|repeat|space|round)+$/i,
};

export function readThemeGradient(value: unknown): GradientPaint | undefined {
  if (typeof value === "string") {
    const image = readGradientImage(value);
    return image ? { image } : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const fields = value as Partial<Record<GradientProperty, unknown>>;
  const image = readGradientImage(fields.image);
  if (!image) return undefined;
  const paint: GradientPaint = { image };
  for (const property of ["position", "size", "repeat"] as const) {
    const field = fields[property];
    if (
      typeof field === "string" &&
      field.length <= 256 &&
      placementPatterns[property].test(field)
    ) {
      paint[property] = field;
    }
  }
  return paint;
}

function splitLayers(value: string) {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  // CSSOM serializes quoted URLs; skip strings so their punctuation cannot split a layer.
  for (const match of value.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[(),]/g)) {
    if (match[0] === "(") depth++;
    else if (match[0] === ")") depth--;
    else if (match[0] === "," && depth === 0) {
      layers.push(value.slice(start, match.index).trim());
      start = match.index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

function readGradientRule(style: CSSStyleDeclaration): GradientPaint | undefined {
  const layers = splitLayers(style.backgroundImage)
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => readGradientImage(image))
    .slice(0, 4);
  if (!layers.length) return undefined;
  const select = (value: string, fallback: string) => {
    const entries = splitLayers(value);
    return layers
      .map(({ index }) => {
        const entry = entries[index % entries.length];
        return !entry || entry === "initial" ? fallback : entry;
      })
      .join(", ");
  };
  return readThemeGradient({
    image: layers.map(({ image }) => image).join(", "),
    position: select(style.backgroundPosition, "0% 0%"),
    size: select(style.backgroundSize, "auto"),
    repeat: select(style.backgroundRepeat, "repeat"),
  });
}

export function importThemeGradients(css: unknown, dark: boolean): ThemeGradients {
  const gradients: ThemeGradients = {};
  if (
    typeof css !== "string" ||
    typeof CSSStyleSheet === "undefined" ||
    typeof CSSStyleSheet.prototype.replaceSync !== "function"
  )
    return gradients;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  for (const rule of Array.from(sheet.cssRules)) {
    if (!(rule instanceof CSSStyleRule)) continue;
    for (const rawSelector of rule.selectorText.split(",")) {
      let selector = rawSelector.trim().replace(/\[([^\]]+)=["']([^"'\]]+)["']\]/g, "[$1=$2]");
      if (selector.startsWith(".dark ")) {
        if (!dark) continue;
        selector = selector.slice(6);
      } else if (selector.startsWith(":root:not(.dark) ")) {
        if (dark) continue;
        selector = selector.slice(17);
      }
      const target = Object.hasOwn(targets, selector)
        ? targets[selector as keyof typeof targets]
        : undefined;
      if (!target) continue;
      const value = readGradientRule(rule.style);
      if (value) gradients[target] = value;
    }
  }
  return gradients;
}
