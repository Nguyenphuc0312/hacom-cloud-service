import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  ArchiveBoxArrowDownIcon,
  ExclamationCircleIcon,
  ClipboardDocumentListIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";
import { toast } from "../../../utils/toast";
import { useTasks } from "../hooks/useTasks";
import { useTaskRealtime } from "../hooks/useTaskRealtime";
import { TaskFormModal } from "../components/TaskFormModal";
import { KanbanView } from "../components/KanbanView";
import { AssigneeAvatar } from "../components/AssigneePicker";
import { taskApi } from "../api/taskApi";
import { useAuthStore } from "../../../stores/authStore";
import type { Task, TaskStatus, TaskPriority, ListTasksParams, CreateTaskPayload } from "../types/task.types";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_STATUS_COLORS,
} from "../types/task.types";

type ViewMode = 'list' | 'kanban';

const STATUS_FILTER_OPTIONS: Array<{ value: TaskStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'TODO', label: 'Cần làm' },
  { value: 'IN_PROGRESS', label: 'Đang làm' },
  { value: 'DONE', label: 'Hoàn thành' },
  { value: 'ARCHIVED', label: 'Đã lưu trữ' },
];

const PRIORITY_FILTER_OPTIONS: Array<{ value: TaskPriority | ''; label: string }> = [
  { value: '', label: 'Tất cả độ ưu tiên' },
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
];

