import { Copy, Moon, Palette as PaletteIcon, Sun, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  palettes,
  restoreThemePreferences,
  parsePalette,
  paletteTokens,
  type Palette,
} from "../lib/themes.js";
import type { VintageSettings } from "../store/uiStore.js";

export function ThemeSettings({
  settings,
  change,
}: {
  settings: VintageSettings;
  change(patch: Partial<VintageSettings>): void;
}) {
  const prefs = restoreThemePreferences(settings.themePreferences);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const all = [...palettes, ...prefs.custom];
  const active = all.find((p) => p.id === editing);
  const button =
    "rounded-lg border border-border px-3 py-2 text-ui-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand";
  const iconButton =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground-subtle hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  const saveCustom = (p: Palette) => {
    change({
      themePreferences: { ...prefs, custom: [...prefs.custom.filter((c) => c.id !== p.id), p] },
    });
  };
  const duplicate = (p: Palette) => {
    if (prefs.custom.length >= 100) {
      setError("You can save up to 100 custom themes.");
      return;
    }
    const copy = { ...p, id: `custom-${crypto.randomUUID()}`, name: `${p.name.slice(0, 54)} copy` };
    saveCustom(copy);
    setEditing(copy.id);
  };
  return (
    <section className="mt-5" aria-label="Theme palettes">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-ui-lg font-semibold">Themes</h3>
          <p className="mt-1 text-ui-sm text-foreground-subtle">
            Choose a palette for each appearance. Duplicate any theme to make it yours.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={iconButton}
            aria-label="Create theme"
            title="Create theme"
            onClick={() => duplicate(all.find((p) => p.id === prefs.dark)!)}
          >
            <PaletteIcon aria-hidden="true" className="size-4" />
          </button>
          <button
            className={iconButton}
            aria-label="Import theme"
            title="Import theme from JSON"
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Import theme JSON"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 65536) throw new Error("Theme files must be smaller than 64 KB.");
            const p = parsePalette(JSON.parse(await file.text()));
            duplicate(p);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to import theme.");
          }
        }}
      />
      {error && (
        <p role="alert" className="mb-3 text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {all.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-panel p-3">
            <div className="mb-4 flex items-center justify-center gap-5 py-2">
              {(["light", "dark"] as const).map((mode) => {
                const selected =
                  (settings.theme === "graphite" && mode === "dark" ? "graphite" : prefs[mode]) ===
                  p.id;
                const tokens = paletteTokens(p, mode === "dark");
                return (
                  <button
                    key={mode}
                    aria-label={`${p.name} ${mode} palette`}
                    aria-pressed={selected}
                    onClick={() =>
                      change({
                        theme: settings.theme === "graphite" ? "dark" : settings.theme,
                        themePreferences: { ...prefs, [mode]: p.id },
                      })
                    }
                    title={`${mode === "light" ? "Light" : "Dark"}${selected ? " · Selected" : ""}`}
                    className={`relative rounded-full p-1.5 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${selected ? "ring-2 ring-brand" : "ring-2 ring-transparent"}`}
                  >
                    <span
                      aria-hidden="true"
                      className="block size-16 rounded-full"
                      style={{
                        background: `radial-gradient(ellipse at 28% 22%, ${mode === "light" ? "#ffffffb3" : "#ffffff1f"}, transparent 52%), radial-gradient(ellipse at 72% 26%, ${p.accent}, transparent 68%), radial-gradient(ellipse at 25% 85%, ${tokens.brand}, transparent 70%), ${tokens.background}`,
                        boxShadow: "inset 0 0 0 1px #ffffff0a, inset -5px -8px 14px #0000001a",
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full border border-border bg-panel ${selected ? "text-brand" : "text-foreground-subtle"}`}
                    >
                      {mode === "light" ? (
                        <Sun className="size-3.5" />
                      ) : (
                        <Moon className="size-3.5" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ui-base font-medium">{p.name}</span>
              <button
                className={iconButton}
                aria-label={`Duplicate ${p.name}`}
                title={`Duplicate ${p.name}`}
                onClick={() => duplicate(p)}
              >
                <Copy aria-hidden="true" className="size-4" />
              </button>
            </div>
            {p.id.startsWith("custom-") && (
              <div className="mt-2 flex gap-2">
                <button
                  className={button}
                  onClick={() => setEditing(editing === p.id ? null : p.id)}
                >
                  Edit
                </button>
                <button
                  className={button}
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "vintage-theme.json";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Export
                </button>
                <button
                  className={button}
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    change({
                      themePreferences: {
                        light: prefs.light === p.id ? "vintage" : prefs.light,
                        dark: prefs.dark === p.id ? "vintage" : prefs.dark,
                        custom: prefs.custom.filter((c) => c.id !== p.id),
                      },
                    });
                    setEditing(null);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {active && (
        <div
          className="mt-4 rounded-xl border border-border bg-panel p-4"
          aria-label="Theme editor"
        >
          <h4 className="mb-3 font-semibold">Edit theme</h4>
          <label className="mb-4 flex items-center justify-between gap-4">
            Name
            <input
              className="min-w-0 rounded border border-input-border bg-input px-3 py-2"
              aria-label="Theme name"
              maxLength={60}
              key={active.id}
              defaultValue={active.name}
              onBlur={(e) => saveCustom({ ...active, name: e.target.value.trim() || active.name })}
            />
          </label>
          {(["light", "dark", "accent"] as const).map((key) => (
            <label key={key} className="mt-3 flex items-center justify-between gap-4 capitalize">
              {key === "accent" ? "Accent" : `${key} background`}
              <input
                aria-label={`Theme ${key} color`}
                type="color"
                value={active[key]}
                onChange={(e) => saveCustom({ ...active, [key]: e.target.value })}
              />
            </label>
          ))}
          <p className="mt-3 text-ui-sm text-foreground-subtle">
            Text and borders adjust automatically. Select this palette above to see changes in your
            workspace.
          </p>
          <button className={`${button} mt-3`} onClick={() => setEditing(null)}>
            Done
          </button>
        </div>
      )}
    </section>
  );
}
