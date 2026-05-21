import { useEffect, useRef } from "react";
import wsManager from "../../../lib/socket";
import { toast } from "../../../utils/toast";
import type { Task } from "../types/task.types";

export const TASK_WS_EVENTS = {
  CREATED: 'task:created',
  UPDATED: 'task:updated',
  STATUS_CHANGED: 'task:status_changed',
  ARCHIVED: 'task:archived',
} as const;

interface TaskRealtimeHandlers {
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onStatusChanged: (task: Task) => void;
  onArchived: (task: Task) => void;
  currentUserId?: string;
}

export function useTaskRealtime(handlers: TaskRealtimeHandlers, isEnabled: boolean) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isEnabled) return;

    const handleCreated = (raw: unknown) => {
      const task = extractTask(raw);
      if (!task) return;
      handlersRef.current.onCreated(task);
      if (task.assigneeId && task.assigneeId === handlersRef.current.currentUserId
          && task.creatorId !== handlersRef.current.currentUserId) {
        toast.info(`Bạn có công việc mới: ${task.title}`);
      }
    };

    const handleUpdated = (raw: unknown) => {
      const task = extractTask(raw);
      if (task) handlersRef.current.onUpdated(task);
    };

    const handleStatusChanged = (raw: unknown) => {
      const task = extractTask(raw);
      if (task) handlersRef.current.onStatusChanged(task);
    };

    const handleArchived = (raw: unknown) => {
      const task = extractTask(raw);
      if (task) handlersRef.current.onArchived(task);
    };

    wsManager.on(TASK_WS_EVENTS.CREATED, handleCreated);
    wsManager.on(TASK_WS_EVENTS.UPDATED, handleUpdated);
    wsManager.on(TASK_WS_EVENTS.STATUS_CHANGED, handleStatusChanged);
    wsManager.on(TASK_WS_EVENTS.ARCHIVED, handleArchived);

    return () => {
      wsManager.off(TASK_WS_EVENTS.CREATED, handleCreated);
      wsManager.off(TASK_WS_EVENTS.UPDATED, handleUpdated);
      wsManager.off(TASK_WS_EVENTS.STATUS_CHANGED, handleStatusChanged);
      wsManager.off(TASK_WS_EVENTS.ARCHIVED, handleArchived);
    };
  }, [isEnabled]);
}

function extractTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Record<string, unknown>;
  // Backend wraps: { event, data: Task }
  const task = (payload.data ?? payload) as Record<string, unknown>;
  if (!task.id || !task.title) return null;
  return task as unknown as Task;
}
