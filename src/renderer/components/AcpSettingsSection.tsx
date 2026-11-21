import { Bot, Check, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DEFAULT_ACP_SETTINGS,
  type AcpAgentProfile,
  type AcpPermissionPolicy,
  type AcpProbeResult,
  type AcpSettings,
} from "../../shared/acp.js";
import { Button } from "./Button.js";
import { SettingsSelect } from "./SettingsSelect.js";

export function AcpSettingsSection() {
  const [settings, setSettings] = useState<AcpSettings>(DEFAULT_ACP_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<Record<string, AcpProbeResult>>({});
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.desktop;
    if (!bridge?.getAcpSettings) {
      setLoaded(true);
      return;
    }
    void bridge
      .getAcpSettings()
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (next: AcpSettings) => {
    setSettings(next);
    if (!window.desktop?.setAcpSettings) return;
    try {
      const saved = await window.desktop.setAcpSettings(next);
      setSettings(saved);
      setSaveNotice("ACP settings saved.");
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : "Unable to save ACP settings.");
    }
  };

  const updateProfile = (profileId: string, patch: Partial<AcpAgentProfile>) => {
    const next: AcpSettings = {
      ...settings,
      profiles: settings.profiles.map((item) =>
        item.id === profileId ? { ...item, ...patch } : item,
      ),
    };
    void persist(next);
  };

  const addCustomProfile = () => {
    const customId = `custom-${Date.now().toString(36)}`;
    const newProfile: AcpAgentProfile = {
      id: customId,
      name: "Custom ACP Agent",
      badge: "AC",
      builtin: false,
      executable: "",
      defaultCandidates: [],
      args: ["--acp"],
      permissionPolicy: "ask",
      defaultModel: "default",
      defaultReasoning: "medium",
      models: [{ id: "default", name: "Default Model" }],
      reasoningLevels: [
        { id: "low", name: "Low" },
        { id: "medium", name: "Medium" },
        { id: "high", name: "High" },
      ],
    };
    void persist({
      ...settings,
      profiles: [...settings.profiles, newProfile],
    });
  };

  const removeCustomProfile = (profileId: string) => {
    const remaining = settings.profiles.filter((item) => item.id !== profileId);
    const defaultProfileId =
      settings.defaultProfileId === profileId
        ? (remaining[0]?.id ?? "claude")
        : settings.defaultProfileId;
    void persist({ defaultProfileId, profiles: remaining });
  };

  const browseExecutable = async (profileId: string) => {
    if (!window.desktop?.chooseAcpExecutable) return;
    const chosen = await window.desktop.chooseAcpExecutable();
    if (chosen) {
      updateProfile(profileId, { executable: chosen });
    }
  };

  const probeProfile = async (profile: AcpAgentProfile) => {
    if (!window.desktop?.probeAcpProfile || probingId) return;
    setProbingId(profile.id);
    try {
      const result = await window.desktop.probeAcpProfile(
        profile.id,
        profile.executable,
        profile.args,
      );
      setProbeResults((current) => ({ ...current, [profile.id]: result }));
    } catch (error) {
      setProbeResults((current) => ({
        ...current,
        [profile.id]: {
          ok: false,
          resolvedPath: null,
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setProbingId(null);
    }
  };

  return (
    <section className="mt-6" aria-labelledby="acp-agents-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-ui-lg font-semibold" id="acp-agents-heading">
            <Bot className="size-4 text-brand" />
            ACP Agents (Agent Client Protocol)
          </h3>
          <p className="mt-1 text-ui-sm text-foreground-subtle">
            Configure ACP providers launched by the &ldquo;New ACP&rdquo; button. Built-in agents
            are auto-detected from PATH, ~/.local/bin, nvm, bun, and Homebrew.
          </p>
        </div>
        <Button type="button" size="compact" variant="outline" onClick={addCustomProfile}>
          <Plus className="size-3.5" />
          Add ACP agent
        </Button>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium">Default agent for &ldquo;New ACP&rdquo;</div>
            <p className="mt-0.5 text-ui-xs text-foreground-subtle">
              You can also switch providers and models anytime inside any open ACP pane.
            </p>
          </div>
          <SettingsSelect
            label="Default ACP agent"
            value={settings.defaultProfileId}
            onChange={(defaultProfileId) => void persist({ ...settings, defaultProfileId })}
            options={settings.profiles.map((profile) => ({
              id: profile.id,
              label: `${profile.name} (${profile.badge})`,
            }))}
          />
        </div>
      </div>

      {saveNotice && (
        <p role="status" className="mt-2 text-ui-xs text-foreground-subtle">
          {saveNotice}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {settings.profiles.map((profile) => {
          const probe = probeResults[profile.id];
          const isProbing = probingId === profile.id;
          return (
            <div
              key={profile.id}
              className="rounded-xl border border-border bg-panel p-4"
              aria-label={`${profile.name} ACP profile`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-surface font-mono text-ui-xs font-semibold text-brand">
                    {profile.badge}
                  </span>
                  {profile.builtin ? (
                    <span className="text-ui-base font-semibold">{profile.name}</span>
                  ) : (
                    <input
                      type="text"
                      aria-label="Custom agent name"
                      value={profile.name}
                      onChange={(event) =>
                        updateProfile(profile.id, {
                          name: event.target.value,
                          badge: event.target.value.slice(0, 2).toUpperCase() || "AC",
                        })
                      }
                      className="h-7 rounded-md border border-border bg-background px-2 text-ui-sm font-semibold text-foreground outline-none focus:border-brand"
                    />
                  )}
                  {settings.defaultProfileId === profile.id && (
                    <span className="rounded bg-brand/15 px-1.5 py-0.5 text-ui-xs font-medium text-brand">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="compact"
                    variant="outline"
                    disabled={!loaded || isProbing}
                    onClick={() => void probeProfile(profile)}
                  >
                    <Check className="size-3.5" />
                    {isProbing ? "Testing…" : "Test ACP Handshake"}
                  </Button>
                  {!profile.builtin && (
                    <Button
                      type="button"
                      size="compact"
                      variant="ghost"
                      aria-label={`Remove ${profile.name}`}
                      onClick={() => removeCustomProfile(profile.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-ui-xs">
                  <span className="text-foreground-subtle">Executable path</span>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      aria-label={`${profile.name} executable path`}
                      placeholder={
                        profile.defaultCandidates.length
                          ? `Auto-detect (${profile.defaultCandidates.join(" / ")})`
                          : "/path/to/acp-agent"
                      }
                      value={profile.executable}
                      onChange={(event) =>
                        updateProfile(profile.id, { executable: event.target.value })
                      }
                      className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 font-mono text-ui-xs text-foreground outline-none placeholder:text-foreground-subtlest focus:border-brand"
                    />
                    <Button
                      type="button"
                      size="compact"
                      variant="outline"
                      onClick={() => void browseExecutable(profile.id)}
                    >
                      <FolderOpen className="size-3.5" />
                      Browse…
                    </Button>
                  </div>
                </label>

                <label className="block space-y-1 text-ui-xs">
                  <span className="text-foreground-subtle">Arguments (space-separated)</span>
                  <input
                    type="text"
                    aria-label={`${profile.name} arguments`}
                    placeholder="--acp"
                    value={profile.args.join(" ")}
                    onChange={(event) =>
                      updateProfile(profile.id, {
                        args: event.target.value
                          .split(" ")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                    className="h-8 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-ui-xs text-foreground outline-none placeholder:text-foreground-subtlest focus:border-brand"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                <span className="text-ui-xs text-foreground-subtle">Default permission policy</span>
                <SettingsSelect
                  label={`${profile.name} permission policy`}
                  value={profile.permissionPolicy}
                  onChange={(value) =>
                    updateProfile(profile.id, {
                      permissionPolicy: value as AcpPermissionPolicy,
                    })
                  }
                  options={[
                    { id: "ask", label: "Standard (Ask before write / exec)" },
                    { id: "auto_edit", label: "Auto-approve file edits in workspace" },
                    { id: "auto_all", label: "Full access in workspace (フルアクセス)" },
                  ]}
                />
              </div>

              {probe && (
                <p
                  role="status"
                  className={`mt-2 break-all text-ui-xs ${
                    probe.ok ? "text-success" : "text-warning"
                  }`}
                >
                  {probe.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
