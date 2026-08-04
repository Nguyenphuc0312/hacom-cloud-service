import { useState, useCallback, useRef } from "react";
import { taskApi } from "../api/taskApi";
import type {
  Task,
  ListTasksParams,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskStatus,
} from "../types/task.types";

export interface UseTasksState {
  items: Task[];
  total: number;
  page: number;
  isLoading: boolean;
  error: string | null;
}

export function useTasks() {
  const [state, setState] = useState<UseTasksState>({
    items: [],
    total: 0,
    page: 1,
    isLoading: false,
    error: null,
  });
  const currentParamsRef = useRef<ListTasksParams>({});

  const fetchTasks = useCallback(async (params: ListTasksParams = {}) => {
    currentParamsRef.current = params;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const result = await taskApi.list(params);
      setState({ items: result.items, total: result.total, page: result.page, isLoading: false, error: null });
    } catch {
      setState((s) => ({ ...s, isLoading: false, error: "Không thể tải danh sách công việc" }));
    }
  }, []);

  const refresh = useCallback(() => fetchTasks(currentParamsRef.current), [fetchTasks]);

  const createTask = useCallback(
    async (payload: CreateTaskPayload): Promise<Task> => {
      const task = await taskApi.create(payload);
      await refresh();
      return task;
    },
    [refresh],
  );

  const updateTask = useCallback(
    async (taskId: string, payload: UpdateTaskPayload): Promise<Task> => {
      const task = await taskApi.update(taskId, payload);
      setState((s) => ({
        ...s,
        items: s.items.map((t) => (t.id === taskId ? task : t)),
      }));
      return task;
    },
    [],
  );

  const updateStatus = useCallback(
    async (taskId: string, status: TaskStatus): Promise<void> => {
      const task = await taskApi.updateStatus(taskId, status);
      setState((s) => ({
        ...s,
        items:
          status === "ARCHIVED"
            ? s.items.filter((t) => t.id !== taskId)
            : s.items.map((t) => (t.id === taskId ? task : t)),
      }));
    },
    [],
  );

  const archiveTask = useCallback(
    async (taskId: string): Promise<void> => {
      await taskApi.archive(taskId);
      setState((s) => ({ ...s, items: s.items.filter((t) => t.id !== taskId), total: s.total - 1 }));
    },
    [],
  );

  return { ...state, fetchTasks, refresh, createTask, updateTask, updateStatus, archiveTask };
}
