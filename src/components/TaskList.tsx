import type { Task } from "@/types";
import { formatDue } from "@/lib/format";

export function TaskList({
  tasks,
  onToggle,
  onRemove,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Nothing here. Point the camera at a bill, a letter, an appointment card.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start gap-3 py-3">
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => onToggle(task)}
            aria-label={task.done ? `Reopen ${task.text}` : `Done: ${task.text}`}
            className="mt-1 size-5 shrink-0 accent-accent"
          />
          <div className="min-w-0 flex-1">
            <p className={task.done ? "text-muted line-through" : ""}>{task.text}</p>
            {task.dueAt !== undefined && !task.done && (
              <p className="mt-0.5 text-xs text-muted">{formatDue(task.dueAt)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(task)}
            aria-label={`Remove ${task.text}`}
            className="px-2 text-muted"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
