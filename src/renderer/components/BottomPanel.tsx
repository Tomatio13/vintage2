import { ListTree, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { ActivityPanel } from "./ActivityPanel.js";
import { Button } from "./Button.js";
import { TerminalPanel } from "./TerminalPanel.js";

export function BottomPanel() {
  const [tab, setTab] = useState<"terminal" | "activity">("terminal");

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          size="compact"
          variant={tab === "terminal" ? "outline" : "ghost"}
          onClick={() => setTab("terminal")}
        >
          <TerminalSquare />
          Terminal
        </Button>
        <Button
          size="compact"
          variant={tab === "activity" ? "outline" : "ghost"}
          onClick={() => setTab("activity")}
        >
          <ListTree />
          Activity
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "terminal" ? (
          <TerminalPanel active workspaceId="" title="Terminal" />
        ) : (
          <ActivityPanel />
        )}
      </div>
    </section>
  );
}
