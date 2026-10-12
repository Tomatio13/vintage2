import {
  CheckCircle2,
  Circle,
  CircleDot,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
} from "lucide-react";
import { kanbanLabelTone, type KanbanPriority, type KanbanStatus } from "../../shared/kanban.js";

export function BoardStatusIcon({
  status,
  className = "size-4",
}: {
  status: KanbanStatus;
  className?: string;
}) {
  const Icon = status === "todo" ? Circle : status === "doing" ? CircleDot : CheckCircle2;
  return (
    <Icon
      aria-hidden="true"
      className={`${className} ${status === "doing" ? "text-brand" : status === "done" ? "text-green-600" : "text-foreground-subtle"}`}
    />
  );
}
export function BoardPriorityIcon({
  priority = "none",
  className = "size-3.5",
}: {
  priority?: KanbanPriority;
  className?: string;
}) {
  const Icon = {
    none: Minus,
    low: SignalLow,
    medium: SignalMedium,
    high: SignalHigh,
    urgent: TriangleAlert,
  }[priority];
  return (
    <Icon
      aria-hidden="true"
      className={`${className} ${priority === "urgent" ? "text-destructive" : "text-foreground-subtle"}`}
    />
  );
}
export function BoardLabel({ label }: { label: string }) {
  return (
    <span className="board-label" data-tone={kanbanLabelTone(label)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-sm bg-current" />
      <span className="truncate">{label}</span>
    </span>
  );
}
export function boardDueDate(value: string, done: boolean) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [year = 2000, month = 1, day = 1] = value.split("-").map(Number);
  return {
    label:
      value === today
        ? "Today"
        : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
            new Date(year, month - 1, day, 12),
          ),
    overdue: !done && value < today,
    today: !done && value === today,
  };
}
