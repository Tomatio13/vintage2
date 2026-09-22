import { useWorkspaceState } from "../runtime/WorkspaceProvider.js";

export function ActivityPanel() {
  const { activities, activeTaskId } = useWorkspaceState();
  const visible = activities.filter((entry) => entry.taskId === activeTaskId);
  return (
    <section className="h-full min-h-0 overflow-y-auto bg-panel p-3 font-mono text-ui-sm">
      {visible.length === 0 ? (
        <span className="text-foreground-subtlest">No activity yet.</span>
      ) : (
        visible.map((entry) => (
          <div key={entry.id} className="flex gap-3 py-1">
            <span className="text-foreground-subtlest">
              {new Date(entry.createdAt).toLocaleTimeString()}
            </span>
            <span
              className={
                entry.level === "error"
                  ? "text-destructive"
                  : entry.level === "success"
                    ? "text-success"
                    : "text-foreground-subtle"
              }
            >
              {entry.message}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
