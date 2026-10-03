import { useState } from "react";
import { useUiStore } from "../store/uiStore.js";
import { KanbanBoard, type CardRequest } from "./KanbanBoard.js";
import { MarkdownEditor } from "./MarkdownEditor.js";

export function NotesPane({
  workspaceId,
  visible,
  onOpenFile,
}: {
  workspaceId: string;
  visible: boolean;
  onOpenFile: (path: string) => void;
}) {
  const view = useUiStore((state) => state.activeSidePaneTabId);
  const notesEnabled = useUiStore((state) => state.notesPanelEnabled);
  const boardEnabled = useUiStore((state) => state.boardPanelEnabled);
  const [request, setRequest] = useState<CardRequest | null>(null);
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Workspace notes pane">
      {notesEnabled && (
        <div className="min-h-0 flex-1" hidden={view !== "notes"}>
          <MarkdownEditor
            workspaceId={workspaceId}
            visible={visible && view === "notes"}
            onOpenFile={onOpenFile}
            onCreateCard={
              boardEnabled
                ? (text) => {
                    setRequest({ text, nonce: (request?.nonce ?? 0) + 1 });
                    useUiStore.getState().showSidePaneTab("board");
                  }
                : undefined
            }
          />
        </div>
      )}
      {boardEnabled && (
        <div className="min-h-0 flex-1" hidden={view !== "board"}>
          <KanbanBoard
            workspaceId={workspaceId}
            request={request}
            active={visible && view === "board"}
          />
        </div>
      )}
    </section>
  );
}