const formatDueDate = (dueDate: string | null): string | null => {
  if (!dueDate) return null;
  return new Date(dueDate).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const isOverdue = (task: Task): boolean =>
  !!task.dueDate && task.status !== 'DONE' && task.status !== 'ARCHIVED' && new Date(task.dueDate) < new Date();

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onArchive: (task: Task) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onEdit, onToggleDone, onArchive }) => {
  const overdue = isOverdue(task);
  const isDone = task.status === 'DONE';
  const isArchived = task.status === 'ARCHIVED';

  return (
    <div className={clsx(
      "group flex items-start gap-3 rounded-xl border p-4 transition-colors",
      isArchived
        ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 opacity-60"
        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-200 dark:hover:border-indigo-800",
    )}>
      <button
        onClick={() => onToggleDone(task)}
        className="mt-0.5 shrink-0 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
        title={isDone ? "Đánh dấu chưa xong" : "Đánh dấu hoàn thành"}
      >
        {isDone ? <CheckCircleSolid className="h-5 w-5 text-green-500" /> : <CheckCircleIcon className="h-5 w-5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx("text-sm font-medium text-gray-900 dark:text-gray-100", isDone && "line-through text-gray-400 dark:text-gray-500")}>
            {task.title}
          </span>
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", TASK_PRIORITY_COLORS[task.priority])}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", TASK_STATUS_COLORS[task.status])}>
            {TASK_STATUS_LABELS[task.status]}
          </span>
        </div>
        {task.description && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3">
          {task.dueDate && (
            <span className={clsx("flex items-center gap-1 text-xs", overdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500")}>
              {overdue && <ExclamationCircleIcon className="h-3.5 w-3.5" />}
              {overdue ? "Quá hạn: " : "Deadline: "}
              {formatDueDate(task.dueDate)}
            </span>
          )}
          {task.assigneeId && task.assigneeName && (
            <span className="flex items-center gap-1">
              <AssigneeAvatar user={{ displayName: task.assigneeName, avatar: task.assigneeAvatar ?? null }} size={4} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{task.assigneeName}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isArchived && (
          <button onClick={() => onEdit(task)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200" title="Sửa">
            <PencilSquareIcon className="h-4 w-4" />
          </button>
        )}
        {!isArchived && (
          <button onClick={() => onArchive(task)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-orange-500" title="Lưu trữ">
            <ArchiveBoxArrowDownIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export const TasksPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const directTaskId = searchParams.get('taskId');

  const { items, total, isLoading, error, fetchTasks, createTask, updateTask, updateStatus, archiveTask } = useTasks();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('TODO');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Task | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const buildParams = useCallback((): ListTasksParams => ({
    status: viewMode === 'kanban' ? 'ALL' : statusFilter,
    priority: priorityFilter || undefined,
    q: debouncedSearch || undefined,
  }), [statusFilter, priorityFilter, debouncedSearch, viewMode]);

  const paramsRef = useRef(buildParams);
  paramsRef.current = buildParams;

  useEffect(() => {
    void fetchTasks(buildParams());
  }, [fetchTasks, buildParams]);

  // Open task from URL query param (e.g. from Calendar click)
  useEffect(() => {
    if (!directTaskId) return;
    taskApi.getById(directTaskId)
      .then((task) => { setEditingTask(task); setShowModal(true); })
      .catch(() => { toast.error('Không tìm thấy công việc hoặc bạn không có quyền truy cập.'); });
  }, [directTaskId]);

  // Realtime task events
  useTaskRealtime({
    currentUserId: currentUser?.id,
    onCreated: () => void fetchTasks(paramsRef.current()),
    onUpdated: (task) => {
      // If task now matches filter, update in list; otherwise refetch
      void fetchTasks(paramsRef.current());
      // Update calendar cache by invalidating (handled by CalendarPage on next month nav)
      void task; // suppress lint
    },
    onStatusChanged: () => void fetchTasks(paramsRef.current()),
    onArchived: () => void fetchTasks(paramsRef.current()),
  }, !!currentUser);

  const handleSave = async (payload: CreateTaskPayload) => {
    try {
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        toast.success("Đã cập nhật công việc");
      } else {
        await createTask(payload);
        toast.success("Đã tạo công việc");
      }
    } catch {
      toast.error(editingTask ? "Không thể lưu công việc" : "Không thể tạo công việc");
      throw new Error("save_failed");
    }
  };

  const handleToggleDone = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      await updateStatus(task.id, newStatus);
      toast.success(newStatus === 'DONE' ? "Đã hoàn thành công việc" : "Đã đánh dấu chưa xong");
    } catch {
      toast.error("Không thể đổi trạng thái");
    }
  };

  const handleMoveStatus = async (task: Task, status: TaskStatus) => {
    try {
      await updateStatus(task.id, status);
    } catch {
      toast.error("Không thể đổi trạng thái");
    }
  };

  const handleArchive = async (task: Task) => {
    try {
      await archiveTask(task.id);
      toast.success("Đã lưu trữ công việc");
    } catch {
      toast.error("Không thể lưu trữ công việc");
    } finally {
      setConfirmArchive(null);
    }
  };

  const openCreate = () => { setEditingTask(null); setShowModal(true); };
  const openEdit = (task: Task) => { setEditingTask(task); setShowModal(true); };
  const closeModal = () => {
    setShowModal(false);
    setEditingTask(null);
    if (searchParams.has('taskId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('taskId');
      setSearchParams(next, { replace: true });
    }
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardDocumentListIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Công việc</h1>
            {total > 0 && (
              <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                {total}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                  viewMode === 'list'
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800",
                )}
                title="List view"
              >
                <ListBulletIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Danh sách</span>
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                  viewMode === 'kanban'
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800",
                )}
                title="Kanban view"
              >
                <Squares2X2Icon className="h-4 w-4" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>

            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" />
              Tạo công việc
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm công việc..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {viewMode === 'list' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'ALL')}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PRIORITY_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ExclamationCircleIcon className="h-12 w-12 text-red-400 mb-3" />
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => fetchTasks(buildParams())}
              className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100"
            >
              Thử lại
            </button>
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardDocumentListIcon className="h-14 w-14 text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-base font-medium text-gray-500 dark:text-gray-400">Bạn chưa có công việc nào</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Tạo công việc đầu tiên để bắt đầu</p>
            <button onClick={openCreate} className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <PlusIcon className="h-4 w-4" />
              Tạo công việc đầu tiên
            </button>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && viewMode === 'list' && (
          <div className="flex flex-col gap-2">
            {items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={openEdit}
                onToggleDone={handleToggleDone}
                onArchive={(t) => setConfirmArchive(t)}
              />
            ))}
          </div>
        )}

        {!isLoading && !error && viewMode === 'kanban' && (
          <KanbanView
            items={items}
            onEdit={openEdit}
            onArchive={(t) => setConfirmArchive(t)}
            onMoveStatus={handleMoveStatus}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <TaskFormModal
          task={editingTask}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}

      {/* Archive confirm */}
      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 shadow-xl p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Lưu trữ công việc?</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Công việc &ldquo;{confirmArchive.title}&rdquo; sẽ bị ẩn khỏi danh sách chính.
            </p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setConfirmArchive(null)} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                Hủy
              </button>
              <button onClick={() => handleArchive(confirmArchive)} className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-600">
                Lưu trữ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
