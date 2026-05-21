export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskSourceType = 'MANUAL' | 'CHAT' | 'CALENDAR';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  assigneeAvatar?: string | null;
  creatorId: string;
  sourceType: TaskSourceType | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTasksParams {
  status?: TaskStatus | 'ALL';
  priority?: TaskPriority;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  assigneeId?: string;
}

export type UpdateTaskPayload = Partial<CreateTaskPayload> & {
  dueDate?: string | null;
  startDate?: string | null;
  assigneeId?: string | null;
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  DONE: 'Hoàn thành',
  ARCHIVED: 'Đã lưu trữ',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  URGENT: 'Khẩn cấp',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DONE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  ARCHIVED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};
