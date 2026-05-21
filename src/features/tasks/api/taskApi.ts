import axios from "axios";
import type { AxiosInstance } from "axios";
import { API_BASE_URL } from "../../../config";
import { getAccessToken } from "../../../services/tokenService";
import type { Task, ListTasksParams, CreateTaskPayload, UpdateTaskPayload, TaskStatus } from "../types/task.types";

const createTaskApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: `${API_BASE_URL}/tasks`,
    timeout: 30000,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.request.use(
    (config) => {
      const token = getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error),
  );

  client.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error),
  );

  return client;
};

const client = createTaskApiClient();

export interface TaskListResult {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export const taskApi = {
  list: async (params?: ListTasksParams): Promise<TaskListResult> => {
    const { data } = await client.get("/", { params });
    return {
      items: data.data ?? [],
      total: data.meta?.total ?? 0,
      page: data.meta?.page ?? 1,
      pageSize: data.meta?.pageSize ?? 50,
    };
  },

  getCalendarTasks: async (from: string, to: string): Promise<Task[]> => {
    const { data } = await client.get("/calendar", { params: { from, to } });
    return data.data ?? [];
  },

  create: async (payload: CreateTaskPayload): Promise<Task> => {
    const { data } = await client.post("/", payload);
    return data.data;
  },

  update: async (taskId: string, payload: UpdateTaskPayload): Promise<Task> => {
    const { data } = await client.patch(`/${taskId}`, payload);
    return data.data;
  },

  updateStatus: async (taskId: string, status: TaskStatus): Promise<Task> => {
    const { data } = await client.patch(`/${taskId}/status`, { status });
    return data.data;
  },

  archive: async (taskId: string): Promise<Task> => {
    const { data } = await client.delete(`/${taskId}`);
    return data.data;
  },
};
