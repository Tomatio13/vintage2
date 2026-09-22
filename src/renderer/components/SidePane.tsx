import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Globe2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { WorkspaceFileEntry } from "../../shared/desktop.js";
import { BrowserPane } from "./BrowserPane.js";
import { Button } from "./Button.js";

type PaneTab = "browser" | "files";

export function SidePane({
  workspaceId,
  onOpenFile,
}: {
  workspaceId: string | null;
  onOpenFile(path: string): void;
}) {
  const [tab, setTab] = useState<PaneTab>("browser");
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setFiles([]);
    setError(null);
    if (!workspaceId || !window.desktop) return;
    void window.desktop
      .listWorkspaceFiles(workspaceId)
      .then(setFiles)
      .catch(() => setError("Unable to read this workspace."));
  }, [workspaceId]);
  return (
    <aside className="flex h-full min-w-0 flex-col bg-panel">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          size="compact"
          variant={tab === "browser" ? "outline" : "ghost"}
          onClick={() => setTab("browser")}
        >
          <Globe2 />
          Browser
        </Button>
        <Button
          size="compact"
          variant={tab === "files" ? "outline" : "ghost"}
          onClick={() => setTab("files")}
        >
          <FolderOpen />
          Files
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "browser" ? (
          <BrowserPane />
        ) : (
          <div className="h-full overflow-y-auto p-2">
            {error ? (
              <p className="p-2 text-ui-sm text-destructive">{error}</p>
            ) : workspaceId ? (
              files.map((entry) => (
                <FileTree key={entry.path} entry={entry} onSelect={onOpenFile} />
              ))
            ) : (
              <p className="p-2 text-ui-sm text-foreground-subtle">
                Open a workspace to browse its files.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
function FileTree({
  entry,
  onSelect,
}: {
  entry: WorkspaceFileEntry;
  onSelect(path: string): void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (entry.kind === "file")
    return (
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-hover"
        onDoubleClick={() => onSelect(entry.path)}
      >
        <File className="size-4 shrink-0 text-foreground-subtlest" />
        <span className="truncate">{entry.name}</span>
      </button>
    );
  return (
    <div>
      <button
        className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-ui-sm hover:bg-hover"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {expanded ? (
          <FolderOpen className="size-4 text-brand" />
        ) : (
          <Folder className="size-4 text-brand" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <div className="ml-3 border-l border-border pl-1">
          {entry.children?.map((child) => (
            <FileTree key={child.path} entry={child} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
