import { ChevronRight, FolderOpen, Plus, Settings, TerminalSquare } from "lucide-react";
import { Button } from "./Button.js";

export interface SidebarWorkspace {
  id: string;
  name: string;
  tabs: Array<{ id: string; title: string; panes: Array<unknown> }>;
  activeTabId: string;
}

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  onOpenWorkspace,
  onNewTerminal,
  onSelectWorkspace,
  onSelectTab,
  onOpenSettings,
}: {
  workspaces: SidebarWorkspace[];
  activeWorkspaceId: string | null;
  onOpenWorkspace(): void;
  onNewTerminal(): void;
  onSelectWorkspace(workspaceId: string): void;
  onSelectTab(workspaceId: string, tabId: string): void;
  onOpenSettings(): void;
}) {
  return (
    <aside className="flex h-full min-w-0 flex-col bg-sidebar">
      <header className="window-drag flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-ui-xs font-medium tracking-[0.14em] text-foreground-subtlest">
          WORKSPACE
        </span>
        <Button aria-label="Open workspace" size="icon" variant="ghost" onClick={onOpenWorkspace}>
          <Plus />
        </Button>
      </header>
      <div className="space-y-1 border-b border-border p-2">
        <Button className="w-full justify-start" variant="outline" onClick={onNewTerminal}>
          <TerminalSquare />
          New terminal
        </Button>
        <Button className="w-full justify-start" variant="ghost" onClick={onOpenWorkspace}>
          <FolderOpen />
          Open folder
        </Button>
      </div>
      <div className="px-3 pb-1 pt-4 text-ui-xs font-medium tracking-[0.14em] text-foreground-subtlest">
        PROJECTS
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {workspaces.length === 0 ? (
          <p className="p-2 text-ui-sm text-foreground-subtle">Open a project folder to begin.</p>
        ) : (
          workspaces.map((workspace) => {
            const active = workspace.id === activeWorkspaceId;
            return (
              <section className="mb-2" key={workspace.id}>
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-ui-sm ${active ? "bg-selected text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
                  onClick={() => onSelectWorkspace(workspace.id)}
                >
                  <ChevronRight
                    className={`size-3.5 shrink-0 transition-transform ${active ? "rotate-90" : ""}`}
                  />
                  <FolderOpen className="size-4 shrink-0 text-brand" />
                  <span className="truncate">{workspace.name}</span>
                </button>
                {active && (
                  <div className="ml-3 mt-1 border-l border-border pl-2">
                    {workspace.tabs.map((tab) => (
                      <button
                        className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui-sm ${tab.id === workspace.activeTabId ? "bg-hover text-foreground" : "text-foreground-subtle hover:bg-hover"}`}
                        key={tab.id}
                        onClick={() => onSelectTab(workspace.id, tab.id)}
                      >
                        <span className="size-1.5 rounded-full bg-brand" />
                        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                        <span className="font-mono text-ui-xs text-foreground-subtlest">
                          {tab.panes.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      <footer className="flex h-16 shrink-0 items-center justify-between border-t border-border px-3 text-ui-sm text-foreground-subtle">
        <span className="flex items-center gap-2">
          <img alt="" aria-hidden="true" className="size-[18px]" src="./favicon.svg" />
          VINTAGE
        </span>
        <Button aria-label="Open settings" size="icon" variant="ghost" onClick={onOpenSettings}>
          <Settings />
        </Button>
      </footer>
    </aside>
  );
}
