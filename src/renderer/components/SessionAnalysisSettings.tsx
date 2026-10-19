import { useEffect, useState } from "react";
import {
  defaultAnalysisSettings,
  type SessionAnalysisSettings as AnalysisSettings,
} from "../../shared/sessionAnalysis.js";
import { Button } from "./Button.js";
import { SettingsSelect } from "./SettingsSelect.js";

export function SessionAnalysisSettings() {
  const [settings, setSettings] = useState<AnalysisSettings>({ ...defaultAnalysisSettings });
  const [saved, setSaved] = useState<AnalysisSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let stale = false;
    void window.desktop
      ?.getSessionAnalysisSettings?.()
      .then((value) => {
        if (!stale) {
          setSettings(value);
          setSaved(value);
        }
      })
      .catch(() => {
        if (!stale) setMessage("Unable to load analysis settings.");
      });
    return () => {
      stale = true;
    };
  }, []);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const execute = async (probe: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      if (!window.desktop) throw new Error("Available in the desktop app.");
      if (probe) {
        const result = await window.desktop.probeSessionAnalysis(settings);
        setMessage(`${result.version} — ${result.authentication}`);
      } else {
        const value = await window.desktop.setSessionAnalysisSettings(settings);
        setSettings(value);
        setSaved(value);
        setMessage("Analysis settings saved.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update analysis settings.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-6" aria-labelledby="session-analysis-heading">
      <h3 id="session-analysis-heading" className="text-ui-lg font-semibold">
        Session analysis
      </h3>
      <p className="mb-3 mt-1 text-ui-sm text-foreground-subtle">
        Manually analyze a session's recent conversation using your CLI login. Each analysis sends
        excerpts to the selected provider and consumes your plan allowance or API credits. Unchanged
        sessions reuse saved results.
      </p>
      <fieldset
        disabled={busy || !saved}
        className="space-y-4 rounded-xl border border-border bg-panel p-5"
      >
        <label className="block space-y-2 text-ui-sm">
          <span>Analysis CLI</span>
          <SettingsSelect
            label="Analysis CLI"
            value={settings.cli}
            onChange={(cli) => {
              setSettings({ cli: cli as AnalysisSettings["cli"], executable: "", model: "" });
              setMessage("");
            }}
            options={[
              { id: "codex", label: "Codex" },
              { id: "claude", label: "Claude Code" },
            ]}
          />
        </label>
        <label className="block space-y-2 text-ui-sm">
          <span>Executable path</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            aria-label="Executable path"
            placeholder={`Auto-detect ${settings.cli}`}
            value={settings.executable}
            onChange={(event) => setSettings({ ...settings, executable: event.target.value })}
          />
          <span className="block text-ui-xs text-foreground-subtle">
            Optional absolute path to the CLI executable. No command arguments.
          </span>
        </label>
        <label className="block space-y-2 text-ui-sm">
          <span>Analysis model</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            aria-label="Analysis model"
            placeholder="CLI default"
            value={settings.model}
            onChange={(event) => setSettings({ ...settings, model: event.target.value })}
          />
          <span className="block text-ui-xs text-foreground-subtle">
            Optional model name supported by your CLI account. Analysis runs separately from the
            original conversation.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty} onClick={() => void execute(false)}>
            Save analysis settings
          </Button>
          <Button variant="outline" onClick={() => void execute(true)}>
            Check CLI connection
          </Button>
        </div>
      </fieldset>
      {busy && (
        <p role="status" className="mt-2 text-ui-xs text-foreground-subtle">
          Checking CLI…
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 break-words text-ui-xs text-foreground-subtle">
          {message}
        </p>
      )}
    </section>
  );
}
